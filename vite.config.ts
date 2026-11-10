import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: false,
  resolve: {
    alias: {
      '@three.ez/simplify-geometry': resolve(import.meta.dirname, 'src/index.ts')
    }
  },
  build: {
    outDir: 'build',
    target: 'es2022',
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'index'
    },
    sourcemap: true,
    minify: false,
    rolldownOptions: {
      external: /^(?:three|meshoptimizer)(?:\/|$)/
    }
  }
});
