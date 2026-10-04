"""Build trips/data/places.csv.gz from the GeoNames "cities1000" dump.

Usage:
    curl -O https://download.geonames.org/export/dump/cities1000.zip && unzip cities1000.zip
    python scripts/build_places.py cities1000.txt

Keeps US + Canadian places (population >= 1000) as: name,state,lat,lng.
Data: GeoNames (https://www.geonames.org), licensed CC BY 4.0.
"""
import csv
import gzip
import sys
from pathlib import Path

# GeoNames uses numeric admin1 codes for Canada.
CA_PROVINCES = {
    "01": "AB", "02": "BC", "03": "MB", "04": "NB", "05": "NL", "07": "NS", "08": "ON",
    "09": "PE", "10": "QC", "11": "SK", "12": "YT", "13": "NT", "14": "NU",
}


def main(src: str) -> None:
    out = Path(__file__).resolve().parent.parent / "trips" / "data" / "places.csv.gz"
    out.parent.mkdir(parents=True, exist_ok=True)
    rows = []
    with open(src, encoding="utf-8") as fh:
        for line in fh:
            f = line.rstrip("\n").split("\t")
            country, admin1 = f[8], f[10]
            if country == "US":
                state = admin1
            elif country == "CA":
                state = CA_PROVINCES.get(admin1, "")
            else:
                continue
            if not state or not state.isalpha():
                continue
            rows.append((f[1], state, round(float(f[4]), 4), round(float(f[5]), 4)))
    with gzip.open(out, "wt", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["name", "state", "lat", "lng"])
        w.writerows(rows)
    print(f"wrote {len(rows)} places -> {out} ({out.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main(sys.argv[1])
