const { build } = require('vite');

build({
  configFile: false,
  root: process.cwd(),
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
