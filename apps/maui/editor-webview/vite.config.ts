import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  base: './',
  build: {
    outDir: resolve(__dirname, '../src/Torqena.Maui/Resources/Raw/editor'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
    },
    // Inline all assets for single-file WebView loading
    assetsInlineLimit: 100000,
  },
});
