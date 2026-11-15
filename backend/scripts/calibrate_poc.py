#!/usr/bin/env python
"""Run a reproducible VIIRS-to-MODIS calibration proof of concept."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
import math
from pathlib import Path
from typing import Iterable

import duckdb
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd


# Input filters, analysis grid, and temporal split.
FIRMS_TYPE = 0
MODIS_MIN_CONFIDENCE = 30
VIIRS_ACCEPTED_CONFIDENCE = ("n", "h")
GRID_SIZE_DEGREES = 0.25
DATA_START_DATE = date(2018, 4, 1)
DATA_END_DATE = date(2024, 12, 31)
TRAIN_END_DATE = date(2022, 12, 31)
TEST_START_DATE = date(2023, 1, 1)

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
ZONES = ("hispaniola", "mato_grosso")
DAYNIGHT_VALUES = ("D", "N")
QUANTITIES = ("n_detections", "sum_frp")
SENSOR_INPUTS = (
    ("hispaniola", "modis", "MODIS"),
    ("hispaniola", "viirs_noaa20", "N20"),
    ("hispaniola", "viirs_snpp", "SNPP"),
    ("mato_grosso", "modis", "MODIS"),
    ("mato_grosso", "viirs_noaa20", "N20"),
    ("mato_grosso", "viirs_snpp", "SNPP"),
)

ROOT_DIR = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT_DIR / "data" / "raw"
PROCESSED_DIR = ROOT_DIR / "data" / "processed"
AGGREGATES_PATH = PROCESSED_DIR / "aggregates_weekly_cell.parquet"
METRICS_PATH = PROCESSED_DIR / "calibration_metrics.csv"
FIGURES_DIR = PROCESSED_DIR / "figures"


@dataclass(frozen=True)
class ValidatedInput:
    zone: str
    folder: str
    sensor_family: str
    path: Path
    table_name: str
    satellite_values: tuple[str, ...]


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def validate_sensor_values(
    folder: str,
    sensor_family: str,
    path: Path,
    satellite_values: Iterable[str],
) -> tuple[str, ...]:
    normalized = tuple(sorted({value.strip().lower() for value in satellite_values}))
    if not normalized:
        raise ValueError(f"{path}: no satellite values were found.")

    if sensor_family == "MODIS":
        expected = {"aqua", "terra"}
        invalid = set(normalized) - expected
        if invalid:
            raise ValueError(
                f"{path}: MODIS folder contains unexpected satellite value(s) "
                f"{sorted(invalid)}; expected Aqua and/or Terra."
            )
        return normalized

    expected_satellite = {"N20": "n20", "SNPP": "snpp"}[sensor_family]
    if set(normalized) != {expected_satellite}:
        raise ValueError(
            f"{path}: folder '{folder}' expects satellite '{expected_satellite}', "
            f"but found {list(normalized)}."
        )
    return normalized


def validate_raw_table(
    connection: duckdb.DuckDBPyConnection,
    table_name: str,
    path: Path,
    zone: str,
    folder: str,
    sensor_family: str,
) -> ValidatedInput:
    columns = tuple(
        row[0] for row in connection.execute(f"DESCRIBE {table_name}").fetchall()
    )
    if columns != EXPECTED_COLUMNS:
        raise ValueError(
            f"{path}: unexpected CSV columns or order. "
            f"Expected {EXPECTED_COLUMNS}, found {columns}."
        )

    satellite_values = tuple(
        row[0]
        for row in connection.execute(
            f"SELECT DISTINCT satellite FROM {table_name} ORDER BY satellite"
        ).fetchall()
        if row[0] is not None
    )
    validated_satellites = validate_sensor_values(
        folder, sensor_family, path, satellite_values
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
            "(coordinates, date, time, satellite, daynight, type, or FRP)."
        )

    out_of_period_rows = connection.execute(
        f"""
        SELECT count(*)
        FROM {table_name}
        WHERE try_cast(acq_date AS DATE) < DATE '{DATA_START_DATE.isoformat()}'
           OR try_cast(acq_date AS DATE) > DATE '{DATA_END_DATE.isoformat()}'
        """
    ).fetchone()[0]
    if out_of_period_rows:
        raise ValueError(
            f"{path}: found {out_of_period_rows} rows outside "
            f"{DATA_START_DATE} through {DATA_END_DATE}."
        )

    confidence_values = tuple(
        row[0]
        for row in connection.execute(
            f"SELECT DISTINCT confidence FROM {table_name} ORDER BY confidence"
        ).fetchall()
        if row[0] is not None
    )
    if sensor_family == "MODIS":
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
                f"{path}: found {invalid_confidence} non-numeric or out-of-range "
                "MODIS confidence values."
            )
    else:
        normalized_confidence = {value.strip().lower() for value in confidence_values}
        invalid_confidence = normalized_confidence - {"l", "n", "h"}
        if invalid_confidence or not normalized_confidence:
            raise ValueError(
                f"{path}: unexpected VIIRS confidence value(s) "
                f"{sorted(invalid_confidence)}; expected letters l, n, h."
            )

    total_rows = connection.execute(
        f"SELECT count(*) FROM {table_name}"
    ).fetchone()[0]
    if total_rows == 0:
        raise ValueError(f"{path}: CSV contains no detections.")

    return ValidatedInput(
        zone=zone,
        folder=folder,
        sensor_family=sensor_family,
        path=path,
        table_name=table_name,
        satellite_values=validated_satellites,
    )


def load_and_validate_inputs(
    connection: duckdb.DuckDBPyConnection,
) -> list[ValidatedInput]:
    inputs: list[ValidatedInput] = []
    for index, (zone, folder, sensor_family) in enumerate(SENSOR_INPUTS):
        source_dir = RAW_DIR / zone / folder
        files = sorted(source_dir.glob("fire_archive_*.csv"))
        if len(files) != 1:
            raise ValueError(
                f"{source_dir}: expected exactly one fire_archive_*.csv file, "
                f"found {len(files)}."
            )

        path = files[0]
        table_name = f"raw_input_{index}"
        csv_path = path.resolve().as_posix()
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
        validated = validate_raw_table(
            connection,
            table_name,
            path,
            zone,
            folder,
            sensor_family,
        )
        inputs.append(validated)
        print(
            f"Validated {path.relative_to(ROOT_DIR)}: "
            f"satellite={list(validated.satellite_values)}"
        )

    return inputs


def filter_inputs(
    connection: duckdb.DuckDBPyConnection,
    inputs: list[ValidatedInput],
) -> None:
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

    for item in inputs:
        if item.sensor_family == "MODIS":
            confidence_filter = (
                f"try_cast(confidence AS DOUBLE) >= {MODIS_MIN_CONFIDENCE}"
            )
            sensor_group_expression = """
                CASE lower(trim(satellite))
                    WHEN 'aqua' THEN 'MODIS_AQUA'
                    WHEN 'terra' THEN 'MODIS_TERRA'
                END
            """
        else:
            accepted = ", ".join(
                sql_literal(value) for value in VIIRS_ACCEPTED_CONFIDENCE
            )
            confidence_filter = f"lower(trim(confidence)) IN ({accepted})"
            sensor_group_expression = sql_literal(f"VIIRS_{item.sensor_family}")

        filter_clause = (
            f"try_cast(type AS INTEGER) = {FIRMS_TYPE} "
            f"AND {confidence_filter}"
        )
        before_rows, after_rows = connection.execute(
            f"""
            SELECT count(*), count(*) FILTER (WHERE {filter_clause})
            FROM {item.table_name}
            """
        ).fetchone()
        print(
            f"Filter {item.path.relative_to(ROOT_DIR)} "
            f"({item.sensor_family}): before={before_rows:,}, after={after_rows:,}"
        )

        connection.execute(
            f"""
            INSERT INTO filtered_detections
            SELECT
                {sql_literal(item.zone)} AS zone,
                {sensor_group_expression} AS sensor_group,
                try_cast(latitude AS DOUBLE) AS latitude,
                try_cast(longitude AS DOUBLE) AS longitude,
                try_cast(acq_date AS DATE) AS acq_date,
                upper(trim(daynight)) AS daynight,
                try_cast(frp AS DOUBLE) AS frp
            FROM {item.table_name}
            WHERE {filter_clause}
            """
        )


def build_weekly_aggregates(
    connection: duckdb.DuckDBPyConnection,
) -> None:
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
        GROUP BY
            zone,
            sensor_group,
            cell_lat,
            cell_lon,
            week,
            daynight
        """
    )


