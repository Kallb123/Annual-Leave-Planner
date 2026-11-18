# Architecture

## Goals and constraints

| Constraint | Consequence |
| --- | --- |
| Host on Cloudflare Workers (static assets) or Vercel | Pure static SPA, no server runtime, no platform-specific code |
| Simple, personal tool | No accounts and no backend. State lives in the browser. |
| PNG download | Client-side rendering to `<canvas>` |
| Bank holidays must be correct | Use the official GOV.UK data rather than computing dates ourselves |
| Easy to change later | Domain logic kept separate from React and from the renderers |

## Stack

- **Vite + React + TypeScript** – fast builds, static output, widely supported by both hosts.
- **Vitest** for unit tests, **oxlint** for linting.
- **No runtime dependencies** beyond React, and no PWA plugin either (see "Offline and updates"). Date handling and PNG export are hand-written (small and fully tested) rather than pulling in `date-fns`/`html2canvas`.

## High-level flow

```
                ┌──────────────────────────┐
 user input ──▶ │ state/plannerState.ts    │  reducer + validation + localStorage
                │  { shared, people,       │
                │    activePersonId,       │
                │    companies,            │
                │    editingCompanyId }    │
                └────────────┬─────────────┘
                             │
                ┌────────────▼─────────────┐
                │ state/usePlanner.ts      │  derives everything with useMemo
                └────────────┬─────────────┘
                             │ uses
     ┌───────────────────────┼──────────────────────────┐
     ▼                       ▼                          ▼
 domain/leaveYear.ts   domain/bankHolidays.ts     domain/allowance.ts
 (which dates?)        (GOV.UK snapshot)          (classify days, totals)
                             │
                    domain/calendar.ts ──▶ YearView (renderer-agnostic)
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
   components/YearCalendar.tsx     export/renderPng.ts
   (DOM, interactive)              (Canvas 2D → PNG)
```

## Layers

### `src/domain/` – pure logic

No React, no DOM, no globals. Everything here is deterministic and unit tested.

- **`dates.ts`**: all dates are ISO strings (`YYYY-MM-DD`). Arithmetic goes through UTC so results never shift with the user's timezone or daylight saving changes. ISO strings sort lexicographically, so range checks are plain string comparisons.
- **`leaveYear.ts`**: works out the leave year containing a date, or starting in a given year, from the configured start month and day. A start day past the end of the month is clamped (so 30 February becomes 28 or 29 February).
- **`bankHolidays.ts`**: loads the bundled GOV.UK snapshot, indexes it by date for the selected region, and reports whether a leave year is fully covered by the data.
- **`companyDays.ts`**: the `CompanyDayIndex` lookup (exact-date and repeating days), input validation and sanitising of stored company days. Each company has its own index, and `NO_COMPANY_DAYS` is the empty one used for people with no company. A repeating day matches the same month and day in any year, so a repeating 29 February only occurs in leap years.
- **`allowance.ts`**: classifies each day as `working`, `non-working`, `bank-holiday` or `company-day`, and computes the `AllowanceSummary` (entitlement, booked, bank holidays deducted, company days deducted, remaining). Precedence is bank holiday, then company day, then working pattern. Company days replace a working day, so they aren't bookable. They are shown on any day of the week but only deduct from the allowance when they fall on one of the user's working days and not on a bank holiday.
- **`bridges.ts`**: `findBridges()` suggests "bridge" runs of 1–4 bookable days between days off. A day is off if `classifyDay` says it isn't a working day, or it is booked as full leave (half days don't count as off). A run needs off days directly on both sides, and at least one side's off-block must contain a bank holiday or company day, so ordinary weeks between weekends are never suggested. `totalDaysOff` walks the off-blocks outwards, past the leave year if needed. Runs must lie inside the leave year and not start before today (passed in). Sorted by days off per leave day, then total days off, then date.
- **`calendar.ts`**: builds a `YearView`, a list of months, each a grid of Monday-first weeks of `DayCell`s. This is the **single model both renderers draw from**, so the screen and the PNG can't disagree. Each cell's `kind` and `leave` describe the active person; `people` lists everyone whose leave counts that day (in range and bookable under *their own* working pattern), with their name, colour, portion and over-limit flag, so both renderers can colour it per person. Each `PersonLeaveSource` carries that person's own `companyDays` index, so a company day for one person's company doesn't hide another person's leave. `DayCell.companyDay` is the matching `CompanyDay` from the index passed to `buildYearView` (alongside `companyDayName`), which lets the UI tell an existing company day from an empty one.

### `src/state/` – application state

