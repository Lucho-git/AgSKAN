#!/usr/bin/env python3
"""Query FTW field candidates for a bbox and print a GeoJSON FeatureCollection.

This is a local proof harness for the real data provider. Install dependency with:
  python -m pip install duckdb

Example:
  python scripts/query-ftw-candidates.py --bbox 147.35,-35.15,147.37,-35.13
"""

import argparse
import json
import math
import sys
import urllib.error
import urllib.request

DOCUMENTED_FTW_PARQUET_PATH = "s3://us-west-2.opendata.source.coop/ftw/global-data/predictions/vectors/alpha/results/*.parquet"
PUBLISHED_FTW_PARQUET_PATH = "s3://us-west-2.opendata.source.coop/ftw/global-field-boundaries/*.parquet"
TILED_FTW_PARQUET_ROOT = "s3://us-west-2.opendata.source.coop/ftw/global-field-boundaries/download-tiles/geoparquet"


def parse_bbox(value):
    parts = [float(part.strip()) for part in value.split(",")]
    if len(parts) != 4:
        raise argparse.ArgumentTypeError("bbox must be xmin,ymin,xmax,ymax")
    xmin, ymin, xmax, ymax = parts
    if xmin >= xmax or ymin >= ymax:
        raise argparse.ArgumentTypeError("bbox min values must be less than max values")
    return {"xmin": xmin, "ymin": ymin, "xmax": xmax, "ymax": ymax}


def format_tile_name(year, lat_floor, lon_floor):
    lat_prefix = "N" if lat_floor >= 0 else "S"
    lon_prefix = "E" if lon_floor >= 0 else "W"
    return f"{year}_{lat_prefix}{abs(lat_floor):02d}{lon_prefix}{abs(lon_floor):03d}.parquet"


def path_to_http_url(path):
    return path.replace(
        "s3://us-west-2.opendata.source.coop/",
        "https://data.source.coop/",
        1,
    )


def object_exists(path):
    request = urllib.request.Request(
        path_to_http_url(path),
        headers={"User-Agent": "AgSKAN-FTW-MVP/1.0"},
        method="HEAD",
    )
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            return 200 <= response.status < 400
    except urllib.error.HTTPError as error:
        if error.code in (403, 404):
            return False
        raise


def get_tile_paths_for_bbox(bbox, year):
    lon_start = math.floor(bbox["xmin"])
    lon_end = math.floor(math.nextafter(bbox["xmax"], -math.inf))
    lat_start = math.floor(bbox["ymin"])
    lat_end = math.floor(math.nextafter(bbox["ymax"], -math.inf))

    paths = []
    for lat_floor in range(lat_start, lat_end + 1):
        for lon_floor in range(lon_start, lon_end + 1):
            tile_name = format_tile_name(year, lat_floor, lon_floor)
            path = f"{TILED_FTW_PARQUET_ROOT}/{year}/{tile_name}"
            if object_exists(path):
                paths.append(path)
    return paths


def parquet_path_expression(paths):
    if isinstance(paths, str):
        return f"'{paths.replace(chr(39), chr(39) + chr(39))}'"
    escaped_paths = [f"'{path.replace(chr(39), chr(39) + chr(39))}'" for path in paths]
    return f"[{', '.join(escaped_paths)}]"


def empty_collection():
    print(json.dumps({"type": "FeatureCollection", "features": []}))
    return 0


def json_number(value, digits=None):
    if value is None:
        return None

    try:
        number = float(value)
    except (TypeError, ValueError):
        return None

    if not math.isfinite(number):
        return None

    return round(number, digits) if digits is not None else number


def main():
    parser = argparse.ArgumentParser(description="Query FTW field candidates by bbox")
    parser.add_argument("--bbox", required=True, type=parse_bbox)
    parser.add_argument("--year", type=int, default=2025, choices=[2024, 2025])
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument(
        "--dataset",
        choices=["tiles", "published", "documented"],
        default="tiles",
        help="tiles targets 1-degree download tiles; published targets the global published files; documented targets the newer docs path",
    )
    parser.add_argument(
        "--path",
        help="override parquet path or glob, useful for proving one published part file quickly",
    )
    args = parser.parse_args()

    try:
        import duckdb
    except ImportError:
        print("duckdb is not installed. Run: python -m pip install duckdb", file=sys.stderr)
        return 1

    connection = duckdb.connect()
    connection.execute("INSTALL spatial; LOAD spatial;")
    connection.execute("INSTALL httpfs; LOAD httpfs;")
    connection.execute("SET s3_region='us-west-2';")
    connection.execute("SET s3_url_style='path';")
    connection.execute("SET http_timeout=300;")
    connection.execute("SET http_retries=3;")

    paths = args.path
    if paths is None:
        if args.dataset == "documented":
            paths = DOCUMENTED_FTW_PARQUET_PATH
        elif args.dataset == "published":
            paths = PUBLISHED_FTW_PARQUET_PATH
        else:
            paths = get_tile_paths_for_bbox(args.bbox, args.year)
            if not paths:
                return empty_collection()

    path_expression = parquet_path_expression(paths)

    if args.dataset == "documented":
        rows = connection.execute(
            f"""
            SELECT
              ST_AsGeoJSON(geometry) AS geojson,
              time,
              ST_Area_Spheroid(geometry) / 10000 AS area_ha,
              NULL::FLOAT AS confidence_mean
            FROM read_parquet({path_expression})
            WHERE label = 'field'
              AND time = ?::TIMESTAMP
              AND struct_extract(bbox, 'xmax') >= ?
              AND struct_extract(bbox, 'xmin') <= ?
              AND struct_extract(bbox, 'ymax') >= ?
              AND struct_extract(bbox, 'ymin') <= ?
            LIMIT ?
            """,
            [
                f"{args.year}-01-01 00:00:00",
                args.bbox["xmin"],
                args.bbox["xmax"],
                args.bbox["ymin"],
                args.bbox["ymax"],
                args.limit,
            ],
        ).fetchall()
    else:
        xmin, ymin, xmax, ymax = (
            args.bbox["xmin"],
            args.bbox["ymin"],
            args.bbox["xmax"],
            args.bbox["ymax"],
        )
        bbox_wkt = (
            f"POLYGON(({xmin} {ymin}, {xmax} {ymin}, {xmax} {ymax}, "
            f"{xmin} {ymax}, {xmin} {ymin}))"
        )
        rows = connection.execute(
            f"""
            SELECT
              ST_AsGeoJSON(geometry) AS geojson,
              time,
              ST_Area_Spheroid(geometry) / 10000 AS area_ha,
              confidence_mean
            FROM read_parquet({path_expression})
            WHERE label = 'field'
              AND time = ?::TIMESTAMP
              AND ST_Intersects(geometry, ST_GeomFromText(?))
            LIMIT ?
            """,
            [f"{args.year}-01-01 00:00:00", bbox_wkt, args.limit],
        ).fetchall()

    features = []
    for index, (geojson, timestamp, area_ha, confidence_mean) in enumerate(rows):
        features.append(
            {
                "type": "Feature",
                "geometry": json.loads(geojson),
                "properties": {
                    "ftw_id": f"ftw-{args.year}-{index}",
                    "provider": "ftw",
                    "time": timestamp.isoformat(),
                    "area_ha": json_number(area_ha, 2),
                    "confidence_mean": json_number(confidence_mean),
                },
            }
        )

    print(json.dumps({"type": "FeatureCollection", "features": features}, allow_nan=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())