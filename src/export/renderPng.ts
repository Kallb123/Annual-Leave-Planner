import type { AllowanceSummary } from '../domain/allowance'
import type { DayCell, PersonLeave, YearView } from '../domain/calendar'
import { WEEKDAY_INITIALS_MON_FIRST } from '../domain/dates'
import type { DayStyle } from '../domain/types'
import { companyDayColours, halfDayTint, legendItems, palette, textOn } from '../theme'

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
  /** Filled swatch and cells, or an outline. */
  style: DayStyle
  /** False for someone who just marks dates: the header shows "Marked n" and there is no entitlement. */
  tracksAllowance: boolean
  summary: AllowanceSummary
  /** Over-entitlement warning for this person (see `overEntitlementMessage`). */
  warning?: string
  /** This person's leave year, when it differs from the one the calendar shows (e.g. "2026/27"). */
  yearLabel?: string
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
const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
const FONT_DISPLAY = '"Space Grotesk", Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
const HALF_TINT = 0.2
const CELL_RADIUS = 6
/** Gap between nested outlines in one cell. */
const OUTLINE_STEP = 3
/** How far an open outline side runs past the cell edge (it is clipped, so only the straight lines show). */
const OUTLINE_BLEED = 10
/** Inset of the white month card from the page edge. */
const CARD_INSET = 16
const CARD_RADIUS = 18

/**
 * Loads the web fonts the renderer draws with, so the canvas doesn't fall back to system fonts.
 * Resolves even when the fonts are unavailable (or `document.fonts` is missing).
 */
export async function loadExportFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts?.load) return
  const specs = ['400 13px Inter', '500 13px Inter', '600 13px Inter', '700 13px Inter', '600 15px "Space Grotesk"']
  try {
    await Promise.all(specs.map((spec) => document.fonts.load(spec)))
  } catch {
    // Fall back to the system fonts in the stack.
  }
}
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

/** A legend or header swatch: a filled rounded square, or a stroked one for the outline style. */
function drawSwatch(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  colour: string,
  style: DayStyle,
  radius = 4,
) {
  if (style === 'outline') {
    ctx.strokeStyle = colour
    ctx.lineWidth = 2
    roundRect(ctx, x + 1, y + 1, size - 2, size - 2, radius - 1)
    ctx.stroke()
  } else {
    ctx.fillStyle = colour
    roundRect(ctx, x, y, size, size, radius)
    ctx.fill()
  }
}

function legendEntries(meta: ExportMeta, company: YearView['company']): LegendEntry[] {
  const fixed: LegendEntry[] = legendItems.map((item) => ({
    label: item.label,
    swatch: (ctx, x, y) => {
      if (item.key === 'companyDay' && company) {
        const colour = company.style === 'outline' ? company.colour : companyDayColours(company.colour).fill
        drawSwatch(ctx, x, y - 8, 16, colour, company.style)
      } else {
        drawSwatch(ctx, x, y - 8, 16, palette[item.key], 'fill')
      }
    },
  }))
  const halfSwatch = (colour: string): LegendEntry => ({
    label: 'Half day',
    swatch: (ctx, x, y) => drawHalfSwatch(ctx, x, y - 8, 16, colour),
  })
  if (meta.people.length === 1) {
    const [person] = meta.people
    const colour = person.colour
    return [
      {
        label: person.tracksAllowance ? 'Annual leave' : person.name,
        swatch: (ctx, x, y) => drawSwatch(ctx, x, y - 8, 16, colour, person.style),
      },
      halfSwatch(colour),
      ...fixed,
    ]
  }
  return [
    ...meta.people.map((p) => ({
      label: p.name,
      swatch: (ctx: CanvasRenderingContext2D, x: number, y: number) => drawSwatch(ctx, x, y - 8, 16, p.colour, p.style),
    })),
    halfSwatch(palette.textMuted),
    ...fixed,
  ]
}

function drawHalfSwatch(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, colour: string) {
  ctx.fillStyle = halfDayTint(colour, HALF_TINT)
  roundRect(ctx, x, y, size, size, 4)
  ctx.fill()
  ctx.strokeStyle = colour
  ctx.lineWidth = 1.5
  roundRect(ctx, x + 0.75, y + 0.75, size - 1.5, size - 1.5, 3.25)
  ctx.stroke()
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
  const entries = legendEntries(meta, view.company)
  const baseWidth = computeLayout(view, options.columns, people.length).width
  const legendRows = layoutLegend(measure, entries, baseWidth - PADDING * 2).rows
  const layout = computeLayout(view, options.columns, people.length, legendRows)
  canvas.width = layout.width * scale
  canvas.height = layout.height * scale

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  ctx.scale(scale, scale)

  ctx.fillStyle = palette.surface
  ctx.fillRect(0, 0, layout.width, layout.height)
  // White card behind the months and the legend.
  const cardTop = PADDING + layout.headerHeight - CARD_INSET
  ctx.fillStyle = palette.background
  roundRect(ctx, CARD_INSET, cardTop, layout.width - CARD_INSET * 2, layout.height - CARD_INSET - cardTop, CARD_RADIUS)
  ctx.fill()
  ctx.strokeStyle = palette.border
  ctx.lineWidth = 1
  roundRect(ctx, CARD_INSET + 0.5, cardTop + 0.5, layout.width - CARD_INSET * 2 - 1, layout.height - CARD_INSET - cardTop - 1, CARD_RADIUS)
  ctx.stroke()

  drawHeader(ctx, meta, layout)

  view.months.forEach((month, i) => {
    const col = i % layout.columns
    const row = Math.floor(i / layout.columns)
    const x = PADDING + col * (layout.monthWidth + MONTH_GAP)
    const y = PADDING + layout.headerHeight + row * (layout.monthHeight + MONTH_GAP)

    ctx.fillStyle = palette.text
    ctx.font = `600 15px ${FONT_DISPLAY}`
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
        drawDay(ctx, cell, x + d * CELL, y + MONTH_TITLE_H + WEEKDAY_H + w * CELL, d, view.company)
      })
    })
  })

  drawLegend(ctx, layout, entries)
  return canvas
}

