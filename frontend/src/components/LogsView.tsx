import { fmtDay } from '../format'
import type { LogDetails, TripPlan } from '../types'
import LogSheet, { SHEET_H, SHEET_W } from './LogSheet'

async function downloadPng(svgId: string, name: string) {
  const svg = document.getElementById(svgId)
  if (!svg) return
  const xml = new XMLSerializer().serializeToString(svg)
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }))
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Could not render the log sheet'))
    img.src = url
  })
  const scale = 2.5
  const canvas = document.createElement('canvas')
  canvas.width = SHEET_W * scale
  canvas.height = SHEET_H * scale
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  URL.revokeObjectURL(url)
  const a = document.createElement('a')
  a.href = canvas.toDataURL('image/png')
  a.download = `${name}.png`
  a.click()
}

interface Props {
  plan: TripPlan
  active: number
  setActive: (i: number) => void
  details: LogDetails
}

export default function LogsView({ plan, active, setActive, details }: Props) {
  const logs = plan.logs
  const homeTerminal = plan.locations.current.label

  return (
    <section className="logs" id="logs">
      <div className="section-head">
        <div>
          <h2>Daily log sheets</h2>
          <p>
            {logs.length} sheet{logs.length > 1 ? 's' : ''} · every sheet totals exactly 24 hours · 15-minute precision
          </p>
        </div>
        <div className="actions">
          <button type="button" className="ghost" onClick={() => downloadPng(`log-${active}`, `driver-log-${logs[active].date}`)}>
            Download PNG
          </button>
          <button type="button" className="ghost" onClick={() => window.print()}>
            Print / Save all as PDF
          </button>
        </div>
      </div>

      <div className="tabs" role="tablist">
        {logs.map((d, i) => (
          <button
            key={d.date}
            role="tab"
            aria-selected={i === active}
            className={i === active ? 'active' : ''}
            onClick={() => setActive(i)}
            type="button"
          >
            <span>Day {i + 1}</span>
            <small>{fmtDay(d.date)}</small>
          </button>
        ))}
      </div>

      <div className="sheets">
        {logs.map((d, i) => (
          <div key={d.date} className={`sheet-wrap ${i === active ? 'active' : ''}`} role="tabpanel">
            <div className="sheet-legend">
              {[
                ['Off duty', d.totals_hm.OFF],
                ['Sleeper', d.totals_hm.SB],
                ['Driving', d.totals_hm.D],
                ['On duty', d.totals_hm.ON],
              ].map(([k, v]) => (
                <span key={k}><b>{v}</b> {k}</span>
              ))}
              <span className="miles"><b>{Math.round(d.driving_miles)}</b> mi driven</span>
            </div>
            <LogSheet day={d} id={`log-${i}`} homeTerminal={homeTerminal} details={details} />
          </div>
        ))}
      </div>
    </section>
  )
}