def export_weekly_aggregates(connection: duckdb.DuckDBPyConnection) -> None:
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    if AGGREGATES_PATH.exists():
        AGGREGATES_PATH.unlink()
    connection.execute(
        f"""
        COPY weekly_aggregates
        TO {sql_literal(AGGREGATES_PATH.resolve().as_posix())}
        (FORMAT PARQUET, COMPRESSION ZSTD)
        """
    )
    rows = connection.execute(
        "SELECT count(*) FROM weekly_aggregates"
    ).fetchone()[0]
    print(f"Saved {rows:,} weekly cell aggregates to {AGGREGATES_PATH}.")


def create_pair_table(
    connection: duckdb.DuckDBPyConnection,
    table_name: str,
    left_group: str,
    right_group: str,
    left_alias: str,
    right_alias: str,
) -> None:
    connection.execute(
        f"""
        CREATE TEMP TABLE {table_name} AS
        SELECT
            coalesce(left_sensor.zone, right_sensor.zone) AS zone,
            coalesce(left_sensor.cell_lat, right_sensor.cell_lat) AS cell_lat,
            coalesce(left_sensor.cell_lon, right_sensor.cell_lon) AS cell_lon,
            coalesce(left_sensor.week, right_sensor.week) AS week,
            coalesce(left_sensor.daynight, right_sensor.daynight) AS daynight,
            coalesce(left_sensor.n_detections, 0)::DOUBLE AS {left_alias}_n_detections,
            coalesce(right_sensor.n_detections, 0)::DOUBLE AS {right_alias}_n_detections,
            coalesce(left_sensor.sum_frp, 0.0)::DOUBLE AS {left_alias}_sum_frp,
            coalesce(right_sensor.sum_frp, 0.0)::DOUBLE AS {right_alias}_sum_frp
        FROM (
            SELECT zone, cell_lat, cell_lon, week, daynight, n_detections, sum_frp
            FROM weekly_aggregates
            WHERE sensor_group = {sql_literal(left_group)}
        ) AS left_sensor
        FULL OUTER JOIN (
            SELECT zone, cell_lat, cell_lon, week, daynight, n_detections, sum_frp
            FROM weekly_aggregates
            WHERE sensor_group = {sql_literal(right_group)}
        ) AS right_sensor
        ON left_sensor.zone = right_sensor.zone
           AND left_sensor.cell_lat = right_sensor.cell_lat
           AND left_sensor.cell_lon = right_sensor.cell_lon
           AND left_sensor.week = right_sensor.week
           AND left_sensor.daynight = right_sensor.daynight
        """
    )


