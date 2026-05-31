import { build } from 'vite';

await build({
  configFile: false,
  root: process.cwd(),
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      external: ['@sentry/react'],
    },
  },
});
