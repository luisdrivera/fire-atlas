#!/usr/bin/env python
"""Export harmonized, sparse weekly fire data for the FIRE ATLAS frontend."""

from __future__ import annotations

import csv
from datetime import date, timedelta
import json
import math
from pathlib import Path
import re
import sys
from typing import Any

import duckdb


# Filters, grid, source transition, and export limits.
FIRMS_TYPE = 0
MODIS_MIN_CONFIDENCE = 30
VIIRS_ACCEPTED_CONFIDENCE = ("n", "h")
GRID_SIZE_DEGREES = 0.25
OBSERVED_VIIRS_START = date(2018, 4, 1)
TRANSITION_WEEK = OBSERVED_VIIRS_START - timedelta(days=OBSERVED_VIIRS_START.weekday())
MAX_JSON_BYTES = 8_000_000
ROUND_FRP_DIGITS = 2

ZONES = ("hispaniola", "mato_grosso")
SENSOR_GROUPS = ("MODIS_AQUA", "VIIRS_N20", "VIIRS_SNPP")
DAYNIGHT_VALUES = ("D", "N")
QUANTITIES = ("n_detections", "sum_frp")
EXPECTED_COLUMNS = (
    "latitude",
    "longitude",
    "brightness",
    "scan",
    "track",
    "acq_date",
    "acq_time",
    "satellite",
    "instrument",
    "confidence",
    "version",
    "bright_t31",
    "frp",
    "daynight",
    "type",
)
METRIC_INTEGER_COLUMNS = {"n_training_pairs", "n_test_pairs"}
METRIC_FLOAT_COLUMNS = {
    "training_ratio_modis_over_viirs",
    "mean_bias_pred_minus_observed",
    "mae",
    "rmse",
    "pearson_r",
    "spearman_r",
}
NOTES = (
    "Before 2018-04-01, MODIS Aqua values are scaled to VIIRS-equivalent units using the ratio estimated over 2018-04-01 to 2022-12-31. This assumes the relationship between sensors stayed stable.",
    "From 2018-04-01, values are observed VIIRS NOAA-20 detections.",
    "Calibration is regional and day/night specific; agreement is weaker in low-activity cells.",
    "Harmonization is a proof of concept validated on 2023-2024 test data for two regions.",
)
SOURCES = (
    {"id": 0, "name": "Observed VIIRS NOAA-20"},
    {"id": 1, "name": "MODIS Aqua scaled to VIIRS-equivalent units"},
)

ROOT_DIR = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT_DIR / "data" / "raw"
CALIBRATION_METRICS_PATH = ROOT_DIR / "data" / "processed" / "calibration_metrics.csv"
OUTPUT_DIR = ROOT_DIR / "frontend" / "public" / "data"


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def week_start(value: date) -> date:
    return value - timedelta(days=value.weekday())


def json_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
    ).encode("utf-8")


def visible_warning(message: str) -> None:
    border = "!" * 84
    print(f"\n{border}\n!!! WARNING: {message}\n{border}\n", file=sys.stderr)


