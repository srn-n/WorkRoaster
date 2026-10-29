import { defineConfig } from 'vite';
import fs from 'node:fs';

// The Content-Security-Policy normally arrives as an HTTP header from
// vercel.json. Anywhere the built files are opened without those headers
// (the Android app's WebView, a saved copy, another host) there would be no
// policy at all, so the production build also carries it as a <meta> tag.
// frame-ancestors / upgrade-insecure-requests only work as headers, so they
// stay in vercel.json only. Build-only: the dev server needs its own scripts.
const headerPolicy = JSON.parse(fs.readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'))
  .headers.flatMap((h) => h.headers)
  .find((h) => h.key === 'Content-Security-Policy').value;
const metaPolicy = headerPolicy
  .split(';')
  .map((d) => d.trim())
  .filter((d) => d && !/^(frame-ancestors|upgrade-insecure-requests|report-uri|report-to|sandbox)\b/.test(d))
  .join('; ');

export default defineConfig({
  plugins: [
    {
      name: 'workroaster-csp-meta',
      apply: 'build',
      transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: metaPolicy }, injectTo: 'head-prepend' }],
    },
  ],
});
