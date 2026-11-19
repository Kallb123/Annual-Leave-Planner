import { useCallback, useState, type CSSProperties } from 'react'
import { BridgeSuggestions } from './components/BridgeSuggestions'
import { CompaniesBar, ModeToggle } from './components/CompaniesBar'
import type { CompanyDayChoice } from './components/CompanyDayPopover'
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon, LogoMark, SettingsIcon } from './components/Icons'
import { newId } from './components/newId'
import { PeopleBar } from './components/PeopleBar'
import { SettingsDrawer, type SettingsTab } from './components/SettingsDrawer'
import { SummaryBar } from './components/SummaryBar'
import { UpdateBanner } from './components/UpdateBanner'
import { Legend, YearCalendar } from './components/YearCalendar'
import type { Bridge } from './domain/bridges'
import { formatBridgeDates } from './domain/bridges'
import { REGIONS, type LeavePortion } from './domain/types'
import { downloadCanvasAsPng, downloadJson } from './export/download'
import { loadExportFonts, renderYearToCanvas } from './export/renderPng'
import { useMediaQuery } from './hooks/useMediaQuery'
import { companyDayColours } from './theme'
import { companyOf, describePlan, parsePlan, serialisePlan } from './state/plannerState'
import { usePlanner } from './state/usePlanner'
import './App.css'

/** Company tones for the mode pill, hint bar and usage bar (CSS falls back to the default palette). */
function companyVars(colour: string | undefined): CSSProperties {
  if (!colour) return {}
  const { fill, text, mark } = companyDayColours(colour)
  return { '--company-fill': fill, '--company-text': text, '--company-mark': mark } as CSSProperties
}