def discover_input_files() -> tuple[list[dict[str, Any]], dict[str, bool]]:
    inputs: list[dict[str, Any]] = []
    history_included: dict[str, bool] = {}

    for zone in ZONES:
        zone_dir = RAW_DIR / zone
        modern_modis_files = sorted(
            (zone_dir / "modis").glob("fire_archive_M-C61_*.csv")
        )
        if not modern_modis_files:
            raise FileNotFoundError(
                f"No MODIS Aqua/Terra files found in {zone_dir / 'modis'}."
            )
        for path in modern_modis_files:
            inputs.append(
                {
                    "zone": zone,
                    "sensor_group": "MODIS_AQUA",
                    "sensor_family": "MODIS",
                    "path": path,
                    "is_history": False,
                }
            )

        history_dir = zone_dir / "modis_history"
        history_files = (
            sorted(history_dir.glob("*.csv")) if history_dir.is_dir() else []
        )
        history_included[zone] = bool(history_files)
        if not history_files:
            visible_warning(
                f"MODIS history is unavailable for {zone}: "
                f"{history_dir} is missing or contains no CSV files. "
                "Continuing without this region's pre-2018 MODIS history."
            )
        for path in history_files:
            inputs.append(
                {
                    "zone": zone,
                    "sensor_group": "MODIS_AQUA",
                    "sensor_family": "MODIS",
                    "path": path,
                    "is_history": True,
                }
            )

        sensor_sources = (
            ("viirs_noaa20", "VIIRS_N20", "N20", "fire_archive_J1V-C2_*.csv"),
            ("viirs_snpp", "VIIRS_SNPP", "SNPP", "fire_archive_SV-C2_*.csv"),
        )
        for folder, sensor_group, satellite, pattern in sensor_sources:
            files = sorted((zone_dir / folder).glob(pattern))
            if not files:
                raise FileNotFoundError(
                    f"No {sensor_group} files matching {pattern} "
                    f"were found in {zone_dir / folder}."
                )
            for path in files:
                inputs.append(
                    {
                        "zone": zone,
                        "sensor_group": sensor_group,
                        "sensor_family": satellite,
                        "path": path,
                        "is_history": False,
                    }
                )

    return inputs, history_included


def validate_raw_table(
    connection: duckdb.DuckDBPyConnection,
    table_name: str,
    item: dict[str, Any],
) -> None:
    path: Path = item["path"]
    actual_columns = tuple(
        row[0] for row in connection.execute(f"DESCRIBE {table_name}").fetchall()
    )
    if actual_columns != EXPECTED_COLUMNS:
        raise ValueError(
            f"{path}: unexpected CSV headers or order. "
            f"Expected {EXPECTED_COLUMNS}, found {actual_columns}."
        )

    satellite_values = {
        str(row[0]).strip().lower()
        for row in connection.execute(
            f"SELECT DISTINCT satellite FROM {table_name}"
        ).fetchall()
        if row[0] is not None
    }
    if item["sensor_family"] == "MODIS":
        unexpected = satellite_values - {"aqua", "terra"}
        if not satellite_values or unexpected:
            raise ValueError(
                f"{path}: unexpected MODIS satellite values "
                f"{sorted(unexpected)}; expected Aqua and/or Terra."
            )
    elif satellite_values != {item["sensor_family"].lower()}:
        raise ValueError(
            f"{path}: folder expects satellite {item['sensor_family']}, "
            f"but found {sorted(satellite_values)}."
        )

    invalid_rows = connection.execute(
        f"""
        SELECT count(*)
        FROM {table_name}
        WHERE try_cast(latitude AS DOUBLE) IS NULL
           OR try_cast(longitude AS DOUBLE) IS NULL
           OR try_cast(acq_date AS DATE) IS NULL
           OR try_cast(type AS INTEGER) IS NULL
           OR try_cast(frp AS DOUBLE) IS NULL
           OR satellite IS NULL
           OR NOT regexp_full_match(trim(acq_time), '[0-9]{{4}}')
           OR upper(trim(daynight)) NOT IN ('D', 'N')
           OR daynight IS NULL
        """
    ).fetchone()[0]
    if invalid_rows:
        raise ValueError(
            f"{path}: found {invalid_rows} rows with invalid required fields "
            "(coordinates, date, HHMM acquisition time, satellite, daynight, "
            "type, or FRP)."
        )

    if item["sensor_family"] == "MODIS":
        invalid_confidence = connection.execute(
            f"""
            SELECT count(*)
            FROM {table_name}
            WHERE try_cast(confidence AS DOUBLE) IS NULL
               OR try_cast(confidence AS DOUBLE) < 0
               OR try_cast(confidence AS DOUBLE) > 100
            """
        ).fetchone()[0]
        if invalid_confidence:
            raise ValueError(
                f"{path}: found {invalid_confidence} invalid MODIS confidence values."
            )
    else:
        confidences = {
            str(row[0]).strip().lower()
            for row in connection.execute(
                f"SELECT DISTINCT confidence FROM {table_name}"
            ).fetchall()
            if row[0] is not None
        }
        unexpected = confidences - {"l", "n", "h"}
        if not confidences or unexpected:
            raise ValueError(
                f"{path}: unexpected VIIRS confidence values {sorted(unexpected)}; "
                "expected l, n, h."
            )


