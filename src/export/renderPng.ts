import type { AllowanceSummary } from '../domain/allowance'
import type { DayCell, YearView } from '../domain/calendar'
import { WEEKDAY_INITIALS_MON_FIRST } from '../domain/dates'
import { halfDayTint, legendItems, palette, textOn } from '../theme'

/**
 * Draws a leave year to a <canvas> for PNG export.
 *
 * We deliberately draw with the Canvas 2D API rather than screenshotting the
 * DOM (html2canvas / html-to-image): output is deterministic, independent of
 * screen size, needs no dependencies, and can't be broken by CSS changes.
 * Everything is laid out in CSS pixels and multiplied by `scale` for crispness.
 */

export interface ExportPerson {
  name: string
  colour: string
  summary: AllowanceSummary
  /** Over-entitlement warning for this person (see `overEntitlementMessage`). */
  warning?: string
}

export interface ExportMeta {
  title: string
  subtitle?: string
  /** Everyone in the plan, in display order. Never empty. */
  people: ExportPerson[]
}

export interface ExportOptions {
  columns?: number
  scale?: number
}

const CELL = 30
const MONTH_GAP = 28
const PADDING = 40
const HEADER_H = 96
const PERSON_ROW_H = 22
const LEGEND_ROW_H = 26
const LEGEND_BASE_H = 30
const MONTH_TITLE_H = 30
const WEEKDAY_H = 22
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
/** Room kept on the left of a multi-person header for the title and subtitle. */
const TITLE_RESERVED_W = 310
const LEGEND_NAME_MAX_W = 150

export interface Layout {
  width: number
  height: number
  columns: number
  rows: number
  monthWidth: number
  monthHeight: number
  headerHeight: number
  legendRows: number
  legendHeight: number
}

/**
 * Header height: the single-person header is fixed; with several people it
 * grows by one row per person plus a line reserved for the over-entitlement warning.
 */
function headerHeightFor(peopleCount: number): number {
  if (peopleCount <= 1) return HEADER_H
  return Math.max(HEADER_H, peopleCount * PERSON_ROW_H + PERSON_ROW_H + 14)
}

/**
 * Pure layout maths — kept separate from drawing so it can be unit tested.
 * `legendRows` is how many lines the legend wraps onto (see `renderYearToCanvas`).
 */
export function computeLayout(view: YearView, columns = 4, peopleCount = 1, legendRows = 1): Layout {
  const cols = Math.max(1, Math.min(columns, view.months.length))
  const rows = Math.ceil(view.months.length / cols)
  const maxWeeks = Math.max(...view.months.map((m) => m.weeks.length))
  const monthWidth = CELL * 7
  const monthHeight = MONTH_TITLE_H + WEEKDAY_H + CELL * maxWeeks
  const headerHeight = headerHeightFor(peopleCount)
  const legendRowsClamped = Math.max(1, legendRows)
  const legendHeight = LEGEND_BASE_H + legendRowsClamped * LEGEND_ROW_H
  return {
    columns: cols,
    rows,
    monthWidth,
    monthHeight,
    headerHeight,
    legendRows: legendRowsClamped,
    legendHeight,
    width: PADDING * 2 + cols * monthWidth + (cols - 1) * MONTH_GAP,
    height: PADDING * 2 + headerHeight + rows * monthHeight + (rows - 1) * MONTH_GAP + legendHeight,
  }
}

interface LegendEntry {
  label: string
  swatch: (ctx: CanvasRenderingContext2D, x: number, y: number) => void
}

