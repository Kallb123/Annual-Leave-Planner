import type { AllowanceSummary } from '../domain/allowance'
import type { DayCell, YearView } from '../domain/calendar'
import { WEEKDAY_INITIALS_MON_FIRST } from '../domain/dates'
import { legendItems, palette } from '../theme'

/**
 * Draws a leave year to a <canvas> for PNG export.
 *
 * We deliberately draw with the Canvas 2D API rather than screenshotting the
 * DOM (html2canvas / html-to-image): output is deterministic, independent of
 * screen size, needs no dependencies, and can't be broken by CSS changes.
 * Everything is laid out in CSS pixels and multiplied by `scale` for crispness.
 */

export interface ExportMeta {
  title: string
  subtitle?: string
  summary: AllowanceSummary
  /** Over-entitlement warning (see `overEntitlementMessage`); drawn under the summary. */
  warning?: string
}

export interface ExportOptions {
  columns?: number
  scale?: number
}

const CELL = 30
const MONTH_GAP = 28
const PADDING = 40
const HEADER_H = 96
const LEGEND_H = 56
const MONTH_TITLE_H = 30
const WEEKDAY_H = 22
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

export interface Layout {
  width: number
  height: number
  columns: number
  rows: number
  monthWidth: number
  monthHeight: number
}

/** Pure layout maths — kept separate from drawing so it can be unit tested. */
export function computeLayout(view: YearView, columns = 4): Layout {
  const cols = Math.max(1, Math.min(columns, view.months.length))
  const rows = Math.ceil(view.months.length / cols)
  const maxWeeks = Math.max(...view.months.map((m) => m.weeks.length))
  const monthWidth = CELL * 7
  const monthHeight = MONTH_TITLE_H + WEEKDAY_H + CELL * maxWeeks
  return {
    columns: cols,
    rows,
    monthWidth,
    monthHeight,
    width: PADDING * 2 + cols * monthWidth + (cols - 1) * MONTH_GAP,
    height: PADDING * 2 + HEADER_H + rows * monthHeight + (rows - 1) * MONTH_GAP + LEGEND_H,
  }
}

export function renderYearToCanvas(
  view: YearView,
  meta: ExportMeta,
  options: ExportOptions = {},
  canvas: HTMLCanvasElement = document.createElement('canvas'),
): HTMLCanvasElement {
  const scale = options.scale ?? 2
  const layout = computeLayout(view, options.columns)
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
    const y = PADDING + HEADER_H + row * (layout.monthHeight + MONTH_GAP)

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

  drawLegend(ctx, layout)
  return canvas
}

function drawHeader(ctx: CanvasRenderingContext2D, meta: ExportMeta, layout: Layout) {
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = palette.text
  ctx.font = `700 28px ${FONT}`
  ctx.fillText(meta.title, PADDING, PADDING + 30)

  ctx.fillStyle = palette.textMuted
  ctx.font = `400 15px ${FONT}`
  if (meta.subtitle) ctx.fillText(meta.subtitle, PADDING, PADDING + 56)

  const s = meta.summary
  const parts = [
    { text: `Entitlement ${fmt(s.entitlement)}`, color: palette.text },
    { text: `Booked ${fmt(s.booked)}`, color: palette.text },
    ...(s.bankHolidaysDeducted
      ? [{ text: `Bank holidays ${fmt(s.bankHolidaysDeducted)}`, color: palette.text }]
      : []),
    ...(s.companyDaysDeducted
      ? [{ text: `Company days ${fmt(s.companyDaysDeducted)}`, color: palette.text }]
      : []),
    { text: `Remaining ${fmt(s.remaining)}`, color: s.remaining < 0 ? palette.warn : palette.text },
  ]
  // Drawn right to left from the right edge so each part can have its own colour.
  const separator = '   ·   '
  ctx.textAlign = 'right'
  ctx.font = `600 15px ${FONT}`
  let x = layout.width - PADDING
  for (let i = parts.length - 1; i >= 0; i--) {
    ctx.fillStyle = parts[i].color
    ctx.fillText(parts[i].text, x, PADDING + 30)
    x -= ctx.measureText(parts[i].text).width
    if (i > 0) {
      ctx.fillStyle = palette.text
      ctx.fillText(separator, x, PADDING + 30)
      x -= ctx.measureText(separator).width
    }
  }

  if (meta.warning) {
    ctx.fillStyle = palette.warn
    ctx.font = `600 14px ${FONT}`
    ctx.fillText(meta.warning, layout.width - PADDING, PADDING + 56)
  }
}

function drawDay(ctx: CanvasRenderingContext2D, cell: DayCell, x: number, y: number) {
  const inset = 2
  const size = CELL - inset * 2
  const fill = cellFill(cell)

  ctx.globalAlpha = cell.inRange ? 1 : 0.35
  if (fill) {
    ctx.fillStyle = fill
    roundRect(ctx, x + inset, y + inset, size, size, 5)
    ctx.fill()
  }
  if (cell.leave === 'half') {
    // Half days: lighter fill with the full-day colour on the lower-right triangle.
    ctx.fillStyle = palette.leave
    ctx.beginPath()
    ctx.moveTo(x + inset + size, y + inset)
    ctx.lineTo(x + inset + size, y + inset + size)
    ctx.lineTo(x + inset, y + inset + size)
    ctx.closePath()
    ctx.fill()
  }
  if (cell.overLimit) {
    // Same marking as the screen: a warning-coloured outline inside the cell.
    ctx.strokeStyle = palette.warn
    ctx.lineWidth = 2.5
    roundRect(ctx, x + inset + 1.25, y + inset + 1.25, size - 2.5, size - 2.5, 4)
    ctx.stroke()
  }

  ctx.fillStyle = cell.leave === 'full' ? '#ffffff' : palette.text
  ctx.font = `500 12px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(cell.day), x + CELL / 2, y + CELL / 2 + 1)
  ctx.globalAlpha = 1
}

function cellFill(cell: DayCell): string | null {
  if (cell.leave === 'full') return palette.leave
  if (cell.leave === 'half') return palette.leaveHalf
  if (cell.kind === 'bank-holiday') return palette.bankHoliday
  if (cell.kind === 'company-day') return palette.companyDay
  if (cell.kind === 'non-working') return palette.nonWorking
  return null
}

function drawLegend(ctx: CanvasRenderingContext2D, layout: Layout) {
  let x = PADDING
  const y = layout.height - PADDING - 12
  ctx.font = `400 13px ${FONT}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  for (const item of legendItems) {
    ctx.fillStyle = palette[item.key]
    roundRect(ctx, x, y - 8, 16, 16, 4)
    ctx.fill()
    ctx.fillStyle = palette.text
    ctx.fillText(item.label, x + 22, y + 1)
    x += 22 + ctx.measureText(item.label).width + 24
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}
