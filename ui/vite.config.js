import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
