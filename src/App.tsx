import { useCallback, useRef, useState } from 'react'
import { CompaniesBar } from './components/CompaniesBar'
import { BridgeSuggestions } from './components/BridgeSuggestions'
import { PeopleBar } from './components/PeopleBar'
import { SettingsPanel } from './components/SettingsPanel'
import { SummaryBar } from './components/SummaryBar'
import { UpdateBanner } from './components/UpdateBanner'
import type { CompanyDayChoice } from './components/CompanyDayPopover'
import { newId } from './components/newId'
import { Legend, YearCalendar } from './components/YearCalendar'
import type { Bridge } from './domain/bridges'
import { REGIONS, type LeavePortion } from './domain/types'
import { downloadCanvasAsPng, downloadJson } from './export/download'
import { renderYearToCanvas } from './export/renderPng'
import { useMediaQuery } from './hooks/useMediaQuery'
import { describePlan, parsePlan, serialisePlan } from './state/plannerState'
import { usePlanner } from './state/usePlanner'

export default function App() {
  const { state, hadSavedState, dispatch, range, label, settings, activePerson, people, companies, editingCompany, editingCompanyIndex, yearView, summary, bridges, bridgeByDate, overEntitlementWarning, hasBankHolidayData } = usePlanner()
  // Same breakpoint as the single-column layout in styles.css.
  const smallScreen = useMediaQuery('(max-width: 860px)')
  const [exporting, setExporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const toggleDay = useCallback((date: string) => dispatch({ type: 'cycleLeave', date }), [dispatch])
  const setRange = useCallback(
    (start: string, end: string, portion: LeavePortion | undefined) =>
      dispatch({ type: 'setLeaveRange', start, end, portion }),
    [dispatch],
  )

  const bookBridge = useCallback(
    (b: Bridge) => dispatch({ type: 'setLeaveRange', start: b.start, end: b.end, portion: 'full' }),
    [dispatch],
  )

  const companyMode = editingCompany !== null
  const assignCompanyDays = useCallback(
    (companyId: string, dates: string[], choice: CompanyDayChoice) =>
      dispatch({ type: 'assignCompanyDays', companyId, dates, ...choice, idPrefix: newId('cd') }),
    [dispatch],
  )
  const removeCompanyDays = useCallback(
    (companyId: string, dates: string[]) => dispatch({ type: 'removeCompanyDays', companyId, dates }),
    [dispatch],
  )
  const companyDayAt = useCallback((date: string) => editingCompanyIndex.get(date), [editingCompanyIndex])

  const regionLabel = REGIONS.find((r) => r.id === settings.region)?.label ?? ''

  async function exportPng() {
    setExporting(true)
    try {
      const canvas = renderYearToCanvas(yearView, {
        title: `Annual leave ${label}`,
        subtitle: `${range.start} to ${range.end} · ${regionLabel} bank holidays`,
        people: people.map((p) => ({
          name: p.person.name,
          colour: p.person.colour,
          summary: p.summary,
          warning: p.warning ?? undefined,
        })),
      })
      await downloadCanvasAsPng(canvas, `annual-leave-${label.replace('/', '-')}.png`)
    } finally {
      setExporting(false)
    }
  }

  function exportJson() {
    downloadJson(serialisePlan(state), 'annual-leave-plan.json')
  }

  async function importJson(file: File) {
    const result = parsePlan(await file.text())
    if (!result.ok) {
      setImportError(result.message)
      return
    }
    setImportError(null)
    const { plan } = result
    if (confirm(`Replace your current plan?\n\nCurrent: ${describePlan(state)}\n\nImported: ${describePlan(plan)}`)) {
      dispatch({ type: 'replacePlan', plan })
    }
  }

  return (
    <div className="app">
      <UpdateBanner />
      <header className="app-header">
        <h1>Annual Leave Planner</h1>
        <p className="tagline">
          {editingCompany
            ? `Editing company days for ${editingCompany.name}. Click or tap a day to add, change or delete a company day. Shift-click or drag to pick a range; weekends and bank holidays are skipped.`
            : 'Leave is booked for the person selected below. Click or tap a working day to book leave, again for a half day, and again to clear. Shift-click or drag (swipe sideways on touch screens) to book or clear a range.'}
        </p>
      </header>

      <div className="layout">
        <aside>
          <SettingsPanel collapsible={smallScreen} defaultCollapsed={hadSavedState} settings={settings} activePerson={activePerson} peopleCount={people.length} companies={companies} dispatch={dispatch} />
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
                <button type="button" className="link year-nav-reset" onClick={() => dispatch({ type: 'resetYear' })}>
                  Current year
                </button>
              )}
            </div>
            <div className="actions">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  if (confirm(`Clear all of ${activePerson.name}’s leave in ${label}?`)) {
                    dispatch({ type: 'clearLeaveInRange', start: range.start, end: range.end })
                  }
                }}
              >
                Clear <span className="actions-name">{activePerson.name}</span>’s year
              </button>
              <button type="button" className="primary" onClick={exportPng} disabled={exporting}>
                {exporting ? 'Exporting…' : 'Download PNG'}
              </button>
              <button type="button" className="secondary" onClick={exportJson}>
                Export JSON
              </button>
              <button type="button" className="secondary" onClick={() => fileInput.current?.click()}>
                Import JSON
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (file) void importJson(file)
                }}
              />
            </div>
          </div>

          {importError && (
            <p className="notice" role="alert">
              {importError} Your current plan hasn’t changed.
            </p>
          )}

          <PeopleBar people={people} editing={companyMode} dispatch={dispatch} />

          <CompaniesBar companies={companies} editingCompanyId={state.editingCompanyId} range={range} dispatch={dispatch} />

          <SummaryBar summary={summary} warning={overEntitlementWarning} />

          {!hasBankHolidayData && (
            <p className="notice" role="status">
              Bank holiday data isn’t available for all of this leave year yet, so some may be missing.
            </p>
          )}

          <BridgeSuggestions bridges={companyMode ? [] : bridges} onBook={bookBridge} />

          <YearCalendar
            view={yearView}
            activeColour={companyMode ? 'var(--c-companyDay)' : activePerson.colour}
            bridgeByDate={companyMode ? undefined : bridgeByDate}
            onToggleDay={toggleDay}
            onSetRange={setRange}
            company={editingCompany}
            companyDayAt={companyDayAt}
            onAssignCompanyDays={assignCompanyDays}
            onRemoveCompanyDays={removeCompanyDays}
          />
          <Legend people={people.map((p) => ({ id: p.person.id, name: p.person.name, colour: p.person.colour }))} activeColour={activePerson.colour} showBridge={!companyMode && bridges.length > 0} />
        </main>
      </div>

      <footer className="app-footer">Version {__APP_VERSION__}</footer>
    </div>
  )
}
