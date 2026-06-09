import { Hono } from "hono";
import { listVersions, getVersion, deleteVersion, deleteVersions } from "../store/jsonstore.js";

const app = new Hono();

app.get("/versions", (c) => {
  const limit = parseInt(c.req.query("limit") || "50", 10);
  const offset = parseInt(c.req.query("offset") || "0", 10);
  const data = listVersions(limit, offset);
  return c.json({ success: true, data, pagination: { total: data.length, limit, offset } });
});

app.get("/versions/:id", (c) => {
  const v = getVersion(c.req.param("id"));
  if (!v) return c.json({ success: false, error: { message: "版本未找到" } }, 404);
  return c.json({ success: true, data: v });
});

app.delete("/versions/:id", (c) => {
  const ok = deleteVersion(c.req.param("id"));
  if (!ok) return c.json({ success: false, error: { message: "版本未找到" } }, 404);
  return c.json({ success: true });
});

app.post("/versions/batch-delete", async (c) => {
  const { ids } = await c.req.json<{ ids: string[] }>();
  if (!ids?.length) return c.json({ success: false, error: { message: "请提供要删除的版本 ID" } }, 400);
  const removed = deleteVersions(ids);
  return c.json({ success: true, data: { removed } });
});

export default app;
