// ============================================================
// FigmaMaster Hono Server — Entry Point
// ============================================================

import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { config } from "./config.js";
import generateRoutes from "./routes/generate.js";
import versionRoutes from "./routes/versions.js";
import refineRoutes from "./routes/refine.js";
import refineAllRoutes from "./routes/refine-all.js";
import summarizeRoutes from "./routes/summarize.js";

const app = new Hono();

// CORS — allow Vite dev server
app.use(
  "/*",
  cors({
    origin: ["http://localhost:5173", "http://localhost:3000"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    credentials: true,
  })
);

// Routes
app.route("/api", generateRoutes);
app.route("/api", versionRoutes);
app.route("/api", refineRoutes);
app.route("/api", refineAllRoutes);
app.route("/api", summarizeRoutes);

// Health
app.get("/health", (c) => c.json({ status: "ok" }));

console.log(`🚀 FigmaMaster Hono Server starting...`);
console.log(`📁 Data: server-hono/data/`);
console.log(`🤖 AI: DeepSeek (deepseek-chat)`);
console.log(`⚡ Concurrency: ${config.deepseekConcurrency} workers`);

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`✅ Server running on http://localhost:${info.port}`);
});
