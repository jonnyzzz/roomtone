import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    // Vite's default preload helper uses `new Function()` to probe for
    // relative-path support, which is blocked by the server's
    // `script-src 'self'` CSP and surfaces as
    // "Refused to evaluate a string as JavaScript" in the browser. The
    // app's unhandled-rejection handler then reports it as an error and
    // the docker smoke test fails right after page load. Disabling the
    // polyfill is safe — every target browser has native
    // <link rel="modulepreload"> support.
    modulePreload: {
      polyfill: false
    }
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/ws": {
        target: "ws://localhost:5670",
        ws: true
      }
    }
  }
});