def load_and_filter_inputs(
    connection: duckdb.DuckDBPyConnection,
    inputs: list[dict[str, Any]],
) -> dict[str, bool]:
    connection.execute(
        """
        CREATE TEMP TABLE filtered_detections (
            zone VARCHAR,
            sensor_group VARCHAR,
            latitude DOUBLE,
            longitude DOUBLE,
            acq_date DATE,
            daynight VARCHAR,
            frp DOUBLE
        )
        """
    )
    history_rows_by_zone = {zone: 0 for zone in ZONES}

    for index, item in enumerate(inputs):
        table_name = f"raw_input_{index}"
        item["table_name"] = table_name
        csv_path = item["path"].resolve().as_posix()
        connection.execute(
            f"""
            CREATE TEMP TABLE {table_name} AS
            SELECT * FROM read_csv(
                {sql_literal(csv_path)},
                header = true,
                all_varchar = true
            )
            """
        )
        validate_raw_table(connection, table_name, item)

        if item["sensor_family"] == "MODIS":
            confidence_filter = (
                f"try_cast(confidence AS DOUBLE) >= {MODIS_MIN_CONFIDENCE}"
            )
            satellite_filter = "lower(trim(satellite)) = 'aqua'"
        else:
            accepted = ", ".join(
                sql_literal(value) for value in VIIRS_ACCEPTED_CONFIDENCE
            )
            confidence_filter = f"lower(trim(confidence)) IN ({accepted})"
            satellite_filter = "TRUE"
        filter_clause = (
            f"try_cast(type AS INTEGER) = {FIRMS_TYPE} "
            f"AND {confidence_filter} AND {satellite_filter}"
        )
        before_rows, after_rows = connection.execute(
            f"""
            SELECT count(*), count(*) FILTER (WHERE {filter_clause})
            FROM {table_name}
            """
        ).fetchone()
        print(
            f"Filter {item['path'].relative_to(ROOT_DIR)} "
            f"({item['sensor_group']}): before={before_rows:,}, after={after_rows:,}"
        )

        connection.execute(
            f"""
            INSERT INTO filtered_detections
            SELECT
                {sql_literal(item['zone'])},
                {sql_literal(item['sensor_group'])},
                try_cast(latitude AS DOUBLE),
                try_cast(longitude AS DOUBLE),
                try_cast(acq_date AS DATE),
                upper(trim(daynight)),
                try_cast(frp AS DOUBLE)
            FROM {table_name}
            WHERE {filter_clause}
            """
        )
        if item["is_history"]:
            history_rows_by_zone[item["zone"]] += after_rows

    history_included = {
        zone: history_rows_by_zone[zone] > 0 for zone in ZONES
    }
    for zone in ZONES:
        if not history_included[zone] and any(
            item["is_history"] and item["zone"] == zone for item in inputs
        ):
            visible_warning(
                f"MODIS history files exist for {zone}, but no Aqua detections "
                "survived the required filters."
            )
    return history_included


