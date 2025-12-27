import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

// Use a root-relative base for local dev so Vite can serve assets at "/".
// Keep the Android asset base when building the bundle that ships in the app.
export default defineConfig(({ command }) => {
  const isServe = command === "serve";
  return {
    base: isServe ? "/" : "/assets/web/",
    plugins: [
      react(),
      tailwindcss(),
      // Copy Excalidraw fonts to the build output so they can be loaded offline.
      // Excalidraw looks for fonts at ${EXCALIDRAW_ASSET_PATH}/fonts/
      viteStaticCopy({
        targets: [
          {
            src: "node_modules/@excalidraw/excalidraw/dist/prod/fonts/*",
            dest: "fonts",
          },
        ],
      }),
    ],
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
