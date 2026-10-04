import { duration, fmtDateTime, STOP_META } from '../format'
import type { Stop } from '../types'

interface Props {
  stops: Stop[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export default function StopsTimeline({ stops, selectedId, onSelect }: Props) {
  return (
    <ol className="timeline">
      {stops.map((s, i) => {
        const m = STOP_META[s.type]
        return (
          <li key={s.id} className={s.id === selectedId ? 'selected' : ''}>
            <button type="button" onClick={() => onSelect(s.id)}>
              <span className="dot" style={{ background: m.color }}>{m.glyph}</span>
              <span className="body">
                <strong>{m.name}</strong>
                <span className="loc">{s.location}</span>
                <span className="when">
                  {fmtDateTime(s.arrival)}
                  {s.minutes > 0 && <> · {duration(s.minutes)}</>}
                </span>
              </span>
              {s.type !== 'start' && <span className="mile">mi {Math.round(s.mile).toLocaleString()}</span>}
            </button>
            {i < stops.length - 1 && <span className="rail" />}
          </li>
        )
      })}
    </ol>
  )
}
