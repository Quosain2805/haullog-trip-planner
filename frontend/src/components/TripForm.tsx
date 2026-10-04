import { useState } from 'react'
import { localInputValue } from '../format'
import { EMPTY_DETAILS, type LogDetails, type Place, type TripRequest } from '../types'
import LocationInput from './LocationInput'

interface Props {
  loading: boolean
  onSubmit: (req: TripRequest, details: LogDetails) => void
}

interface Field {
  text: string
  place: Place | null
}

const EMPTY: Field = { text: '', place: null }

const EXAMPLE = {
  current: { text: 'Chicago, IL', place: { lat: 41.8755616, lng: -87.6244212, label: 'Chicago, IL' } },
  pickup: { text: 'Nashville, TN', place: { lat: 36.1622296, lng: -86.7743531, label: 'Nashville, TN' } },
  dropoff: { text: 'Phoenix, AZ', place: { lat: 33.4484367, lng: -112.0740373, label: 'Phoenix, AZ' } },
}

const DETAIL_FIELDS = [
  ['carrier', 'Carrier name', 'Demo Carrier Co.'],
  ['officeAddress', 'Main office address', '123 Main St, Dallas, TX'],
  ['vehicles', 'Truck / trailer numbers', 'T-104 / TR-2207'],
  ['docNo', 'DVL or manifest no.', 'BOL-48213'],
  ['shipper', 'Shipper & commodity', 'Acme Foods — pallets'],
] as const

function defaultStart(): string {
  const d = new Date()
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0)
  return localInputValue(d)
}

export default function TripForm({ loading, onSubmit }: Props) {
  const [current, setCurrent] = useState<Field>(EMPTY)
  const [pickup, setPickup] = useState<Field>(EMPTY)
  const [dropoff, setDropoff] = useState<Field>(EMPTY)
  const [cycleText, setCycleText] = useState('0')
  const [start, setStart] = useState(defaultStart)
  const [details, setDetails] = useState<LogDetails>(EMPTY_DETAILS)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const cycle = cycleText.trim() === '' ? NaN : Number(cycleText)
  const cycleValid = Number.isFinite(cycle) && cycle >= 0 && cycle <= 70
  const clamped = Number.isFinite(cycle) ? Math.min(70, Math.max(0, cycle)) : 0

  const clearError = (key: string) =>
    setErrors((prev) => {
      if (!prev[key]) return prev
      const { [key]: _removed, ...rest } = prev
      return rest
    })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (current.text.trim().length < 2) next.current = 'Where is the truck right now?'
    if (pickup.text.trim().length < 2) next.pickup = 'Enter the pickup location.'
    if (dropoff.text.trim().length < 2) next.dropoff = 'Enter the drop-off location.'
    if (!cycleValid) next.cycle = 'Enter a number between 0 and 70.'
    if (!start) next.start = 'Pick a start time.'
    setErrors(next)
    if (Object.keys(next).length) return
    onSubmit(
      {
        current: current.place ?? current.text.trim(),
        pickup: pickup.place ?? pickup.text.trim(),
        dropoff: dropoff.place ?? dropoff.text.trim(),
        cycle_used: cycle,
        start_time: start,
      },
      details,
    )
  }

  const fillExample = () => {
    setCurrent(EXAMPLE.current)
    setPickup(EXAMPLE.pickup)
    setDropoff(EXAMPLE.dropoff)
    setCycleText('10')
    setErrors({})
  }

  const remaining = 70 - clamped

  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="card-head">
        <h2>Plan a trip</h2>
        <button type="button" className="link" onClick={fillExample}>Try an example</button>
      </div>

      <div className="route-fields">
        <LocationInput
          label="Current location" hint="e.g. Chicago, IL" marker="A" markerColor="#16a34a"
          value={current.text} place={current.place} error={current.text.trim().length < 2 ? errors.current : undefined}
          onChange={(text, place) => { setCurrent({ text, place }); clearError('current') }}
        />
        <LocationInput
          label="Pickup location" hint="e.g. Nashville, TN" marker="P" markerColor="#2563eb"
          value={pickup.text} place={pickup.place} error={pickup.text.trim().length < 2 ? errors.pickup : undefined}
          onChange={(text, place) => { setPickup({ text, place }); clearError('pickup') }}
        />
        <LocationInput
          label="Drop-off location" hint="e.g. Phoenix, AZ" marker="D" markerColor="#dc2626"
          value={dropoff.text} place={dropoff.place} error={dropoff.text.trim().length < 2 ? errors.dropoff : undefined}
          onChange={(text, place) => { setDropoff({ text, place }); clearError('dropoff') }}
        />
      </div>

      <div className="field">
        <label htmlFor="cycle">Current cycle used (hrs)</label>
        <div className="cycle-row">
          <input
            type="range" min={0} max={70} step={0.5} value={clamped} aria-label="Cycle hours used"
            onChange={(e) => { setCycleText(e.target.value); clearError('cycle') }}
            style={{ ['--pct' as string]: `${(clamped / 70) * 100}%` }}
          />
          <input
            id="cycle" type="number" inputMode="decimal" min={0} max={70} step={0.5} value={cycleText}
            onChange={(e) => { setCycleText(e.target.value); clearError('cycle') }}
          />
        </div>
        <p className="hint">
          {cycleValid
            ? `${remaining.toFixed(1).replace(/\.0$/, '')} of 70 hrs available in the 8-day cycle`
            : 'Enter the hours already used (0–70)'}
        </p>
        {errors.cycle && <p className="field-error">{errors.cycle}</p>}
      </div>

      <div className="field">
        <label htmlFor="start">Trip start (home terminal time)</label>
        <div className="input-wrap">
          <input id="start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        {errors.start && <p className="field-error">{errors.start}</p>}
      </div>

      <details className="more">
        <summary>Log sheet details <em>optional</em></summary>
        <div className="more-grid">
          {DETAIL_FIELDS.map(([key, label, placeholder]) => (
            <label key={key} className="mini">
              <span>{label}</span>
              <input
                value={details[key]} placeholder={placeholder} maxLength={60}
                onChange={(e) => setDetails((d) => ({ ...d, [key]: e.target.value }))}
              />
            </label>
          ))}
        </div>
      </details>

      <button className="primary" type="submit" disabled={loading}>
        {loading ? (<><span className="spinner" /> Planning route…</>) : 'Plan trip & generate logs'}
      </button>

      <ul className="assumptions">
        <li>Property-carrying · 70 hr / 8 day · no adverse conditions</li>
        <li>Fuel at least every 1,000 mi · 1 hr pickup + 1 hr drop-off</li>
      </ul>
    </form>
  )
}
