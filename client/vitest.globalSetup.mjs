// ============================================================
// vitest.globalSetup.mjs — starts Hono server before all tests
// ============================================================
import { spawn } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
let server;

export async function setup() {
  const serverDir = resolve(__dirname, "../server-hono");

  server = spawn("npx", ["tsx", "src/index.ts"], {
    cwd: serverDir,
    stdio: "pipe",
    env: { ...process.env, NODE_ENV: "development" },
  });

  server.stdout.on("data", (d) => process.stdout.write(`[hono] ${d}`));
  server.stderr.on("data", (d) => process.stderr.write(`[hono:err] ${d}`));
  server.on("exit", (code) => {
    if (code !== null && code !== 0) {
      console.warn(`[hono] exited with code ${code}`);
    }
  });

  // Poll /health until server is ready (max 30s)
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch("http://localhost:3001/health");
      if (res.ok) return;
    } catch { /* server not ready yet */ }
    await new Promise((r) => setTimeout(r, 800));
  }
  throw new Error("Hono server failed to start within 30s");
}

export async function teardown() {
  if (!server) return;
  server.kill("SIGTERM");
  await new Promise((r) => {
    server.on("exit", r);
    setTimeout(r, 3000); // force-resolve after 3s
  });
}
