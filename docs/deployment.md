# Deployment

The app is a static single-page app. `npm run build` writes everything to `dist/`. There are no server functions, environment variables or routes. The only host configuration is cache headers (see [Caching and updates](#caching-and-updates)), already included in the repo as `public/_headers` (Cloudflare Pages) and `vercel.json` (Vercel).

## Build pipeline

`npm run build` runs:

1. `prebuild`: `scripts/update-bank-holidays.mjs --soft` fetches the latest bank holidays from GOV.UK. If the request fails, it logs a warning and keeps the committed snapshot. It never fails the build.
2. `tsc -b`: type-checks.
3. `vite build`: bundles to `dist/`, then a small plugin (`vite-plugins/pwa.ts`) writes `dist/sw.js` with the list of files to precache and a version hash of their contents.

## Vercel

1. Import the GitHub repository in the Vercel dashboard.
2. Vercel detects **Vite**. The defaults are correct:
   - Build command: `npm run build`
   - Output directory: `dist`
   - Install command: `npm install`
3. Node version comes from `"engines": { "node": ">=22" }` in `package.json`. You can also set it under Project → Settings → General.

Every push to a branch gets a preview URL, and pushes to `main` deploy to production.

## Cloudflare Pages

1. Workers & Pages → Create → Pages → Connect to Git, then pick the repository.
2. Build settings:
   - Framework preset: **None** (or Vite)
   - Build command: `npm run build`
   - Build output directory: `dist`
3. Environment variable: `NODE_VERSION` = `22` (Cloudflare doesn't read `.nvmrc` on every build image version).

## Caching and updates

The app is a PWA: a service worker caches the build so it works offline. For users to get new deploys without clearing anything, the entry points must always be revalidated while hashed assets can be cached forever:

| Path | `Cache-Control` |
| --- | --- |
| `/`, `/index.html`, `/sw.js`, `/manifest.webmanifest` | `no-cache` (always revalidate) |
| `/assets/*` (hashed filenames) | `public, max-age=31536000, immutable` |

- **Cloudflare Pages**: `public/_headers` (copied into `dist/` by Vite; the service worker deliberately doesn't precache it).
- **Vercel**: `vercel.json`.

If you host elsewhere, replicate these two rules. If `sw.js` or `index.html` were cached for a long time, returning users would keep seeing the old version.

When a new version is deployed, the browser fetches the changed `sw.js`, installs it in the background and the app shows an "Update available" banner. Clicking **Reload** activates it. The service worker is only registered in production builds, so `npm run dev` is never affected. To test locally, run `npm run build && npm run preview`.

## Optional: security headers

Not needed for v1, but both hosts make them easy to add:

- **Cloudflare Pages**: add rules to the existing `public/_headers`.
- **Vercel**: add to the `headers` list in the existing `vercel.json`.

A sensible starting policy for this app (no third-party scripts, and no network calls at runtime):

```
Content-Security-Policy: default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

`'unsafe-inline'` for styles is needed because the palette is applied as inline CSS custom properties, and legend swatches use inline styles.

## Keeping bank holidays fresh

Production deploys refresh the data automatically. To update the committed snapshot (so local dev and tests also see new years), run:

```bash
npm run update-bank-holidays
```

Then commit `src/data/bank-holidays.json`. A scheduled GitHub Action could do this monthly and open a PR. That's a possible future addition.
