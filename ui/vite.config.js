import { defineConfig } from 'vite';

export default defineConfig({
  base: './',          // ← relative paths so Electron file:// works
  server: {
    port: 5173,
    proxy: {
      '/api':   { target: 'http://localhost:4000', changeOrigin: true },
      '/admin': { target: 'http://localhost:4000', changeOrigin: true },
      '/ws':    { target: 'ws://localhost:4000',   ws: true },
    },
  },
});
