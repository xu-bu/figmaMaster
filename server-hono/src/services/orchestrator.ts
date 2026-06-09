// ============================================================
// Orchestrator: decompose → shared components → concurrent map → babel(retry) → buildHTML
// ============================================================

import { chatJSON, chatQuick, parseLLMJson } from "./deepseek.js";
import { intentMsgs, decomposeMsgs, pageMsgs, fixMsgs, componentMsgs } from "./prompts.js";
import { transpileJSX, validatePage, buildImportMap, buildHTML } from "./babel.js";
import { insertVersion } from "../store/jsonstore.js";
import type { GenerateRequest, DecomposeResult, PageGenTask, PageGenResult, GeneratedPage, SharedComponent, StreamEvent } from "../types.js";

const CONCURRENCY = parseInt(process.env.DEEPSEEK_CONCURRENCY || "4", 10);
const MAX_RETRIES = 2;

type EmitFn = (evt: StreamEvent) => Promise<void> | void;

/** Prepend shared component JSX code to page JSX so components are defined in scope.
 *  Avoids duplicating if the code already contains them (e.g. during retry).
 *  Strips import/export from shared code — page's own imports cover React etc. */
function prependSharedComponents(task: PageGenTask, pageJsx: string): string {
  if (!task.sharedComponents?.length) return pageJsx;
  const alreadyHasAll = task.sharedComponents.every(sc =>
    pageJsx.includes(`function ${sc.spec.name}`) || pageJsx.includes(`const ${sc.spec.name}`)
  );
  if (alreadyHasAll) return pageJsx;
  const header = task.sharedComponents.map(sc => {
    return sc.jsx
      .replace(/export\s+default\s+/g, "")
      .replace(/^import\s+.*?['"].*?['"];?\s*$/gm, "")  // strip import lines — page code already imports React
      .replace(/^const\s+styles\s*=/m, `const ${sc.spec.name}_styles =`)  // avoid colliding with page's const styles
      .trim();
  }).join("\n\n");
  return header + "\n\n" + pageJsx;
}

// ---- Concurrent map (I/O-bound concurrency control) ----
async function mapConcurrent<T>(items: T[], fn: (item: T) => Promise<PageGenResult>, concurrency: number): Promise<PageGenResult[]> {
  const results: PageGenResult[] = [];
  const iterator = items[Symbol.iterator]();
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (const item of iterator) {
      try { results.push(await fn(item)); } catch (err: any) { results.push({ page: {} as GeneratedPage, error: err }); }
    }
  });
  await Promise.all(workers);
  return results;
}

// ---- Pipeline ----

