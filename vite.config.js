import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // dist/ works from any folder or static host
  build: {
    chunkSizeWarningLimit: 900, // three.js is most of the bundle
  },
});