def read_metrics_and_ratios() -> tuple[list[dict[str, Any]], dict[tuple[str, str, str], float]]:
    if not CALIBRATION_METRICS_PATH.is_file():
        raise FileNotFoundError(
            f"Calibration metrics not found: {CALIBRATION_METRICS_PATH}"
        )

    expected_keys = {
        (zone, daynight, quantity)
        for zone in ZONES
        for daynight in DAYNIGHT_VALUES
        for quantity in QUANTITIES
    }
    metrics: list[dict[str, Any]] = []
    ratios: dict[tuple[str, str, str], float] = {}
    with CALIBRATION_METRICS_PATH.open(
        "r", encoding="utf-8-sig", newline=""
    ) as metrics_file:
        reader = csv.DictReader(metrics_file)
        if reader.fieldnames is None:
            raise ValueError(f"{CALIBRATION_METRICS_PATH} has no CSV header.")
        required_fields = {
            "zone",
            "daynight",
            "quantity",
            "training_ratio_modis_over_viirs",
        }
        missing_fields = required_fields - set(reader.fieldnames)
        if missing_fields:
            raise ValueError(
                f"{CALIBRATION_METRICS_PATH} is missing columns "
                f"{sorted(missing_fields)}."
            )

        for line_number, raw_row in enumerate(reader, start=2):
            output_row: dict[str, Any] = {}
            for field in reader.fieldnames:
                value = raw_row[field]
                if value is None or value == "":
                    raise ValueError(
                        f"{CALIBRATION_METRICS_PATH}:{line_number}: "
                        f"empty value in column {field}."
                    )
                if field in METRIC_INTEGER_COLUMNS:
                    output_row[field] = int(value)
                elif field in METRIC_FLOAT_COLUMNS:
                    parsed_value = float(value)
                    if not math.isfinite(parsed_value):
                        raise ValueError(
                            f"{CALIBRATION_METRICS_PATH}:{line_number}: "
                            f"non-finite value in column {field}."
                        )
                    output_row[field] = parsed_value
                else:
                    output_row[field] = value
            metrics.append(output_row)

            key = (
                output_row["zone"],
                output_row["daynight"],
                output_row["quantity"],
            )
            if key not in expected_keys:
                raise ValueError(
                    f"{CALIBRATION_METRICS_PATH}:{line_number}: "
                    f"unexpected calibration key {key}."
                )
            if key in ratios:
                raise ValueError(
                    f"{CALIBRATION_METRICS_PATH}:{line_number}: duplicate ratio "
                    f"for zone/daynight/quantity {key}."
                )
            calibration_ratio = float(
                output_row["training_ratio_modis_over_viirs"]
            )
            if calibration_ratio == 0:
                raise ValueError(
                    f"Zero calibration ratio for {key}; export stopped."
                )
            if calibration_ratio < 0:
                raise ValueError(
                    f"Negative calibration ratio for {key}; export stopped."
                )
            ratios[key] = calibration_ratio

    missing_keys = expected_keys - ratios.keys()
    if missing_keys:
        raise ValueError(
            "Missing calibration ratios; export stopped: "
            + ", ".join(map(str, sorted(missing_keys)))
        )
    return metrics, ratios


def aggregate_detections(
    connection: duckdb.DuckDBPyConnection,
) -> tuple[
    list[tuple[str, str, float, float, date, str, int, float]],
    dict[str, dict[str, float]],
]:
    grid_size = f"{GRID_SIZE_DEGREES:.2f}"
    connection.execute(
        f"""
        CREATE TEMP TABLE weekly_aggregates AS
        SELECT
            zone,
            sensor_group,
            floor(latitude / {grid_size}) * {grid_size} AS cell_lat,
            floor(longitude / {grid_size}) * {grid_size} AS cell_lon,
            CAST(date_trunc('week', acq_date) AS DATE) AS week,
            daynight,
            count(*)::BIGINT AS n_detections,
            coalesce(sum(frp), 0.0)::DOUBLE AS sum_frp
        FROM filtered_detections
        GROUP BY zone, sensor_group, cell_lat, cell_lon, week, daynight
        """
    )
    aggregate_rows = connection.execute(
        """
        SELECT
            zone, sensor_group, cell_lat, cell_lon, week, daynight,
            n_detections, sum_frp
        FROM weekly_aggregates
        ORDER BY zone, week, cell_lat, cell_lon, sensor_group, daynight
        """
    ).fetchall()

    bounds: dict[str, dict[str, float]] = {}
    for zone in ZONES:
        row = connection.execute(
            """
            SELECT
                min(latitude), min(longitude), max(latitude), max(longitude)
            FROM filtered_detections
            WHERE zone = ?
            """,
            [zone],
        ).fetchone()
        if row[0] is None:
            raise ValueError(f"No detections survived the filters for zone {zone}.")
        bounds[zone] = {
            "min_lat": float(row[0]),
            "min_lon": float(row[1]),
            "max_lat": float(row[2]),
            "max_lon": float(row[3]),
        }
    return aggregate_rows, bounds


