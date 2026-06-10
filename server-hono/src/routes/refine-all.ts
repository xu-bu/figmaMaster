// POST /api/refine-all — apply one instruction to ALL pages with shared context
// Strategy 3 enhancement:
//   1. LLM identifies which component(s) need changing
//   2. If shared component → modify once, re-inject into all pages
//   3. If page-specific → fragment mode on that page only
//   4. If undetermined → fallback to full JSX per page

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { SharedContext, GeneratedPage, SharedComponent } from "../types.js";
import { chatJSON, chatQuick, parseLLMJson } from "../services/deepseek.js";
import { validatePage, buildImportMap, buildHTML, extractComponentFragments, mergeComponentFragment } from "../services/babel.js";
import { refineFragmentMsgs, identifyComponentMsgs } from "../services/prompts.js";
import type { ComponentEntry } from "../services/prompts.js";

const app = new Hono();

const FIX_ALL_SYSTEM = `You are an expert React developer. Fix a page component according to the user's instruction.
The user wants to apply a CONSISTENT change across ALL pages of an app.
Output ONLY valid JSON: { "jsx": "...", "title": "..." }

IMPORTANT: Use shared components as-is — they ensure consistency across all pages.
If shared components are provided below, use them directly. Do NOT recreate them.`;

/** Get the injected form of a shared component (what actually appears in each page's JSX). */
function getInjectedSharedCode(sc: SharedComponent): string {
  return sc.jsx
    .replace(/export\s+default\s+/g, "")
    .replace(/^import\s+.*?['"].*?['"];?\s*$/gm, "")
    .replace(/^const\s+styles\s*=/m, `const ${sc.spec.name}_styles =`)
    .trim();
}

app.post("/refine-all", async (c) => {
  const { prompt, sharedContext, sharedComponents, pages, conversationSummary } = await c.req.json<{
    prompt: string;
    sharedContext: SharedContext;
    sharedComponents?: SharedComponent[];
    pages: { name: string; jsx: string; title: string }[];
    conversationSummary?: string;
  }>();

  if (!prompt?.trim() || !pages?.length) {
    return c.json({ success: false, error: { message: "缺少 prompt 或 pages" } }, 400);
  }

  const deps = [
    { name: "react", version: "19.1.0", esmUrl: "https://esm.sh/react@19.1.0" },
    { name: "react-dom", version: "19.1.0", esmUrl: "https://esm.sh/react-dom@19.1.0" },
  ];

  return streamSSE(c, async (s) => {
    const refined: GeneratedPage[] = [];
    const nav = (sharedContext?.navigation || []).map(n => `${n.label}(${n.route})`).join(", ");

    // ---- Step 0: Build component catalog for LLM identification ----
    const componentCatalog: ComponentEntry[] = [];

    // Add shared components
    if (sharedComponents?.length) {
      for (const sc of sharedComponents) {
        componentCatalog.push({
          name: sc.spec.name,
          type: "shared",
          description: sc.spec.description || "shared UI component",
        });
      }
    }

    // Add page-specific components (extract from each page's JSX)
    const pageComponents: Map<string, ComponentEntry[]> = new Map();
    for (const page of pages) {
      if (!page.jsx) continue;
      const fragments = extractComponentFragments(page.jsx);
      const entries: ComponentEntry[] = [];
      for (const f of fragments) {
        // Skip components that are already shared
        if (sharedComponents?.some(sc => sc.spec.name === f.name)) continue;
        // Skip the page's main export (it's the page itself)
        if (f.name === page.name.replace(/\s/g, "")) continue;
        entries.push({
          name: f.name,
          type: "page",
          pageName: page.name,
          description: `component in ${page.name}`,
        });
      }
      if (entries.length > 0) {
        pageComponents.set(page.name, entries);
        componentCatalog.push(...entries);
      }
    }

    // ---- Step 1: LLM identifies which component(s) need changing ----
    let targetComponents: string[] = [];
    try {
      const idRaw = await chatQuick(identifyComponentMsgs(componentCatalog, prompt), 150);
      const parsed = parseLLMJson(idRaw);
      targetComponents = Array.isArray(parsed) ? parsed : [];
    } catch (err: any) {
      console.warn("[refine-all] component identification failed, falling back:", err.message);
    }

    // Categorize identified components
    const targetShared = sharedComponents?.filter(sc => targetComponents.includes(sc.spec.name)) || [];
    const targetPageEntries = componentCatalog.filter(c => c.type === "page" && targetComponents.includes(c.name));

    if (targetShared.length > 0) {
      // ---- Case A: Modify shared component(s) once, re-inject to all pages ----
      await s.writeSSE({
        event: "status",
        data: JSON.stringify({ event: "status", data: { message: `🎯 识别到共享组件: ${targetShared.map(s => s.spec.name).join(", ")}，统一修改中...` } }),
      });

      // Update each shared component
      const updatedShared: SharedComponent[] = [...(sharedComponents || [])];

      for (const tsc of targetShared) {
        const injectedCode = getInjectedSharedCode(tsc);

        // LLM call: modify the shared component
        const fragMsgs = refineFragmentMsgs(injectedCode, [tsc.spec.name], prompt, sharedContext, conversationSummary);
        const raw = await chatJSON(fragMsgs, 4096);
        const parsed = parseLLMJson(raw);

        if (parsed.jsx) {
          // Update the shared component's stored JSX (original form)
          const idx = updatedShared.findIndex(s => s.spec.name === tsc.spec.name);
          if (idx >= 0) {
            // Store the original-form JSX (with export default) — replace the function body in original
            const origFragments = extractComponentFragments(updatedShared[idx].jsx);
            let newSharedJsx = updatedShared[idx].jsx;
            const modifiedFragments = extractComponentFragments(parsed.jsx);
            for (const mf of modifiedFragments) {
              newSharedJsx = mergeComponentFragment(newSharedJsx, mf);
            }
            if (modifiedFragments.length === 0) {
              // LLM returned raw code — try merging with first fragment
              const firstOrig = origFragments[0];
              if (firstOrig) newSharedJsx = mergeComponentFragment(newSharedJsx, { name: firstOrig.name, code: parsed.jsx });
            }
            updatedShared[idx] = { ...tsc, jsx: newSharedJsx };
          }

          // Re-inject into all pages
          for (const page of pages) {
            if (!page.jsx) continue;
            let patchedJsx = page.jsx;
            const responseFrags = extractComponentFragments(parsed.jsx);
            for (const rf of responseFrags) {
              patchedJsx = mergeComponentFragment(patchedJsx, rf);
            }
            if (responseFrags.length === 0) {
              patchedJsx = mergeComponentFragment(patchedJsx, { name: tsc.spec.name, code: parsed.jsx });
            }
            page.jsx = patchedJsx;
          }
        }
      }

      // Re-validate and rebuild all pages with updated shared components
      for (const page of pages) {
        if (!page.jsx) continue;
        const p: GeneratedPage = {
          name: page.name, route: "", jsx: page.jsx, js: "", html: "",
          title: page.title, importMap: {}, jsValid: false,
        };
        validatePage(p);
        p.importMap = buildImportMap(deps);
        p.html = buildHTML(p.js, p.importMap, p.title);
        refined.push(p);
        await s.writeSSE({
          event: "page_done",
          data: JSON.stringify({ event: "page_done", data: p }),
        });
      }

      // Return updated shared components in the complete event
      await s.writeSSE({
        event: "complete",
        data: JSON.stringify({ event: "complete", data: { pages: refined, count: refined.length, sharedComponents: updatedShared.length ? updatedShared : undefined } }),
      });
      return;
    }

    if (targetPageEntries.length > 0) {
      // ---- Case B: Page-specific component(s) — fragment mode on specific pages ----
      await s.writeSSE({
        event: "status",
        data: JSON.stringify({ event: "status", data: { message: `🎯 识别到组件: ${targetPageEntries.map(e => e.name).join(", ")}，按需修改中...` } }),
      });

      for (const page of pages) {
        if (!page.jsx) continue;

        // Extract relevant fragments for this page
        const fragments = extractComponentFragments(page.jsx);
        const pageTargets = targetPageEntries.filter(e => e.pageName === page.name);
        const relevantFrags = fragments.filter(f => pageTargets.some(t => t.name === f.name));

        if (relevantFrags.length > 0) {
          await s.writeSSE({
            event: "status",
            data: JSON.stringify({ event: "status", data: { message: `正在修改 ${page.name} 的 ${relevantFrags.map(f => f.name).join(", ")}...` } }),
          });

          try {
            const fragmentCode = relevantFrags.map(f => f.code).join("\n\n");
            const fragmentNames = relevantFrags.map(f => f.name);
            const fragMsgs = refineFragmentMsgs(fragmentCode, fragmentNames, prompt, sharedContext, conversationSummary);
            const raw = await chatJSON(fragMsgs, 4096);
            const parsed = parseLLMJson(raw);

            let patchedJsx = page.jsx;
            const responseFrags = extractComponentFragments(parsed.jsx || "");
            for (const rf of responseFrags) {
              patchedJsx = mergeComponentFragment(patchedJsx, rf);
            }
            if (responseFrags.length === 0 && parsed.jsx && relevantFrags.length > 0) {
              patchedJsx = mergeComponentFragment(patchedJsx, { name: relevantFrags[0].name, code: parsed.jsx });
            }

            const p: GeneratedPage = {
              name: page.name, route: "", jsx: patchedJsx, js: "", html: "",
              title: parsed.title || page.title, importMap: {}, jsValid: false,
            };
            validatePage(p);
            p.importMap = buildImportMap(deps);
            p.html = buildHTML(p.js, p.importMap, p.title);
            refined.push(p);
            await s.writeSSE({ event: "page_done", data: JSON.stringify({ event: "page_done", data: p }) });
          } catch (err: any) {
            await s.writeSSE({ event: "page_error", data: JSON.stringify({ event: "page_error", data: { page: page.name, error: err.message } }) });
          }
        } else {
          // Page not affected — keep unchanged
          const p: GeneratedPage = {
            name: page.name, route: "", jsx: page.jsx, js: "", html: "",
            title: page.title, importMap: {}, jsValid: false,
          };
          validatePage(p);
          p.importMap = buildImportMap(deps);
          p.html = buildHTML(p.js, p.importMap, p.title);
          refined.push(p);
          await s.writeSSE({ event: "page_done", data: JSON.stringify({ event: "page_done", data: p }) });
        }
      }

      await s.writeSSE({
        event: "complete",
        data: JSON.stringify({ event: "complete", data: { pages: refined, count: refined.length } }),
      });
      return;
    }

    // ---- Case C: Fallback — full JSX per page (traditional refine-all) ----
    await s.writeSSE({
      event: "status",
      data: JSON.stringify({ event: "status", data: { message: "正在修改所有页面..." } }),
    });

    // Build shared component block for full JSX prompt
    let componentBlock = "";
    if (sharedComponents?.length) {
      componentBlock = `\n## Shared Components (use as-is)\n` + sharedComponents.map(sc =>
        `// ${sc.spec.name} — ${sc.spec.description}\n${sc.jsx}`
      ).join("\n\n") + "\n";
    }

    const summaryBlock = conversationSummary
      ? `\n## Project Context\n${conversationSummary}\n`
      : '';

    for (const page of pages) {
      await s.writeSSE({ event: "status", data: JSON.stringify({ event: "status", data: { message: `正在修改: ${page.name}...` } }) });

      try {
        const msgs = [
          { role: "system" as const, content: FIX_ALL_SYSTEM },
          {
            role: "user" as const,
            content: `## Shared Context
Primary: ${sharedContext?.primaryColor || "#3B82F6"} | ${sharedContext?.colorScheme || ""}
Nav items: ${nav}
Common styles: ${sharedContext?.commonStyles || ""}${componentBlock}${summaryBlock}

## Current JSX for page "${page.name}"
\`\`\`jsx
${page.jsx.slice(0, 3000)}
\`\`\`

## Instruction (apply to ALL pages consistently)
${prompt}

Return ONLY valid JSON with the fixed jsx. Keep the same page name and functionality. Make sure shared components IDENTICAL across all pages.`,
          },
        ];

        const raw = await chatJSON(msgs, 8192);
        const parsed = parseLLMJson(raw);

        const p: GeneratedPage = {
          name: page.name, route: "", jsx: parsed.jsx || page.jsx, js: "", html: "",
          title: parsed.title || page.title, importMap: {}, jsValid: false,
        };
        validatePage(p);
        p.importMap = buildImportMap(deps);
        p.html = buildHTML(p.js, p.importMap, p.title);
        refined.push(p);
        await s.writeSSE({ event: "page_done", data: JSON.stringify({ event: "page_done", data: p }) });
      } catch (err: any) {
        await s.writeSSE({ event: "page_error", data: JSON.stringify({ event: "page_error", data: { page: page.name, error: err.message } }) });
      }
    }

    await s.writeSSE({
      event: "complete",
      data: JSON.stringify({ event: "complete", data: { pages: refined, count: refined.length } }),
    });
  });
});

export default app;