/** Header figures for one person: "Marked n" alone for someone with no allowance. */
export function summaryParts(person: Pick<ExportPerson, 'summary' | 'tracksAllowance' | 'yearLabel'>, withEntitlement: boolean) {
  const s = person.summary
  const year = person.yearLabel ? [{ text: person.yearLabel, color: palette.textMuted }] : []
  if (!person.tracksAllowance) return [...year, { text: `Marked ${fmt(s.booked)}`, color: palette.text }]
  return [
    ...year,
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
  ctx.font = `600 28px ${FONT_DISPLAY}`
  const multi = meta.people.length > 1
  ctx.fillText(multi ? fitText(ctx, meta.title, TITLE_RESERVED_W - 20) : meta.title, PADDING, PADDING + 30)

  ctx.fillStyle = palette.textMuted
  ctx.font = `400 15px ${FONT}`
  if (meta.subtitle) ctx.fillText(multi ? fitText(ctx, meta.subtitle, TITLE_RESERVED_W - 20) : meta.subtitle, PADDING, PADDING + 56)

  const right = layout.width - PADDING
  if (meta.people.length === 1) {
    const [person] = meta.people
    ctx.font = `600 15px ${FONT}`
    drawParts(ctx, summaryParts(person, true), right, PADDING + 30)
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
  const rows = meta.people.map((p) => ({ person: p, parts: summaryParts(p, false) }))
  const statsWidth = Math.max(...rows.map((r) => partsWidth(ctx, r.parts)))
  const nameMax = Math.max(60, Math.min(200, blockWidth - 20 - 16 - statsWidth))
  const nameX = right - statsWidth - 16 - nameMax
  rows.forEach(({ person, parts }, i) => {
    const cy = PADDING + 14 + i * PERSON_ROW_H
    drawSwatch(ctx, nameX - 20, cy - 7, 14, person.colour, person.style)
    ctx.font = `600 13px ${FONT}`
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.fillStyle = palette.text
    ctx.fillText(fitText(ctx, person.name, nameMax), nameX, cy + 1)
    drawParts(ctx, parts, right - statsWidth + partsWidth(ctx, parts), cy + 1)
  })

  const over = meta.people
    .filter((p) => p.tracksAllowance && (p.summary.remaining < 0 || p.warning))
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

/** Which sides of an outline are open (joined to the next day) in this week column (0 = Monday, 6 = Sunday). */
export function outlineSides(joinsPrev: boolean, joinsNext: boolean, column: number) {
  return { left: joinsPrev && column > 0, right: joinsNext && column < 6 }
}

export interface OutlineLayer {
  colour: string
  half: boolean
  joinsPrev: boolean
  joinsNext: boolean
}

/** Outlines to draw on a day, outermost first: each outline person, then the company day if it is outlined. */
export function outlineLayers(cell: DayCell, company: YearView['company']): OutlineLayer[] {
  const layers: OutlineLayer[] = cell.people
    .filter((p) => p.style === 'outline')
    .map((p) => ({ colour: p.colour, half: p.portion === 'half', joinsPrev: p.joinsPrev, joinsNext: p.joinsNext }))
  if (company?.style === 'outline' && cell.kind === 'company-day') {
    layers.push({ colour: company.colour, half: false, joinsPrev: cell.companyJoinsPrev, joinsNext: cell.companyJoinsNext })
  }
  return layers
}

/**
 * Strokes one outline layer. The shape is clipped to the cell's own box, and a joined side is pushed
 * past the clip so it draws open (just the straight top and bottom lines); neighbouring cells meet at
 * the cell edge, so a run reads as one continuous outline.
 */
function drawOutline(ctx: CanvasRenderingContext2D, layer: OutlineLayer, index: number, column: number, x: number, y: number) {
  const sides = outlineSides(layer.joinsPrev, layer.joinsNext, column)
  const inset = 3 + index * OUTLINE_STEP
  const left = sides.left ? x - OUTLINE_BLEED : x + inset
  const right = sides.right ? x + CELL + OUTLINE_BLEED : x + CELL - inset
  const top = y + inset
  const bottom = y + CELL - inset
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, CELL, CELL)
  ctx.clip()
  ctx.strokeStyle = layer.colour
  ctx.lineWidth = 2
  if (layer.half) ctx.setLineDash([3, 2])
  const r = Math.max(1, CELL_RADIUS - index)
  roundRect(ctx, left, top, right - left, bottom - top, [sides.left ? 0 : r, sides.right ? 0 : r, sides.right ? 0 : r, sides.left ? 0 : r])
  ctx.stroke()
  ctx.restore()
}

function drawDay(
  ctx: CanvasRenderingContext2D,
  cell: DayCell,
  x: number,
  y: number,
  column: number,
  company: YearView['company'],
) {
  const inset = 2
  const size = CELL - inset * 2
  const left = x + inset
  const top = y + inset
  const people: PersonLeave[] = cell.people.filter((p) => p.style === 'fill')

  ctx.globalAlpha = cell.inRange ? 1 : 0.35
  if (people.length === 1) {
    const [p] = people
    roundRect(ctx, left, top, size, size, CELL_RADIUS)
    if (p.portion === 'half') {
      // Half day: pale tint with a ring in the person's colour (told apart by lightness, not hue).
      ctx.fillStyle = halfDayTint(p.colour, HALF_TINT)
      ctx.fill()
      ctx.strokeStyle = p.colour
      ctx.lineWidth = 1.5
      roundRect(ctx, left + 0.75, top + 0.75, size - 1.5, size - 1.5, CELL_RADIUS - 0.75)
      ctx.stroke()
    } else {
      ctx.fillStyle = p.colour
      ctx.fill()
    }
  } else if (people.length > 1) {
    // Equal diagonal bands (135 degrees), one per person.
    const g = ctx.createLinearGradient(left, top, left + size, top + size)
    const step = 1 / people.length
    people.forEach((p, i) => {
      const c = p.portion === 'half' ? halfDayTint(p.colour, HALF_TINT) : p.colour
      g.addColorStop(i * step, c)
      g.addColorStop((i + 1) * step, c)
    })
    ctx.fillStyle = g
    roundRect(ctx, left, top, size, size, CELL_RADIUS)
    ctx.fill()
  } else {
    const fill = cellFill(cell, company)
    if (fill) {
      ctx.fillStyle = fill
      roundRect(ctx, left, top, size, size, CELL_RADIUS)
      ctx.fill()
    }
  }
  outlineLayers(cell, company).forEach((layer, i) => drawOutline(ctx, layer, i, column, x, y))
  if (cell.overLimit) {
    // Same marking as the screen: a warning-coloured outline inside the cell.
    ctx.strokeStyle = palette.warn
    ctx.lineWidth = 2
    roundRect(ctx, left + 1, top + 1, size - 2, size - 2, CELL_RADIUS - 1)
    ctx.stroke()
  }

  const cx = x + CELL / 2
  const cy = y + CELL / 2 + 1
  const allFull = people.length > 1 && people.every((p) => p.portion === 'full')
  if (people.length > 1 && !allFull) {
    // Light and dark bands behind the number: give it a small light backdrop.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.88)'
    roundRect(ctx, cx - 9, cy - 8, 18, 16, 8)
    ctx.fill()
  }
  ctx.fillStyle = numberColour(cell, people, company)
  ctx.font = `${cell.people.length > 0 || cell.kind === 'bank-holiday' || cell.kind === 'company-day' ? 600 : 500} 12px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if (allFull) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)'
    ctx.shadowOffsetY = 1
    ctx.shadowBlur = 2
  }
  ctx.fillText(String(cell.day), cx, cy)
  ctx.shadowColor = 'transparent'
  ctx.shadowOffsetY = 0
  ctx.shadowBlur = 0
  ctx.globalAlpha = 1
}

/** Number colour; `fillPeople` are the people whose cells are filled (outline people leave the cell's own colouring). */
function numberColour(cell: DayCell, fillPeople: PersonLeave[], company: YearView['company']): string {
  if (fillPeople.length === 1) return fillPeople[0].portion === 'full' ? textOn(fillPeople[0].colour) : palette.text
  if (fillPeople.length > 1) return fillPeople.every((p) => p.portion === 'full') ? '#ffffff' : palette.text
  if (cell.kind === 'bank-holiday') return palette.bankHolidayText
  if (cell.kind === 'company-day') {
    if (!company) return palette.companyDayText
    return company.style === 'fill' ? companyDayColours(company.colour).text : palette.text
  }
  if (cell.kind === 'non-working') return palette.nonWorkingText
  return palette.text
}

function cellFill(cell: DayCell, company: YearView['company']): string | null {
  if (cell.kind === 'bank-holiday') return palette.bankHoliday
  if (cell.kind === 'company-day') {
    if (!company) return palette.companyDay
    return company.style === 'fill' ? companyDayColours(company.colour).fill : null
  }
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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number | number[]) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}