def build_zone_data(
    zone: str,
    aggregate_rows: list[tuple[str, str, float, float, date, str, int, float]],
    ratios: dict[tuple[str, str, str], float],
) -> tuple[dict[str, Any], dict[str, Any]]:
    zone_rows = [row for row in aggregate_rows if row[0] == zone]
    zone_cells = sorted({(float(row[2]), float(row[3])) for row in zone_rows})
    cell_ids = {cell: index for index, cell in enumerate(zone_cells)}

    modis_weeks = [
        row[4] for row in zone_rows if row[1] == "MODIS_AQUA"
    ]
    viirs_weeks = [
        row[4]
        for row in zone_rows
        if row[1] in ("VIIRS_N20", "VIIRS_SNPP")
    ]
    if not modis_weeks:
        raise ValueError(f"No filtered MODIS_AQUA weeks found for {zone}.")
    if not viirs_weeks:
        raise ValueError(f"No filtered VIIRS weeks found for {zone}.")

    first_week = min(modis_weeks)
    last_week = max(viirs_weeks)
    if last_week < first_week:
        raise ValueError(
            f"VIIRS ends before the first MODIS Aqua week for {zone}: "
            f"{last_week} < {first_week}."
        )
    weeks: list[date] = []
    current_week = first_week
    while current_week <= last_week:
        weeks.append(current_week)
        current_week += timedelta(days=7)
    week_ids = {week: index for index, week in enumerate(weeks)}

    records_by_cell_week: dict[tuple[int, int], list[Any]] = {}
    sensor_totals: dict[str, dict[date, list[float]]] = {
        sensor: {} for sensor in SENSOR_GROUPS
    }
    sensor_week_lists: dict[str, list[date]] = {sensor: [] for sensor in SENSOR_GROUPS}

    for row_zone, sensor_group, cell_lat, cell_lon, week, daynight, count, frp in zone_rows:
        if week in week_ids:
            week_total = sensor_totals[sensor_group].setdefault(week, [0.0, 0.0])
            week_total[0] += int(count)
            week_total[1] += float(frp)

        if week not in week_ids:
            continue
        source = 0 if week >= TRANSITION_WEEK else 1
        if source == 0 and sensor_group != "VIIRS_N20":
            continue
        if source == 1 and sensor_group != "MODIS_AQUA":
            continue

        cell_index = cell_ids[(float(cell_lat), float(cell_lon))]
        week_index = week_ids[week]
        key = (cell_index, week_index)
        values = records_by_cell_week.setdefault(
            key, [0, 0, 0.0, 0.0, source]
        )
        if values[4] != source:
            raise ValueError(
                f"Conflicting source ids for {zone}, cell {cell_index}, week {week}."
            )

        count_index = 0 if daynight == "D" else 1
        frp_index = 2 if daynight == "D" else 3
        if source == 0:
            count_ratio = 1.0
            frp_ratio = 1.0
            output_count = int(count)
            output_frp = float(frp)
        else:
            count_ratio = ratios[(zone, daynight, "n_detections")]
            frp_ratio = ratios[(zone, daynight, "sum_frp")]
            output_count = int(count) / count_ratio
            output_frp = float(frp) / frp_ratio

        values[count_index] += output_count
        values[frp_index] += output_frp

    for sensor in SENSOR_GROUPS:
        sensor_week_lists[sensor] = sorted(sensor_totals[sensor])

    records: list[list[int | float]] = []
    for (cell_index, week_index), values in sorted(records_by_cell_week.items()):
        record: list[int | float] = [
            cell_index,
            week_index,
            round(float(values[0]), ROUND_FRP_DIGITS),
            round(float(values[1]), ROUND_FRP_DIGITS),
            round(float(values[2]), ROUND_FRP_DIGITS),
            round(float(values[3]), ROUND_FRP_DIGITS),
            int(values[4]),
        ]
        if any(value > 0 for value in record[2:6]):
            records.append(record)

    sensor_series: dict[str, dict[str, list[int | float | None]]] = {}
    for sensor in SENSOR_GROUPS:
        available_weeks = sensor_week_lists[sensor]
        if available_weeks:
            first_sensor_week = min(available_weeks)
            last_sensor_week = max(available_weeks)
        else:
            first_sensor_week = None
            last_sensor_week = None

        detections: list[int | None] = []
        frp_values: list[float | None] = []
        for week in weeks:
            if (
                first_sensor_week is None
                or last_sensor_week is None
                or week < first_sensor_week
                or week > last_sensor_week
            ):
                detections.append(None)
                frp_values.append(None)
                continue
            total = sensor_totals[sensor].get(week, [0.0, 0.0])
            detections.append(int(total[0]))
            frp_values.append(float(total[1]))
        sensor_series[sensor] = {
            "n_detections": detections,
            "sum_frp": frp_values,
        }

    zone_data = {
        "cells": [
            {"id": index, "lat": cell[0], "lon": cell[1]}
            for cell, index in cell_ids.items()
        ],
        "weeks": [week.isoformat() for week in weeks],
        "records": records,
        "sensor_series": sensor_series,
    }
    zone_metadata = {
        "name": zone,
        "week_range": {
            "start": first_week.isoformat(),
            "end": last_week.isoformat(),
        },
    }
    return zone_data, zone_metadata


