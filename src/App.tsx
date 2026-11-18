import { useCallback, useState } from 'react'
import { SettingsPanel } from './components/SettingsPanel'
import { SummaryBar } from './components/SummaryBar'
import { Legend, YearCalendar } from './components/YearCalendar'
import { REGIONS, type LeavePortion } from './domain/types'
import { downloadCanvasAsPng } from './export/download'
import { renderYearToCanvas } from './export/renderPng'
import { usePlanner } from './state/usePlanner'

export default function App() {
  const { state, dispatch, range, label, yearView, summary, overEntitlementWarning, hasBankHolidayData } = usePlanner()
  const [exporting, setExporting] = useState(false)

  const toggleDay = useCallback((date: string) => dispatch({ type: 'cycleLeave', date }), [dispatch])
  const setRange = useCallback(
    (start: string, end: string, portion: LeavePortion | undefined) =>
      dispatch({ type: 'setLeaveRange', start, end, portion }),
    [dispatch],
  )

  const regionLabel = REGIONS.find((r) => r.id === state.settings.region)?.label ?? ''

  async function exportPng() {
    setExporting(true)
    try {
      const canvas = renderYearToCanvas(yearView, {
        title: `Annual leave ${label}`,
        subtitle: `${range.start} to ${range.end} · ${regionLabel} bank holidays`,
        summary,
        warning: overEntitlementWarning ?? undefined,
      })
      await downloadCanvasAsPng(canvas, `annual-leave-${label.replace('/', '-')}.png`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Annual Leave Planner</h1>
        <p className="tagline">Click a working day to book leave, again for a half day, and again to clear. Shift-click or drag to book or clear a range.</p>
      </header>

      <div className="layout">
        <aside>
          <SettingsPanel settings={state.settings} dispatch={dispatch} />
        </aside>

        <main className="panel">
          <div className="toolbar">
            <div className="year-nav">
              <button type="button" onClick={() => dispatch({ type: 'shiftYear', by: -1 })} aria-label="Previous leave year">
                ‹
              </button>
              <h2>{label}</h2>
              <button type="button" onClick={() => dispatch({ type: 'shiftYear', by: 1 })} aria-label="Next leave year">
                ›
              </button>
              {state.yearOffset !== 0 && (
                <button type="button" className="link" onClick={() => dispatch({ type: 'resetYear' })}>
                  Current year
                </button>
              )}
            </div>
            <div className="actions">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  if (confirm(`Clear all leave booked in ${label}?`)) {
                    dispatch({ type: 'clearLeaveInRange', start: range.start, end: range.end })
                  }
                }}
              >
                Clear year
              </button>
              <button type="button" className="primary" onClick={exportPng} disabled={exporting}>
                {exporting ? 'Exporting…' : 'Download PNG'}
              </button>
            </div>
          </div>

          <SummaryBar summary={summary} warning={overEntitlementWarning} />

          {!hasBankHolidayData && (
            <p className="notice" role="status">
              Bank holiday data isn’t available for all of this leave year yet, so some may be missing.
            </p>
          )}

          <YearCalendar view={yearView} onToggleDay={toggleDay} onSetRange={setRange} />
          <Legend />
        </main>
      </div>
    </div>
  )
}
