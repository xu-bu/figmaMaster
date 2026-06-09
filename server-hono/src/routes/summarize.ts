// POST /api/summarize — compress conversation history into a summary
// Independent LLM call, doesn't affect main pipeline

import { Hono } from "hono";
import { chatQuick } from "../services/deepseek.js";

const app = new Hono();

app.post("/summarize", async (c) => {
  const { messages } = await c.req.json<{ messages: { role: string; content: string }[] }>();
  if (!messages?.length) return c.json({ success: true, data: { summary: "" } });

  const msgs = [
    {
      role: "system" as const,
      content: `Summarize this conversation in 1-2 Chinese sentences focusing on:
- What app/pages were requested
- Key design decisions (colors, layout, features)
- Any constraints mentioned
Output ONLY the summary text, no JSON, no markdown.`,
    },
    {
      role: "user" as const,
      content: messages.map((m) => `${m.role}: ${m.content.slice(0, 200)}`).join("\n"),
    },
  ];

  try {
    const summary = await chatQuick(msgs, 150);
    return c.json({ success: true, data: { summary } });
  } catch (err: any) {
    return c.json({ success: false, error: { message: err.message } }, 500);
  }
});

export default app;
