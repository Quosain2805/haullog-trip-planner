"""Hours-of-Service (49 CFR Part 395) trip scheduler for a property-carrying driver.

Pure Python, no Django / network dependencies, so it is easy to unit test.

Rules implemented (70 hr / 8 day driver, no adverse driving conditions):
  * 11-hour driving limit per shift
  * 14-hour driving window (does not pause for breaks)
  * 30-minute non-driving break after 8 cumulative driving hours
  * 10 consecutive hours off duty (we use the sleeper berth) resets the shift
  * 70-hour on-duty limit; a 34-hour off-duty restart resets the cycle
  * Fuel stop at least every 1,000 miles (30 min, on duty not driving)
  * 1 hour on duty for pickup and for drop-off

All durations are multiples of 15 minutes, matching the log grid.

Simplification (documented in the README): the hours already used in the
cycle are treated as one lump that does not roll off during the trip. This is
conservative: it can only make the plan stop *earlier*, never break the limit.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from math import ceil, floor

OFF, SB, DRIVING, ON = "OFF", "SB", "D", "ON"
STATUS_LABELS = {
    OFF: "Off Duty",
    SB: "Sleeper Berth",
    DRIVING: "Driving",
    ON: "On Duty (not driving)",
}

# --- Regulatory / assumption constants (minutes unless noted) -----------------
MAX_DRIVE = 11 * 60
MAX_WINDOW = 14 * 60
BREAK_AFTER_DRIVE = 8 * 60
BREAK_LENGTH = 30
REST_LENGTH = 10 * 60
CYCLE_LIMIT = 70 * 60
RESTART_LENGTH = 34 * 60
FUEL_INTERVAL_MILES = 1000.0
FUEL_STOP_MINUTES = 30
PICKUP_MINUTES = 60
DROPOFF_MINUTES = 60
AVG_SPEED_MPH = 55.0
DAY_MINUTES = 24 * 60
STEP = 15  # the log grid is kept in 15-minute increments (00, 15, 30, 45)


@dataclass
class Segment:
    status: str
    start: int  # minutes since trip start
    end: int
    kind: str  # drive | pickup | dropoff | fuel | break | rest | restart
    label: str
    miles: float = 0.0
    mile_marker: float = 0.0  # route odometer (miles) at segment start
    cycle_before: int = 0  # cycle minutes used before this segment
    cycle_after: int = 0

    @property
    def minutes(self) -> int:
        return self.end - self.start


@dataclass
class _State:
    t: int = 0
    shift_start: int | None = None
    shift_drive: int = 0
    since_break: int = 0
    nondrive_run: int = 0
    cycle: int = 0
    since_fuel_miles: float = 0.0
    odometer: float = 0.0
    segments: list[Segment] = field(default_factory=list)


class TripPlanner:
    def __init__(self, cycle_used_hours: float, speed_mph: float = AVG_SPEED_MPH):
        self.speed = speed_mph
        self.s = _State(cycle=int(round(cycle_used_hours * 60)))

    # -- low level ----------------------------------------------------------
    def _add(self, status: str, minutes: int, kind: str, label: str, miles: float = 0.0):
        s = self.s
        if minutes <= 0:
            return
        seg = Segment(
            status=status, start=s.t, end=s.t + minutes, kind=kind, label=label,
            miles=miles, mile_marker=s.odometer, cycle_before=s.cycle,
        )
        if status in (DRIVING, ON):
            if s.shift_start is None:
                s.shift_start = s.t
            s.cycle += minutes
        if status == DRIVING:
            s.shift_drive += minutes
            s.since_break += minutes
            s.nondrive_run = 0
            s.odometer += miles
            s.since_fuel_miles += miles
        else:
            s.nondrive_run += minutes
            if s.nondrive_run >= BREAK_LENGTH:
                s.since_break = 0
            if status in (OFF, SB) and minutes >= REST_LENGTH:
                s.shift_start, s.shift_drive = None, 0
            if status in (OFF, SB) and minutes >= RESTART_LENGTH:
                s.cycle = 0
        seg.cycle_after = s.cycle
        s.t += minutes
        s.segments.append(seg)

    def _rest(self):
        self._add(SB, REST_LENGTH, "rest", "10 hr rest (sleeper berth)")

    def _restart(self):
        self._add(OFF, RESTART_LENGTH, "restart", "34 hr restart (cycle reset)")

    def _window_left(self) -> int:
        s = self.s
        return MAX_WINDOW if s.shift_start is None else MAX_WINDOW - (s.t - s.shift_start)

    # -- public building blocks ----------------------------------------------
    def on_duty_task(self, minutes: int, kind: str, label: str):
        if self.s.cycle >= CYCLE_LIMIT:
            self._restart()
        if self._window_left() <= 0:
            self._rest()
        self._add(ON, minutes, kind, label)

    def drive(self, miles: float):
        s = self.s
        remaining = float(miles)
        while remaining > 0.01:
            lim_shift = MAX_DRIVE - s.shift_drive
            lim_window = self._window_left()
            lim_break = BREAK_AFTER_DRIVE - s.since_break
            # Limits are rounded *down* to the 15-minute grid so every segment lands on a grid line.
            lim_cycle = (CYCLE_LIMIT - s.cycle) // STEP * STEP
            lim_fuel = floor((FUEL_INTERVAL_MILES - s.since_fuel_miles) / self.speed * 60) // STEP * STEP

            if lim_cycle <= 0:
                self._restart()
            elif lim_shift <= 0 or lim_window <= 0:
                self._rest()
            elif lim_fuel <= 0:
                if s.cycle + FUEL_STOP_MINUTES > CYCLE_LIMIT:
                    # No point fuelling past the 70th hour: reset the cycle first, then fuel.
                    self._restart()
                    continue
                self._add(ON, FUEL_STOP_MINUTES, "fuel", "Fuel stop")
                s.since_fuel_miles = 0.0
            elif lim_break <= 0:
                self._add(OFF, BREAK_LENGTH, "break", "30 min break")
            else:
                need = ceil(remaining / self.speed * 60 / STEP) * STEP  # round the arrival up to the grid
                chunk = min(need, lim_shift, lim_window, lim_break, lim_cycle, lim_fuel)
                chunk_miles = min(remaining, chunk * self.speed / 60)
                self._add(DRIVING, chunk, "drive", "Driving", miles=chunk_miles)
                remaining -= chunk_miles


def plan_trip(
    leg_miles: list[float],
    cycle_used_hours: float,
    speed_mph: float = AVG_SPEED_MPH,
) -> list[Segment]:
    """leg_miles = [current->pickup, pickup->dropoff]. Returns ordered segments."""
    if len(leg_miles) != 2:
        raise ValueError("expected two legs")
    p = TripPlanner(cycle_used_hours, speed_mph)
    p.drive(leg_miles[0])
    p.on_duty_task(PICKUP_MINUTES, "pickup", "Pickup (loading)")
    p.drive(leg_miles[1])
    p.on_duty_task(DROPOFF_MINUTES, "dropoff", "Drop-off (unloading)")
    return p.s.segments


# ---------------------------------------------------------------------------
# Daily log sheets
# ---------------------------------------------------------------------------
def _fmt_hm(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def _cycle_at(segments: list[Segment], t: int, initial_cycle: int) -> int:
    """Cycle minutes used at absolute trip minute t (restart counts once complete)."""
    cycle = initial_cycle
    for seg in segments:
        if t >= seg.end:
            cycle = seg.cycle_after
        elif t > seg.start:
            if seg.status in (DRIVING, ON):
                cycle = seg.cycle_before + (t - seg.start)
            else:
                cycle = seg.cycle_before
            break
        else:
            break
    return cycle


def build_daily_logs(
    segments: list[Segment],
    start: datetime,
    cycle_used_hours: float,
) -> list[dict]:
    """Split the timeline at midnights and fill every day to exactly 24:00."""
    initial_cycle = int(round(cycle_used_hours * 60))
    day0 = start.replace(hour=0, minute=0, second=0, microsecond=0)
    offset = int((start - day0).total_seconds() // 60)  # trip minute 0 == this minute of day 0
    abs_segs = [(s, s.start + offset, s.end + offset) for s in segments]
    trip_end = abs_segs[-1][2] if abs_segs else offset
    n_days = max(1, ceil(trip_end / DAY_MINUTES))
    end_mile = segments[-1].mile_marker + segments[-1].miles if segments else 0.0

    days: list[dict] = []
    on_duty_by_day: list[int] = []
    seg_index = {id(s): i for i, s in enumerate(segments)}
    for d in range(n_days):
        lo, hi = d * DAY_MINUTES, (d + 1) * DAY_MINUTES
        entries: list[dict] = []
        cursor = lo
        if d == 0 and offset > 0:
            entries.append(dict(status=OFF, start=0, end=offset, kind="off", label="Off duty", mile_marker=0.0, miles=0.0, segment=None, where="start"))
            cursor = offset
        for seg, a, b in abs_segs:
            s0, s1 = max(a, lo), min(b, hi)
            if s1 <= s0:
                continue
            frac = (s1 - s0) / (b - a)
            entries.append(dict(
                status=seg.status, start=s0 - lo, end=s1 - lo, kind=seg.kind, label=seg.label,
                mile_marker=seg.mile_marker + seg.miles * ((s0 - a) / (b - a)),
                miles=round(seg.miles * frac, 1),
                end_mile=seg.mile_marker + seg.miles * ((s1 - a) / (b - a)),
                continued=a < lo,
                segment=seg_index[id(seg)],
            ))
            cursor = s1
        if cursor < hi:  # after the trip ends: off duty for the rest of the last day
            entries.append(dict(status=OFF, start=cursor - lo, end=DAY_MINUTES, kind="off", label="Off duty", mile_marker=end_mile, miles=0.0, segment=None, where="end"))

        totals = {OFF: 0, SB: 0, DRIVING: 0, ON: 0}
        for e in entries:
            totals[e["status"]] += e["end"] - e["start"]
        assert sum(totals.values()) == DAY_MINUTES, "day must total 24:00"
        on_duty = totals[DRIVING] + totals[ON]
        on_duty_by_day.append(on_duty)

        cycle_end = _cycle_at(segments, hi - offset, initial_cycle)
        last5 = sum(on_duty_by_day[max(0, d - 4): d + 1])
        # Prior (pre-trip) hours are only attributed to the first days of the trip.
        c_hours = min(cycle_end, last5 + (initial_cycle if d <= 4 else 0))
        date = day0 + timedelta(days=d)
        days.append({
            "date": date.date().isoformat(),
            "day_index": d,
            "entries": entries,
            "totals_minutes": totals,
            "totals_hm": {k: _fmt_hm(v) for k, v in totals.items()},
            "driving_miles": round(sum(e["miles"] for e in entries if e["status"] == DRIVING), 1),
            "on_duty_minutes": on_duty,
            "recap": {
                "on_duty_today": _fmt_hm(on_duty),
                "a_total_last_7_days": round(cycle_end / 60, 2),
                "b_available_tomorrow": round(max(0, CYCLE_LIMIT - cycle_end) / 60, 2),
                "c_total_last_5_days": round(c_hours / 60, 2),
            },
        })
    return days


def trip_summary(segments: list[Segment]) -> dict:
    drive = sum(s.minutes for s in segments if s.status == DRIVING)
    on = sum(s.minutes for s in segments if s.status == ON)
    return {
        "total_minutes": segments[-1].end if segments else 0,
        "driving_minutes": drive,
        "on_duty_minutes": on,
        "total_miles": round(sum(s.miles for s in segments), 1),
        "rests": sum(1 for s in segments if s.kind == "rest"),
        "breaks": sum(1 for s in segments if s.kind == "break"),
        "fuel_stops": sum(1 for s in segments if s.kind == "fuel"),
        "restarts": sum(1 for s in segments if s.kind == "restart"),
    }
