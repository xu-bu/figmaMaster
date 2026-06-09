// ============================================================
// Orchestrator: decompose → worker pool → babel(retry) → buildHTML
// ============================================================

import { chatJSON, chatQuick, parseLLMJson } from "./deepseek.js";
import { intentMsgs, decomposeMsgs, pageMsgs, fixMsgs } from "./prompts.js";
import { transpileJSX, validatePage, buildImportMap, buildHTML } from "./babel.js";
import { insertVersion } from "../store/jsonstore.js";
import type { GenerateRequest, DecomposeResult, PageGenTask, PageGenResult, GeneratedPage, StreamEvent } from "../types.js";

const CONCURRENCY = parseInt(process.env.DEEPSEEK_CONCURRENCY || "4", 10);
const MAX_RETRIES = 2;

type EmitFn = (evt: StreamEvent) => Promise<void> | void;

// ---- Worker Pool ----
async function workerPool<T>(tasks: T[], worker: (t: T) => Promise<PageGenResult>, c: number): Promise<PageGenResult[]> {
  const results: PageGenResult[] = [];
  const queue = [...tasks];
  async function run() {
    while (queue.length > 0) {
      const task = queue.shift()!;
      try { results.push(await worker(task)); } catch (err: any) { results.push({ page: {} as GeneratedPage, error: err }); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(c, tasks.length) }, run));
  return results;
}

// ---- Pipeline ----

export async function generateStream(req: GenerateRequest, emit: EmitFn) {
  intentAnalysis(req.prompt, emit);

  // Step 1: Decompose
  await emit({ event: "status", data: { message: "正在分析需求，拆解页面结构..." } });
  const decompRaw = await chatJSON(decomposeMsgs(req.prompt, req.preferences, req.interactions));
  const decomp: DecomposeResult = parseLLMJson(decompRaw);
  if (!decomp.pages?.length) throw new Error("未能识别页面结构");

  for (const d of decomp.dependencies) {
    if (!d.esmUrl) d.esmUrl = `https://esm.sh/${d.name}@${d.version}`;
  }

  await emit({ event: "decompose", data: { sharedContext: decomp.sharedContext, pages: decomp.pages, pageCount: decomp.pages.length } });

  // Step 2: Build tasks
  const tasks: PageGenTask[] = decomp.pages.map(p => ({
    page: p, sharedContext: decomp.sharedContext, preferences: req.preferences, interactions: req.interactions, dependencies: decomp.dependencies,
  }));

  // Step 3: Parallel generation with Babel validation + retry
  await emit({ event: "status", data: { message: `并行生成 ${tasks.length} 个页面...` } });

  const results = await workerPool(tasks, async (task) => {
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
    pages, sharedContext: decomp.sharedContext, dependencies: decomp.dependencies,
    preferences: req.preferences, interactions: req.interactions,
  });

  const data = { sharedContext: decomp.sharedContext, pages, dependencies: decomp.dependencies, versionId: version.id };
  await emit({ event: "complete", data });
  return data;
}

async function generateOnePage(task: PageGenTask): Promise<GeneratedPage> {
  const raw = await chatJSON(pageMsgs(task));
  const parsed = parseLLMJson(raw);
  const page: GeneratedPage = {
    name: task.page.name, route: task.page.route,
    jsx: parsed.jsx || "", js: "", html: "", title: parsed.title || task.page.name,
    importMap: {}, jsValid: false,
  };
  return validatePage(page);
}

async function fixPage(task: PageGenTask, brokenJSX: string, error: string): Promise<GeneratedPage> {
  const raw = await chatJSON(fixMsgs(task, brokenJSX, error));
  const parsed = parseLLMJson(raw);
  const page: GeneratedPage = {
    name: task.page.name, route: task.page.route,
    jsx: parsed.jsx || "", js: "", html: "", title: parsed.title || task.page.name,
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
