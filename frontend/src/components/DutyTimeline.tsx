import { fmtDay, hm, STATUS_COLOR, STATUS_NAME } from '../format'
import type { DayLog, Status } from '../types'

interface Props {
  logs: DayLog[]
  active: number
  onSelect: (i: number) => void
}

/** One 24-hour bar per day: the whole trip's duty status at a glance. */
export default function DutyTimeline({ logs, active, onSelect }: Props) {
  return (
    <div className="duty-timeline">
      <div className="dt-head">
        <div>
          <h3>Trip at a glance</h3>
          <p>Duty status for every hour of the trip. Select a day to open its log sheet.</p>
        </div>
        <ul className="dt-legend">
          {(['D', 'ON', 'SB', 'OFF'] as Status[]).map((s) => (
            <li key={s}><i style={{ background: STATUS_COLOR[s] }} />{STATUS_NAME[s]}</li>
          ))}
        </ul>
      </div>

      <div className="dt-axis" aria-hidden>
        <span />
        {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => (
          <em key={h} style={{ left: `${(h / 24) * 100}%` }}>{h === 0 || h === 24 ? '12a' : h === 12 ? 'noon' : h > 12 ? `${h - 12}p` : `${h}a`}</em>
        ))}
      </div>

      {logs.map((d, i) => (
        <button
          key={d.date}
          type="button"
          className={`dt-row ${i === active ? 'active' : ''}`}
          onClick={() => {
            onSelect(i)
            document.getElementById('logs')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
        >
          <span className="dt-day">
            <b>Day {i + 1}</b>
            <small>{fmtDay(d.date)}</small>
          </span>
          <span className="dt-bar">
            {d.entries.map((e, k) => (
              <span
                key={k}
                className="dt-seg"
                style={{
                  left: `${(e.start / 1440) * 100}%`,
                  width: `${((e.end - e.start) / 1440) * 100}%`,
                  background: STATUS_COLOR[e.status],
                  animationDelay: `${i * 70 + k * 25}ms`,
                }}
                title={`${STATUS_NAME[e.status]} · ${hm(e.start)}–${hm(e.end)} · ${e.location}`}
              />
            ))}
            {[6, 12, 18].map((h) => <i key={h} className="dt-grid" style={{ left: `${(h / 24) * 100}%` }} />)}
          </span>
          <span className="dt-stat">
            <b>{Math.round(d.driving_miles)}</b> mi
          </span>
        </button>
      ))}
    </div>
  )
}