- **Persisted state** is just `{ shared, people, activePersonId, companies }`. Everything else is derived. `PlannerState` also holds `yearOffset` and `editingCompanyId`, which are never persisted and are always reset on load.
- **People.** `Settings` is split into `SharedSettings` (leave year start, region, bridge suggestions) and `PersonSettings` (allowance, carry-over, working days, bank-holiday deduction; see `PERSON_SETTING_KEYS` in `types.ts`). A `Person` is `PersonSettings` plus `id`, `name`, `colour` and their own `leave`. There is always at least one person, and one is *active*: the leave actions (`cycleLeave`, `setLeaveRange`, `clearLeaveInRange`) and the person keys of `updateSettings` apply to them. `personSettings(shared, person)` rebuilds a full `Settings`, so the domain functions are unchanged and simply run once per person. The calendar's working/non-working shading, the summary bar and bridge suggestions follow the active person; leave colours show everyone. Ids are generated in the UI so the reducer stays pure. Colours default to the next unused entry in `PERSON_COLOURS` (`theme.ts`) and can be any `#rrggbb`.
- **Companies.** A `Company` is `{ id, name, days }`, where `days` are `CompanyDay`s sorted by date. There can be up to 20 (`MAX_COMPANIES`), or none. Each `Person` has a `companyId` (a company id, or `null`), and only that company's days affect them: `companyOf()` and `companyIndexFor()` look up a person's company and its `CompanyDayIndex`, falling back to `NO_COMPANY_DAYS`. `editingCompanyId` puts the calendar into *company mode* for that company. `addCompany` appends a company, starts editing it and, if the active person has no company, assigns them to it. `removeCompany` clears `companyId` for its people. `selectPerson` leaves company mode. Other actions are `renameCompany`, `selectCompany`, `stopEditingCompany` and `setPersonCompany`. Company days are changed with `assignCompanyDays` (for each date, replaces the company's matching day in place, keeping its id and matching repeating days too, or adds a new one; ids are `${idPrefix}-${i}` with the prefix generated in the UI), `removeCompanyDays` (by date, including repeating matches) and `removeCompanyDay` (by id, for the settings list). There is no action to add a day by form. `setLeaveRange` uses the active person's company to decide which days are bookable.
- Each person's `leave` is a map of `IsoDate → 'full' | 'half'`, **independent of leave years**. Changing the reset date regroups existing bookings into new leave years rather than losing them.
- Leave stored on a day that later becomes unbookable (for example after changing working days) stays stored but isn't counted or shown. Changing the setting back brings it back.
- `localStorage` holds a versioned envelope (`{ version: 4, shared, people, activePersonId, companies }`). `parsePlan(json)` is the single validation entry point: browser storage, JSON file import (Export JSON / Import JSON, which reuses `serialisePlan()` for the same envelope) and any future share links all go through it. It returns either the plan or a reason (`not-json`, `not-a-plan`, `newer-version`) with a user-facing message, and the `replacePlan` action swaps in an imported plan. Loading validates every field and falls back to defaults on anything unexpected (invalid people are dropped, bad colours and names replaced, and a default person is created if none survive). Companies are sanitised too: ids must be unique strings, names are cleaned (falling back to "Company N"), days are sanitised and capped, and a person's `companyId` that doesn't match a surviving company becomes `null`. On a first visit there is one company, "My company", and the default person belongs to it. `migrateStored()` upgrades older versions: v1 and v2 were single-person (`settings` + `leave`) and load as one person called "Me" in the original green; v1 had no company days and loads with an empty list. v1–v3 had a single list of company days, which moves into one company called "My company" that every person is assigned to, so nothing changes for existing users. Adding a field to `Settings` needs no version bump, because stored settings are merged over `DEFAULT_SETTINGS` and sanitised on load (for example `showBridgeSuggestions` defaults to on for older data); future schema changes add a case there.
- `usePlanner()` is the only hook components need. It returns state, `dispatch` and the memoised derived data, including the active person's effective `settings` and a `people` list of `PersonStatus` (summary, over-limit dates and warning per person). It builds one `CompanyDayIndex` per company, and each person's summary, over-limit dates and `PersonLeaveSource` use their own company's index. The year view's `kind` and `companyDay` come from the active person's company, except in company mode, where they come from the company being edited so its days are visible; leave stripes still use each person's own index. Bridge suggestions and the active summary always use the active person's company. It also returns `companies`, `editingCompany` and `editingCompanyIndex`.

### `src/components/` – React UI

Presentational components that render props and dispatch actions. They contain no date or allowance logic.

- **Layout (`App`).** A header (brand, year navigation, Settings and Download PNG), then a side rail and the main column. The rail has the people cards, the companies list and the bridge ideas; the main column has the summary card and the calendar card (mode strip, `YearCalendar`, `Legend`). The calendar's working/non-working shading, the summary and the bridge ideas follow the active person. Shell styles are in `App.css`; global tokens, fonts and the shared control primitives (`.btn` and its variants, `.chip`, `.switch`, `.segmented`, `.field`, `.card`) are in `styles.css`; `YearCalendar.css` and `SettingsDrawer.css` sit next to their components.
- `PeopleBar`: one card per person (colour, name, working days and company, days left and a bar of booked and company days) to choose who is being booked for, and an inline form (`InlineAddForm`) to add someone. On phones the cards become a scrolling row of chips.
- `CompaniesBar`: one row per company (its number of days in the leave year and its members) with an "Edit days" button (`aria-pressed`) that enters company mode for it; it turns into "Done" while editing, and the people cards show none as pressed. Also exports `ModeToggle`, the phones' "Book leave | {company} days" segmented control.
- `CompanyDayPopover`: a small non-modal dialog (`role="dialog"`, `aria-modal="false"`) anchored to the day that was clicked, or a bottom sheet under 600px. It shows the date or range and the company name, a name field, a "Repeats every year" switch and the buttons "Comes out of allowance" and "Doesn't come out of allowance" (both dispatch `assignCompanyDays`), "Delete" (only if a selected date is already a company day; dispatches `removeCompanyDays`) and "Cancel". Escape or clicking outside closes it and returns focus to the day.
- `SettingsDrawer`: a native modal `<dialog>` (focus trap, Escape, backdrop click, focus returned to the opener) opened from the header. A right-hand drawer on desktop and a full-screen sheet on phones, with two tabs. **People**: choose or add a person, then their name, company, colour, allowance and carry-over (`DayCountInput`), working days and bank-holiday deduction, plus "Clear {name}'s leave" and "Remove {name}". **Plan**: leave-year start, bank holiday region, bridge suggestions, `CompaniesSection` and Backup (export and import the plan as JSON; import errors show here). `App` holds whether it is open and which tab is shown.
- `CompaniesSection`: lists the companies, with rename and remove for each, their members, and each company's days (name, date, repeating and deducted flags, remove). New days are added on the calendar in company mode.
- `YearCalendar`: months and days, in one of two modes. In `leave` mode each day is a `<button>`, disabled when the day isn't bookable for the active person, with an `aria-label` and holiday names and who is off in the `title`. One person's full day is filled with their colour; a half day is a light tint of it with a thin ring, so the two differ in lightness, not just pattern. Several people on one day get equal diagonal bands, one per person. Today has an ink ring. In `company` mode every day in the leave year is enabled and `aria-pressed` means "is a company day". Clicking a day opens the `CompanyDayPopover` for it (any day of the week); dragging or shift-clicking opens it for the range, skipping weekends and bank holidays.
- `BridgeSuggestions`: the top five suggestions in the rail with a Book button (dispatches `setLeaveRange` with `'full'`); on phones only the best one is shown. `YearCalendar` takes an optional `bridgeByDate` map and adds a dashed `day--bridge` outline and a tooltip. Suggestions are screen-only: the PNG renderer ignores them, and the on-screen `Legend` adds its bridge entry separately from the shared `legendItems`. They are controlled by the `showBridgeSuggestions` setting, and are hidden in company mode.
- `SummaryBar` (the active person: days left, a stacked bar, entitlement, booked, deducted bank holidays and company days, remaining, and the over-entitlement warning), `Legend` (one swatch per person, then half day, the fixed `legendItems`, bridge idea and today).

**Small screens.** Between 600px and 860px the rail stacks above the main column and lays its cards out side by side. Under 600px (`useMediaQuery`) the header becomes icon buttons, people are a scrolling row of chips, the best bridge idea and a "Book leave | {company} days" toggle sit above the calendar, each month is its own card, and a fixed bar at the bottom says who is being booked for and what a tap does. Under `@media (pointer: coarse)` every control is at least 44px, and day cells use `touch-action: pan-y` so vertical swipes still scroll the page while horizontal drags along a week select a range (pointercancel aborts the drag).

**Fonts.** Inter (text) and Space Grotesk (display) are self-hosted from `src/assets/fonts/` (Latin and Latin Extended subsets, SIL Open Font License, copied from the Fontsource packages) so the app looks the same offline; the service worker precaches them with the rest of the build. The PNG renderer awaits `loadExportFonts()` before drawing so the export uses them too.

### `src/export/` – PNG export

- `renderPng.ts` draws a `YearView` straight onto a canvas with the 2D API at 2× scale, with the same cell colours as the screen (months on a white card over the warm page colour). `computeLayout()` is pure and separate from drawing. `ExportMeta` takes a `people` list (name, colour, summary, warning): one person gives the original single summary line; several give one summary row per person, and the header grows to fit.
- `download.ts` turns the canvas into a Blob and triggers a download.

**Why not screenshot the DOM?** Libraries like `html2canvas` and `html-to-image` re-implement CSS layout and break on fonts, gradients and responsive layouts. Drawing from the model gives a consistent, print-friendly layout (always 4 × 3) whatever the user's screen size, and adds no dependencies.

### `src/theme.ts` – shared palette

The palette is defined once in TypeScript (a warm neutral page, white cards, near-black ink for primary controls and one cobalt accent for focus rings, links and bridge ideas), along with the default person colours (all dark enough for white text) and their names and the helpers both renderers use for them (`halfDayTint`, `textOn`). On startup `applyPaletteToCss()` writes it to CSS custom properties (`--c-leave`, …) for the UI, and the canvas renderer reads the same object, so colours always match.

## Offline and updates (PWA)

The app is installable (`public/manifest.webmanifest`, icons in `public/icons/`, iOS meta tags in `index.html`) and works offline after the first visit.

- **Build.** `vite-plugins/pwa.ts` runs after `vite build` (production only). It lists every file in `dist/` except `sw.js`, `_headers` and source maps, hashes their contents into a version, and writes `dist/sw.js` from `vite-plugins/sw.template.js`. Any change to any file therefore changes the worker, which is how browsers notice a new deploy. The pure helpers (`precache.ts`) are unit tested. URLs are relative to the worker's scope, so a different Vite `base` still works.
- **Worker.** `install` precaches the build into cache `alp-<version>` and does not skip waiting. `activate` deletes older `alp-*` caches and claims open pages. Navigations are network-first, falling back to the cached `index.html` offline, so a new deploy shows up on the next load when online. Other same-origin GETs are cache-first. A `SKIP_WAITING` message activates a waiting worker.
- **Update flow.** `src/pwa/registerServiceWorker.ts` registers `sw.js` in production only. If a new worker installs (or is already waiting) while an existing worker controls the page, it goes into `updateStore`, which `UpdateBanner` reads with `useSyncExternalStore`. The banner (`role="status"`) shows "Update available" and a Reload button that sends `SKIP_WAITING`. On `controllerchange` the page reloads once; this is skipped on the very first install, and guarded so it can't loop. The page also calls `registration.update()` when it becomes visible again and hourly (at most once a minute).
- **Hosting.** `sw.js`, `index.html` and the manifest must be served with `no-cache`, and `/assets/*` as immutable (`public/_headers`, `vercel.json`; see deployment docs).
- **Icons.** SVG sources are in `scripts/icons/`; `npm run generate-icons` renders the PNGs with Playwright. The PNGs are committed, so the build doesn't need it.

**Why hand-written?** The worker is about 60 lines and the app has one static page, so `vite-plugin-pwa`/Workbox would add a dependency (and a risk with new Vite majors) for routing features we don't need. The trade-off is that cache behaviour is ours to maintain.

## Bank holiday data pipeline

```
GOV.UK /bank-holidays.json ──(scripts/update-bank-holidays.mjs)──▶ src/data/bank-holidays.json ──(import)──▶ bundle
```

- The script trims the data to `{date, title}` from the start of last year onward, keeping the bundle small.
- `prebuild` runs the script with `--soft`: deploys pick up newly published holidays automatically, and a network failure never breaks a deploy.
- The data is bundled rather than fetched at runtime, so the app works offline, has no CORS dependency, and loads with no network requests.
- Data for other countries can be added by extending `Region` and the data file. The domain code only sees a `Map<IsoDate, title>`.

## Key decisions

| Decision | Alternatives considered | Why |
| --- | --- | --- |
| ISO strings for dates | `Date`, `date-fns`, Temporal | No timezone bugs; serialisable; trivially comparable |
| `useReducer` + one hook | Redux, Zustand | State is tiny; no extra dependency |
| `localStorage` | Backend + accounts | Zero hosting cost, private, works on static hosts |
| Canvas PNG renderer | DOM screenshot libraries | Deterministic output, no dependency, layout independent of screen |
| Build-time bank holiday snapshot | Runtime fetch from GOV.UK | Offline, no CORS risk, faster first load |
| Hand-written service worker | `vite-plugin-pwa`, Workbox | Tiny, no dependency, full control over the update prompt |
| Monday-first weeks | Locale-dependent | UK-focused audience; can become a setting later |

## Testing

- Unit tests sit next to the code they test (`*.test.ts`). They cover date maths (DST, leap years), leave-year boundaries, allowance rules, the calendar model, reducer behaviour, persistence and validation, and the integrity of the bundled bank holiday data.
- The canvas renderer has a pure `computeLayout()` that can be tested. Pixel output is checked manually for now (see the plan for visual regression tests).
