import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { generateStream } from "../services/orchestrator.js";
import type { GenerateRequest } from "../types.js";

const app = new Hono();

// POST /api/generate-stream — SSE streaming multi-page generation
app.post("/generate-stream", async (c) => {
  const body: GenerateRequest = await c.req.json();

  if (!body.prompt?.trim()) {
    return c.json({ success: false, error: { message: "请提供设计描述" } }, 400);
  }

  return streamSSE(c, async (s) => {
    s.onAbort(() => {
      console.log("[sse] Client disconnected");
    });

    try {
      // IMPORTANT: await each writeSSE so the stream doesn't close before events flush
      await generateStream(body, async (evt) => {
        await s.writeSSE({ event: evt.event, data: JSON.stringify(evt) });
      });
    } catch (err: any) {
      s.writeSSE({
        event: "error",
        data: JSON.stringify({ event: "error", data: { message: err.message } }),
      });
    }
  });
});

export default app;
