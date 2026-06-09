import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  clearScreen: false,
  server: {
    host: "::",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api/auth": {
        target: "http://127.0.0.1:8088",
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/api\/auth/, "/auth"),
      },
      "/api": {
        target: "http://127.0.0.1:8088",
        changeOrigin: true,
      },
      "/governance": {
        target: "http://127.0.0.1:8088",
        changeOrigin: true,
      },
      "/sop": {
        target: "http://127.0.0.1:8088",
        changeOrigin: true,
      },
      "/audit": {
        target: "http://127.0.0.1:8088",
        changeOrigin: true,
      },
    },
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
    ],
  },
});