def make_manifest(
    bounds: dict[str, dict[str, float]],
    zone_metadata: list[dict[str, Any]],
    history_included: dict[str, bool],
    metrics: list[dict[str, Any]],
) -> dict[str, Any]:
    ranges = [metadata["week_range"] for metadata in zone_metadata]
    ratios_used = [
        {
            "zone": metric["zone"],
            "daynight": metric["daynight"],
            "quantity": metric["quantity"],
            "training_ratio_modis_over_viirs": metric[
                "training_ratio_modis_over_viirs"
            ],
        }
        for metric in metrics
        if metric["quantity"] in QUANTITIES and metric["zone"] in ZONES
    ]
    return {
        "zones": [
            {
                **metadata,
                "bounds": bounds[metadata["name"]],
                "history_included": history_included[metadata["name"]],
            }
            for metadata in zone_metadata
        ],
        "grid_size_degrees": GRID_SIZE_DEGREES,
        "week_range": {
            "start": min(item["start"] for item in ranges),
            "end": max(item["end"] for item in ranges),
        },
        "history_included": any(history_included.values()),
        "ratios_used": ratios_used,
        "sources": list(SOURCES),
        "notes": list(NOTES),
    }


def build_payloads(
    aggregate_rows: list[tuple[str, str, float, float, date, str, int, float]],
    bounds: dict[str, dict[str, float]],
    history_included: dict[str, bool],
    metrics: list[dict[str, Any]],
    ratios: dict[tuple[str, str, str], float],
) -> tuple[dict[str, bytes], dict[str, int]]:
    payloads: dict[str, bytes] = {}
    output_records: dict[str, int] = {}
    zone_metadata: list[dict[str, Any]] = []
    zone_data_by_name: dict[str, dict[str, Any]] = {}

    for zone in ZONES:
        zone_data, metadata = build_zone_data(zone, aggregate_rows, ratios)
        zone_data_by_name[zone] = zone_data
        zone_metadata.append(metadata)
        filename = f"{zone}.json"
        payloads[filename] = json_bytes(zone_data)
        output_records[filename] = len(zone_data["records"])

    manifest = make_manifest(bounds, zone_metadata, history_included, metrics)
    payloads["manifest.json"] = json_bytes(manifest)
    output_records["manifest.json"] = len(manifest["zones"])
    payloads["metrics.json"] = json_bytes(metrics)
    output_records["metrics.json"] = len(metrics)
    return payloads, output_records


