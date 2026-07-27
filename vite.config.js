import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Vite configuration for the StarForge console SPA.
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, '.', '');
  const apiProxyTarget = String(env.VITE_API_PROXY_TARGET || '').replace(/\/+$/, '');
  const mockEnabled = ['1', 'true', 'yes', 'on'].includes(
    String(env.VITE_USE_MOCK || '').trim().toLowerCase(),
  );

  // The fixed presentation demo is useful during local design work, but a
  // deployable bundle must never be able to masquerade as a connected console.
  if (command === 'build' && mockEnabled) {
    throw new Error('Production bundles require VITE_USE_MOCK=false.');
  }

  return {
    plugins: [react()],
    // The production console should share its tenant origin with the API. During
    // local development this proxy keeps the browser same-origin, so the tenant
    // API does not need to expose a permissive CORS policy just for Vite.
    server: {
      port: 5173,
      host: true,
      ...(apiProxyTarget
        ? {
            proxy: {
              '/api': {
                target: apiProxyTarget,
                changeOrigin: true,
                secure: true,
              },
            },
          }
        : {}),
    },
    preview: { port: 4173, host: true },
    build: { outDir: 'dist', sourcemap: false },
  };
});
