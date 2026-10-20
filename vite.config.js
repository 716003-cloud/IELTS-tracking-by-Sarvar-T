import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { outDir: 'dist', target: 'es2020', chunkSizeWarningLimit: 1600 },
  test: { environment: 'node', include: ['test/**/*.test.js'], testTimeout: 30000 },
});