export default function App() {
  const { state, dispatch, range, label, settings, activePerson, people, companies, editingCompany, editingCompanyIndex, viewCompany, yearView, summary, bridges, bridgeByDate, overEntitlementWarning, hasBankHolidayData } = usePlanner()
  // Same breakpoint as the phone layout in App.css.
  const phone = useMediaQuery('(max-width: 600px)')
  const [exporting, setExporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('people')

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
  const shownBridges = companyMode ? [] : bridges
  // Phones edit company days through a toggle: the company being edited, else the active person's, else the first.
  const toggleCompany = editingCompany ?? companyOf(companies, activePerson) ?? companies[0] ?? null

  function openSettings(tab: SettingsTab = 'people') {
    setSettingsTab(tab)
    setSettingsOpen(true)
  }

  async function exportPng() {
    setExporting(true)
    try {
      await loadExportFonts()
      const canvas = renderYearToCanvas(yearView, {
        title: `Annual leave ${label}`,
        subtitle: `${formatBridgeDates(range.start, range.end)} · ${regionLabel}`,
        people: people.map((p) => ({
          name: p.person.name,
          colour: p.person.colour,
          style: p.person.style,
          tracksAllowance: p.person.tracksAllowance,
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
      setImportError(`${result.message} Your current plan hasn’t changed.`)
      return
    }
    setImportError(null)
    const { plan } = result
    if (confirm(`Replace your current plan?\n\nCurrent: ${describePlan(state)}\n\nImported: ${describePlan(plan)}`)) {
      dispatch({ type: 'replacePlan', plan })
    }
  }

  const marksDates = !activePerson.tracksAllowance
  const leaveHint = marksDates
    ? phone
      ? 'Tap a day to mark or clear it. Swipe for a range.'
      : 'Click any day to mark it, again to clear. Shift-click or drag for a range.'
    : phone
      ? 'Tap: full, half, clear. Swipe for a range.'
      : 'Click a working day for a full day, again for half, again to clear. Shift-click or drag for a range.'
  const modeVerb = marksDates ? 'Marking dates for' : 'Booking for'
  // Tone of the company mark in the mode pill and hint bar: the company being edited, else the person's.
  const markColour = (editingCompany ?? companyOf(companies, activePerson))?.colour
  const companyHint = phone
    ? 'Tap a day to add, change or delete.'
    : `Click a day to add, change or delete a company day; it applies to everyone at ${editingCompany?.name ?? 'this company'}. Drag or shift-click for a range.`

  return (
    <div className={`app${phone ? ' app--phone' : ''}`} style={{ '--person-colour': activePerson.colour, ...companyVars(markColour) } as CSSProperties}>
      <header className="app-header">
        <div className="brand">
          <LogoMark />
          <h1 className="brand-name">Leave Planner</h1>
        </div>

        <div className="year-nav">
          <button type="button" className="btn btn-ghost icon-btn year-nav-arrow" onClick={() => dispatch({ type: 'shiftYear', by: -1 })} aria-label="Previous leave year">
            <ChevronLeftIcon size={18} />
          </button>
          <div className="year-nav-label">
            <span className="year-nav-year" aria-live="polite">
              {label}
            </span>
            <span className="year-nav-sub">
              {phone ? regionLabel : `${formatBridgeDates(range.start, range.end)} · ${regionLabel}`}
            </span>
          </div>
          <button type="button" className="btn btn-ghost icon-btn year-nav-arrow" onClick={() => dispatch({ type: 'shiftYear', by: 1 })} aria-label="Next leave year">
            <ChevronRightIcon size={18} />
          </button>
          {state.yearOffset !== 0 && (
            <button type="button" className="btn btn-link year-nav-reset" onClick={() => dispatch({ type: 'resetYear' })}>
              Current year
            </button>
          )}
        </div>

        <div className="header-actions">
          {phone ? (
            <>
              <button type="button" className="btn btn-ghost icon-btn" aria-label="Settings" onClick={() => openSettings()}>
                <SettingsIcon size={20} />
              </button>
              <button type="button" className="btn btn-primary icon-btn" aria-label={exporting ? 'Exporting PNG' : 'Download PNG'} onClick={exportPng} disabled={exporting}>
                <DownloadIcon size={18} />
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => openSettings()}>
                <SettingsIcon />
                Settings
              </button>
              <button type="button" className="btn btn-primary" onClick={exportPng} disabled={exporting}>
                <DownloadIcon />
                {exporting ? 'Exporting…' : 'Download PNG'}
              </button>
            </>
          )}
        </div>
      </header>

      <UpdateBanner />

      <div className="layout">
        {phone ? (
          <PeopleBar people={people} companies={companies} editing={companyMode} variant="chips" dispatch={dispatch} />
        ) : (
          <aside className="rail" aria-label="People, company days and bridge ideas">
            <PeopleBar people={people} companies={companies} editing={companyMode} dispatch={dispatch} />
            <CompaniesBar companies={companies} people={people.map((p) => p.person)} editingCompanyId={state.editingCompanyId} range={range} dispatch={dispatch} />
            <BridgeSuggestions bridges={shownBridges} name={activePerson.name} onBook={bookBridge} />
          </aside>
        )}

        <main className="main">
          <SummaryBar
            summary={summary}
            name={activePerson.name}
            colour={activePerson.colour}
            label={label}
            allowanceDays={settings.allowanceDays}
            carryOverDays={settings.carryOverDays}
            warning={overEntitlementWarning}
            compact={phone}
            tracksAllowance={activePerson.tracksAllowance}
            companyColour={companyOf(companies, activePerson)?.colour ?? null}
          />

          {phone && <BridgeSuggestions bridges={shownBridges} name={activePerson.name} onBook={bookBridge} compact />}

          {!hasBankHolidayData && (
            <p className="notice" role="status">
              Bank holiday data isn’t available for all of this leave year yet, so some may be missing.
            </p>
          )}

          {phone && toggleCompany && <ModeToggle company={toggleCompany} editing={companyMode} dispatch={dispatch} />}

          <section className="calendar-card" aria-label={`Leave calendar ${label}`}>
            {!phone && (
              <div className="mode-strip">
                {companyMode ? (
                  <>
                    <div className="mode-strip-text">
                      <span className="mode-pill mode-pill--company">
                        <span className="mode-pill-mark" aria-hidden="true" />
                        Editing company days for {editingCompany.name}
                      </span>
                      <span className="mode-strip-hint">{companyHint}</span>
                    </div>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => dispatch({ type: 'stopEditingCompany' })}>
                      Done
                    </button>
                  </>
                ) : (
                  <div className="mode-strip-text">
                    <span className="mode-pill">
                      <span className="mode-pill-dot" aria-hidden="true" />
                      {modeVerb} {activePerson.name}
                    </span>
                    <span className="mode-strip-hint">{leaveHint}</span>
                  </div>
                )}
              </div>
            )}

            <YearCalendar
              view={yearView}
              activeColour={editingCompany ? editingCompany.colour : activePerson.colour}
              allowHalfDays={activePerson.tracksAllowance}
              bridgeByDate={companyMode ? undefined : bridgeByDate}
              onToggleDay={toggleDay}
              onSetRange={setRange}
              company={editingCompany}
              companyDayAt={companyDayAt}
              onAssignCompanyDays={assignCompanyDays}
              onRemoveCompanyDays={removeCompanyDays}
            />
            <Legend
              people={people.map((p) => ({ id: p.person.id, name: p.person.name, colour: p.person.colour, style: p.person.style }))}
              activeColour={activePerson.colour}
              showBridge={!companyMode && bridges.length > 0}
              company={viewCompany}
            />
          </section>

          <footer className="app-footer">Saved in this browser only · Version {__APP_VERSION__}</footer>
        </main>
      </div>

      {phone && (
        <div className="hint-bar">
          <span className={`hint-bar-mark${companyMode ? ' hint-bar-mark--company' : ''}`} aria-hidden="true" />
          <span>
            <strong>{companyMode ? `Editing ${editingCompany.name} days` : `${modeVerb} ${activePerson.name}`}</strong> · {companyMode ? companyHint : leaveHint}
          </span>
        </div>
      )}

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        tab={settingsTab}
        onTabChange={setSettingsTab}
        settings={settings}
        activePerson={activePerson}
        people={people}
        companies={companies}
        range={range}
        label={label}
        dispatch={dispatch}
        onExportJson={exportJson}
        onImportFile={(file) => void importJson(file)}
        importError={importError}
      />
    </div>
  )
}
