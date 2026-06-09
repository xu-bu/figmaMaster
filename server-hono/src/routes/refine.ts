// POST /api/refine — per-page refinement with isolated context
// Only passes: current instruction + current page JSX + shared context
// No history accumulation

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { RefineRequest } from "../types.js";
import { chatJSON, parseLLMJson } from "../services/deepseek.js";
import { validatePage, buildImportMap, buildHTML } from "../services/babel.js";
import { pageMsgs } from "../services/prompts.js";
import type { PageGenTask, GeneratedPage } from "../types.js";

const app = new Hono();

app.post("/refine", async (c) => {
  const body: RefineRequest = await c.req.json();
  if (!body.prompt?.trim() || !body.currentJsx) {
    return c.json({ success: false, error: { message: "缺少 prompt 或 currentJsx" } }, 400);
  }

  return streamSSE(c, async (s) => {
    try {
      await s.writeSSE({ event: "status", data: JSON.stringify({ event: "status", data: { message: "正在修改..." } }) });

      // Build per-page task from request
      const task: PageGenTask = {
        page: { name: body.pageName, route: "", description: body.prompt },
        sharedContext: body.sharedContext || {
          primaryColor: "#3B82F6", colorScheme: "light", typography: "system-ui",
          navigation: [], userObject: {}, commonStyles: "",
        },
        preferences: body.preferences,
        interactions: body.interactions,
        dependencies: [
          { name: "react", version: "19.1.0", esmUrl: "https://esm.sh/react@19.1.0" },
          { name: "react-dom", version: "19.1.0", esmUrl: "https://esm.sh/react-dom@19.1.0" },
        ],
      };

      // LLM call: only current instruction + current JSX (no accumulated history)
      const raw = await chatJSON(pageMsgs(task), 8192);
      const parsed = parseLLMJson(raw);

      const page: GeneratedPage = {
        name: body.pageName, route: "", jsx: parsed.jsx || "", js: "", html: "",
        title: parsed.title || body.pageName, importMap: {}, jsValid: false,
      };

      // Babel validate
      validatePage(page);

      // Build HTML
      page.importMap = buildImportMap(task.dependencies);
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
