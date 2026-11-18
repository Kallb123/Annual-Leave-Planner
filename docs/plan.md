# Plan & roadmap

## Problem

People with a fixed annual leave allowance want to see the whole leave year at a glance, place their leave around bank holidays, know how many days they have left, and share the plan (with a manager, a partner, or on the fridge) as an image.

## Scope for v1

**In scope**

- Allowance in days (half days allowed), plus carried-over days
- Configurable leave year start (any day and month)
- UK bank holidays by region (England & Wales, Scotland, Northern Ireland)
- Option to deduct bank holidays from the allowance
- Configurable working days (part-time patterns)
- Book full or half days by clicking
- Running totals: entitlement, booked, remaining
- Move between leave years
- Download the leave year as a PNG
- Data saved in the browser

**Out of scope for v1**

- Accounts, sync or a backend
- Team or shared calendars
- Leave allowances in hours
- Non-UK public holidays (the design allows them, see below)
- Approval workflows

## Milestones

### M0 – Groundwork ✅ (this commit)

- [x] Vite + React + TypeScript scaffold, oxlint, Vitest, CI workflow
- [x] Domain model: dates, leave year, bank holidays, allowance, calendar view model
- [x] Reducer, validation, versioned `localStorage` persistence
- [x] Working UI: settings, year navigation, clickable calendar, summary, legend
- [x] Canvas PNG export with title, summary and legend
- [x] Bundled GOV.UK bank holidays, refreshed at build time
- [x] Docs: README, architecture, plan, deployment

### M1 – Usable v1

- [x] Drag or shift-click to select a range of days
- [ ] Choose AM or PM for half days, and show which in the UI and PNG
- [ ] Better number inputs: allow an empty field while typing, validate on blur
- [ ] Warn when booked leave exceeds the entitlement (currently only shown in the summary)
- [ ] "Bridge" suggestions: highlight days that join bank holidays to weekends
- [ ] Mobile layout pass: larger touch targets and a collapsible settings panel
- [ ] Deploy to production (Vercel or Cloudflare Pages) and add the URL to the README

### M2 – Export & sharing

- [ ] PNG options: orientation (4×3 or 3×4), include or hide the summary, a custom title
- [ ] Optional user name or label on the export
- [ ] Export or import plan as JSON (backup and moving between devices)
- [ ] iCal (`.ics`) export of booked leave
- [ ] Shareable read-only link (plan encoded in the URL hash, so still no backend)

### M3 – Polish & breadth

- [ ] Dark mode (the palette is already centralised in `theme.ts`)
- [ ] Locale settings: first day of week, date format
- [ ] Other countries' public holidays (for example via the Nager.Date API at build time)
- [ ] Custom "company days" (office closures, extra holidays)
- [ ] Accessibility audit (keyboard grid navigation with arrow keys, screen reader pass)
- [ ] Visual regression tests for the PNG renderer (Playwright screenshot comparison)
- [ ] Installable PWA with offline support

## Open questions

1. **Leave in hours?** Some employers use hours. This would change the `LeavePortion` model to a number, so it's worth deciding before v1 ships.
2. **Allowance pro-rating** for people who join mid-year: a manual "allowance this year" override may be enough.
3. **Carry-over limits**: should carry-over be calculated automatically from the previous leave year's remaining days, with a cap?
4. **Where to host?** Both hosts work identically today. Cloudflare Pages has unlimited bandwidth on the free plan. Vercel has slightly smoother preview deployments. Either is fine.

## Known limitations

- Bank holiday data only runs as far as GOV.UK has published (usually the end of next year). The UI shows a notice when a leave year goes past it.
- Data is stored per browser. Clearing site data removes the plan (JSON export in M2 addresses this).
