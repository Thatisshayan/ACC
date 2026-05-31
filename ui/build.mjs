import { build } from 'vite';
import react from '@vitejs/plugin-react';

await build({
  configFile: false,
  root: process.cwd(),
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      // @sentry/react is loaded lazily only when VITE_SENTRY_DSN is set.
      // Externalise it so an absent installation does not break the build.
      external: ['@sentry/react'],
    },
  },
});
