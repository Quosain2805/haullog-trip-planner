import { duration } from '../format'
import type { TripPlan } from '../types'
import Gauge from './Gauge'

export default function Insights({ plan }: { plan: TripPlan }) {
  const s = plan.summary
  const driveH = s.driving_minutes / 60
  const kpis = [
    { label: 'Total distance', value: `${Math.round(s.route_miles).toLocaleString()} mi` },
    { label: 'Driving time', value: duration(s.driving_minutes) },
    { label: 'On-duty (not driving)', value: duration(s.on_duty_minutes) },
    { label: 'Trip duration', value: duration(s.total_minutes) },
    { label: 'Fuel stops', value: String(s.fuel_stops) },
    { label: '30-min breaks', value: String(s.breaks) },
    { label: '10-hr rests', value: String(s.rests) },
    { label: '34-hr restarts', value: String(s.restarts) },
  ]
  return (
    <div className="insights">
      <div className="gauges">
        <Gauge label="Cycle at start" value={s.cycle_used_start_hours} max={70} color="#94a3b8" sub="hours already used" />
        <Gauge label="Cycle after trip" value={s.cycle_used_end_hours} max={70} color="#f97316" sub={s.restarts ? 'after 34-hr restart' : '70 hr / 8 day'} />
        <Gauge label="Driving" value={driveH} max={Math.max(11, 11 * s.days)} color="#22c55e" sub={`${s.days} day${s.days > 1 ? 's' : ''} · 11 h/shift`} />
      </div>
      <dl className="kpis">
        {kpis.map((k) => (
          <div key={k.label}>
            <dt>{k.label}</dt>
            <dd>{k.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
