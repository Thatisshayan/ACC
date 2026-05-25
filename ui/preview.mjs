import { preview } from 'vite';

const server = await preview({
  configFile: false,
  root: process.cwd(),
  base: './',
  preview: {
    port: 4173,
    strictPort: true,
  },
});

server.printUrls();
