import { useCallback, useState, type CSSProperties } from 'react'
import { BridgeSuggestions } from './components/BridgeSuggestions'
import { CalendarImportDialog, type CalendarImport, type CalendarImportChoice } from './components/CalendarImportDialog'
import { CalendarsBar } from './components/CalendarsBar'
import { SchoolHolidaysDialog } from './components/SchoolHolidaysDialog'
import { CompaniesBar, ModeToggle } from './components/CompaniesBar'
import { ExportDialog } from './components/ExportDialog'
import type { CompanyDayChoice } from './components/CompanyDayPopover'
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon, LogoMark, SettingsIcon } from './components/Icons'
import { newId } from './components/newId'
import { PeopleBar } from './components/PeopleBar'
import { SettingsDrawer, type SettingsTab } from './components/SettingsDrawer'
import { StretchSuggestion } from './components/StretchSuggestion'
import { SummaryBar } from './components/SummaryBar'
import { UpdateBanner } from './components/UpdateBanner'
import { Legend, YearCalendar } from './components/YearCalendar'
import type { Bridge } from './domain/bridges'
import { formatBridgeDates } from './domain/bridges'
import { formatMonthSpan, monthSpanSlug, monthsOfRange, type MonthSpan } from './domain/exportRange'
import { addDays, todayIso } from './domain/dates'
import { IcsFormatError, parseIcs } from './domain/ics'
import { schoolHolidayImport, type SchoolHolidayArea } from './domain/schoolHolidays'
import { MAX_CALENDARS, MAX_CALENDAR_EVENTS, REGIONS, type LeavePortion } from './domain/types'
import { downloadCanvasAsPng, downloadJson } from './export/download'
import { loadExportFonts, renderYearToCanvas } from './export/renderPng'
import { useMediaQuery } from './hooks/useMediaQuery'
import { companyDayColours, nextCalendarColour } from './theme'
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
  const { state, dispatch, range, label, settings, activePerson, people, companies, editingCompany, editingCompanyIndex, viewCompany, yearView, exportFor, summary, activeLabel, activeRange, companyRanges, bridges, bridgeByDate, longestStretch, today, overEntitlementWarning, hasBankHolidayData } = usePlanner()
  // Same breakpoint as the phone layout in App.css.
  const phone = useMediaQuery('(max-width: 600px)')
  const [exporting, setExporting] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [calendarImport, setCalendarImport] = useState<CalendarImport | null>(null)
  const [schoolPickerOpen, setSchoolPickerOpen] = useState(false)
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
  const shownStretch = companyMode ? null : longestStretch
  // Phones edit company days through a toggle: the company being edited, else the active person's, else the first.
  const toggleCompany = editingCompany ?? companyOf(companies, activePerson) ?? companies[0] ?? null

  function openSettings(tab: SettingsTab = 'people') {
    setSettingsTab(tab)
    setSettingsOpen(true)
  }

  async function exportPng(span: MonthSpan) {
    setExporting(true)
    try {
      const data = exportFor(span)
      await loadExportFonts()
      const canvas = renderYearToCanvas(data.view, {
        title: data.isLeaveYear ? `Annual leave ${label}` : `Annual leave ${formatMonthSpan(span)}`,
        subtitle: `${formatBridgeDates(data.range.start, data.range.end)} · ${regionLabel}`,
        people: data.people.map((p) => ({
          name: p.person.name,
          colour: p.person.colour,
          style: p.person.style,
          tracksAllowance: p.person.tracksAllowance,
          summary: p.summary,
          warning: p.warning ?? undefined,
          yearLabel: p.yearLabel,
          countsOnly: !data.isLeaveYear,
        })),
      })
      const slug = data.isLeaveYear ? label.replace('/', '-') : monthSpanSlug(span)
      await downloadCanvasAsPng(canvas, `annual-leave-${slug}.png`)
      setExportOpen(false)
    } finally {
      setExporting(false)
    }
  }

  async function importCalendarFile(file: File) {
    if (state.calendars.length >= MAX_CALENDARS) {
      setCalendarImport({ fileName: file.name, error: `You can import up to ${MAX_CALENDARS} calendars. Remove one to import another.` })
      return
    }
    try {
      const text = await file.text()
      const today = todayIso()
      const result = parseIcs(text, { repeatUntil: addDays(today, 3 * 366), maxEvents: MAX_CALENDAR_EVENTS })
      setCalendarImport({ fileName: file.name, result })
    } catch (e) {
      const message = e instanceof IcsFormatError ? e.message : 'That file couldn’t be read.'
      setCalendarImport({ fileName: file.name, error: message })
    }
  }

  function pickSchoolArea(area: SchoolHolidayArea) {
    setSchoolPickerOpen(false)
    const fileName = `${area.id}.ics`
    if (state.calendars.length >= MAX_CALENDARS) {
      setCalendarImport({ fileName, error: `You can import up to ${MAX_CALENDARS} calendars. Remove one to add another.` })
      return
    }
    // Start of the current month: the current holiday stays, past ones are left out.
    const from = `${todayIso().slice(0, 7)}-01`
    setCalendarImport({
      fileName,
      result: schoolHolidayImport(area, from),
      source: { label: area.authority, url: area.source, checked: area.checked },
    })
  }

  function addImportedCalendar(choice: CalendarImportChoice) {
    dispatch({ type: 'addCalendar', id: newId('cal'), idPrefix: newId('ev'), ...choice })
    setCalendarImport(null)
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
              <button type="button" className="btn btn-primary icon-btn" aria-label={exporting ? 'Exporting PNG' : 'Download PNG'} onClick={() => setExportOpen(true)} disabled={exporting}>
                <DownloadIcon size={18} />
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => openSettings()}>
                <SettingsIcon />
                Settings
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setExportOpen(true)} disabled={exporting}>
                <DownloadIcon />
                {exporting ? 'Exporting…' : 'Download PNG'}
              </button>
            </>
          )}
        </div>
      </header>

      <UpdateBanner />

      <ExportDialog
        open={exportOpen}
        defaultSpan={monthsOfRange(range)}
        leaveYearLabel={label}
        exporting={exporting}
        onExport={exportPng}
        onClose={() => setExportOpen(false)}
      />

      {/* Before the import dialog, so picking an area closes this one before the preview opens. */}
      <SchoolHolidaysDialog open={schoolPickerOpen} onPick={pickSchoolArea} onClose={() => setSchoolPickerOpen(false)} />

      <CalendarImportDialog
        data={calendarImport}
        defaultColour={nextCalendarColour(state.calendars.map((c) => c.colour))}
        onImport={addImportedCalendar}
        onClose={() => setCalendarImport(null)}
      />

      <div className="layout">
        {phone ? (
          <PeopleBar people={people} viewLabel={label} companies={companies} editing={companyMode} variant="chips" dispatch={dispatch} />
        ) : (
          <aside className="rail" aria-label="People, company days, imported calendars and suggestions">
            <PeopleBar people={people} viewLabel={label} companies={companies} editing={companyMode} dispatch={dispatch} />
            <CompaniesBar companies={companies} people={people.map((p) => p.person)} editingCompanyId={state.editingCompanyId} ranges={companyRanges} dispatch={dispatch} />
            <CalendarsBar
              calendars={state.calendars}
              range={range}
              onImportFile={(file) => void importCalendarFile(file)}
              onAddSchoolHolidays={() => setSchoolPickerOpen(true)}
              dispatch={dispatch}
            />
            <BridgeSuggestions bridges={shownBridges} name={activePerson.name} onBook={bookBridge} />
            <StretchSuggestion stretch={shownStretch} name={activePerson.name} today={today} />
          </aside>
        )}

        <main className="main">
          <SummaryBar
            summary={summary}
            name={activePerson.name}
            colour={activePerson.colour}
            label={activeLabel}
            allowanceDays={settings.allowanceDays}
            carryOverDays={settings.carryOverDays}
            warning={overEntitlementWarning}
            compact={phone}
            tracksAllowance={activePerson.tracksAllowance}
            companyColour={companyOf(companies, activePerson)?.colour ?? null}
          />

          {phone && <BridgeSuggestions bridges={shownBridges} name={activePerson.name} onBook={bookBridge} compact />}
          {phone && <StretchSuggestion stretch={shownStretch} name={activePerson.name} today={today} compact />}

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
              calendars={yearView.calendars}
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
        calendars={state.calendars}
        onImportCalendarFile={(file) => void importCalendarFile(file)}
        onAddSchoolHolidays={() => setSchoolPickerOpen(true)}
        range={activeRange}
        label={activeLabel}
        dispatch={dispatch}
        onExportJson={exportJson}
        onImportFile={(file) => void importJson(file)}
        importError={importError}
      />
    </div>
  )
}
