"""Randomised check of the scheduler against an independent re-implementation of the rules.

The validator below walks the finished timeline segment by segment and never touches the
planner's internal state, so a bug in the planner cannot hide itself.
"""
import random
from datetime import datetime

from trips import hos
from trips.hos import DRIVING, OFF, ON, SB


def validate(segs, legs, cycle_hours):
    assert segs, "no segments"
    assert segs[0].start == 0
    for a, b in zip(segs, segs[1:]):
        assert a.end == b.start, "timeline must be contiguous"
    for s in segs:
        assert s.end > s.start, "empty segment"
        assert s.start % 15 == 0 and s.end % 15 == 0, "segment is off the 15-minute grid"
        assert s.status in (OFF, SB, DRIVING, ON)

    shift_start = None      # start of the current 14-hour window
    shift_drive = 0         # driving minutes in the current shift
    drive_since_break = 0   # driving minutes since the last >=30 min non-driving block
    cycle = int(round(cycle_hours * 60))
    last_fuel_mile = 0.0
    nondrive_run = 0

    for s in segs:
        if s.status == DRIVING:
            nondrive_run = 0
            if shift_start is None:
                shift_start = s.start
            shift_drive += s.minutes
            drive_since_break += s.minutes
            cycle += s.minutes
            assert shift_drive <= 11 * 60, f"11-hour driving limit broken ({shift_drive})"
            assert s.end - shift_start <= 14 * 60, "drove past the 14-hour window"
            assert drive_since_break <= 8 * 60, "no 30-min break within 8 h driving"
            assert cycle <= 70 * 60, f"70-hour cycle exceeded ({cycle / 60:.2f})"
        else:
            nondrive_run += s.minutes
            if nondrive_run >= 30:
                drive_since_break = 0
            if s.status == ON:
                if shift_start is None:
                    shift_start = s.start
                cycle += s.minutes
            if s.status in (OFF, SB) and s.minutes >= 10 * 60:
                shift_start, shift_drive = None, 0
            if s.status in (OFF, SB) and s.minutes >= 34 * 60:
                cycle = 0
        if s.kind == "fuel":
            assert s.mile_marker - last_fuel_mile <= 1000.5, "more than 1,000 mi between fuel stops"
            last_fuel_mile = s.mile_marker
        if s.kind == "rest":
            assert s.minutes >= 10 * 60
        if s.kind == "restart":
            assert s.minutes >= 34 * 60
        if s.kind in ("pickup", "dropoff"):
            assert s.status == ON and s.minutes == 60

    end_mile = segs[-1].mile_marker + segs[-1].miles
    assert end_mile - last_fuel_mile <= 1000.5, "final stretch longer than 1,000 mi without fuel"
    assert abs(sum(s.miles for s in segs) - sum(legs)) < 0.5, "driven miles must equal route miles"
    assert sum(1 for s in segs if s.kind == "pickup") == 1
    assert sum(1 for s in segs if s.kind == "dropoff") == 1
    # pickup happens after leg 1, drop-off at the very end
    pick = next(s for s in segs if s.kind == "pickup")
    assert abs(pick.mile_marker - legs[0]) < 0.5
    assert segs[-1].kind == "dropoff"


def validate_days(segs, days, start):
    for i, d in enumerate(days):
        assert sum(d["totals_minutes"].values()) == 1440, "each sheet must total 24:00"
        pos = 0
        for e in d["entries"]:
            assert e["start"] == pos and e["end"] > e["start"]
            pos = e["end"]
        assert pos == 1440
        assert d["driving_miles"] >= 0
        assert all(v % 15 == 0 for v in d["totals_minutes"].values()), "sheet totals must be multiples of 15 min"
        r = d["recap"]
        # Only pickup / drop-off (legal on-duty-not-driving work) may carry the total past 70 h.
        assert 0 <= r["a_total_last_7_days"] <= 71.01
        assert abs(min(70, r["a_total_last_7_days"]) + r["b_available_tomorrow"] - 70) < 0.02
    assert abs(sum(d["driving_miles"] for d in days) - sum(s.miles for s in segs)) < 1.5 + 0.1 * len(days)
    assert days[0]["date"] == start.date().isoformat()


def test_random_trips_obey_every_rule():
    rng = random.Random(20260310)
    for case in range(2000):
        legs = [rng.choice([0, rng.uniform(0, 80), rng.uniform(0, 900), rng.uniform(0, 3200)]) for _ in range(2)]
        cycle = rng.choice([0, 70, rng.uniform(0, 70), rng.uniform(40, 70)])
        start = datetime(2026, 3, rng.randint(1, 28), rng.randint(0, 23), rng.choice([0, 15, 30, 45]))  # UI snaps to 15 min
        segs = hos.plan_trip(legs, cycle)
        try:
            validate(segs, legs, cycle)
            validate_days(segs, hos.build_daily_logs(segs, start, cycle), start)
        except AssertionError as exc:
            raise AssertionError(f"case {case}: legs={legs} cycle={cycle} start={start}: {exc}") from exc


def test_extreme_trips():
    for legs, cycle in [([3000, 3000], 0), ([3000, 3000], 69.9), ([0, 0], 0), ([0, 0], 70), ([0.01, 0.01], 35), ([5000, 5000], 70)]:
        segs = hos.plan_trip(legs, cycle)
        validate(segs, legs, cycle)
        validate_days(segs, hos.build_daily_logs(segs, datetime(2026, 3, 2, 8, 0), cycle), datetime(2026, 3, 2, 8, 0))
