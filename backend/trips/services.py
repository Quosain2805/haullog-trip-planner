"""External services (all free, keyless): Nominatim, Photon, OSRM."""
from __future__ import annotations

import hashlib
import logging
from bisect import bisect_left
from concurrent.futures import ThreadPoolExecutor
from math import atan2, cos, radians, sin, sqrt

import requests
from django.conf import settings
from django.core.cache import cache

from . import places

log = logging.getLogger(__name__)
METERS_PER_MILE = 1609.344
PHOTON_URL = "https://photon.komoot.io"

US_STATES = {
    "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR", "California": "CA",
    "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE", "Florida": "FL", "Georgia": "GA",
    "Hawaii": "HI", "Idaho": "ID", "Illinois": "IL", "Indiana": "IN", "Iowa": "IA",
    "Kansas": "KS", "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
    "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS",
    "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV", "New Hampshire": "NH",
    "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC",
    "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK", "Oregon": "OR", "Pennsylvania": "PA",
    "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD", "Tennessee": "TN",
    "Texas": "TX", "Utah": "UT", "Vermont": "VT", "Virginia": "VA", "Washington": "WA",
    "West Virginia": "WV", "Wisconsin": "WI", "Wyoming": "WY", "District of Columbia": "DC",
}


class ServiceError(Exception):
    """Raised for user-presentable upstream failures."""

    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


class ClientRejected(ServiceError):
    """The upstream service rejected the request itself (4xx): retrying will not help."""


def _get(url: str, params: dict, timeout: float = 12, retries: int = 2):
    headers = {"User-Agent": settings.HTTP_USER_AGENT, "Accept-Language": "en"}
    last: Exception | None = None
    for _ in range(retries + 1):
        try:
            r = requests.get(url, params=params, headers=headers, timeout=timeout)
            if r.status_code == 429 or r.status_code >= 500:
                last = ServiceError(f"{url} returned {r.status_code}")
                continue
            if 400 <= r.status_code < 500:
                raise ClientRejected(f"{url} returned {r.status_code}", status=400)
            r.raise_for_status()
            return r.json()
        except ClientRejected:
            raise
        except requests.RequestException as exc:
            last = exc
    raise ServiceError(f"Upstream service unavailable ({last})")


def short_label(props: dict) -> str:
    """'City, ST' style label from a Photon feature's properties."""
    name = props.get("city") or props.get("town") or props.get("village") or props.get("name") or props.get("county")
    state = props.get("state")
    if props.get("countrycode") == "US" and state in US_STATES:
        state = US_STATES[state]
    parts = [p for p in (name, state) if p]
    if props.get("countrycode") not in (None, "US") and props.get("country"):
        parts.append(props["country"])
    return ", ".join(parts) or "Unknown location"


def place_label(props: dict) -> str:
    """Nearest *place* name for reverse geocoding (never a road or business)."""
    state = props.get("state")
    if props.get("countrycode") == "US" and state in US_STATES:
        state = US_STATES[state]
    if props.get("osm_key") == "place" and props.get("name"):
        name = props["name"]
    else:
        name = props.get("city") or props.get("town") or props.get("village") or props.get("locality")
        if not name and props.get("county"):
            county = props["county"]
            name = county if "County" in county or "Parish" in county else f"{county} County"
        name = name or props.get("district")
    return ", ".join(p for p in (name, state) if p) or "Unknown location"


def _key(prefix: str, text: str) -> str:
    return f"{prefix}:{hashlib.md5(text.lower().strip().encode()).hexdigest()}"


def suggest(query: str, limit: int = 6) -> list[dict]:
    query = query.strip()
    if len(query) < 2:
        return []
    key = _key("suggest", query)
    if (hit := cache.get(key)) is not None:
        return hit
    data = _get(f"{PHOTON_URL}/api/", {"q": query, "limit": limit + 4, "lang": "en"})
    out, seen = [], set()
    for f in data.get("features", []):
        p = f["properties"]
        if p.get("countrycode") not in ("US", "CA", "MX"):
            continue
        lng, lat = f["geometry"]["coordinates"]
        label = short_label(p)
        detail = ", ".join(x for x in (p.get("name"), p.get("street"), p.get("city"), p.get("state")) if x)
        if (label, round(lat, 2), round(lng, 2)) in seen:
            continue
        seen.add((label, round(lat, 2), round(lng, 2)))
        out.append({"label": label, "detail": detail or label, "lat": lat, "lng": lng})
        if len(out) >= limit:
            break
    cache.set(key, out, 3600)
    return out


def geocode(query: str) -> dict:
    """Free-text -> {lat, lng, label}. Used when the client sends a string."""
    key = _key("geocode", query)
    if (hit := cache.get(key)) is not None:
        return hit
    data = _get(f"{settings.NOMINATIM_URL}/search", {
        "q": query, "format": "jsonv2", "limit": 1, "addressdetails": 1,
    })
    if not data:
        raise ServiceError(f"Could not find a location for “{query}”.", status=400)
    r = data[0]
    addr = r.get("address", {})
    state = addr.get("state")
    if addr.get("country_code") == "us" and state in US_STATES:
        state = US_STATES[state]
    city = addr.get("city") or addr.get("town") or addr.get("village") or addr.get("county") or r.get("name")
    label = ", ".join(p for p in (city, state) if p) or r.get("display_name", query)
    out = {"lat": float(r["lat"]), "lng": float(r["lon"]), "label": label}
    cache.set(key, out, 86400)
    return out


