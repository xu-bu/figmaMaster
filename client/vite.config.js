import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Only proxy non-streaming API routes
      "/api/versions": { target: "http://localhost:3001", changeOrigin: true },
      "/api/refine": { target: "http://localhost:3001", changeOrigin: true },
      "/api/summarize": { target: "http://localhost:3001", changeOrigin: true },
    },
  },
});
