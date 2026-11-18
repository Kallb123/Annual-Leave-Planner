# Annual Leave Planner

A small web app for planning annual leave across a leave year and downloading the result as a PNG.

- **Several people, one calendar.** Add everyone you plan leave with (a partner, a small team). Each person has their own allowance, carry-over, working days and bookings, and their own colour. Pick who you're booking for from the chips above the calendar; days where several people are off are split into coloured stripes, one per person.
- **Plan visually.** Click a working day to book a full day, click again for a half day, and once more to clear it. Shift-click or drag (mouse, or swipe sideways on touch screens) to book or clear a whole range; weekends, non-working days and bank holidays are skipped.
- **Your leave year.** Set your allowance, any carried-over days, and the date your leave year resets (for example 1 January or 1 April).
- **UK bank holidays.** Bank holidays for England & Wales, Scotland or Northern Ireland are shown automatically. You can also count them against your allowance if your contract does.
- **Companies and company days.** If you plan leave across different employers, give each its own company, and choose which company each person works for. Pick a company above the calendar, then click a day (or drag across several) to add an office closure or extra day off, such as "24 December, every year". A small pop-up lets you name it, make it repeat every year, and choose whether it comes out of the allowance. Click an existing company day to change or delete it. Company days get their own colour and can't be booked, and they only affect people in that company.
- **Bridge suggestions.** Spots short runs of working days between bank holidays, company days and weekends, and shows how many days off in a row booking them would give (for example "Book 3 days, get 10 days off"). They get a dotted outline on the calendar and a list with a one-click Book button. Switch them off in the settings; they never appear in the PNG.
- **Part-time friendly.** Choose which days of the week you work. Leave can only be booked on working days.
- **Export.** Download the whole leave year, with everyone's leave, bank holidays and a per-person summary, as a high-resolution PNG. Export the whole plan as JSON to back it up or move it to another device, and import it again (validated and migrated like saved data, with a confirmation first).
- **Installable and offline.** It's a Progressive Web App: install it from your browser (or add it to your home screen on iOS) and it keeps working with no connection after the first visit. When a new version is deployed, an "Update available" banner offers a one-click reload.
- **Private by default.** There's no backend and no account. Everything is stored in your browser's `localStorage`.

## Getting started

Requires Node.js 22+.

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:5173.

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Refresh bank holidays (non-fatal), type-check and build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run unit tests (Vitest) |
| `npm run lint` | Lint with oxlint |
| `npm run typecheck` | Type-check only |
| `npm run update-bank-holidays` | Refresh `src/data/bank-holidays.json` from GOV.UK |
| `npm run generate-icons` | Re-render the PNG app icons from `scripts/icons/*.svg` (needs Playwright) |
| `npm run bump <major\|minor\|patch>` | Bump the version in `package.json` and `package-lock.json` (shown in the app footer). Doesn't commit or tag |

## Deploying

The app builds to static files in `dist/`, so it runs on any static host. It's set up for Cloudflare Workers (`wrangler.jsonc`) and Vercel (`vercel.json`). `public/_headers` and `vercel.json` set the cache headers that let updates through (see [docs/deployment.md](docs/deployment.md)):

| | Cloudflare Workers | Vercel |
| --- | --- | --- |
| Build command | `npm run build` | `npm run build` |
| Deploy command | `npx wrangler deploy` | (automatic) |
| Preview (non-production) command | `npx wrangler preview` | (automatic) |
| Output directory | `dist` (from `wrangler.jsonc`) | `dist` |
| Node version | set `NODE_VERSION=22` | from `engines` in `package.json` |

See [docs/deployment.md](docs/deployment.md) for details.

## Project layout

```
src/
  domain/        Pure, framework-free logic (dates, leave years, allowance, calendar model)
  state/         Reducer, persistence and the usePlanner hook
  components/    React UI
  export/        Canvas PNG renderer and download helper
  data/          Bundled bank holiday snapshot (from GOV.UK)
  pwa/           Service worker registration and update-available state
  theme.ts       Shared colour palette for the UI and the PNG
vite-plugins/   Build plugin that writes the service worker (sw.js) with the precache list
scripts/         Build-time tooling (bank holiday refresh, icon generation)
docs/            Architecture, plan and deployment notes
```

## Documentation

- [Architecture](docs/architecture.md): how the app is put together and why
- [Plan & roadmap](docs/plan.md): scope, milestones and open questions
- [Deployment](docs/deployment.md): hosting on Cloudflare Workers or Vercel

## Bank holiday data

Bank holidays come from the [GOV.UK bank holidays API](https://www.gov.uk/bank-holidays.json) (Open Government Licence v3.0). A trimmed snapshot is committed to `src/data/bank-holidays.json` and refreshed on every build. If GOV.UK can't be reached, the build keeps the committed copy. GOV.UK usually publishes about a year ahead, and the app shows a notice when a leave year runs past the available data.