function legendEntries(meta: ExportMeta): LegendEntry[] {
  const fixed: LegendEntry[] = legendItems.map((item) => ({
    label: item.label,
    swatch: (ctx, x, y) => {
      ctx.fillStyle = palette[item.key]
      roundRect(ctx, x, y - 8, 16, 16, 4)
      ctx.fill()
    },
  }))
  const halfSwatch = (colour: string): LegendEntry => ({
    label: 'Half day',
    swatch: (ctx, x, y) => drawHalfSwatch(ctx, x, y - 8, 16, colour),
  })
  if (meta.people.length === 1) {
    const colour = meta.people[0].colour
    return [
      {
        label: 'Annual leave',
        swatch: (ctx, x, y) => {
          ctx.fillStyle = colour
          roundRect(ctx, x, y - 8, 16, 16, 4)
          ctx.fill()
        },
      },
      halfSwatch(colour),
      ...fixed,
    ]
  }
  return [
    ...meta.people.map((p) => ({
      label: p.name,
      swatch: (ctx: CanvasRenderingContext2D, x: number, y: number) => {
        ctx.fillStyle = p.colour
        roundRect(ctx, x, y - 8, 16, 16, 4)
        ctx.fill()
      },
    })),
    halfSwatch(palette.textMuted),
    ...fixed,
  ]
}

function drawHalfSwatch(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, colour: string) {
  ctx.save()
  roundRect(ctx, x, y, size, size, 4)
  ctx.clip()
  ctx.fillStyle = halfDayTint(colour)
  ctx.fillRect(x, y, size, size)
  ctx.fillStyle = colour
  ctx.beginPath()
  ctx.moveTo(x + size, y)
  ctx.lineTo(x + size, y + size)
  ctx.lineTo(x, y + size)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/** Places legend entries left to right, wrapping to a new row when the width runs out. */
function layoutLegend(ctx: CanvasRenderingContext2D, entries: LegendEntry[], maxWidth: number) {
  ctx.font = `400 13px ${FONT}`
  const placed: { entry: LegendEntry; label: string; x: number; row: number }[] = []
  let x = 0
  let row = 0
  for (const entry of entries) {
    const label = fitText(ctx, entry.label, LEGEND_NAME_MAX_W)
    const w = 22 + ctx.measureText(label).width
    if (x > 0 && x + w > maxWidth) {
      row += 1
      x = 0
    }
    placed.push({ entry, label, x, row })
    x += w + 24
  }
  return { placed, rows: row + 1 }
}

/** Truncates `text` with an ellipsis so it measures at most `maxWidth` (in the current font). */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let end = text.length
  while (end > 0 && ctx.measureText(`${text.slice(0, end).trimEnd()}…`).width > maxWidth) end--
  return `${text.slice(0, end).trimEnd()}…`
}

