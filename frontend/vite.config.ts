import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
