import type { Status, StopType } from './types'

export const pad = (n: number) => String(n).padStart(2, '0')

/** 90 -> "1h 30m" */
export function duration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/** 510 -> "08:30" */
export function hm(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(Math.round(minutes % 60))}`
}

/** Naive local ISO ("2026-03-02T08:00") -> Date in local time without tz shifting. */
export function parseLocal(iso: string): Date {
  const [d, t = '00:00'] = iso.split('T')
  const [y, mo, da] = d.split('-').map(Number)
  const [h, mi] = t.split(':').map(Number)
  return new Date(y, mo - 1, da, h, mi)
}

export function fmtDateTime(iso: string): string {
  return parseLocal(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export function fmtTime(iso: string): string {
  return parseLocal(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function fmtDay(iso: string): string {
  return parseLocal(`${iso}T00:00`).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

export function localInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const STATUS_COLOR: Record<Status, string> = {
  OFF: '#64748b',
  SB: '#6366f1',
  D: '#f97316',
  ON: '#22c55e',
}

export const STATUS_NAME: Record<Status, string> = {
  OFF: 'Off Duty',
  SB: 'Sleeper Berth',
  D: 'Driving',
  ON: 'On Duty (not driving)',
}

export const STOP_META: Record<StopType, { color: string; glyph: string; name: string }> = {
  start: { color: '#16a34a', glyph: 'A', name: 'Trip start' },
  pickup: { color: '#2563eb', glyph: 'P', name: 'Pickup' },
  dropoff: { color: '#dc2626', glyph: 'D', name: 'Drop-off' },
  fuel: { color: '#d97706', glyph: '⛽', name: 'Fuel stop' },
  break: { color: '#7c3aed', glyph: '☕', name: '30 min break' },
  rest: { color: '#4338ca', glyph: '🌙', name: '10 hr rest' },
  restart: { color: '#be185d', glyph: '🔄', name: '34 hr restart' },
}
