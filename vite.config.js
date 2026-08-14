import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_PROXY_TARGET || 'http://localhost:4000',
        changeOrigin: true,
        /**
         * Strip the browser's Origin header so local dev matches the deployed shape.
         *
         * On Vercel the SPA and the API share one domain, so the browser sends no Origin and
         * CORS never engages. Behind this proxy the browser *does* send one, which would make
         * dev the only environment needing a CORS allowlist — a config knob that exists purely
         * to paper over a difference from production. Removing the header deletes the
         * difference instead.
         */
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => proxyReq.removeHeader('origin'));
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Recharts is the bulk of the bundle and changes far less often than app code —
        // splitting it keeps the cached vendor chunk warm across deploys.
        manualChunks: {
          charts: ['recharts'],
          vendor: ['react', 'react-dom', 'react-router-dom', 'axios'],
        },
      },
    },
  },
});
