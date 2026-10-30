import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * `npm run dev:lan` (mode "lan") serves over HTTPS with a self-signed certificate and listens on the local network.
 * Phones only allow the camera on HTTPS pages (or localhost), so plain http://192.168.x.x would have no camera.
 */
export default defineConfig(({ mode }) => ({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
  plugins: [react(), tailwindcss(), ...(mode === "lan" ? [basicSsl()] : [])],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  server: {
    host: mode === "lan" ? true : undefined,
    proxy: {
      "/api": {
        target: process.env.VITE_API_TARGET ?? "http://localhost:8000",
        ws: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
}));
