# HaulLog — Trip Planner & ELD Log Generator

A full-stack app (**Django + React**) that takes a trip's details and returns:

1. **A route map** with every pickup, drop-off, fuel stop, 30-minute break, 10-hour rest and 34-hour restart.
2. **Completed Driver's Daily Log sheets** (FMCSA graph-grid format), drawn and filled out — one per calendar day of the trip.

**Inputs:** current location · pickup location · drop-off location · current cycle used (hrs)
**Assumptions (from the brief):** property-carrying driver · 70 hr / 8 day · no adverse driving conditions · fuel at least every 1,000 mi · 1 hr for pickup and 1 hr for drop-off.

| | |
|---|---|
| Live app | _add Vercel URL_ |
| API health check | _add Render URL_`/api/health/` |
| Loom walkthrough | _add link_ |

## Features
- Route on an OpenStreetMap map with typed, colour-coded stop markers; click a stop to zoom to it.
- Daily log sheets drawn as SVG on the official 24-hour grid (15-minute precision): duty-status line, *City, ST – note* remark at every change of duty status, per-line totals that always add up to **24:00**, and the 70 hr / 8 day recap (A / B / C).
- Download any sheet as PNG, or print / save all sheets as a PDF (one sheet per page).
- Insights: cycle gauges and trip statistics; a day-by-day "trip at a glance" duty chart.
- Optional carrier / truck / shipping details are printed on the sheets.
- Light and dark themes, responsive down to phone width.

## How the Hours-of-Service planner works

The scheduler ([backend/trips/hos.py](backend/trips/hos.py)) is pure Python with no framework or network dependencies, so it is fully unit-tested. Before every stretch of driving it checks each limit and inserts whatever stop is needed:

| Rule (49 CFR 395.3) | How it is applied |
|---|---|
| 11-hour driving limit | After 11 h driving → 10 h rest (sleeper berth) |
| 14-hour window | Starts at the first on-duty time and does **not** pause for breaks → 10 h rest when it ends |
| 30-minute break | After 8 cumulative driving hours without ≥30 min non-driving (fuel, pickup and drop-off also satisfy it) |
| 70 hr / 8 day | Driving + on-duty time accumulate against 70 h; when exhausted → 34 h restart, which resets the cycle |
| Fuel | 30 min on-duty stop whenever 1,000 mi have been driven since the last fill |
| Pickup / drop-off | 1 h on duty each |

The timeline is split at midnight into daily logs. Everything is kept on the 15-minute grid, so every sheet total is a multiple of 15 minutes and each sheet sums to exactly 24:00.

**Verification.** Besides unit tests, [test_hos_fuzz.py](backend/trips/tests/test_hos_fuzz.py) runs thousands of random trips through an *independent* validator that re-derives every rule from the finished timeline (11 h, 14 h window, 8 h break, 70 h cycle, 1,000 mi fuel gap, 24:00 days, 15-minute grid). Tens of thousands of random trips pass.

**Simplifications (conservative, shown in the app):**
- Average speed 55 mph over the OSRM road distance; arrival is rounded up to the next 15 minutes.
- Hours already used in the cycle are one lump that does not roll off during the trip — this can only make the plan stop *earlier*, never break a limit.
- All times are home-terminal local time (no time-zone conversion mid-route). The start time is snapped to the nearest quarter hour.
- On-duty work such as a drop-off may legally finish past the 70th hour (only *driving* is prohibited).

## Architecture

```
frontend/  React 19 + TypeScript + Vite · Leaflet map · hand-built SVG log sheet
backend/   Django + DRF (stateless, no database)
  trips/hos.py       HOS scheduler + daily-log builder (pure functions)
  trips/places.py    offline "nearest city/town + state" lookup (bundled GeoNames data)
  trips/services.py  Nominatim (geocoding), Photon (autocomplete), OSRM (routing)
  trips/planner.py   glue: locations → route → schedule → JSON
  trips/tests/       unit, fuzz and API tests
```

Free stack, no API keys: **OpenStreetMap** tiles, **OSRM** routing, **Nominatim** geocoding, **Photon** autocomplete. Stop names (FMCSA remarks need the nearest city/town/village + state) come from a bundled dataset of ~20k US and Canadian places, so they resolve instantly and offline.

### API

`POST /api/plan/`
```json
{
  "current":  {"lat": 41.87, "lng": -87.62, "label": "Chicago, IL"},
  "pickup":   "Nashville, TN",
  "dropoff":  "Phoenix, AZ",
  "cycle_used": 10,
  "start_time": "2026-03-02T08:00"
}
```
Each location may be a `{lat,lng,label}` object (from autocomplete) or free text (geocoded server-side). Returns `route`, `stops`, `segments`, `logs` (one per day), `summary` and `assumptions`.
`GET /api/suggest/?q=` autocomplete · `GET /api/health/`

## Run locally

```bash
# API
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
python manage.py runserver                              # http://localhost:8000

# Web (new terminal)
cd frontend
npm install
npm run dev                                             # http://localhost:5173
```

Open **http://localhost:5173** (port 8000 is only the API).
Tests: `cd backend && pytest` · Frontend checks: `cd frontend && npm run build`

## Deploy

**API → Render** (free): New → Blueprint → select this repo (uses [render.yaml](render.yaml)).
Then set `CORS_ALLOWED_ORIGINS` to your Vercel URL. *(Free instances sleep; the UI pings `/api/health/` on load and shows a "server is waking up" hint if the first request is slow.)*

**Web → Vercel**: import the repo, set **Root Directory** to `frontend`, add the env var
`VITE_API_URL=https://<your-render-service>.onrender.com`, deploy.
(`*.vercel.app` origins are already allowed by CORS.)

## Credits
Map data © OpenStreetMap contributors · routing by OSRM · place names from [GeoNames](https://www.geonames.org) (CC BY 4.0).
Public OSM services are fair-use; responses are cached server-side.