def _photon_place(params: dict) -> str | None:
    try:
        data = _get(f"{PHOTON_URL}/reverse", {"lang": "en", **params}, timeout=6, retries=1)
    except ServiceError:
        return None
    return place_label(data["features"][0]["properties"]) if data.get("features") else None


def _nominatim_place(lat: float, lng: float) -> str | None:
    try:
        data = _get(f"{settings.NOMINATIM_URL}/reverse", {
            "lat": lat, "lon": lng, "format": "jsonv2", "zoom": 10, "addressdetails": 1,
        }, timeout=6, retries=0)
    except ServiceError:
        return None
    addr = data.get("address", {})
    state = addr.get("state")
    if addr.get("country_code") == "us" and state in US_STATES:
        state = US_STATES[state]
    city = addr.get("city") or addr.get("town") or addr.get("village") or addr.get("county")
    return ", ".join(p for p in (city, state) if p) or None


def reverse_label(lat: float, lng: float) -> str:
    """Nearest city/town/village + state, as FMCSA remarks require."""
    key = _key("rev", f"{round(lat, 2)},{round(lng, 2)}")
    if (hit := cache.get(key)) is not None:
        return hit
    # 1) bundled GeoNames data: instant, offline, US + Canada
    label = places.nearest(lat, lng)
    # 2) elsewhere (e.g. Mexico): nearest populated place from Photon, then any Photon hit, then Nominatim
    label = (
        label
        or _photon_place({"lat": lat, "lon": lng, "radius": 80, "limit": 1,
                          "osm_tag": ["place:city", "place:town", "place:village"]})
        or _photon_place({"lat": lat, "lon": lng})
        or _nominatim_place(lat, lng)
        or f"{lat:.2f}, {lng:.2f}"
    )
    cache.set(key, label, 86400)
    return label


def reverse_many(points: list[tuple[float, float]]) -> list[str]:
    unique = list(dict.fromkeys(points))
    with ThreadPoolExecutor(max_workers=6) as pool:
        labels = dict(zip(unique, pool.map(lambda p: reverse_label(*p), unique)))
    return [labels[p] for p in points]


# --- Routing -----------------------------------------------------------------
def route(waypoints: list[tuple[float, float]]) -> dict:
    """waypoints: [(lat, lng), ...]. Returns geometry [[lat,lng]], legs miles, total miles."""
    coords = ";".join(f"{lng:.6f},{lat:.6f}" for lat, lng in waypoints)
    url = f"{settings.OSRM_URL}/route/v1/driving/{coords}"
    params = {"overview": "full", "geometries": "geojson", "steps": "false"}
    try:
        data = _get(url, params, timeout=30)
    except ClientRejected:
        # OSRM answers 400 NoRoute when a point cannot be reached by road (e.g. an island).
        raise ServiceError("No drivable route found between those locations.", status=400)
    if data.get("code") != "Ok" or not data.get("routes"):
        raise ServiceError("No drivable route found between those locations.", status=400)
    r = data["routes"][0]
    geometry = [[lat, lng] for lng, lat in r["geometry"]["coordinates"]]
    return {
        "geometry": geometry,
        "leg_miles": [leg["distance"] / METERS_PER_MILE for leg in r["legs"]],
        "miles": r["distance"] / METERS_PER_MILE,
    }


def _haversine_miles(a, b) -> float:
    (la1, lo1), (la2, lo2) = a, b
    dlat, dlon = radians(la2 - la1), radians(lo2 - lo1)
    h = sin(dlat / 2) ** 2 + cos(radians(la1)) * cos(radians(la2)) * sin(dlon / 2) ** 2
    return 3958.8 * 2 * atan2(sqrt(h), sqrt(1 - h))


class Polyline:
    """Maps an odometer reading (miles along the route) to a lat/lng."""

    def __init__(self, geometry: list[list[float]], total_miles: float):
        cum = [0.0]
        for a, b in zip(geometry, geometry[1:]):
            cum.append(cum[-1] + _haversine_miles(a, b))
        scale = total_miles / cum[-1] if cum[-1] else 1.0
        self.cum = [c * scale for c in cum]
        self.pts = geometry

    def at(self, mile: float) -> tuple[float, float]:
        mile = max(0.0, min(mile, self.cum[-1]))
        i = bisect_left(self.cum, mile)
        if i == 0:
            return tuple(self.pts[0])
        a, b = self.pts[i - 1], self.pts[i]
        span = self.cum[i] - self.cum[i - 1]
        f = (mile - self.cum[i - 1]) / span if span else 0
        return (a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f)


def downsample(geometry: list[list[float]], max_points: int = 3000) -> list[list[float]]:
    if len(geometry) <= max_points:
        return geometry
    step = len(geometry) / max_points
    out = [geometry[int(i * step)] for i in range(max_points)]
    out.append(geometry[-1])
    return out
