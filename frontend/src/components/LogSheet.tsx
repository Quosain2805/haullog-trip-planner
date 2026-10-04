import { fmtDay, hm, parseLocal, STATUS_NAME } from '../format'
import type { DayLog, LogDetails, LogEntry, Status } from '../types'

/**
 * Driver's Daily Log (FMCSA graph-grid format) drawn as SVG.
 * 24 h grid with 15-minute ticks, duty-status line, remarks with locations,
 * per-line totals (always summing to 24:00) and the 70 hr / 8 day recap.
 */

export const SHEET_W = 850
export const SHEET_H = 815
const GX = 130 // grid left
const GW = 600 // grid width -> 25px per hour
const PX_PER_MIN = GW / 1440
const GY = 218 // grid top
const ROW = 30
const ROWS: Status[] = ['OFF', 'SB', 'D', 'ON']
const ROW_LABEL: Record<Status, string> = {
  OFF: '1: OFF DUTY',
  SB: '2: SLEEPER BERTH',
  D: '3: DRIVING',
  ON: '4: ON DUTY',
}
const INK = '#0f172a'
const BLUE = '#3b5bb5'
const FORM = '#334155'
const FILL = '#1e3a8a'

const x = (min: number) => GX + min * PX_PER_MIN

const NOTE: Record<string, string> = {
  pickup: 'Pickup',
  dropoff: 'Drop-off',
  fuel: 'Fuel',
  break: '30 min break',
  rest: '10 hr rest',
  restart: '34 hr restart',
  off: 'Off duty',
  drive: '',
}

function remarkText(e: LogEntry, maxChars: number): string {
  const note = NOTE[e.kind] ?? ''
  let t = note ? `${e.location} – ${note}` : e.location
  if (t.length > maxChars) t = `${t.slice(0, Math.max(3, maxChars - 1)).trimEnd()}…`
  return t
}

function hourLabel(h: number): string {
  if (h === 0 || h === 24) return 'Midnight'
  if (h === 12) return 'Noon'
  return String(h % 12)
}

interface Props {
  day: DayLog
  id?: string
  details?: Partial<LogDetails>
  homeTerminal?: string
}

const clip = (value: string | undefined, max: number, fallback = 'N/A') => {
  const v = (value ?? '').trim()
  if (!v) return fallback
  return v.length > max ? `${v.slice(0, max - 1)}…` : v
}

