import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    cors: { origin: "*", methods: ["GET", "OPTIONS"] },
    proxy: {
      "/api/versions": { target: "http://localhost:3001", changeOrigin: true },
      "/api/refine": { target: "http://localhost:3001", changeOrigin: true },
      "/api/summarize": { target: "http://localhost:3001", changeOrigin: true },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/__tests__/setup.js"],
    css: true,
    globalSetup: ["./vitest.globalSetup.mjs"],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 60_000,
  },
});