def average_ranks(values: np.ndarray) -> np.ndarray:
    order = np.argsort(values, kind="mergesort")
    sorted_values = values[order]
    ranks = np.empty(values.size, dtype=np.float64)
    start = 0
    while start < values.size:
        end = start + 1
        while end < values.size and sorted_values[end] == sorted_values[start]:
            end += 1
        average_rank = ((start + 1) + end) / 2.0
        ranks[order[start:end]] = average_rank
        start = end
    return ranks


def correlation(left: np.ndarray, right: np.ndarray) -> float:
    if left.size < 2 or np.ptp(left) == 0 or np.ptp(right) == 0:
        return math.nan
    return float(np.corrcoef(left, right)[0, 1])


def correlation_metrics(
    observed: np.ndarray, predicted: np.ndarray
) -> tuple[float, float, float, float, float]:
    valid = np.isfinite(observed) & np.isfinite(predicted)
    observed = observed[valid]
    predicted = predicted[valid]
    if observed.size == 0:
        return math.nan, math.nan, math.nan, math.nan, math.nan

    difference = predicted - observed
    pearson = correlation(observed, predicted)
    spearman = correlation(average_ranks(observed), average_ranks(predicted))
    return (
        float(np.mean(difference)),
        float(np.mean(np.abs(difference))),
        float(np.sqrt(np.mean(np.square(difference)))),
        pearson,
        spearman,
    )


