import L from 'leaflet'
import { useEffect, useMemo, useState } from 'react'
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import { duration, fmtDateTime, STOP_META } from '../format'
import type { Stop, StopType, TripPlan } from '../types'

function icon(type: StopType, selected: boolean, index: number) {
  const m = STOP_META[type]
  const big = type === 'start' || type === 'pickup' || type === 'dropoff'
  const size = big ? 38 : 30
  return L.divIcon({
    className: 'stop-marker-wrap',
    html: `<div class="stop-marker ${selected ? 'selected' : ''} ${big ? 'big' : ''}" style="--c:${m.color};width:${size}px;height:${size}px;animation-delay:${index * 60}ms">${m.glyph}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  })
}

function Controller({
  points, focus, fitSignal,
}: { points: [number, number][]; focus: Stop | null; fitSignal: number }) {
  const map = useMap()
  useEffect(() => {
    if (!points.length) return
    const fit = () => {
      map.invalidateSize()
      map.fitBounds(L.latLngBounds(points), { paddingTopLeft: [60, 90], paddingBottomRight: [60, 70], animate: true })
    }
    fit()
    const t = setTimeout(fit, 250)
    return () => clearTimeout(t)
  }, [map, points, fitSignal])
  useEffect(() => {
    if (focus) map.flyTo([focus.lat, focus.lng], Math.max(map.getZoom(), 8), { duration: 0.8 })
  }, [map, focus])
  return null
}

interface Props {
  plan: TripPlan | null
  loading: boolean
  slow?: boolean
  selectedId: string | null
  onSelect: (id: string) => void
}

export default function RouteMap({ plan, loading, slow, selectedId, onSelect }: Props) {
  const [fitSignal, setFitSignal] = useState(0)
  const geometry = plan?.route.geometry ?? []
  const focus = useMemo(() => plan?.stops.find((s) => s.id === selectedId) ?? null, [plan, selectedId])
  const used = useMemo(() => [...new Set(plan?.stops.map((s) => s.type) ?? [])], [plan])

  return (
    <div className={`map-shell ${loading ? 'is-loading' : ''}`}>
      <MapContainer center={[39.5, -98.35]} zoom={4} minZoom={3} scrollWheelZoom zoomControl={false} className="map">
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        {plan && (
          <>
            <Polyline positions={geometry} pathOptions={{ color: '#0b1220', weight: 10, opacity: 0.35, lineCap: 'round' }} />
            <Polyline positions={geometry} pathOptions={{ color: '#fb923c', weight: 6, opacity: 1, lineCap: 'round', className: 'route-base' }} />
            <Polyline positions={geometry} pathOptions={{ color: '#fff', weight: 2, opacity: 0.9, dashArray: '2 14', lineCap: 'round', className: 'route-flow' }} />
            {plan.stops.map((s, i) => (
              <Marker
                key={s.id}
                position={[s.lat, s.lng]}
                icon={icon(s.type, s.id === selectedId, i)}
                zIndexOffset={['start', 'pickup', 'dropoff'].includes(s.type) ? 500 : 0}
                eventHandlers={{ click: () => onSelect(s.id) }}
              >
                <Popup>
                  <div className="popup">
                    <span className="popup-tag" style={{ background: STOP_META[s.type].color }}>{STOP_META[s.type].name}</span>
                    <strong>{s.location}</strong>
                    <span>{fmtDateTime(s.arrival)}</span>
                    {s.minutes > 0 && <span>Stopped {duration(s.minutes)}</span>}
                    {s.type !== 'start' && <span>Mile {Math.round(s.mile).toLocaleString()} of {Math.round(plan.route.miles).toLocaleString()}</span>}
                  </div>
                </Popup>
              </Marker>
            ))}
          </>
        )}
        <Controller points={geometry} focus={focus} fitSignal={fitSignal} />
      </MapContainer>

      {plan && (
        <>
          <div className="map-chips">
            <div className="chip"><span>Distance</span><b>{Math.round(plan.summary.route_miles).toLocaleString()} mi</b></div>
            <div className="chip"><span>Trip time</span><b>{duration(plan.summary.total_minutes)}</b></div>
            <div className="chip"><span>Arrive</span><b>{fmtDateTime(plan.summary.end)}</b></div>
          </div>
          <button type="button" className="map-fit" onClick={() => setFitSignal((n) => n + 1)} title="Fit route to screen">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
            Fit route
          </button>
          <div className="legend">
            {used.map((t) => (
              <span key={t}><i style={{ background: STOP_META[t].color }} />{STOP_META[t].name}</span>
            ))}
          </div>
        </>
      )}

      {!plan && !loading && (
        <div className="map-hint">
          <span className="pulse" />
          Enter a trip to draw the route and every required stop
        </div>
      )}
      {loading && (
        <div className="map-loading">
          <span className="spinner lg" />
          <b>Building your route…</b>
          <small>Routing · scheduling rests · drawing logs</small>
          {slow && <small className="slow">The free server is waking up — this can take up to a minute the first time.</small>}
        </div>
      )}
    </div>
  )
}
