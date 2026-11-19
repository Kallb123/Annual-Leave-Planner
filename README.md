# Annual Leave Planner

A small web app for planning annual leave across a leave year and downloading the result as a PNG.

**Use it at [annual-leave-planner.kallum.uk](https://annual-leave-planner.kallum.uk/).** No sign-up: your plan stays in your browser.

- **Several people, one calendar.** Add everyone you plan leave with (a partner, a small team). Each person has their own allowance, carry-over, working days and bookings, and their own colour. Pick who you're booking for from the cards beside the calendar (chips on phones); days where several people are off are split into diagonal coloured bands, one per person.
- **Plan visually.** Click a working day to book a full day, click again for a half day, and once more to clear it. Shift-click or drag (mouse, or swipe sideways on touch screens) to book or clear a whole range; weekends, non-working days and bank holidays are skipped.
- **Your leave year.** Set your allowance and any carried-over days. Each company sets the date its leave year resets (for example 1 January, 1 April or 1 September), and each person's totals are worked out over their own company's leave year, so people at different employers are always counted correctly. People with no company use the plan's default leave year. The calendar shows the leave year of whoever you're booking for.
- **UK bank holidays.** Bank holidays for England & Wales, Scotland or Northern Ireland are shown automatically. You can also count them against your allowance if your contract does.
- **Companies and company days.** If you plan leave across different employers, give each its own company, and choose which company each person works for. Choose **Edit days** next to a company (or the company toggle on phones), then click a day (or drag across several) to add an office closure or extra day off, such as "24 December, every year". A small pop-up lets you name it, make it repeat every year, and choose whether it comes out of the allowance. Click an existing company day to change or delete it. Company days get their own colour and can't be booked, and they only affect people in that company.
- **Day styles.** Each person and each company can be shown **Filled** (a coloured day) or **Outline** (a border in their colour drawn around each run of consecutive days, which stays open between neighbouring days and closes at the end of a week row or month). Half days get a dashed border, and several outlines on one day nest inside each other. A person can also be set to **Marks dates** instead of **Takes leave**: they have no allowance, any day can be marked (weekends, bank holidays and company days too) and they are shown as days marked. For example, add "School holidays" as a person who marks dates, in outline style, to show which dates need cover. Companies get their own colour, chosen from presets or a custom colour.
- **Imported calendars.** Import an iCalendar (`.ics`) file, such as your school's term dates, to show its dates on the planner. Each file becomes its own calendar, separate from people and companies: name it, pick a colour, show it **Filled** or **Outline** like a person or company, hide it for a while or remove it. Before anything is added you see every event in the file and can untick the ones you don't want; multi-day events such as a half-term week cover every date in between. Imported dates are for information only: they never change anyone's allowance or which days can be booked. Simple repeating events (daily, weekly, monthly or yearly, with a count or end date) are expanded; repeats with more complex rules only bring in their first date. Imported calendars are shown in the PNG and its key, and are saved with the plan and its JSON export. **School holidays** for councils in Yorkshire and Derbyshire are built in: choose **Add school holidays for your area**, pick your council, and the same preview opens without needing a file.
- **Bridge suggestions.** Spots short runs of working days between bank holidays, company days and weekends, and shows how many days off in a row booking them would give (for example "Book 3 days, get 10 days off"). They get a dashed outline on the calendar and a list with a one-click Book button. Switch them off in Settings; they never appear in the PNG.
- **Longest stretch without a week off.** Shows the longest run of the leave year with no week off (at least seven days off in a row, counting weekends, bank holidays, company days and booked leave), for example "18 weeks without a week off, 13 Apr – 24 Dec", and suggests a date for a week off that would break it up. Shown beside the bridge ideas, controlled by the same Suggestions switch in Settings, and never in the PNG.
- **Part-time friendly.** Choose which days of the week you work, including fortnightly patterns such as a 9-day fortnight (week 1 Mon–Fri, week 2 Mon–Thu). Leave can only be booked on working days.
- **Export.** Download a high-resolution PNG with everyone's leave, bank holidays and a per-person summary. It covers the leave year you're viewing by default, or choose any start and end month (up to 36 months). For a custom range, the summary shows the days booked in those months instead of the entitlement. Export the whole plan as JSON to back it up or move it to another device, and import it again (validated and migrated like saved data, with a confirmation first).
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

The app builds to static files in `dist/`, so it runs on any static host. It's set up for Cloudflare Workers (`wrangler.jsonc`) and Vercel (`vercel.json`). `public/_headers` and `vercel.json` set the cache headers that let updates through, and security headers such as a Content Security Policy (see [docs/deployment.md](docs/deployment.md)):

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
  data/          Bundled bank holiday snapshot (from GOV.UK) and school holidays
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

## School holiday data

Built-in school holidays live in `src/data/school-holidays.json`, one entry per council: its name, region, the URL of its term dates page, the date the dates were last checked, and each holiday as an inclusive `start`/`end` range. They're copied by hand from each council's published term dates (councils don't share a common feed), so update `checked` whenever you re-check a council. `npm test` validates the file (unique ids, real dates, holidays sorted and not overlapping). They're the council's dates for community and voluntary-controlled schools; academies and other schools can differ, which the app points out.

## Bank holiday data

Bank holidays come from the [GOV.UK bank holidays API](https://www.gov.uk/bank-holidays.json) (Open Government Licence v3.0). A trimmed snapshot is committed to `src/data/bank-holidays.json` and refreshed on every build. If GOV.UK can't be reached, the build keeps the committed copy. GOV.UK usually publishes about a year ahead, and the app shows a notice when a leave year runs past the available data.
