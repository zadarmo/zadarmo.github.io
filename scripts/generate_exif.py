#!/usr/bin/env python3
"""
从 photos/2026_51/ 目录下的所有 JPG 文件中提取 EXIF 数据，
生成 photos/exif.json 供前端直接加载。

使用方式：
  cd 项目根目录
  python3 scripts/generate_exif.py
"""

import json
import os
import sys
from PIL import Image
from PIL.ExifTags import TAGS

PHOTO_DIR = os.path.join("photos", "2026_51")
OUTPUT_PATH = "exif.json"


def dms_to_decimal(dms, ref):
    degrees = float(dms[0])
    minutes = float(dms[1])
    seconds = float(dms[2])
    decimal = degrees + minutes / 60 + seconds / 3600
    if ref in ("S", "W"):
        decimal = -decimal
    return round(decimal, 6)


def extract_exif(filepath):
    img = Image.open(filepath)
    exif_raw = img._getexif()
    if not exif_raw:
        return {}

    tags = {}
    for tag_id, value in exif_raw.items():
        tag_name = TAGS.get(tag_id, tag_id)
        tags[tag_name] = value

    make = str(tags.get("Make", "")).strip()
    model = str(tags.get("Model", "")).strip()
    device = model or make
    if make and model and make not in model:
        device = make + " " + model

    def to_float(val):
        if val is None:
            return None
        return float(val)

    focal = to_float(tags.get("FocalLengthIn35mmFilm") or tags.get("FocalLength"))
    fnumber = to_float(tags.get("FNumber"))
    exposure = to_float(tags.get("ExposureTime"))
    iso = tags.get("ISOSpeedRatings")
    if isinstance(iso, tuple):
        iso = iso[0]

    gps_info = tags.get("GPSInfo", {})
    lat = lon = None
    if gps_info and 2 in gps_info and 1 in gps_info and 4 in gps_info and 3 in gps_info:
        lat = dms_to_decimal(gps_info[2], gps_info[1])
        lon = dms_to_decimal(gps_info[4], gps_info[3])

    entry = {"device": device.strip()}
    if focal:
        entry["focalLength"] = round(focal)
    if fnumber:
        entry["fNumber"] = round(fnumber * 10) / 10
    if exposure:
        entry["exposureTime"] = exposure
    if iso:
        entry["iso"] = int(iso)
    if lat is not None:
        entry["lat"] = lat
    if lon is not None:
        entry["lon"] = lon

    return entry


def main():
    if not os.path.isdir(PHOTO_DIR):
        print(f"Error: {PHOTO_DIR} not found. Run from project root.")
        sys.exit(1)

    result = {}
    filenames = sorted(f for f in os.listdir(PHOTO_DIR) if f.lower().endswith(".jpg"))

    for filename in filenames:
        filepath = os.path.join(PHOTO_DIR, filename)
        try:
            result[filename] = extract_exif(filepath)
            print(f"  ✓ {filename}")
        except Exception as error:
            print(f"  ✗ {filename}: {error}")
            result[filename] = {}

    with open(OUTPUT_PATH, "w") as fp:
        json.dump(result, fp, indent=2, ensure_ascii=False)

    print(f"\nDone! {len(result)} photos → {OUTPUT_PATH} ({os.path.getsize(OUTPUT_PATH)} bytes)")


if __name__ == "__main__":
    main()
