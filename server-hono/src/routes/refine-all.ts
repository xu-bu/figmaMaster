// POST /api/refine-all — apply one instruction to ALL pages with shared context
// Ensures cross-page consistency (e.g. "add bottom nav to all pages")

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { SharedContext, GeneratedPage } from "../types.js";
import { chatJSON, parseLLMJson } from "../services/deepseek.js";
import { validatePage, buildImportMap, buildHTML } from "../services/babel.js";

const app = new Hono();

const FIX_ALL_SYSTEM = `You are an expert React developer. Fix a page component according to the user's instruction.
The user wants to apply a CONSISTENT change across ALL pages of an app.
Output ONLY valid JSON: { "jsx": "...", "title": "..." }

CRITICAL: If the instruction asks for a navigation bar, EVERY response must include it.
Follow the shared context navigation items exactly.`;

app.post("/refine-all", async (c) => {
  const { prompt, sharedContext, pages } = await c.req.json<{
    prompt: string;
    sharedContext: SharedContext;
    pages: { name: string; jsx: string; title: string }[];
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

    for (const page of pages) {
      await s.writeSSE({ event: "status", data: JSON.stringify({ event: "status", data: { message: `正在修改: ${page.name}...` } }) });

      const msgs = [
        { role: "system" as const, content: FIX_ALL_SYSTEM },
        { role: "user" as const, content: `## Shared Context
Primary: ${sharedContext?.primaryColor || "#3B82F6"} | ${sharedContext?.colorScheme || ""}
Nav items: ${nav}
Common styles: ${sharedContext?.commonStyles || ""}

## Current JSX for page "${page.name}"
\`\`\`jsx
${page.jsx.slice(0, 3000)}
\`\`\`

## Instruction (apply to ALL pages consistently)
${prompt}

Return ONLY valid JSON with the fixed jsx. Keep the same page name and functionality. Make sure the navigation bar IDENTICAL to other pages.`,
        },
      ];

      try {
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

    await s.writeSSE({ event: "complete", data: JSON.stringify({ event: "complete", data: { pages: refined, count: refined.length } }) });
  });
});

export default app;
