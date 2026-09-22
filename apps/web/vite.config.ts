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
