# Deployment

The app is a static single-page app. `npm run build` writes everything to `dist/`. There are no server functions, environment variables or routes, so both hosts below work without config files.

## Build pipeline

`npm run build` runs:

1. `prebuild`: `scripts/update-bank-holidays.mjs --soft` fetches the latest bank holidays from GOV.UK. If the request fails, it logs a warning and keeps the committed snapshot. It never fails the build.
2. `tsc -b`: type-checks.
3. `vite build`: bundles to `dist/`.

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

## Optional: security headers

Not needed for v1, but both hosts make them easy to add:

- **Cloudflare Pages**: add `public/_headers`. Vite copies it into `dist/`.
- **Vercel**: add a `headers` block to `vercel.json`.

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
