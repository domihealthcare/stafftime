import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

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

const proxy = {
  // Proxy API calls to the NestJS server so the browser sees one origin and
  // there is no CORS setup to get wrong in development.
  '/api': {
    target: 'http://localhost:3000',
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD__: JSON.stringify(buildInfo()),
  },
  server: {
    port: 5173,
    proxy,
  },
  preview: {
    port: 4173,
    proxy,
    headers: deployedHeaders(),
  },
});
