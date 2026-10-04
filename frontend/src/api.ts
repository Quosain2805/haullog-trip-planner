import type { Suggestion, TripPlan, TripRequest } from './types'

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? 'http://localhost:8000'

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json()
    if (typeof body.detail === 'string') return body.detail
    const first = Object.entries(body)[0]
    if (first) return `${first[0].replace('_', ' ')}: ${[first[1]].flat().join(' ')}`
  } catch {
    /* fall through */
  }
  return `Request failed (${res.status})`
}

export async function planTrip(req: TripRequest, signal?: AbortSignal): Promise<TripPlan> {
  let res: Response
  try {
    res = await fetch(`${BASE}/api/plan/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal,
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    const misconfigured = BASE.includes('localhost') && !['localhost', '127.0.0.1'].includes(window.location.hostname)
    throw new Error(
      misconfigured
        ? 'This deployment is not connected to its API (VITE_API_URL is not set).'
        : 'Cannot reach the server. If it was idle it may be waking up — please try again in a moment.',
    )
  }
  if (!res.ok) throw new Error(await parseError(res))
  return res.json()
}

export async function suggest(q: string, signal?: AbortSignal): Promise<Suggestion[]> {
  const res = await fetch(`${BASE}/api/suggest/?q=${encodeURIComponent(q)}`, { signal })
  if (!res.ok) return []
  return (await res.json()).results ?? []
}

export function warmUp() {
  fetch(`${BASE}/api/health/`).catch(() => {})
}
