import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const root = import.meta.dirname;

export default defineConfig({
  base: './',
  publicDir: false,
  resolve: {
    alias: {
      '@three.ez/simplify-geometry': resolve(root, 'src/index.ts')
    }
  },
  build: {
    outDir: 'site',
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      input: {
        index: resolve(root, 'index.html'),
        playground: resolve(root, 'playground.html'),
        lodPlayground: resolve(root, 'lod-playground.html')
      }
    }
  }
});
