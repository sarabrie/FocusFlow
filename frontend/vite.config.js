import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3000,
    // api.js calls relative /api paths; in Docker nginx proxies them, in dev Vite does.
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
});
