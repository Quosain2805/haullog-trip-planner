import { useCountUp } from '../hooks'

interface Props {
  label: string
  value: number
  max: number
  unit?: string
  color: string
  sub?: string
}

/** Radial gauge: a 270° arc filled to value/max, with an animated count-up. */
export default function Gauge({ label, value, max, unit = 'h', color, sub }: Props) {
  const animated = useCountUp(value)
  const R = 46
  const C = 2 * Math.PI * R
  const arc = (frac: number) => `${C * 0.75 * frac} ${C}`
  const frac = Math.min(1, animated / max)

  return (
    <div className="gauge">
      <svg viewBox="0 0 120 120" role="img" aria-label={`${label}: ${value.toFixed(1)} of ${max} ${unit}`}>
        <circle cx="60" cy="60" r={R} className="g-track" strokeDasharray={arc(1)} transform="rotate(135 60 60)" />
        <circle cx="60" cy="60" r={R} className="g-fill" stroke={color} strokeDasharray={arc(frac)} transform="rotate(135 60 60)" />
        <text x="60" y="62" textAnchor="middle" className="g-value">{animated.toFixed(1)}</text>
        <text x="60" y="79" textAnchor="middle" className="g-unit">of {max} {unit}</text>
      </svg>
      <strong>{label}</strong>
      {sub && <span>{sub}</span>}
    </div>
  )
}
