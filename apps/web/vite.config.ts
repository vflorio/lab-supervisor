import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import vike from "vike/plugin";
import { defineConfig } from "vite";

const { version } = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf-8"));

export default defineConfig({
  plugins: [vike(), react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  server: {
    proxy: {
      "/api/trpc": {
        target: "http://localhost:3001",
        ws: true,
        rewrite: (path) => path.replace(/^\/api\/trpc/, "/trpc"),
      },
      // Mock Suitest server (apps/mocks) - solo per la form di debug /mock in sviluppo
      "/api/mocks": {
        target: "http://localhost:3002",
        rewrite: (path) => path.replace(/^\/api\/mocks/, ""),
      },
    },
  },
});
