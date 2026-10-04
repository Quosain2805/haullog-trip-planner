from datetime import datetime

from trips import hos
from trips.hos import DRIVING, OFF, ON, SB


def run(legs, cycle=0.0):
    return hos.plan_trip(legs, cycle)


def test_short_trip_has_no_rest_or_break():
    segs = run([50, 100])
    kinds = [s.kind for s in segs]
    assert kinds == ["drive", "pickup", "drive", "dropoff"]
    assert sum(s.miles for s in segs) == 150


def test_pickup_and_dropoff_are_one_hour_on_duty():
    segs = run([50, 100])
    pick = next(s for s in segs if s.kind == "pickup")
    drop = next(s for s in segs if s.kind == "dropoff")
    assert (pick.status, pick.minutes) == (ON, 60)
    assert (drop.status, drop.minutes) == (ON, 60)


def test_segments_are_contiguous():
    segs = run([300, 1500], cycle=20)
    for a, b in zip(segs, segs[1:]):
        assert a.end == b.start


def test_never_exceeds_driving_or_window_limits():
    segs = run([400, 2200], cycle=10)
    shift_start = None
    drive = 0
    since_break = 0
    for s in segs:
        if s.kind in ("rest", "restart"):
            shift_start, drive = None, 0
            since_break = 0
            continue
        if shift_start is None:
            shift_start = s.start
        if s.status == DRIVING:
            drive += s.minutes
            since_break += s.minutes
            assert drive <= 11 * 60
            assert s.end - shift_start <= 14 * 60
            assert since_break <= 8 * 60
        elif s.minutes >= 30:
            since_break = 0


def test_break_inserted_after_8_hours_driving():
    segs = run([0.0001, 600])  # ~10.9 h of driving
    kinds = [s.kind for s in segs if s.kind != "pickup"]
    assert "break" in kinds
    first_break = next(s for s in segs if s.kind == "break")
    driven = sum(s.minutes for s in segs if s.status == DRIVING and s.end <= first_break.start)
    assert driven == 8 * 60


def test_rest_after_11_hours_driving():
    segs = run([10, 1000])
    assert any(s.kind == "rest" and s.minutes == 600 and s.status == SB for s in segs)


def test_fuel_at_least_every_1000_miles():
    segs = run([100, 2900])
    odo = 0.0
    last_fuel_odo = 0.0
    for s in segs:
        if s.kind == "fuel":
            assert s.mile_marker - last_fuel_odo <= 1000.5
            last_fuel_odo = s.mile_marker
    assert sum(1 for s in segs if s.kind == "fuel") >= 2
    assert segs[-1].mile_marker + segs[-1].miles - last_fuel_odo <= 1000.5 + 0  # tail


def test_cycle_limit_triggers_34_hour_restart():
    segs = run([100, 600], cycle=65)
    restart = [s for s in segs if s.kind == "restart"]
    assert len(restart) == 1 and restart[0].minutes == 34 * 60
    # No more than 70 on-duty hours accumulate between restarts
    cyc = 65 * 60
    for s in segs:
        if s.kind == "restart":
            cyc = 0
        elif s.status in (DRIVING, ON):
            cyc += s.minutes
            assert cyc <= 70 * 60


def test_cycle_already_exhausted_restarts_first():
    segs = run([100, 100], cycle=70)
    assert segs[0].kind == "restart"


def test_total_driven_miles_match_input():
    segs = run([321.5, 987.25], cycle=5)
    assert abs(sum(s.miles for s in segs) - (321.5 + 987.25)) < 0.5


def test_daily_logs_total_24_hours_each():
    segs = run([300, 2000], cycle=30)
    days = hos.build_daily_logs(segs, datetime(2026, 3, 2, 8, 0), 30)
    assert len(days) >= 4
    for d in days:
        assert sum(d["totals_minutes"].values()) == 1440
        # entries are contiguous 0..1440
        pos = 0
        for e in d["entries"]:
            assert e["start"] == pos
            pos = e["end"]
        assert pos == 1440


def test_first_day_is_off_duty_before_start():
    segs = run([50, 50])
    days = hos.build_daily_logs(segs, datetime(2026, 3, 2, 8, 0), 0)
    first = days[0]["entries"][0]
    assert (first["status"], first["start"], first["end"]) == (OFF, 0, 480)


def test_recap_available_hours():
    segs = run([100, 100], cycle=10)
    days = hos.build_daily_logs(segs, datetime(2026, 3, 2, 8, 0), 10)
    r = days[0]["recap"]
    on_duty = days[0]["on_duty_minutes"] / 60
    assert abs(r["a_total_last_7_days"] - (10 + on_duty)) < 0.02
    assert abs(r["b_available_tomorrow"] - (70 - 10 - on_duty)) < 0.02


def test_driving_miles_sum_across_days():
    segs = run([300, 2000], cycle=0)
    days = hos.build_daily_logs(segs, datetime(2026, 3, 2, 8, 0), 0)
    assert abs(sum(d["driving_miles"] for d in days) - 2300) < 1.5
