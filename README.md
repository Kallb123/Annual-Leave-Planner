# Annual Leave Planner

A small web app for planning annual leave across a leave year and downloading the result as a PNG.

- **Plan visually.** Click a working day to book a full day, click again for a half day, and once more to clear it.
- **Your leave year.** Set your allowance, any carried-over days, and the date your leave year resets (for example 1 January or 1 April).
- **UK bank holidays.** Bank holidays for England & Wales, Scotland or Northern Ireland are shown automatically. You can also count them against your allowance if your contract does.
- **Part-time friendly.** Choose which days of the week you work. Leave can only be booked on working days.
- **Export.** Download the whole leave year, with leave, bank holidays and a summary, as a high-resolution PNG.
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

## Deploying

The app builds to static files in `dist/`, so it runs on any static host. Vercel and Cloudflare Pages work with no config files:

| | Vercel | Cloudflare Pages |
| --- | --- | --- |
| Framework preset | Vite (auto-detected) | None / Vite |
| Build command | `npm run build` | `npm run build` |
| Output directory | `dist` | `dist` |
| Node version | from `engines` in `package.json` | set `NODE_VERSION=22` |

See [docs/deployment.md](docs/deployment.md) for details.

## Project layout

```
src/
  domain/        Pure, framework-free logic (dates, leave years, allowance, calendar model)
  state/         Reducer, persistence and the usePlanner hook
  components/    React UI
  export/        Canvas PNG renderer and download helper
  data/          Bundled bank holiday snapshot (from GOV.UK)
  theme.ts       Shared colour palette for the UI and the PNG
scripts/         Build-time tooling (bank holiday refresh)
docs/            Architecture, plan and deployment notes
```

## Documentation

- [Architecture](docs/architecture.md): how the app is put together and why
- [Plan & roadmap](docs/plan.md): scope, milestones and open questions
- [Deployment](docs/deployment.md): hosting on Vercel or Cloudflare Pages

## Bank holiday data

Bank holidays come from the [GOV.UK bank holidays API](https://www.gov.uk/bank-holidays.json) (Open Government Licence v3.0). A trimmed snapshot is committed to `src/data/bank-holidays.json` and refreshed on every build. If GOV.UK can't be reached, the build keeps the committed copy. GOV.UK usually publishes about a year ahead, and the app shows a notice when a leave year runs past the available data.