def ratio(numerator: float, denominator: float) -> float:
    if denominator == 0:
        return math.nan
    return numerator / denominator


def load_pair_dataframe(
    connection: duckdb.DuckDBPyConnection, table_name: str
) -> pd.DataFrame:
    frame = connection.execute(
        f"SELECT * FROM {table_name} ORDER BY zone, week, daynight, cell_lat, cell_lon"
    ).fetchdf()
    frame["week"] = pd.to_datetime(frame["week"]).dt.date
    return frame


def build_calibration_metrics(
    pairs: pd.DataFrame,
) -> tuple[pd.DataFrame, dict[tuple[str, str, str], float]]:
    result_rows: list[dict[str, object]] = []
    ratios: dict[tuple[str, str, str], float] = {}

    for zone in ZONES:
        for daynight in DAYNIGHT_VALUES:
            group = pairs[(pairs["zone"] == zone) & (pairs["daynight"] == daynight)]
            training = group[group["week"] <= TRAIN_END_DATE]
            testing = group[group["week"] >= TEST_START_DATE]

            for quantity in QUANTITIES:
                left_column = f"modis_{quantity}"
                right_column = f"viirs_{quantity}"
                estimate = ratio(
                    float(training[left_column].sum()),
                    float(training[right_column].sum()),
                )
                ratios[(zone, daynight, quantity)] = estimate

                observed = testing[left_column].to_numpy(dtype=np.float64)
                viirs = testing[right_column].to_numpy(dtype=np.float64)
                predicted = viirs * estimate
                scores = correlation_metrics(observed, predicted)
                result_rows.append(
                    {
                        "zone": zone,
                        "daynight": daynight,
                        "quantity": quantity,
                        "training_ratio_modis_over_viirs": estimate,
                        "n_training_pairs": len(training),
                        "n_test_pairs": len(testing),
                        "mean_bias_pred_minus_observed": scores[0],
                        "mae": scores[1],
                        "rmse": scores[2],
                        "pearson_r": scores[3],
                        "spearman_r": scores[4],
                    }
                )

    columns = (
        "zone",
        "daynight",
        "quantity",
        "training_ratio_modis_over_viirs",
        "n_training_pairs",
        "n_test_pairs",
        "mean_bias_pred_minus_observed",
        "mae",
        "rmse",
        "pearson_r",
        "spearman_r",
    )
    return pd.DataFrame(result_rows, columns=columns), ratios


def build_viirs_consistency_table(pairs: pd.DataFrame) -> pd.DataFrame:
    rows: list[dict[str, object]] = []
    for zone in ZONES:
        group = pairs[pairs["zone"] == zone]
        for quantity in QUANTITIES:
            left = group[f"n20_{quantity}"].to_numpy(dtype=np.float64)
            right = group[f"snpp_{quantity}"].to_numpy(dtype=np.float64)
            scores = correlation_metrics(left, right)
            rows.append(
                {
                    "zone": zone,
                    "quantity": quantity,
                    "n_pairs": len(group),
                    "pearson_r": scores[3],
                    "spearman_r": scores[4],
                }
            )
    return pd.DataFrame(
        rows, columns=("zone", "quantity", "n_pairs", "pearson_r", "spearman_r")
    )


