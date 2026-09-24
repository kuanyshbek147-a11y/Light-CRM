import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { STATIC_GUIDES, renderGuideDocument } from "./src/features/guides/guideArticle";

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));

function guideStaticHtmlPlugin(): Plugin {
  return {
    name: "guide-static-html",
    apply: "build",
    writeBundle(options) {
      if (!options.dir) return;
      const css = readFileSync(path.join(frontendRoot, "src/features/guides/guideArticle.css"), "utf8");
      for (const guide of STATIC_GUIDES) {
        const markdown = readFileSync(
          path.join(frontendRoot, "src/features/guides", guide.sourceFile),
          "utf8"
        );
        const target = path.join(options.dir, guide.path.replace(/^\//, ""));
        mkdirSync(target, { recursive: true });
        writeFileSync(
          path.join(target, "index.html"),
          renderGuideDocument(markdown, css, {
            canonicalUrl: guide.canonicalUrl,
            description: guide.description
          }),
          "utf8"
        );
      }
    }
  };
}

export default defineConfig({
  plugins: [react(), guideStaticHtmlPlugin()],
  server: {
    host: "0.0.0.0",
    port: 5173
  },
  build: {
    target: "es2020",
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }
          if (id.includes("recharts") || id.includes("d3-")) {
            return "charts";
          }
          if (id.includes("sip.js")) {
            return "telephony";
          }
          if (id.includes("socket.io-client") || id.includes("engine.io-client")) {
            return "realtime";
          }
          if (
            id.includes("node_modules/react-dom") ||
            id.includes("node_modules/react/") ||
            id.includes("node_modules\\react\\") ||
            id.includes("node_modules/scheduler")
          ) {
            return "react-vendor";
          }
          return undefined;
        }
      }
    },
    chunkSizeWarningLimit: 900
  }
});
