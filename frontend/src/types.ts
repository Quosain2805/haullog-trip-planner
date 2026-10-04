export type Status = 'OFF' | 'SB' | 'D' | 'ON'

export type StopType = 'start' | 'pickup' | 'dropoff' | 'fuel' | 'break' | 'rest' | 'restart'

export interface Place {
  lat: number
  lng: number
  label: string
}

export interface Suggestion extends Place {
  detail: string
}

export interface Stop {
  id: string
  type: StopType
  label: string
  location: string
  lat: number
  lng: number
  mile: number
  arrival: string
  departure: string
  minutes: number
}

export interface LogEntry {
  status: Status
  start: number // minutes since midnight
  end: number
  kind: string
  label: string
  miles: number
  location: string
  remark: string
  continued?: boolean
}

export interface DayLog {
  date: string
  from: string
  to: string
  day_index: number
  entries: LogEntry[]
  totals_minutes: Record<Status, number>
  totals_hm: Record<Status, string>
  driving_miles: number
  on_duty_minutes: number
  recap: {
    on_duty_today: string
    a_total_last_7_days: number
    b_available_tomorrow: number
    c_total_last_5_days: number
  }
}

export interface Summary {
  total_minutes: number
  driving_minutes: number
  on_duty_minutes: number
  total_miles: number
  route_miles: number
  rests: number
  breaks: number
  fuel_stops: number
  restarts: number
  start: string
  end: string
  days: number
  cycle_used_start_hours: number
  cycle_used_end_hours: number
}

export interface TripPlan {
  locations: { current: Place; pickup: Place; dropoff: Place }
  route: { geometry: [number, number][]; miles: number; leg_miles: number[] }
  stops: Stop[]
  logs: DayLog[]
  summary: Summary
  assumptions: Record<string, string | number>
}

export interface TripRequest {
  current: Place | string
  pickup: Place | string
  dropoff: Place | string
  cycle_used: number
  start_time: string
}

/** Optional details printed on the log sheet header (frontend only). */
export interface LogDetails {
  carrier: string
  officeAddress: string
  vehicles: string
  docNo: string
  shipper: string
}

export const EMPTY_DETAILS: LogDetails = { carrier: '', officeAddress: '', vehicles: '', docNo: '', shipper: '' }
