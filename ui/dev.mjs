import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  base: './',
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/admin': { target: 'http://localhost:4000', changeOrigin: true },
      '/ws': { target: 'ws://localhost:4000', ws: true },
    },
  },
  optimizeDeps: {
    noDiscovery: true,
    include: [],
  },
});

await server.listen();
server.printUrls();
