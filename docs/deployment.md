# Deployment

The app is a static single-page app. `npm run build` writes everything to `dist/`. There are no server functions, environment variables or routes. The host configuration is already in the repo: `wrangler.jsonc` (Cloudflare Workers), and cache and security headers in `public/_headers` (Cloudflare) and `vercel.json` (Vercel). See [Caching and updates](#caching-and-updates) and [Security headers](#security-headers).

Production is at <https://annual-leave-planner.kallum.uk/>. The link preview tags in `index.html` use that address (see [architecture](architecture.md#link-previews)), so update them if the domain changes.

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
   - Non-production branch deploy command: `npx wrangler preview`
3. Build variable: `NODE_VERSION` = `22`.

The Worker name in the dashboard must match `name` in `wrangler.jsonc` (`annual-leave-planner`). Pushes to `main` deploy to production, and other branches (including PRs) get a preview URL.

Cloudflare Pages also works: build command `npm run build`, output directory `dist`, `NODE_VERSION` = `22`. Pages ignores `wrangler.jsonc` because it has no `pages_build_output_dir`.

## Caching and updates

The app is a PWA: a service worker caches the build so it works offline. For users to get new deploys without clearing anything, the entry points must always be revalidated while hashed assets can be cached forever:

| Path | `Cache-Control` |
| --- | --- |
| `/`, `/index.html`, `/sw.js`, `/manifest.webmanifest` | `no-cache` (always revalidate) |
| `/assets/*` (hashed filenames) | `public, max-age=31536000, immutable` |
| `/og-image.png` (link preview image, see [architecture](architecture.md#link-previews)) | `public, max-age=86400` |

- **Cloudflare (Workers or Pages)**: `public/_headers` (copied into `dist/` by Vite; the service worker deliberately doesn't precache it).
- **Vercel**: `vercel.json`.

If you host elsewhere, replicate these rules. If `sw.js` or `index.html` were cached for a long time, returning users would keep seeing the old version.

When a new version is deployed, the browser fetches the changed `sw.js`, installs it in the background and the app shows an "Update available" banner. Clicking **Reload** activates it. The service worker is only registered in production builds, so `npm run dev` is never affected. To test locally, run `npm run build && npm run preview`.

## Security headers

Every response gets these headers, from the `/*` rule in `public/_headers` (Cloudflare) and the `/(.*)` rule in `vercel.json` (Vercel). Keep the two in step; `vite-plugins/securityHeaders.test.ts` fails if they differ.

```
Content-Security-Policy: default-src 'self'; img-src 'self' blob: data:; style-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
```

What they do:

- **`Content-Security-Policy` (CSP)** tells the browser which sources the page may load and run things from. If someone ever managed to inject markup into the page (cross-site scripting), the browser would refuse to run it. The app has no third-party scripts, fonts or analytics and makes no network calls at runtime, so it can be strict:
  - `default-src 'self'`: scripts, styles, fonts, the manifest, the service worker and any network requests may only come from this site. No inline `<script>` and no `eval`.
  - `img-src 'self' blob: data:`: images from this site, plus `blob:` and `data:` URLs, which canvas and download code can produce.
  - `style-src 'self'`: stylesheets from this site only, and no `<style>` blocks or `style="..."` attributes in markup. React's `style` props (the palette's CSS custom properties, legend swatches) are set through the DOM, which CSP allows, so `'unsafe-inline'` isn't needed. Don't add styles with `setAttribute('style', ...)` or `innerHTML`; they would be blocked.
  - `object-src 'none'`: no plugins (`<object>`, `<embed>`).
  - `base-uri 'self'`: an injected `<base>` tag can't redirect the page's relative URLs to another site.
  - `form-action 'self'`: forms can only submit to this site (the app's forms never submit anywhere).
  - `frame-ancestors 'none'`: other sites can't show the app in an `<iframe>`, which prevents clickjacking (tricking someone into clicking a hidden, framed copy).
- **`X-Content-Type-Options: nosniff`** stops the browser guessing a file's type. A file is only treated as a script or stylesheet if the server says it is one.
- **`Referrer-Policy: strict-origin-when-cross-origin`** controls what the browser sends in the `Referer` header when someone follows a link from the app to another site: just `https://annual-leave-planner.kallum.uk`, never the full URL. That matters once plans can be shared in the URL (#14).
- **`Permissions-Policy`** turns off browser features the app never uses (camera, microphone, location, payments, USB), so no code on the page can ask for them.

If you add something that loads from another site (analytics, a web font CDN, an API such as an `.ics` feed), the CSP has to allow it, or the browser blocks it and logs a "Content Security Policy" error in the console. To check the policy locally, run `npm run build && npm run preview` and serve `dist/` with the headers above (`vite preview` doesn't read `_headers`).

HTTPS-only (`Strict-Transport-Security`, HSTS) isn't set here. It's a decision for the whole domain (browsers remember it for months, and it can cover subdomains), so turn it on in the host's dashboard instead, for example Cloudflare's SSL/TLS → Edge Certificates → HSTS.

## Keeping bank holidays fresh

Production deploys refresh the data automatically. To update the committed snapshot (so local dev and tests also see new years), run:

```bash
npm run update-bank-holidays
```

Then commit `src/data/bank-holidays.json`. A scheduled GitHub Action could do this monthly and open a PR. That's a possible future addition.
