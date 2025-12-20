import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/assets/web/",
  plugins: [react()],
  build: {
    outDir: "../app/src/main/assets/web",
    emptyOutDir: true,
  },
});
