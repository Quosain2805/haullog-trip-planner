from trips import places


def test_nearest_known_towns():
    assert places.nearest(37.0, -100.9) == "Liberal, KS"
    assert places.nearest(41.3, -109.9) == "Lyman, WY"
    assert places.nearest(36.1627, -86.7816).endswith(", TN")      # Nashville area
    assert places.nearest(43.65, -79.38).endswith(", ON")           # Toronto area (Canada)


def test_far_from_any_place_returns_none():
    assert places.nearest(0.0, -30.0) is None                      # mid-Atlantic
    assert places.nearest(19.4, -99.1) is None                     # Mexico City: outside US/CA data