export async function generateStream(req: GenerateRequest, emit: EmitFn) {
  intentAnalysis(req.prompt, emit);

  // Step 1: Decompose
  await emit({ event: "status", data: { message: "正在分析需求，拆解页面结构..." } });
  const decompRaw = await chatJSON(decomposeMsgs(req.prompt, req.preferences, req.interactions, req.conversationSummary, req.existingPageNames));
  const decomp: DecomposeResult = parseLLMJson(decompRaw);
  if (!decomp.pages?.length) throw new Error("未能识别页面结构");

  for (const d of decomp.dependencies) {
    if (!d.esmUrl) d.esmUrl = `https://esm.sh/${d.name}@${d.version}`;
  }

  await emit({ event: "decompose", data: { sharedContext: decomp.sharedContext, pages: decomp.pages, pageCount: decomp.pages.length } });

  // Step 2: Generate shared components (e.g. nav, footer) — injected into each page task
  const sharedComponents: SharedComponent[] = [];
  if (decomp.sharedComponents?.length) {
    await emit({ event: "status", data: { message: `生成 ${decomp.sharedComponents.length} 个共享组件...` } });
    for (const spec of decomp.sharedComponents) {
      await emit({ event: "component_start", data: { name: spec.name } });
      try {
        const raw = await chatJSON(componentMsgs(spec, decomp.sharedContext));
        const parsed = parseLLMJson(raw);
        const sc: SharedComponent = { spec, jsx: parsed.jsx || "" };
        sharedComponents.push(sc);
        await emit({ event: "component_done", data: { name: spec.name, size: sc.jsx.length } });
      } catch (err: any) {
        console.warn(`[component] "${spec.name}" generation failed: ${err.message}`);
        await emit({ event: "status", data: { message: `⚠️ 组件 ${spec.name} 生成失败，跳过` } });
      }
    }
  }

  // Step 3: Build tasks (with shared components injected)
  const tasks: PageGenTask[] = decomp.pages.map(p => ({
    page: p, sharedContext: decomp.sharedContext, sharedComponents,
    preferences: req.preferences, interactions: req.interactions, dependencies: decomp.dependencies,
  }));

  // Step 4: Parallel generation with Babel validation + retry
  await emit({ event: "status", data: { message: `并行生成 ${tasks.length} 个页面...` } });

  const results = await mapConcurrent(tasks, async (task) => {
    const name = task.page.name;
    await emit({ event: "page_start", data: { page: name } });

    let page = await generateOnePage(task);
    let retries = 0;

    while (!page.jsValid && retries < MAX_RETRIES) {
      retries++;
      console.log(`[retry] "${name}" invalid JSX (${retries}/${MAX_RETRIES}): ${page.jsError}`);
      page = await fixPage(task, page.jsx, page.jsError!);
    }

    // Always buildHTML from transpiled JS — never trust LLM HTML
    page.importMap = buildImportMap(task.dependencies);
    page.html = buildHTML(page.js, page.importMap, page.title);

    if (!page.jsValid) console.warn(`[babel] "${name}" still invalid after ${MAX_RETRIES} retries`);

    await emit({ event: "page_done", data: page });
    return { page };
  }, CONCURRENCY);

  // Collect
  const pages: GeneratedPage[] = [];
  for (const r of results) {
    if (r.error) { console.error("[orch] Error:", r.error); continue; }
    pages.push(r.page);
  }
  if (pages.length === 0) throw new Error("所有页面生成失败");

  // Save
  const version = insertVersion({
    title: pages[0].title, description: `${pages.length} pages`, prompt: req.prompt,
    pages, sharedContext: decomp.sharedContext, sharedComponents: sharedComponents.length ? sharedComponents : undefined,
    dependencies: decomp.dependencies, preferences: req.preferences, interactions: req.interactions,
  });

  const data = { sharedContext: decomp.sharedContext, pages, sharedComponents: sharedComponents.length ? sharedComponents : undefined, dependencies: decomp.dependencies, versionId: version.id };
  await emit({ event: "complete", data });
  return data;
}

async function generateOnePage(task: PageGenTask): Promise<GeneratedPage> {
  const raw = await chatJSON(pageMsgs(task));
  const parsed = parseLLMJson(raw);
  const page: GeneratedPage = {
    name: task.page.name, route: task.page.route,
    jsx: prependSharedComponents(task, parsed.jsx || ""), js: "", html: "", title: parsed.title || task.page.name,
    importMap: {}, jsValid: false,
  };
  return validatePage(page);
}

async function fixPage(task: PageGenTask, brokenJSX: string, error: string): Promise<GeneratedPage> {
  const raw = await chatJSON(fixMsgs(task, brokenJSX, error));
  const parsed = parseLLMJson(raw);
  const page: GeneratedPage = {
    name: task.page.name, route: task.page.route,
    jsx: prependSharedComponents(task, parsed.jsx || ""), js: "", html: "", title: parsed.title || task.page.name,
    importMap: {}, jsValid: false,
  };
  return validatePage(page);
}

async function intentAnalysis(prompt: string, emit: EmitFn) {
  try {
    const result = await chatQuick(intentMsgs(prompt), 200);
    await emit({ event: "intent", data: { analysis: result } });
  } catch (err: any) { console.warn("[intent]", err.message); }
}
