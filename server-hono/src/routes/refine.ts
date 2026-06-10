// POST /api/refine — per-page refinement with isolated context
// Supports fragment mode: send only relevant components to LLM instead of full JSX
// Supports conversation summary for cross-turn context

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { RefineRequest, SharedContext, PageGenTask, GeneratedPage } from "../types.js";
import { chatJSON, parseLLMJson } from "../services/deepseek.js";
import { validatePage, buildImportMap, buildHTML } from "../services/babel.js";
import { extractComponentFragments, identifyRelevantFragments, mergeComponentFragment } from "../services/babel.js";
import { pageMsgs, refineFragmentMsgs } from "../services/prompts.js";

const app = new Hono();

app.post("/refine", async (c) => {
  const body: RefineRequest & { fragmentMode?: boolean; existingPages?: { name: string; route: string }[] } = await c.req.json();
  if (!body.prompt?.trim()) {
    return c.json({ success: false, error: { message: "缺少 prompt" } }, 400);
  }
  const isNewPage = !body.currentJsx?.trim();

  return streamSSE(c, async (s) => {
    try {
      const emsg = isNewPage ? "正在生成新页面..." : "正在修改...";
      await s.writeSSE({ event: "status", data: JSON.stringify({ event: "status", data: { message: emsg } }) });

      // Attach existing page list to sharedContext so the LLM generates correct navigation
      const ctx = body.sharedContext || {
        primaryColor: "#3B82F6", colorScheme: "light", typography: "system-ui",
        navigation: [], userObject: {}, commonStyles: "",
      };
      if (isNewPage && body.existingPages?.length) {
        const existingNav = body.existingPages.map(p => ({
          label: p.name, route: p.route, pageName: p.name,
        }));
        const existingLabels = new Set(ctx.navigation.map(n => n.label));
        for (const n of existingNav) {
          if (!existingLabels.has(n.label)) {
            ctx.navigation.push(n);
          }
        }
      }

      const deps = [
        { name: "react", version: "19.1.0", esmUrl: "https://esm.sh/react@19.1.0" },
        { name: "react-dom", version: "19.1.0", esmUrl: "https://esm.sh/react-dom@19.1.0" },
      ];

      let raw: string;
      let parsed: any;

      if (!isNewPage && body.fragmentMode && body.currentJsx) {
        // ---- Fragment mode: extract relevant components, send only those ----
        const fragments = extractComponentFragments(body.currentJsx);
        const relevant = identifyRelevantFragments(fragments, body.prompt);

        if (relevant.length > 0 && relevant.length < fragments.length) {
          // Found a subset — use fragment prompt
          const fragmentCode = relevant.map(f => f.code).join("\n\n");
          const fragmentNames = relevant.map(f => f.name);
          const fragMsgs = refineFragmentMsgs(fragmentCode, fragmentNames, body.prompt, ctx, body.conversationSummary);
          raw = await chatJSON(fragMsgs, 4096);
          parsed = parseLLMJson(raw);

          // Merge fragment back into full JSX
          const patchedJsx = body.currentJsx;
          let mergedJsx = parsed.jsx || "";
          // If response contains multiple components, merge each
          const responseFragments = extractComponentFragments(mergedJsx);
          for (const rf of responseFragments) {
            mergedJsx = mergeComponentFragment(patchedJsx, rf);
          }
          // If the LLM returned a single modified component and we have exactly one relevant,
          // also try merging with the original relevant component
          if (responseFragments.length === 0 && relevant.length > 0) {
            mergedJsx = mergeComponentFragment(patchedJsx, { name: relevant[0].name, code: mergedJsx });
          }

          parsed.jsx = mergedJsx;
        } else {
          // Fallback: send full JSX (can't identify relevant parts)
          const task: PageGenTask = {
            page: { name: body.pageName, route: "", description: body.prompt },
            sharedContext: ctx,
            preferences: body.preferences,
            interactions: body.interactions,
            dependencies: deps,
          };
          raw = await chatJSON(pageMsgs(task), 8192);
          parsed = parseLLMJson(raw);
          // Then merge fragments
          if (parsed.jsx) {
            const responseFragments = extractComponentFragments(parsed.jsx);
            let mergedJsx = body.currentJsx;
            for (const rf of responseFragments) {
              mergedJsx = mergeComponentFragment(mergedJsx, rf);
            }
            if (responseFragments.length > 0) parsed.jsx = mergedJsx;
          }
        }
      } else if (isNewPage) {
        // ---- New page generation ----
        const task: PageGenTask = {
          page: { name: body.pageName, route: "", description: body.prompt },
          sharedContext: ctx,
          preferences: body.preferences,
          interactions: body.interactions,
          dependencies: deps,
        };
        raw = await chatJSON(pageMsgs(task), 8192);
        parsed = parseLLMJson(raw);
      } else {
        // ---- Standard refine (full JSX) ----
        const task: PageGenTask = {
          page: { name: body.pageName, route: "", description: body.prompt },
          sharedContext: ctx,
          preferences: body.preferences,
          interactions: body.interactions,
          dependencies: deps,
        };
        raw = await chatJSON(pageMsgs(task), 8192);
        parsed = parseLLMJson(raw);
      }

      const page: GeneratedPage = {
        name: body.pageName, route: "", jsx: parsed.jsx || body.currentJsx || "", js: "", html: "",
        title: parsed.title || body.pageName, importMap: {}, jsValid: false,
      };

      // Babel validate
      validatePage(page);

      // Build HTML
      page.importMap = buildImportMap(deps);
      page.html = buildHTML(page.js, page.importMap, page.title);

      await s.writeSSE({
        event: "page_done",
        data: JSON.stringify({ event: "page_done", data: page }),
      });
    } catch (err: any) {
      await s.writeSSE({
        event: "error",
        data: JSON.stringify({ event: "error", data: { message: err.message } }),
      });
    }
  });
});

export default app;
