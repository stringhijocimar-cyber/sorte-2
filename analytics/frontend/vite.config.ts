import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // A API roda separada; o proxy evita CORS em desenvolvimento e mantém o
    // mesmo caminho (/api) em produção atrás de um reverse proxy.
    proxy: { "/api": { target: "http://127.0.0.1:8000", changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, "") } },
  },
});