export function renderYearToCanvas(
  view: YearView,
  meta: ExportMeta,
  options: ExportOptions = {},
  canvas: HTMLCanvasElement = document.createElement('canvas'),
): HTMLCanvasElement {
  const scale = options.scale ?? 2
  const people = meta.people
  const measure = document.createElement('canvas').getContext('2d')
  if (!measure) throw new Error('Canvas 2D context unavailable')
  const entries = legendEntries(meta)
  const baseWidth = computeLayout(view, options.columns, people.length).width
  const legendRows = layoutLegend(measure, entries, baseWidth - PADDING * 2).rows
  const layout = computeLayout(view, options.columns, people.length, legendRows)
  canvas.width = layout.width * scale
  canvas.height = layout.height * scale

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  ctx.scale(scale, scale)

  ctx.fillStyle = palette.background
  ctx.fillRect(0, 0, layout.width, layout.height)

  drawHeader(ctx, meta, layout)

  view.months.forEach((month, i) => {
    const col = i % layout.columns
    const row = Math.floor(i / layout.columns)
    const x = PADDING + col * (layout.monthWidth + MONTH_GAP)
    const y = PADDING + layout.headerHeight + row * (layout.monthHeight + MONTH_GAP)

    ctx.fillStyle = palette.text
    ctx.font = `600 15px ${FONT}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(month.label, x + 2, y + 18)

    ctx.fillStyle = palette.textMuted
    ctx.font = `500 11px ${FONT}`
    ctx.textAlign = 'center'
    WEEKDAY_INITIALS_MON_FIRST.forEach((d, j) => {
      ctx.fillText(d, x + j * CELL + CELL / 2, y + MONTH_TITLE_H + 14)
    })

    month.weeks.forEach((week, w) => {
      week.forEach((cell, d) => {
        if (!cell) return
        drawDay(ctx, cell, x + d * CELL, y + MONTH_TITLE_H + WEEKDAY_H + w * CELL)
      })
    })
  })

  drawLegend(ctx, layout, entries)
  return canvas
}

function summaryParts(s: AllowanceSummary, withEntitlement: boolean) {
  return [
    ...(withEntitlement ? [{ text: `Entitlement ${fmt(s.entitlement)}`, color: palette.text }] : []),
    { text: `Booked ${fmt(s.booked)}`, color: palette.text },
    ...(s.bankHolidaysDeducted
      ? [{ text: `Bank holidays ${fmt(s.bankHolidaysDeducted)}`, color: palette.text }]
      : []),
    ...(s.companyDaysDeducted
      ? [{ text: `Company days ${fmt(s.companyDaysDeducted)}`, color: palette.text }]
      : []),
    { text: `Remaining ${fmt(s.remaining)}`, color: s.remaining < 0 ? palette.warn : palette.text },
  ]
}

/** Draws coloured parts right to left from `right`, so each part can have its own colour. */
function drawParts(
  ctx: CanvasRenderingContext2D,
  parts: { text: string; color: string }[],
  right: number,
  y: number,
) {
  const separator = '   ·   '
  ctx.textAlign = 'right'
  let x = right
  for (let i = parts.length - 1; i >= 0; i--) {
    ctx.fillStyle = parts[i].color
    ctx.fillText(parts[i].text, x, y)
    x -= ctx.measureText(parts[i].text).width
    if (i > 0) {
      ctx.fillStyle = palette.text
      ctx.fillText(separator, x, y)
      x -= ctx.measureText(separator).width
    }
  }
}

function partsWidth(ctx: CanvasRenderingContext2D, parts: { text: string }[]): number {
  const separator = '   ·   '
  return (
    parts.reduce((sum, p) => sum + ctx.measureText(p.text).width, 0) +
    Math.max(0, parts.length - 1) * ctx.measureText(separator).width
  )
}

function drawHeader(ctx: CanvasRenderingContext2D, meta: ExportMeta, layout: Layout) {
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = palette.text
  ctx.font = `700 28px ${FONT}`
  const multi = meta.people.length > 1
  ctx.fillText(multi ? fitText(ctx, meta.title, TITLE_RESERVED_W - 20) : meta.title, PADDING, PADDING + 30)

  ctx.fillStyle = palette.textMuted
  ctx.font = `400 15px ${FONT}`
  if (meta.subtitle) ctx.fillText(multi ? fitText(ctx, meta.subtitle, TITLE_RESERVED_W - 20) : meta.subtitle, PADDING, PADDING + 56)

  const right = layout.width - PADDING
  if (meta.people.length === 1) {
    const [person] = meta.people
    ctx.font = `600 15px ${FONT}`
    drawParts(ctx, summaryParts(person.summary, true), right, PADDING + 30)
    if (person.warning) {
      ctx.fillStyle = palette.warn
      ctx.font = `600 14px ${FONT}`
      ctx.textAlign = 'right'
      ctx.fillText(person.warning, right, PADDING + 56)
    }
    return
  }

  // Several people: one row each (swatch, name, figures), then a compact warning line.
  const blockWidth = layout.width - PADDING * 2 - TITLE_RESERVED_W
  ctx.font = `600 13px ${FONT}`
  const rows = meta.people.map((p) => ({ person: p, parts: summaryParts(p.summary, false) }))
  const statsWidth = Math.max(...rows.map((r) => partsWidth(ctx, r.parts)))
  const nameMax = Math.max(60, Math.min(200, blockWidth - 20 - 16 - statsWidth))
  const nameX = right - statsWidth - 16 - nameMax
  rows.forEach(({ person, parts }, i) => {
    const cy = PADDING + 14 + i * PERSON_ROW_H
    ctx.fillStyle = person.colour
    roundRect(ctx, nameX - 20, cy - 7, 14, 14, 4)
    ctx.fill()
    ctx.font = `600 13px ${FONT}`
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.fillStyle = palette.text
    ctx.fillText(fitText(ctx, person.name, nameMax), nameX, cy + 1)
    drawParts(ctx, parts, right - statsWidth + partsWidth(ctx, parts), cy + 1)
  })

  const over = meta.people
    .filter((p) => p.summary.remaining < 0 || p.warning)
    .map((p) => (p.summary.remaining < 0 ? `${p.name} (−${fmt(-p.summary.remaining)})` : p.name))
  if (over.length > 0) {
    ctx.fillStyle = palette.warn
    ctx.font = `600 13px ${FONT}`
    ctx.textAlign = 'right'
    ctx.fillText(
      fitText(ctx, `Over entitlement: ${over.join(', ')}`, blockWidth + 20),
      right,
      PADDING + 14 + rows.length * PERSON_ROW_H + 1,
    )
  }
  ctx.textBaseline = 'alphabetic'
}

function drawDay(ctx: CanvasRenderingContext2D, cell: DayCell, x: number, y: number) {
  const inset = 2
  const size = CELL - inset * 2
  const left = x + inset
  const top = y + inset
  const people = cell.people

  ctx.globalAlpha = cell.inRange ? 1 : 0.35
  if (people.length > 0) {
    ctx.save()
    roundRect(ctx, left, top, size, size, 5)
    ctx.clip()
    const segW = size / people.length
    people.forEach((p, i) => {
      const x0 = left + i * segW
      const x1 = x0 + segW
      if (p.portion === 'half') {
        // Half days: lighter fill with the full colour on the lower-right triangle.
        ctx.fillStyle = halfDayTint(p.colour)
        ctx.fillRect(x0, top, segW, size)
        ctx.fillStyle = p.colour
        ctx.beginPath()
        ctx.moveTo(x1, top)
        ctx.lineTo(x1, top + size)
        ctx.lineTo(x0, top + size)
        ctx.closePath()
        ctx.fill()
      } else {
        ctx.fillStyle = p.colour
        ctx.fillRect(x0, top, segW, size)
      }
    })
    ctx.restore()
  } else {
    const fill = cellFill(cell)
    if (fill) {
      ctx.fillStyle = fill
      roundRect(ctx, left, top, size, size, 5)
      ctx.fill()
    }
  }
  if (cell.overLimit) {
    // Same marking as the screen: a warning-coloured outline inside the cell.
    ctx.strokeStyle = palette.warn
    ctx.lineWidth = 2.5
    roundRect(ctx, left + 1.25, top + 1.25, size - 2.5, size - 2.5, 4)
    ctx.stroke()
  }

  const cx = x + CELL / 2
  const cy = y + CELL / 2 + 1
  if (people.length > 1) {
    // Several colours behind the number: give it a small light backdrop.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)'
    roundRect(ctx, cx - 9, cy - 8, 18, 16, 4)
    ctx.fill()
  }
  ctx.fillStyle =
    people.length === 1 && people[0].portion === 'full' ? textOn(people[0].colour) : palette.text
  ctx.font = `500 12px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(cell.day), cx, cy)
  ctx.globalAlpha = 1
}

function cellFill(cell: DayCell): string | null {
  if (cell.kind === 'bank-holiday') return palette.bankHoliday
  if (cell.kind === 'company-day') return palette.companyDay
  if (cell.kind === 'non-working') return palette.nonWorking
  return null
}

function drawLegend(ctx: CanvasRenderingContext2D, layout: Layout, entries: LegendEntry[]) {
  const { placed } = layoutLegend(ctx, entries, layout.width - PADDING * 2)
  ctx.font = `400 13px ${FONT}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  for (const { entry, label, x, row } of placed) {
    const y = layout.height - PADDING - (layout.legendRows - row) * LEGEND_ROW_H + LEGEND_ROW_H / 2
    entry.swatch(ctx, PADDING + x, y)
    ctx.fillStyle = palette.text
    ctx.fillText(label, PADDING + x + 22, y + 1)
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}
