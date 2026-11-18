# Deployment

The app is a static single-page app. `npm run build` writes everything to `dist/`. There are no server functions, environment variables or routes. The host configuration is already in the repo: `wrangler.jsonc` (Cloudflare Workers), cache headers in `public/_headers` (Cloudflare) and `vercel.json` (Vercel). See [Caching and updates](#caching-and-updates).

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

## Cloudflare Workers

The app is deployed as a Worker with static assets only (no Worker script). `wrangler.jsonc` points Wrangler at `dist/`, and its `previews` block (empty is fine) is what `wrangler preview` needs to create per-branch previews.

1. Workers & Pages → Create → Import a repository, then pick the repository.
2. Build settings (Settings → Build):
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
   - Non-production branch builds: off. PR previews are deployed by GitHub Actions instead (see [PR preview comments](#pr-preview-comments)).
3. Build variable: `NODE_VERSION` = `22`.

The Worker name in the dashboard must match `name` in `wrangler.jsonc` (`annual-leave-planner`). Pushes to `main` deploy to production, and other branches (including PRs) get a preview URL.

### PR preview comments

Workers Builds doesn't comment on pull requests (only Pages does), so `.github/workflows/preview.yml` deploys PR previews itself. On every push to a PR it runs `wrangler preview`, then posts one comment on the PR with the branch preview URL and the URL for that commit, and edits that same comment on later pushes. When the PR closes, the workflow deletes the preview.

Setup:

1. Create a Cloudflare API token (My Profile → API Tokens → Create Token → **Edit Cloudflare Workers** template), limited to this account.
2. In GitHub → Settings → Secrets and variables → Actions, add the repository secrets `CLOUDFLARE_API_TOKEN` (the token) and `CLOUDFLARE_ACCOUNT_ID` (shown on the Workers & Pages overview page).
3. In the Worker's Settings → Build → Branch control, turn off builds for non-production branches, so each push isn't built twice. Production deploys from `main` stay on Workers Builds.

PRs from forks don't get repository secrets, so the workflow skips them.

Cloudflare Pages also works: build command `npm run build`, output directory `dist`, `NODE_VERSION` = `22`. Pages ignores `wrangler.jsonc` because it has no `pages_build_output_dir`.

## Caching and updates

The app is a PWA: a service worker caches the build so it works offline. For users to get new deploys without clearing anything, the entry points must always be revalidated while hashed assets can be cached forever:

| Path | `Cache-Control` |
| --- | --- |
| `/`, `/index.html`, `/sw.js`, `/manifest.webmanifest` | `no-cache` (always revalidate) |
| `/assets/*` (hashed filenames) | `public, max-age=31536000, immutable` |

- **Cloudflare (Workers or Pages)**: `public/_headers` (copied into `dist/` by Vite; the service worker deliberately doesn't precache it).
- **Vercel**: `vercel.json`.

If you host elsewhere, replicate these two rules. If `sw.js` or `index.html` were cached for a long time, returning users would keep seeing the old version.

When a new version is deployed, the browser fetches the changed `sw.js`, installs it in the background and the app shows an "Update available" banner. Clicking **Reload** activates it. The service worker is only registered in production builds, so `npm run dev` is never affected. To test locally, run `npm run build && npm run preview`.

## Optional: security headers

Not needed for v1, but both hosts make them easy to add:

- **Cloudflare**: add rules to the existing `public/_headers`.
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
