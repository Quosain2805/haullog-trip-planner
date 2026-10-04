from unittest import mock

import pytest
from rest_framework.test import APIClient

from trips import services

GEOM = [[32.78, -96.80], [35.0, -92.0], [38.0, -90.0], [41.88, -87.63]]
PAYLOAD = {
    "current": {"lat": 32.78, "lng": -96.80, "label": "Dallas, TX"},
    "pickup": {"lat": 38.0, "lng": -90.0, "label": "St. Louis, MO"},
    "dropoff": {"lat": 41.88, "lng": -87.63, "label": "Chicago, IL"},
    "cycle_used": 20,
    "start_time": "2026-03-02T08:00",
}


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture(autouse=True)
def fake_services():
    route = {"geometry": GEOM, "leg_miles": [630.0, 300.0], "miles": 930.0}
    with mock.patch.object(services, "route", return_value=route), \
         mock.patch.object(services, "reverse_many", side_effect=lambda pts: [f"Town{i}, XX" for i, _ in enumerate(pts)]):
        yield


def test_plan_returns_logs_and_stops(client):
    r = client.post("/api/plan/", PAYLOAD, format="json")
    assert r.status_code == 200, r.content
    body = r.json()
    assert body["summary"]["route_miles"] == 930.0
    assert body["stops"][0]["type"] == "start"
    assert {s["type"] for s in body["stops"]} >= {"pickup", "dropoff", "rest"}
    for day in body["logs"]:
        assert sum(day["totals_minutes"].values()) == 1440
        assert all("remark" in e for e in day["entries"])


def test_rejects_invalid_cycle(client):
    r = client.post("/api/plan/", {**PAYLOAD, "cycle_used": 71}, format="json")
    assert r.status_code == 400


def test_rejects_missing_fields(client):
    r = client.post("/api/plan/", {"cycle_used": 3}, format="json")
    assert r.status_code == 400


def test_upstream_failure_is_reported(client):
    with mock.patch.object(services, "route", side_effect=services.ServiceError("boom")):
        r = client.post("/api/plan/", PAYLOAD, format="json")
    assert r.status_code == 502 and r.json()["detail"] == "boom"


def test_polyline_interpolation():
    p = services.Polyline(GEOM, 930.0)
    assert p.at(0) == (32.78, -96.80)
    assert p.at(930) == (41.88, -87.63)
    lat, lng = p.at(465)
    assert 32.78 < lat < 41.88
