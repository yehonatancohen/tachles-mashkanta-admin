// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// Internal tool: always server-rendered, always behind Cloudflare Access. No sitemap/SEO concerns.
export default defineConfig({
  trailingSlash: 'always',
  devToolbar: { enabled: false },
  // Auth is Cloudflare Access, not cookies — no need for the adapter's default KV-backed
  // session store (which would otherwise require an unused SESSION KV namespace).
  session: false,
  adapter: cloudflare({
    imageService: 'compile',
    prerenderEnvironment: 'node',
    // Shared with mortgage-website's local D1/KV state so `wrangler dev` in both projects
    // sees the same local databases (the site's beacon writes what this admin reads).
    // See tachles-admin/README.md "Local development".
    persistState: { path: '../.wrangler-shared' },
  }),
  build: { inlineStylesheets: 'auto' },
});
