#!/usr/bin/env python3
"""Build china-map.json from DataV GeoJSON with WGS84 bounds."""
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "china-map.json"
URL = "https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json"
SIMPLIFY_STEP = 4
PRECISION = 2  # decimal places in SVG path coords


def simplify_ring(ring, step):
    if len(ring) <= 4:
        return ring
    s = ring[::step]
    if s[-1] != ring[-1]:
        s.append(ring[-1])
    return s


def walk_coords(geom):
    t = geom["type"]
    c = geom["coordinates"]
    if t == "Polygon":
        for ring in c:
            for p in ring:
                yield p
    elif t == "MultiPolygon":
        for poly in c:
            for ring in poly:
                for p in ring:
                    yield p


def geom_paths(geom, bounds, step):
    t = geom["type"]
    c = geom["coordinates"]
    paths = []
    if t == "Polygon":
        paths.append(ring_to_path(simplify_ring(c[0], step), bounds))
    elif t == "MultiPolygon":
        for poly in c:
            paths.append(ring_to_path(simplify_ring(poly[0], step), bounds))
    return paths


def project(lon, lat, bounds):
    min_lon, min_lat, max_lon, max_lat = bounds
    x = (lon - min_lon) / (max_lon - min_lon) * 1000
    y = (max_lat - lat) / (max_lat - min_lat) * 800
    return round(x, PRECISION), round(y, PRECISION)


def ring_to_path(ring, bounds):
    parts = []
    for i, (lon, lat) in enumerate(ring):
        x, y = project(lon, lat, bounds)
        parts.append(("M" if i == 0 else "L") + f"{x},{y}")
    return "".join(parts) + "Z"


def main():
    data = json.load(urllib.request.urlopen(URL, timeout=30))
    lons, lats = [], []
    for f in data["features"]:
        for p in walk_coords(f["geometry"]):
            lon, lat = p[0], p[1]
            # Exclude South China Sea / far islands from bounds
            if 73 <= lon <= 135 and 18 <= lat <= 54:
                lons.append(lon)
                lats.append(lat)

    bounds = [min(lons), min(lats), max(lons), max(lats)]
    provinces = []

    for f in data["features"]:
        name = (f["properties"].get("name") or "").strip()
        if not name:
            continue
        paths = geom_paths(f["geometry"], bounds, SIMPLIFY_STEP)
        if not paths:
            continue

        nums = []
        for path in paths:
            nums.extend(float(x) for x in re.findall(r"[\d.]+", path))
        xs, ys = nums[0::2], nums[1::2]
        cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
        ux, uy = unproject(cx, cy, bounds)

        # Drop features whose centroid falls outside China lat/lon box
        if not (73 <= ux <= 135 and 18 <= uy <= 54):
            continue

        provinces.append(
            {
                "name": name,
                "d": " ".join(paths),
                "lon": round(ux, 6),
                "lat": round(uy, 6),
            }
        )

    markers = [
        {"name": "乌鲁木齐", "lon": 87.6177, "lat": 43.7928, "note": "新疆 · 木卡姆"},
        {"name": "北京", "lon": 116.4074, "lat": 39.9042, "note": "首都"},
    ]

    out = {
        "viewBox": "0 0 1000 800",
        "bounds": {
            "west": round(bounds[0], 6),
            "south": round(bounds[1], 6),
            "east": round(bounds[2], 6),
            "north": round(bounds[3], 6),
        },
        "provinces": provinces,
        "markers": markers,
    }

    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes), {len(provinces)} provinces")


def unproject(x, y, bounds):
    min_lon, min_lat, max_lon, max_lat = bounds
    lon = min_lon + (x / 1000) * (max_lon - min_lon)
    lat = max_lat - (y / 800) * (max_lat - min_lat)
    return lon, lat


if __name__ == "__main__":
    main()