export default function LogSheet({ day, id, details = {}, homeTerminal = 'N/A' }: Props) {
  const carrier = clip(details.carrier, 56, 'Demo Carrier Co.')
  const officeAddress = clip(details.officeAddress, 56)
  const vehicles = clip(details.vehicles, 30)
  const docNo = clip(details.docNo, 44)
  const shipper = clip(details.shipper, 44)
  const date = parseLocal(`${day.date}T00:00`)
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const yyyy = String(date.getFullYear())
  const entries = day.entries
  const miles = Math.round(day.driving_miles)
  const gridBottom = GY + ROWS.length * ROW
  const remarkBase = gridBottom + 40

  // Duty-status line: horizontal run per entry, vertical joins at each change.
  let path = ''
  entries.forEach((e, i) => {
    const y = GY + ROWS.indexOf(e.status) * ROW + ROW / 2
    path += `${i === 0 ? 'M' : 'L'}${x(e.start)} ${y} L${x(e.end)} ${y} `
  })

  // A remark is written at every change of duty status (not for the status already in effect at midnight).
  // Resuming to drive right after a short stop (fuel, pickup, break) adds no new place, so it is not
  // labelled again. Resuming after a long stop (rest, restart) and the first move of the trip are labelled.
  const remarks = entries.filter((e, i) => {
    if (e.start === 0) return false
    const prev = entries[i - 1]
    const shortStop = prev && prev.kind !== 'off' && !prev.continued && prev.end - prev.start < 90
    return !(e.kind === 'drive' && shortStop && prev.location === e.location)
  })

  const recapCols = [
    { x: 196, k: 'A', lines: ['Total hours on duty', 'last 7 days', 'including today.'], v: day.recap.a_total_last_7_days },
    { x: 316, k: 'B', lines: ['Total hours available', 'tomorrow: 70 hr.', 'minus A*'], v: day.recap.b_available_tomorrow },
    { x: 436, k: 'C', lines: ['Total hours on duty', 'last 5 days', 'including today.'], v: day.recap.c_total_last_5_days },
  ]

  return (
    <svg
      id={id}
      className="log-svg"
      viewBox={`0 0 ${SHEET_W} ${SHEET_H}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={`Driver's daily log for ${fmtDay(day.date)}`}
      fontFamily="Arial, Helvetica, sans-serif"
    >
      <rect width={SHEET_W} height={SHEET_H} fill="#fff" />

      {/* ---- header ---- */}
      <text x="30" y="38" fontSize="23" fontWeight="800" fill={INK}>Drivers Daily Log</text>
      <text x="30" y="54" fontSize="10" fill={FORM}>(24 hours)</text>

      <g fontSize="15" fontWeight="700" fill={FILL} textAnchor="middle">
        <text x="308" y="36">{mm}</text>
        <text x="352" y="36">{dd}</text>
        <text x="418" y="36">{yyyy}</text>
      </g>
      <g stroke={FORM} strokeWidth="0.8">
        <line x1="285" y1="42" x2="330" y2="42" />
        <line x1="335" y1="42" x2="370" y2="42" />
        <line x1="376" y1="42" x2="460" y2="42" />
      </g>
      <g fontSize="8" fill={FORM} textAnchor="middle">
        <text x="308" y="52">(month)</text>
        <text x="352" y="52">(day)</text>
        <text x="418" y="52">(year)</text>
        <text x="333" y="36" fontSize="14">/</text>
        <text x="373" y="36" fontSize="14">/</text>
      </g>

      <g fontSize="8.5" fill={FORM}>
        <text x="540" y="30"><tspan fontWeight="700">Original</tspan> – File at home terminal.</text>
        <text x="540" y="42"><tspan fontWeight="700">Duplicate</tspan> – Driver retains in his/her possession for 8 days.</text>
      </g>

      <text x="30" y="82" fontSize="12" fontWeight="700" fill={INK}>From:</text>
      <text x="68" y="81" fontSize="12" fill={FILL} fontWeight="600">{day.from}</text>
      <line x1="64" y1="85" x2="290" y2="85" stroke={FORM} strokeWidth="0.8" />
      <text x="310" y="82" fontSize="12" fontWeight="700" fill={INK}>To:</text>
      <text x="334" y="81" fontSize="12" fill={FILL} fontWeight="600">{day.to}</text>
      <line x1="332" y1="85" x2="560" y2="85" stroke={FORM} strokeWidth="0.8" />

      {/* mileage boxes */}
      <g stroke={INK} strokeWidth="1" fill="none">
        <rect x="30" y="100" width="112" height="34" />
        <rect x="150" y="100" width="112" height="34" />
      </g>
      <g fontSize="18" fontWeight="800" fill={FILL} textAnchor="middle">
        <text x="86" y="124">{miles || '—'}</text>
        <text x="206" y="124">{miles || '—'}</text>
      </g>
      <g fontSize="8" fill={FORM} textAnchor="middle">
        <text x="86" y="145">Total Miles Driving Today</text>
        <text x="206" y="145">Total Mileage Today</text>
      </g>

      {/* carrier block */}
      <g stroke={FORM} strokeWidth="0.8">
        <line x1="300" y1="118" x2="820" y2="118" />
        <line x1="300" y1="144" x2="820" y2="144" />
        <line x1="300" y1="170" x2="820" y2="170" />
        <line x1="30" y1="170" x2="262" y2="170" />
      </g>
      <g fontSize="12" fontWeight="600" fill={FILL}>
        <text x="306" y="115">{carrier}</text>
        <text x="306" y="141">{officeAddress}</text>
        <text x="306" y="167">{homeTerminal}</text>
        <text x="36" y="167">{vehicles}</text>
      </g>
      <g fontSize="8" fill={FORM} textAnchor="middle">
        <text x="560" y="129">Name of Carrier or Carriers</text>
        <text x="560" y="155">Main Office Address</text>
        <text x="560" y="181">Home Terminal Address</text>
        <text x="146" y="181">Truck/Tractor and Trailer Numbers or</text>
        <text x="146" y="191">License Plate(s)/State (show each unit)</text>
      </g>

      {/* ---- graph grid ---- */}
      <g fontSize="9" fill={FORM} textAnchor="middle">
        {Array.from({ length: 25 }, (_, h) => (
          <text key={`t${h}`} x={x(h * 60)} y={GY - 6} fontSize={h % 12 === 0 ? 7.5 : 9} fontWeight={h === 12 ? 700 : 400}>
            {hourLabel(h)}
          </text>
        ))}
      </g>
      <g fontSize="8" fill={FORM} textAnchor="middle" fontWeight="700">
        <text x={GX + GW + 32} y={GY - 17}>Total</text>
        <text x={GX + GW + 32} y={GY - 8}>Hours</text>
      </g>

      {ROWS.map((s, r) => {
        const top = GY + r * ROW
        return (
          <g key={s}>
            <rect x={GX} y={top} width={GW} height={ROW} fill={r % 2 ? '#f8fafc' : '#fff'} stroke={BLUE} strokeWidth="1" />
            {Array.from({ length: 97 }, (_, q) => {
              const isHour = q % 4 === 0
              const isHalf = q % 4 === 2
              const len = isHour ? ROW : isHalf ? ROW * 0.55 : ROW * 0.3
              const xx = GX + q * 15 * PX_PER_MIN
              return (
                <line
                  key={q} x1={xx} x2={xx} y1={top + ROW} y2={top + ROW - len}
                  stroke={BLUE} strokeWidth={isHour ? 0.9 : 0.6}
                />
              )
            })}
            <text x={GX - 8} y={top + ROW / 2 + (s === 'ON' ? 0 : 4)} textAnchor="end" fontSize="9.5" fontWeight="800" fill={BLUE}>
              {ROW_LABEL[s]}
            </text>
            {s === 'ON' && <text x={GX - 8} y={top + ROW / 2 + 10} textAnchor="end" fontSize="7" fill={FORM}>(not driving)</text>}
            <rect x={GX + GW + 5} y={top} width="54" height={ROW} fill="#fff" stroke={BLUE} strokeWidth="1" />
            <text x={GX + GW + 32} y={top + ROW / 2 + 5} textAnchor="middle" fontSize="13" fontWeight="800" fill={FILL}>
              {day.totals_hm[s]}
            </text>
          </g>
        )
      })}

      <g fontSize="9" fill={FORM} textAnchor="middle">
        {Array.from({ length: 25 }, (_, h) => (
          <text key={`b${h}`} x={x(h * 60)} y={gridBottom + 12} fontSize={h % 12 === 0 ? 7.5 : 9} fontWeight={h === 12 ? 700 : 400}>
            {hourLabel(h)}
          </text>
        ))}
      </g>
      <text x={GX + GW + 32} y={gridBottom + 16} textAnchor="middle" fontSize="12" fontWeight="800" fill={INK}>24:00</text>
      <line x1={GX + GW + 8} x2={GX + GW + 56} y1={gridBottom + 20} y2={gridBottom + 20} stroke={INK} />
      <line x1={GX + GW + 8} x2={GX + GW + 56} y1={gridBottom + 23} y2={gridBottom + 23} stroke={INK} />

      {/* duty-status line */}
      <path d={path} fill="none" stroke={INK} strokeWidth="2.6" strokeLinejoin="miter" strokeLinecap="butt" />
      {entries.map((e, i) => (
        <rect key={`hit${i}`} x={x(e.start)} y={GY} width={Math.max(2, (e.end - e.start) * PX_PER_MIN)} height={ROWS.length * ROW} fill="transparent">
          <title>{`${STATUS_NAME[e.status]} · ${hm(e.start)}–${hm(e.end)} · ${e.remark}`}</title>
        </rect>
      ))}

      {/* ---- remarks ---- */}
      <text x="30" y={remarkBase + 6} fontSize="12" fontWeight="800" fill={INK}>Remarks</text>
      <line x1="22" y1={remarkBase - 12} x2="22" y2={remarkBase + 178} stroke={INK} strokeWidth="1.5" />
      <g fontSize="9" fill={FILL} fontWeight="600">
        {remarks.map((e, i) => {
          const px = x(e.start)
          const avail = (px - 24) / Math.cos((50 * Math.PI) / 180)
          const chars = Math.max(6, Math.min(34, Math.floor(avail / 5.3)))
          const text = remarkText(e, chars)
          const yLine = GY + ROWS.indexOf(e.status) * ROW + ROW / 2
          return (
            <g key={`r${i}`}>
              <polyline points={`${px},${yLine} ${px},${remarkBase}`} fill="none" stroke="#64748b" strokeWidth="0.9" strokeDasharray="2 2" />
              <g transform={`translate(${px},${remarkBase}) rotate(-50)`}>
                <line x1={-text.length * 5.1 - 4} y1="2.5" x2="0" y2="2.5" stroke={INK} strokeWidth="1" />
                <text textAnchor="end" x="-1" y="-1.5">{text}</text>
              </g>
            </g>
          )
        })}
      </g>

      {/* ---- shipping documents ---- */}
      <g fontSize="9.5" fill={FORM}>
        <text x="30" y="601" fontWeight="800" fill={INK}>Shipping</text>
        <text x="30" y="613" fontWeight="800" fill={INK}>Documents:</text>
        <line x1="30" y1="640" x2="330" y2="640" stroke={FORM} strokeWidth="0.8" />
        <text x="36" y="636" fontSize="12" fontWeight="600" fill={FILL}>{docNo}</text>
        <text x="30" y="651" fontSize="8.5">DVL or Manifest No. or</text>
        <line x1="30" y1="675" x2="330" y2="675" stroke={FORM} strokeWidth="0.8" />
        <text x="36" y="671" fontSize="12" fontWeight="600" fill={FILL}>{shipper}</text>
        <text x="30" y="686" fontSize="8.5">Shipper &amp; Commodity</text>
      </g>
      <g fontSize="8.5" fill={FORM} textAnchor="middle">
        <text x="580" y="640">Enter name of place you reported and where released from work</text>
        <text x="580" y="651">and when and where each change of duty occurred.</text>
        <text x="580" y="662" fontWeight="700">Use time standard of home terminal.</text>
      </g>

      {/* ---- recap ---- */}
      <line x1="22" y1="702" x2="828" y2="702" stroke={INK} strokeWidth="1.4" />
      <g fontSize="9" fontWeight="800" fill={INK}>
        <text x="30" y="718">Recap:</text>
        <text x="30" y="729">Complete at</text>
        <text x="30" y="740">end of day</text>
        <text x="112" y="718">On duty</text>
        <text x="112" y="729">hours today,</text>
        <text x="112" y="740">Total lines</text>
        <text x="112" y="751">3 &amp; 4</text>
      </g>
      <rect x="112" y="758" width="62" height="26" fill="#fff" stroke={BLUE} strokeWidth="1.2" />
      <text x="143" y="776" textAnchor="middle" fontSize="14" fontWeight="800" fill={FILL}>{day.recap.on_duty_today}</text>

      <text x="196" y="718" fontSize="9" fontWeight="800" fill={INK}>70 Hour / 8 Day Drivers</text>
      {recapCols.map((c) => (
        <g key={c.k}>
          <text x={c.x} y="733" fontSize="9" fontWeight="800" fill={INK}>{c.k}.</text>
          {c.lines.map((l, i) => (
            <text key={l} x={c.x + 14} y={733 + i * 10} fontSize="8.5" fill={FORM}>{l}</text>
          ))}
          <rect x={c.x} y="764" width="100" height="22" fill="#fff" stroke={BLUE} strokeWidth="1.2" />
          <text x={c.x + 50} y="780" textAnchor="middle" fontSize="13" fontWeight="800" fill={FILL}>{Number(c.v.toFixed(2))} h</text>
        </g>
      ))}

      <g fill="#94a3b8">
        <text x="580" y="718" fontSize="9" fontWeight="800">60 Hour / 7 Day Drivers</text>
        <text x="580" y="734" fontSize="8.5">A. last 7 days · B. 60 hr minus A</text>
        <text x="580" y="744" fontSize="8.5">C. last 5 days</text>
        <text x="580" y="778" fontSize="8.5" fontStyle="italic">n/a — 70 hr / 8 day driver</text>
      </g>
      <text x="828" y="803" fontSize="7.5" fill={FORM} textAnchor="end">*If you took 34 consecutive hours off duty you have 60/70 hours available.</text>
    </svg>
  )
}
