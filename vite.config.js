import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

function validatedProxyTarget(value) {
  if (!value) return '';
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('VITE_API_PROXY_TARGET must be one valid origin.');
  }
  const loopback =
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.hostname.endsWith('.localhost');
  const allowedProtocol = url.protocol === 'https:' || (url.protocol === 'http:' && loopback);
  if (
    !allowedProtocol ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'VITE_API_PROXY_TARGET must be one HTTPS origin without a path or credentials (HTTP is allowed only on loopback).',
    );
  }
  return url.origin;
}

// A browser sees the Vite server as same-origin, but Django still receives the
// browser's local Origin/Referer headers after proxying. Align those security
// headers with the already validated upstream so production CSRF checks see
// the same origin as the rewritten Host header. This is development-only; the
// production console and API share an origin and do not use Vite's proxy.
export function alignDevProxySecurityHeaders(proxyRequest, request, upstreamOrigin) {
  if (typeof request.headers.origin === 'string' && request.headers.origin) {
    proxyRequest.setHeader('Origin', upstreamOrigin);
  }
  if (typeof request.headers.referer !== 'string' || !request.headers.referer) return;
  try {
    const incomingReferer = new URL(request.headers.referer);
    const upstreamReferer = new URL(upstreamOrigin);
    // Assign the path instead of resolving it as a relative URL. A path that
    // begins with `//` must never be reinterpreted as a different hostname.
    upstreamReferer.pathname = incomingReferer.pathname;
    upstreamReferer.search = incomingReferer.search;
    proxyRequest.setHeader('Referer', upstreamReferer.href);
  } catch {
    proxyRequest.removeHeader('Referer');
  }
}

// Vite configuration for the StarForge console SPA.
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, '.', '');
  const apiProxyTarget = validatedProxyTarget(String(env.VITE_API_PROXY_TARGET || '').trim());
  const mockEnabled = ['1', 'true', 'yes', 'on'].includes(
    String(env.VITE_USE_MOCK || '').trim().toLowerCase(),
  );
  const browserApiOrigin = String(env.VITE_API_URL || '').trim();
  const analyzeBundle = ['1', 'true', 'yes', 'on'].includes(
    String(env.VITE_BUNDLE_REPORT || '').trim().toLowerCase(),
  );

  // The fixed presentation demo is useful during local design work, but a
  // deployable bundle must never be able to masquerade as a connected console.
  if (command === 'build' && mockEnabled) {
    throw new Error('Production bundles require VITE_USE_MOCK=false.');
  }
  if (command === 'build' && browserApiOrigin) {
    throw new Error(
      'Production bundles require a same-origin API path; leave VITE_API_URL empty.',
    );
  }

  return {
    plugins: [
      react(),
      ...(analyzeBundle
        ? [visualizer({
            filename: 'dist/bundle-report.html',
            template: 'treemap',
            gzipSize: true,
            brotliSize: true,
            open: false,
          })]
        : []),
    ],
    // The production console should share its tenant origin with the API. During
    // local development this proxy keeps the browser same-origin, so the tenant
    // API does not need to expose a permissive CORS policy just for Vite.
    server: {
      port: 5173,
      host: env.VITE_DEV_HOST || '127.0.0.1',
      ...(apiProxyTarget
        ? {
            proxy: {
              '/api': {
                target: apiProxyTarget,
                changeOrigin: true,
                secure: apiProxyTarget.startsWith('https:'),
                configure(proxy) {
                  proxy.on('proxyReq', (proxyRequest, request) => {
                    alignDevProxySecurityHeaders(proxyRequest, request, apiProxyTarget);
                  });
                },
              },
            },
          }
        : {}),
    },
    preview: { port: 4173, host: env.VITE_DEV_HOST || '127.0.0.1' },
    build: { outDir: 'dist', sourcemap: false },
  };
});
