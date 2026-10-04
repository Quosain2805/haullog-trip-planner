"""Glue: locations + route + HOS schedule -> the JSON the frontend renders."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta

from . import hos, services

STOP_TYPES = {"pickup", "dropoff", "fuel", "break", "rest", "restart"}


def resolve_location(value) -> dict:
    """Accepts {lat,lng,label} or a free-text string."""
    if isinstance(value, dict):
        label = value.get("label") or f"{value['lat']:.3f}, {value['lng']:.3f}"
        return {"lat": float(value["lat"]), "lng": float(value["lng"]), "label": str(label)}
    return services.geocode(str(value))


def build_plan(current, pickup, dropoff, cycle_used: float, start: datetime) -> dict:
    with ThreadPoolExecutor(max_workers=3) as pool:  # free-text inputs are geocoded concurrently
        locs = list(pool.map(resolve_location, (current, pickup, dropoff)))
    route = services.route([(l["lat"], l["lng"]) for l in locs])
    leg_miles = route["leg_miles"]
    total_miles = route["miles"]

    segments = hos.plan_trip(leg_miles, cycle_used)
    logs = hos.build_daily_logs(segments, start, cycle_used)
    poly = services.Polyline(route["geometry"], total_miles)

    # Where the truck is when each segment begins.
    seg_points = [poly.at(s.mile_marker) for s in segments]
    # Only stops need a reverse lookup: a driving segment starts where the previous
    # stop was, and the endpoints use the labels the user already picked.
    names: list[str | None] = [None] * len(segments)
    for i, s in enumerate(segments):
        if s.kind == "pickup":
            names[i] = locs[1]["label"]
        elif s.kind == "dropoff":
            names[i] = locs[2]["label"]
    lookup = [i for i, s in enumerate(segments) if s.kind != "drive" and names[i] is None]
    found = services.reverse_many([(round(seg_points[i][0], 3), round(seg_points[i][1], 3)) for i in lookup])
    for i, label in zip(lookup, found):
        names[i] = label
    for i, s in enumerate(segments):
        if names[i] is None:  # driving segment
            names[i] = locs[0]["label"] if i == 0 else names[i - 1]

    def iso(minutes: int) -> str:
        return (start + timedelta(minutes=minutes)).isoformat(timespec="minutes")

    seg_out = [{
        "index": i, "status": s.status, "kind": s.kind, "label": s.label,
        "start": iso(s.start), "end": iso(s.end), "minutes": s.minutes,
        "miles": round(s.miles, 1), "mile_marker": round(s.mile_marker, 1),
        "lat": round(seg_points[i][0], 5), "lng": round(seg_points[i][1], 5),
        "location": names[i],
    } for i, s in enumerate(segments)]

    # Map stops: trip origin + every non-driving event.
    stops = [{
        "id": "start", "type": "start", "label": "Trip start", "location": locs[0]["label"],
        "lat": locs[0]["lat"], "lng": locs[0]["lng"], "mile": 0.0,
        "arrival": iso(0), "departure": iso(0), "minutes": 0,
    }]
    for sg in seg_out:
        if sg["kind"] in STOP_TYPES:
            stops.append({
                "id": f"seg-{sg['index']}", "type": sg["kind"], "label": sg["label"],
                "location": sg["location"], "lat": sg["lat"], "lng": sg["lng"],
                "mile": sg["mile_marker"], "arrival": sg["start"], "departure": sg["end"],
                "minutes": sg["minutes"],
            })

    # Attach location + remark text to every log entry.
    for day in logs:
        for e in day["entries"]:
            if e["segment"] is not None:
                e["location"] = seg_out[e["segment"]]["location"]
            else:
                e["location"] = locs[0]["label"] if e.get("where") == "start" else locs[2]["label"]
            e["remark"] = e["location"] if e["kind"] == "drive" else f"{e['location']} – {e['label']}"

    # "From" / "To" for each sheet. A driving segment that crosses midnight ends the day
    # somewhere mid-route, so those points get their own reverse lookup.
    extra: list[tuple[int, str, tuple[float, float]]] = []
    for di, day in enumerate(logs):
        first, last = day["entries"][0], day["entries"][-1]
        day["from"] = first["location"]
        day["to"] = last["location"]
        if first["kind"] == "drive" and first.get("continued"):
            extra.append((di, "from", poly.at(first["mile_marker"])))
        if last["kind"] == "drive":
            extra.append((di, "to", poly.at(last["end_mile"])))
    if extra:
        labels = services.reverse_many([(round(p[0], 3), round(p[1], 3)) for _, _, p in extra])
        for (di, key, _), label in zip(extra, labels):
            logs[di][key] = label
    for day in logs:
        for e in day["entries"]:
            e.pop("end_mile", None)

    summary = hos.trip_summary(segments)
    summary.update({
        "route_miles": round(total_miles, 1),
        "start": iso(0), "end": iso(segments[-1].end),
        "days": len(logs),
        "cycle_used_start_hours": cycle_used,
        "cycle_used_end_hours": round(segments[-1].cycle_after / 60, 2),
    })

    return {
        "locations": {"current": locs[0], "pickup": locs[1], "dropoff": locs[2]},
        "route": {
            "geometry": services.downsample(route["geometry"]),
            "miles": round(total_miles, 1),
            "leg_miles": [round(m, 1) for m in leg_miles],
        },
        "stops": stops,
        "segments": seg_out,
        "logs": logs,
        "summary": summary,
        "assumptions": {
            "avg_speed_mph": hos.AVG_SPEED_MPH,
            "fuel_every_miles": hos.FUEL_INTERVAL_MILES,
            "pickup_minutes": hos.PICKUP_MINUTES,
            "dropoff_minutes": hos.DROPOFF_MINUTES,
            "cycle": "70 hr / 8 day, property-carrying, no adverse conditions",
        },
    }
