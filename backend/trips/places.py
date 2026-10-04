"""Offline "nearest city, town or village" lookup.

FMCSA remarks must name the nearest city/town/village and state for every change of duty
status. Resolving that with a public geocoder is slow (rate limited) and can fail, so we
bundle ~20k US + Canadian places from GeoNames (CC BY 4.0, see scripts/build_places.py).
"""
from __future__ import annotations

import csv
import gzip
from functools import lru_cache
from math import cos, radians, sqrt
from pathlib import Path

DATA = Path(__file__).resolve().parent / "data" / "places.csv.gz"
CELL = 0.5  # degrees per grid cell
MAX_MILES = 60.0


@lru_cache(maxsize=1)
def _index() -> dict[tuple[int, int], list[tuple[str, str, float, float]]]:
    grid: dict[tuple[int, int], list[tuple[str, str, float, float]]] = {}
    with gzip.open(DATA, "rt", encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            lat, lng = float(row["lat"]), float(row["lng"])
            grid.setdefault((int(lat // CELL), int(lng // CELL)), []).append((row["name"], row["state"], lat, lng))
    return grid


def _miles(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    # Equirectangular approximation: plenty accurate at these distances.
    x = radians(lng2 - lng1) * cos(radians((lat1 + lat2) / 2))
    y = radians(lat2 - lat1)
    return 3958.8 * sqrt(x * x + y * y)


def nearest(lat: float, lng: float, max_miles: float = MAX_MILES) -> str | None:
    """'Town, ST' for the closest place within max_miles, else None."""
    grid = _index()
    ci, cj = int(lat // CELL), int(lng // CELL)
    best: tuple[float, str, str] | None = None
    for ring in range(0, 4):  # widen the search until a hit is certain to be the closest
        for i in range(ci - ring, ci + ring + 1):
            for j in range(cj - ring, cj + ring + 1):
                if max(abs(i - ci), abs(j - cj)) != ring:
                    continue
                for name, state, plat, plng in grid.get((i, j), ()):
                    d = _miles(lat, lng, plat, plng)
                    if best is None or d < best[0]:
                        best = (d, name, state)
        # anything outside the rings searched is at least `ring * CELL` degrees (~34 mi) away
        if best is not None and best[0] <= ring * CELL * 69 * 0.7:
            break
    if best is None or best[0] > max_miles:
        return None
    return f"{best[1]}, {best[2]}"
