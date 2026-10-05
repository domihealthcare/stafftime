import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * The deployed app's security headers, read from vercel.json rather than
 * copied, so `vite preview` serves exactly what production serves.
 *
 * That matters most for the Content-Security-Policy: a CSP that is wrong turns
 * the whole app into a blank page, and the only honest way to know it is right
 * is to load the production bundle with the real policy applied.
 */
function deployedHeaders(): Record<string, string> {
  const vercel = JSON.parse(
    readFileSync(fileURLToPath(new URL('../../vercel.json', import.meta.url)), 'utf8'),
  ) as { headers?: { source: string; headers: { key: string; value: string }[] }[] };

  return Object.fromEntries(
    (vercel.headers ?? [])
      .filter((rule) => rule.source === '/(.*)')
      .flatMap((rule) => rule.headers.map((header) => [header.key, header.value])),
  );
}

/**
 * Which build this is, baked into the bundle so the Help page can say.
 *
 * On Vercel the commit comes from VERCEL_GIT_COMMIT_SHA; locally, from git;
 * with neither (a tarball, say), it is left out rather than guessed. The API
 * reports its own commit at /api/config, so the page can tell a stale tab
 * from the version that is live.
 */
function buildInfo() {
  let commit = process.env.VERCEL_GIT_COMMIT_SHA ?? '';
  if (!commit) {
    try {
      commit = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim();
    } catch {
      commit = '';
    }
  }
  return { commit: commit.slice(0, 7) || null, builtAt: new Date().toISOString() };
}

/**
 * The time clock has its own HTML page (kiosk.html), so that adding it to a
 * tablet's home screen makes a "Time Clock" app that opens on /kiosk instead
 * of the Domi Staff app staff phones install. On Vercel a rewrite serves it at
 * /kiosk (vercel.json); this does the same for the dev server and
 * `vite preview`, so the browser suites see what production serves.
 */
const KIOSK_PATH = /^\/kiosk\/?(\?.*)?$/;

function kioskPage(): Plugin {
  const rewrite = (req: { url?: string }, _res: unknown, next: () => void) => {
    const match = req.url?.match(KIOSK_PATH);
    if (match) req.url = `/kiosk.html${match[1] ?? ''}`;
    next();
  };
  return {
    name: 'kiosk-page',
    configureServer: (server) => void server.middlewares.use(rewrite),
    configurePreviewServer: (server) => void server.middlewares.use(rewrite),
  };
}

const proxy = {
  // Proxy API calls to the NestJS server so the browser sees one origin and
  // there is no CORS setup to get wrong in development.
  '/api': {
    target: 'http://localhost:3000',
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react(), kioskPage()],
  define: {
    __BUILD__: JSON.stringify(buildInfo()),
  },
  server: {
    port: 5173,
    proxy,
  },
  build: {
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        kiosk: fileURLToPath(new URL('./kiosk.html', import.meta.url)),
      },
    },
  },
  preview: {
    port: 4173,
    proxy,
    headers: deployedHeaders(),
  },
});
