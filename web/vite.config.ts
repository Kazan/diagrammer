import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Use a root-relative base for local dev so Vite can serve assets at "/".
// Keep the Android asset base when building the bundle that ships in the app.
export default defineConfig(({ command }) => {
  const isServe = command === "serve";
  return {
    base: isServe ? "/" : "/assets/web/",
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      outDir: "../app/src/main/assets/web",
      emptyOutDir: true,
      cssCodeSplit: false,
      chunkSizeWarningLimit: 9000,
      rollupOptions: {
        output: {
          // Force a single JS bundle to ship with the Android assets.
          manualChunks: () => "bundle",
        },
      },
    },
  };
});
