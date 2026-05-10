#!/usr/bin/env python3
"""
从 photo/2026_51/ 目录下的所有 JPG 文件中提取 EXIF 数据，
通过反向地理编码获取地名，生成 exif.json 供前端直接加载，
同时生成缩略图用于瀑布流展示。

使用方式：
  cd 项目根目录
  python3 scripts/generate_exif.py

可选参数：
  --no-thumbnails    跳过缩略图生成
  --no-geocode       跳过反向地理编码
  --thumb-width 800  指定缩略图最大宽度（默认 800px）
  --thumb-quality 82 指定缩略图 JPEG 质量（默认 82）
"""

import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.error
from PIL import Image
from PIL.ExifTags import TAGS

PHOTO_DIR = os.path.join("photo", "2026_51")
THUMB_DIR = os.path.join(PHOTO_DIR, "thumbnails")
OUTPUT_PATH = "exif.json"
DEFAULT_THUMB_WIDTH = 800
DEFAULT_THUMB_QUALITY = 82


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

    # 拍摄时间: DateTimeOriginal 优先，其次 DateTime
    date_str = tags.get("DateTimeOriginal") or tags.get("DateTime") or ""
    date_time = None
    if date_str:
        # EXIF 格式 "2026:04:25 18:11:37" → "2026-04-25T18:11:37"
        try:
            date_time = date_str.replace(":", "-", 2)  # 只替换前两个冒号(日期部分)
        except Exception:
            pass

    entry = {"device": device.strip()}
    if date_time:
        entry["dateTime"] = date_time
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


def reverse_geocode(lat, lon):
    """调用 BigDataCloud API 将经纬度转为中文地名，返回 '📍 国家 · 省 · 城市' 格式字符串。"""
    url = (f"https://api.bigdatacloud.net/data/reverse-geocode-client"
           f"?latitude={lat}&longitude={lon}&localityLanguage=zh")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, json.JSONDecodeError, OSError) as err:
        print(f"    geocode failed ({lat}, {lon}): {err}")
        return None

    country = data.get("countryName", "")
    state = data.get("principalSubdivision", "")
    city = data.get("city") or data.get("locality") or ""

    # 尝试从 informative 中找中文城市名
    informative = (data.get("localityInfo") or {}).get("informative") or []
    for item in informative:
        wikidata_id = item.get("wikidataId", "")
        name = item.get("name", "")
        # informative 中城市级别的条目通常 order 较大且有 wikidataId
        if name and wikidata_id and item.get("order", 0) >= 7:
            city = name
            break

    parts = []
    if country:
        parts.append(country)
    if state and state != country:
        parts.append(state)
    if city and city != state:
        parts.append(city)

    return "📍 " + " · ".join(parts) if parts else None


def generate_thumbnail(filepath, output_path, max_width, quality):
    """缩放图片并保存为压缩 JPEG，保留 EXIF 方向信息。"""
    img = Image.open(filepath)

    # 处理 EXIF 方向旋转
    from PIL import ImageOps
    img = ImageOps.exif_transpose(img)

    width, height = img.size
    if width > max_width:
        ratio = max_width / width
        new_size = (max_width, int(height * ratio))
        img = img.resize(new_size, Image.LANCZOS)

    img.save(output_path, "JPEG", quality=quality, optimize=True)
    return os.path.getsize(output_path)


def parse_args():
    parser = argparse.ArgumentParser(description="Extract EXIF and generate thumbnails")
    parser.add_argument("--no-thumbnails", action="store_true", help="Skip thumbnail generation")
    parser.add_argument("--no-geocode", action="store_true", help="Skip reverse geocoding")
    parser.add_argument("--thumb-width", type=int, default=DEFAULT_THUMB_WIDTH,
                        help=f"Max thumbnail width in px (default: {DEFAULT_THUMB_WIDTH})")
    parser.add_argument("--thumb-quality", type=int, default=DEFAULT_THUMB_QUALITY,
                        help=f"JPEG quality for thumbnails (default: {DEFAULT_THUMB_QUALITY})")
    return parser.parse_args()


def main():
    args = parse_args()

    if not os.path.isdir(PHOTO_DIR):
        print(f"Error: {PHOTO_DIR} not found. Run from project root.")
        sys.exit(1)

    result = {}
    filenames = sorted(f for f in os.listdir(PHOTO_DIR)
                       if f.lower().endswith(".jpg") and not f.startswith("."))

    # --- Extract EXIF ---
    print("Extracting EXIF data...")
    for filename in filenames:
        filepath = os.path.join(PHOTO_DIR, filename)
        try:
            result[filename] = extract_exif(filepath)
            print(f"  ✓ {filename}")
        except Exception as error:
            print(f"  ✗ {filename}: {error}")
            result[filename] = {}

    # --- Reverse Geocode ---
    if not args.no_geocode:
        gps_entries = [(fn, info) for fn, info in result.items()
                       if info.get("lat") is not None and info.get("lon") is not None]
        if gps_entries:
            print(f"\nReverse geocoding {len(gps_entries)} locations...")
            for filename, info in gps_entries:
                location = reverse_geocode(info["lat"], info["lon"])
                if location:
                    info["location"] = location
                    print(f"  ✓ {filename}  → {location}")
                else:
                    print(f"  ✗ {filename}  ({info['lat']}, {info['lon']})")
                time.sleep(0.3)  # 避免请求过快

    with open(OUTPUT_PATH, "w") as fp:
        json.dump(result, fp, indent=2, ensure_ascii=False)
    print(f"\n{len(result)} photos → {OUTPUT_PATH} ({os.path.getsize(OUTPUT_PATH)} bytes)")

    # --- Generate Thumbnails ---
    if not args.no_thumbnails:
        os.makedirs(THUMB_DIR, exist_ok=True)
        print(f"\nGenerating thumbnails (max {args.thumb_width}px, quality {args.thumb_quality})...")
        total_original = 0
        total_thumb = 0

        for filename in filenames:
            filepath = os.path.join(PHOTO_DIR, filename)
            thumb_path = os.path.join(THUMB_DIR, filename)
            try:
                original_size = os.path.getsize(filepath)
                thumb_size = generate_thumbnail(filepath, thumb_path,
                                                args.thumb_width, args.thumb_quality)
                total_original += original_size
                total_thumb += thumb_size
                ratio = thumb_size / original_size * 100
                print(f"  ✓ {filename}  {original_size // 1024}KB → {thumb_size // 1024}KB ({ratio:.0f}%)")
            except Exception as error:
                print(f"  ✗ {filename}: {error}")

        if total_original > 0:
            saved = (1 - total_thumb / total_original) * 100
            print(f"\nThumbnails saved to {THUMB_DIR}/")
            print(f"Total: {total_original // 1024}KB → {total_thumb // 1024}KB (saved {saved:.0f}%)")

    print("\nAll done!")


if __name__ == "__main__":
    main()