def write_payloads(
    payloads: dict[str, bytes],
    output_records: dict[str, int],
) -> None:
    oversized = [
        (filename, len(content))
        for filename, content in payloads.items()
        if len(content) > MAX_JSON_BYTES
    ]
    if oversized:
        details = "; ".join(
            f"{filename}: {size / 1_000_000:.3f} MB"
            for filename, size in oversized
        )
        raise RuntimeError(
            f"!!! STOP: a JSON exceeds the {MAX_JSON_BYTES / 1_000_000:.0f} MB "
            f"limit; no JSON files were written. {details}"
        )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for filename, content in payloads.items():
        output_path = OUTPUT_DIR / filename
        output_path.write_bytes(content)
        record_count = output_records[filename]
        if filename == "manifest.json":
            record_description = f"{record_count} zones"
        elif filename == "metrics.json":
            record_description = f"{record_count} metric rows"
        else:
            record_description = f"{record_count} sparse records"
        print(
            f"Output {output_path.relative_to(ROOT_DIR)}: "
            f"{record_description}; {len(content) / 1_000_000:.3f} MB"
        )


def main() -> None:
    print(f"FIRE ATLAS frontend export; project root: {ROOT_DIR}")
    print(
        f"Filters: type={FIRMS_TYPE}; MODIS Aqua confidence >= "
        f"{MODIS_MIN_CONFIDENCE}; VIIRS confidence in "
        f"{VIIRS_ACCEPTED_CONFIDENCE}"
    )
    print(
        f"Grid={GRID_SIZE_DEGREES} degrees; weeks start Monday; "
        f"VIIRS source begins {TRANSITION_WEEK} (week containing "
        f"{OBSERVED_VIIRS_START})."
    )

    metrics, ratios = read_metrics_and_ratios()
    connection = duckdb.connect(":memory:")
    try:
        inputs, _ = discover_input_files()
        history_included = load_and_filter_inputs(connection, inputs)
        aggregate_rows, bounds = aggregate_detections(connection)
    finally:
        connection.close()

    payloads, output_records = build_payloads(
        aggregate_rows,
        bounds,
        history_included,
        metrics,
        ratios,
    )
    metadata_by_zone = {
        zone: {
            "first_modis_week": min(
                row[4]
                for row in aggregate_rows
                if row[0] == zone and row[1] == "MODIS_AQUA"
            ),
            "last_viirs_week": max(
                row[4]
                for row in aggregate_rows
                if row[0] == zone and row[1] in ("VIIRS_N20", "VIIRS_SNPP")
            ),
        }
        for zone in ZONES
    }
    for zone, date_range in metadata_by_zone.items():
        print(
            f"Week range {zone}: {date_range['first_modis_week']} "
            f"to {date_range['last_viirs_week']} (continuous Mondays)."
        )

    source_weeks: dict[int, set[date]] = {0: set(), 1: set()}
    for zone, date_range in metadata_by_zone.items():
        zone_source_weeks: dict[int, set[date]] = {0: set(), 1: set()}
        current_week = date_range["first_modis_week"]
        while current_week <= date_range["last_viirs_week"]:
            source = 0 if current_week >= TRANSITION_WEEK else 1
            zone_source_weeks[source].add(current_week)
            source_weeks[source].add(current_week)
            current_week += timedelta(days=7)
        print(
            f"Source weeks {zone}: source=0 {len(zone_source_weeks[0])}; "
            f"source=1 {len(zone_source_weeks[1])}."
        )
    print(
        "Unique calendar weeks by source across zones: "
        f"source=0 (observed VIIRS_N20) {len(source_weeks[0])}; "
        f"source=1 (scaled MODIS_AQUA) {len(source_weeks[1])}."
    )
    write_payloads(payloads, output_records)
    print(
        f"Export complete: {len(payloads)} JSON files in "
        f"{OUTPUT_DIR.relative_to(ROOT_DIR)}."
    )


if __name__ == "__main__":
    main()