def plot_calibration_scatter(
    pairs: pd.DataFrame,
    ratios: dict[tuple[str, str, str], float],
) -> None:
    FIGURES_DIR.mkdir(parents=True, exist_ok=True)
    testing = pairs[pairs["week"] >= TEST_START_DATE]
    daynight_colors = {"D": "#d9822b", "N": "#516f9b"}

    for zone in ZONES:
        zone_data = testing[testing["zone"] == zone]
        figure, axes = plt.subplots(1, 2, figsize=(12, 5), constrained_layout=True)
        for axis, quantity, title in zip(
            axes,
            QUANTITIES,
            ("Active fire detections", "Fire radiative power"),
        ):
            left_column = f"modis_{quantity}"
            right_column = f"viirs_{quantity}"
            plotted_values: list[np.ndarray] = []
            for daynight in DAYNIGHT_VALUES:
                subset = zone_data[zone_data["daynight"] == daynight]
                estimate = ratios[(zone, daynight, quantity)]
                if subset.empty or not math.isfinite(estimate):
                    continue
                observed = subset[left_column].to_numpy(dtype=np.float64)
                predicted = (
                    subset[right_column].to_numpy(dtype=np.float64) * estimate
                )
                plotted_values.extend((observed, predicted))
                axis.scatter(
                    observed,
                    predicted,
                    alpha=0.35,
                    s=12,
                    color=daynight_colors[daynight],
                    label=f"{daynight} observations",
                )

            finite_values = (
                np.concatenate(plotted_values)
                if plotted_values
                else np.array([], dtype=np.float64)
            )
            finite_values = finite_values[np.isfinite(finite_values)]
            limit = float(np.max(finite_values)) if finite_values.size else 0.0
            if limit > 0:
                axis.plot(
                    [0, limit],
                    [0, limit],
                    linestyle="--",
                    linewidth=1,
                    color="#777777",
                    label="1:1 reference",
                )
                axis.set_xlim(left=0, right=limit * 1.03)
                axis.set_ylim(bottom=0, top=limit * 1.03)
            axis.set_title(title)
            axis.set_xlabel("MODIS_AQUA observed")
            axis.set_ylabel("VIIRS_N20 calibrated prediction")
            axis.grid(alpha=0.2)
            if axis.get_legend_handles_labels()[0]:
                axis.legend(fontsize=8)
            else:
                axis.text(
                    0.5,
                    0.5,
                    "No test pairs with an available training ratio",
                    ha="center",
                    va="center",
                    transform=axis.transAxes,
                )

        figure.suptitle(
            f"{zone}: observed vs predicted, test weeks from {TEST_START_DATE}"
        )
        figure.savefig(
            FIGURES_DIR / f"calibration_scatter_{zone}.png",
            dpi=160,
        )
        plt.close(figure)


def monday_of(value: date) -> date:
    return value - timedelta(days=value.weekday())


