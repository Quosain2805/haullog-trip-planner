import { useEffect, useRef, useState } from 'react'
import { planTrip, warmUp } from './api'
import DutyTimeline from './components/DutyTimeline'
import Insights from './components/Insights'
import LogsView from './components/LogsView'
import RouteMap from './components/RouteMap'
import StopsTimeline from './components/StopsTimeline'
import TripForm from './components/TripForm'
import { useTheme } from './hooks'
import { EMPTY_DETAILS, type LogDetails, type TripPlan, type TripRequest } from './types'

type Tab = 'trip' | 'itinerary' | 'insights'

export default function App() {
  const [theme, toggleTheme] = useTheme()
  const [plan, setPlan] = useState<TripPlan | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('trip')
  const [activeDay, setActiveDay] = useState(0)
  const [details, setDetails] = useState<LogDetails>(EMPTY_DETAILS)
  const [slow, setSlow] = useState(false)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => warmUp(), [])

  const submit = async (req: TripRequest, logDetails: LogDetails) => {
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    setLoading(true)
    setError(null)
    setSlow(false)
    const slowTimer = setTimeout(() => setSlow(true), 7000)
    try {
      const result = await planTrip(req, ctrl.signal)
      setPlan(result)
      setDetails(logDetails)
      setSelected(null)
      setActiveDay(0)
      setTab('itinerary')
      if (window.innerWidth < 960) {
        // On phones the map sits below the form, so bring it into view.
        setTimeout(() => document.querySelector('.stage')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      clearTimeout(slowTimer)
      if (abort.current === ctrl) {
        setLoading(false)
        setSlow(false)
      }
    }
  }

  const tabs: { id: Tab; label: string; disabled?: boolean }[] = [
    { id: 'trip', label: 'Trip' },
    { id: 'itinerary', label: 'Itinerary', disabled: !plan },
    { id: 'insights', label: 'Insights', disabled: !plan },
  ]

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 6h13v10H1z" /><path d="M14 9h4l4 4v3h-8z" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="18" r="2" />
            </svg>
          </span>
          <div>
            <h1>Haul<span>Log</span></h1>
            <p>Trip planner &amp; ELD log generator</p>
          </div>
        </div>
        <div className="top-actions">
          <span className="badge"><i /> 70 hr / 8 day · property-carrying</span>
          <button type="button" className="icon-btn" onClick={toggleTheme} aria-label="Toggle dark mode" title="Toggle theme">
            {theme === 'dark' ? (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
            )}
          </button>
        </div>
      </header>

      <section className="workspace">
        <aside className="panel">
          <div className="seg" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id} type="button" role="tab" disabled={t.disabled}
                aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''}
                onClick={() => setTab(t.id)}
              >
                {t.label}
                {t.id === 'itinerary' && plan && <em>{plan.stops.length}</em>}
              </button>
            ))}
          </div>

          <div className="panel-body">
            {/* Panels stay mounted (just hidden) so the form keeps what was typed when switching tabs. */}
            <div hidden={tab !== 'trip'}>
              <TripForm loading={loading} onSubmit={submit} />
              {error && (
                <div className="alert" role="alert">
                  <strong>Couldn’t plan that trip</strong>
                  <p>{error}</p>
                </div>
              )}
            </div>
            {plan && (
              <>
                <div hidden={tab !== 'itinerary'}>
                  <StopsTimeline stops={plan.stops} selectedId={selected} onSelect={setSelected} />
                </div>
                <div hidden={tab !== 'insights'}>
                  <Insights plan={plan} />
                </div>
              </>
            )}
          </div>
        </aside>

        <div className="stage">
          <RouteMap plan={plan} loading={loading} slow={slow} selectedId={selected} onSelect={(id) => { setSelected(id); setTab('itinerary') }} />
        </div>
      </section>

      {plan && (
        <main className="below">
          <DutyTimeline logs={plan.logs} active={activeDay} onSelect={setActiveDay} />
          <LogsView plan={plan} active={activeDay} setActive={setActiveDay} details={details} />
          <Assumptions plan={plan} />
        </main>
      )}

      {!plan && <Features />}
      <footer className="foot">
        Built with Django · React · OpenStreetMap · OSRM — all free map services.
      </footer>
    </div>
  )
}

function Features() {
  const items = [
    ['11 / 14 hr limits', 'Driving and window limits enforced on every shift.'],
    ['30-min break', 'Inserted automatically after 8 hours of driving.'],
    ['70 hr / 8 day cycle', 'With a 34-hour restart when the cycle runs out.'],
    ['Drawn log sheets', 'Real FMCSA grid, one sheet per day, exactly 24:00.'],
  ]
  return (
    <section className="features">
      {items.map(([t, d], i) => (
        <div key={t} className="feature" style={{ animationDelay: `${i * 80}ms` }}>
          <b>{t}</b>
          <p>{d}</p>
        </div>
      ))}
    </section>
  )
}

function Assumptions({ plan }: { plan: TripPlan }) {
  const a = plan.assumptions
  return (
    <section className="notes">
      <h3>How this plan was calculated</h3>
      <ul>
        <li>Average truck speed of {a.avg_speed_mph} mph on the road distance from OpenStreetMap routing (OSRM).</li>
        <li>11-hour driving limit, 14-hour window, 30-minute break after 8 hours of driving, 10-hour reset (sleeper berth).</li>
        <li>70-hour / 8-day limit — a 34-hour restart is inserted when the cycle is exhausted.</li>
        <li>Fuel stop (30 min, on duty) at least every {Number(a.fuel_every_miles).toLocaleString()} miles.</li>
        <li>{a.pickup_minutes} minutes on duty at pickup and {a.dropoff_minutes} minutes at drop-off.</li>
        <li>Hours already used in the cycle are treated as not rolling off during the trip (conservative).</li>
        <li>All times are home-terminal local time.</li>
      </ul>
    </section>
  )
}
