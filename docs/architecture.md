# Architecture

## Goals and constraints

| Constraint | Consequence |
| --- | --- |
| Host on Vercel or Cloudflare Pages | Pure static SPA, no server runtime, no platform-specific code |
| Simple, personal tool | No accounts and no backend. State lives in the browser. |
| PNG download | Client-side rendering to `<canvas>` |
| Bank holidays must be correct | Use the official GOV.UK data rather than computing dates ourselves |
| Easy to change later | Domain logic kept separate from React and from the renderers |

## Stack

- **Vite + React + TypeScript** – fast builds, static output, widely supported by both hosts.
- **Vitest** for unit tests, **oxlint** for linting.
- **No runtime dependencies** beyond React. Date handling and PNG export are hand-written (small and fully tested) rather than pulling in `date-fns`/`html2canvas`.

## High-level flow

```
                ┌──────────────────────────┐
 user input ──▶ │ state/plannerState.ts    │  reducer + validation + localStorage
                │  { settings, leave }     │
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
- **`allowance.ts`**: classifies each day as `working`, `non-working` or `bank-holiday`, and computes the `AllowanceSummary` (entitlement, booked, bank holidays deducted, remaining).
- **`calendar.ts`**: builds a `YearView`, a list of months, each a grid of Monday-first weeks of `DayCell`s. This is the **single model both renderers draw from**, so the screen and the PNG can't disagree.

### `src/state/` – application state

- **Persisted state** is just `{ settings, leave }`. Everything else is derived.
- `leave` is a map of `IsoDate → 'full' | 'half'`, **independent of leave years**. Changing the reset date regroups existing bookings into new leave years rather than losing them.
- Leave stored on a day that later becomes unbookable (for example after changing working days) stays stored but isn't counted or shown. Changing the setting back brings it back.
- `localStorage` holds a versioned envelope (`{ version: 1, settings, leave }`). Loading validates every field and falls back to defaults on anything unexpected. Future schema changes add a migration keyed on `version`.
- `usePlanner()` is the only hook components need. It returns state, `dispatch` and the memoised derived data.

### `src/components/` – React UI

Presentational components that render props and dispatch actions. They contain no date or allowance logic.

- `SettingsPanel`: allowance, carry-over, leave-year start, region, working days, bank-holiday deduction.
- `YearCalendar`: months and days. Each day is a `<button>`, disabled when the day isn't bookable, with an `aria-label` and holiday names in the `title`.
- `SummaryBar`, `Legend`.

### `src/export/` – PNG export

- `renderPng.ts` draws a `YearView` straight onto a canvas with the 2D API at 2× scale. `computeLayout()` is pure and separate from drawing.
- `download.ts` turns the canvas into a Blob and triggers a download.

**Why not screenshot the DOM?** Libraries like `html2canvas` and `html-to-image` re-implement CSS layout and break on fonts, gradients and responsive layouts. Drawing from the model gives a consistent, print-friendly layout (always 4 × 3) whatever the user's screen size, and adds no dependencies.

### `src/theme.ts` – shared palette

The palette is defined once in TypeScript. On startup `applyPaletteToCss()` writes it to CSS custom properties (`--c-leave`, …) for the UI, and the canvas renderer reads the same object, so colours always match.

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
| Monday-first weeks | Locale-dependent | UK-focused audience; can become a setting later |

## Testing

- Unit tests sit next to the code they test (`*.test.ts`). They cover date maths (DST, leap years), leave-year boundaries, allowance rules, the calendar model, reducer behaviour, persistence and validation, and the integrity of the bundled bank holiday data.
- The canvas renderer has a pure `computeLayout()` that can be tested. Pixel output is checked manually for now (see the plan for visual regression tests).