def plot_weekly_detections(
    pairs: pd.DataFrame,
    ratios: dict[tuple[str, str, str], float],
) -> None:
    FIGURES_DIR.mkdir(parents=True, exist_ok=True)
    start_week = monday_of(DATA_START_DATE)
    end_week = monday_of(DATA_END_DATE)
    weeks: list[date] = []
    current_week = start_week
    while current_week <= end_week:
        weeks.append(current_week)
        current_week += timedelta(days=7)

    weekly = (
        pairs.groupby(["zone", "week", "daynight"], as_index=False)[
            ["modis_n_detections", "viirs_n_detections"]
        ]
        .sum()
    )

    for zone in ZONES:
        zone_weekly = weekly[weekly["zone"] == zone]
        values_by_week_and_period = {
            (row.week, row.daynight): (
                float(row.modis_n_detections),
                float(row.viirs_n_detections),
            )
            for row in zone_weekly.itertuples(index=False)
        }

        modis_series: list[float] = []
        viirs_series: list[float] = []
        calibrated_series: list[float] = []
        for week in weeks:
            modis_total = 0.0
            viirs_total = 0.0
            calibrated_total = 0.0
            has_all_ratios = True
            for daynight in DAYNIGHT_VALUES:
                modis_value, viirs_value = values_by_week_and_period.get(
                    (week, daynight), (0.0, 0.0)
                )
                modis_total += modis_value
                viirs_total += viirs_value
                estimate = ratios[(zone, daynight, "n_detections")]
                if math.isfinite(estimate):
                    calibrated_total += viirs_value * estimate
                else:
                    has_all_ratios = False

            modis_series.append(modis_total)
            viirs_series.append(viirs_total)
            calibrated_series.append(
                calibrated_total if has_all_ratios else math.nan
            )

        figure, axis = plt.subplots(figsize=(12, 5), constrained_layout=True)
        axis.plot(weeks, modis_series, label="MODIS_AQUA", linewidth=1.2)
        axis.plot(weeks, viirs_series, label="VIIRS_N20 uncalibrated", linewidth=1.0)
        axis.plot(
            weeks,
            calibrated_series,
            label="VIIRS_N20 calibrated",
            linewidth=1.2,
        )
        axis.set_title(f"{zone}: weekly active fire detections")
        axis.set_xlabel("Week (Monday)")
        axis.set_ylabel("Detections")
        axis.grid(alpha=0.2)
        axis.legend()
        figure.autofmt_xdate()
        figure.savefig(
            FIGURES_DIR / f"weekly_detections_{zone}.png",
            dpi=160,
        )
        plt.close(figure)


def print_table(title: str, frame: pd.DataFrame) -> None:
    print(f"\n{title}")
    print(frame.to_string(index=False, float_format=lambda value: f"{value:.8g}"))


def main() -> None:
    print(f"FIRE ATLAS calibration POC; project root: {ROOT_DIR}")
    print(
        f"Filters: type={FIRMS_TYPE}; MODIS confidence >= {MODIS_MIN_CONFIDENCE}; "
        f"VIIRS confidence in {VIIRS_ACCEPTED_CONFIDENCE}"
    )
    print(
        f"Grid={GRID_SIZE_DEGREES} degrees; train weeks <= {TRAIN_END_DATE}; "
        f"test weeks >= {TEST_START_DATE}."
    )
    print("DuckDB date_trunc('week') labels each week by its Monday.")

    connection = duckdb.connect(":memory:")
    try:
        inputs = load_and_validate_inputs(connection)
        filter_inputs(connection, inputs)
        build_weekly_aggregates(connection)
        export_weekly_aggregates(connection)

        create_pair_table(
            connection,
            "modis_viirs_pairs",
            "MODIS_AQUA",
            "VIIRS_N20",
            "modis",
            "viirs",
        )
        create_pair_table(
            connection,
            "viirs_consistency_pairs",
            "VIIRS_N20",
            "VIIRS_SNPP",
            "n20",
            "snpp",
        )
        calibration_pairs = load_pair_dataframe(connection, "modis_viirs_pairs")
        consistency_pairs = load_pair_dataframe(
            connection, "viirs_consistency_pairs"
        )
    finally:
        connection.close()

    metrics, ratios = build_calibration_metrics(calibration_pairs)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    metrics.to_csv(METRICS_PATH, index=False, na_rep="NaN", float_format="%.10g")
    print_table("Calibration metrics (bias = prediction - observation)", metrics)
    print(f"\nSaved calibration metrics to {METRICS_PATH}.")

    consistency = build_viirs_consistency_table(consistency_pairs)
    print_table("VIIRS_N20 vs VIIRS_SNPP consistency", consistency)

    plot_calibration_scatter(calibration_pairs, ratios)
    plot_weekly_detections(calibration_pairs, ratios)
    print(f"\nSaved figures to {FIGURES_DIR}.")


if __name__ == "__main__":
    main()
