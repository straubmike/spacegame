import { defineConfig } from "vite";

/**
 * Pin the dev server to IPv4 loopback and do not auto-open a browser.
 * Auto-open + ambiguous `localhost` (::1 vs 127.0.0.1) is a common source of
 * a tab that spins forever before any game frame appears. Open the printed
 * URL yourself (see README).
 */
export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    open: false,
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
  },
});
