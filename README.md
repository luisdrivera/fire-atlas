# FIRE ATLAS

**A continuity bridge between MODIS and VIIRS fire detections.**
NASA Space Apps Challenge 2026 · Challenge: *Harmonization of MODIS and VIIRS Hot Spots*

**Live demo:** https://fire-atlas-nu.vercel.app/

## What it does

NASA's MODIS and VIIRS active-fire products detect fires differently (different pixel sizes and sensitivity), so a single long history of burning activity is hard to read. FIRE ATLAS harmonizes both into one comparable weekly record for two regions, Hispaniola and Mato Grosso (Brazil), covering July 2002 to December 2024.

The web app shows:

- a **burning-activity calendar** (week by year) with the typical peak season,
- **weekly anomalies** (z-scores against each week's own climatology),
- a **map** of weekly activity on a 0.25° grid,
- a **sensor comparison** chart and a **validation panel** with the real test metrics.

## Data

- NASA FIRMS archive downloads (not the live API): MODIS C6.1 Aqua, VIIRS S-NPP/NOAA-20 375 m.
- Filters: fire type = 0 (presumed vegetation fire); MODIS confidence >= 30; VIIRS confidence nominal or high.
- Basemap: NASA GIBS (Blue Marble). Fire data: NASA FIRMS.

## Method

1. Aggregate detections per 0.25° cell per week (weeks start on Monday), split by day and night.
2. Compare only VIIRS NOAA-20 against MODIS Aqua, because both cross the equator in the afternoon.
3. Estimate a MODIS-to-VIIRS ratio per region, per day/night and per quantity (detections, summed FRP) on a **training period, 2018-04-01 to 2022-12-31**.
4. Evaluate on **held-out data, 2023-2024**.
5. Build the harmonized "VIIRS-equivalent" index: observed VIIRS NOAA-20 from 2018-04-01 onward; MODIS Aqua divided by the training ratio before that date.
6. Anomalies: climatology by ISO week (mean and standard deviation across years, at least 5 years of baseline) and z-score per week. The typical peak season is the longest run of consecutive weeks whose climatological mean is at least 60% of the maximum.

## Validation (test period 2023-2024)

Values are per cell-week, in VIIRS-equivalent units. Ratio = MODIS Aqua / VIIRS NOAA-20 estimated on the training period.

**Number of detections**

| Region | Day/Night | Ratio | Test pairs | Bias | MAE | RMSE | Pearson | Spearman |
|---|---|---|---|---|---|---|---|---|
| Hispaniola | Day | 0.109 | 4378 | -0.083 | 0.514 | 0.962 | 0.67 | 0.30 |
| Hispaniola | Night | 0.024 | 1132 | -0.032 | 0.136 | 0.591 | 0.79 | 0.22 |
| Mato Grosso | Day | 0.244 | 5580 | -0.398 | 1.434 | 2.596 | 0.92 | 0.19 |
| Mato Grosso | Night | 0.050 | 3119 | +0.025 | 0.649 | 1.573 | 0.77 | 0.57 |

**Summed fire radiative power (FRP)**

| Region | Day/Night | Ratio | Test pairs | Bias | MAE | RMSE | Pearson | Spearman |
|---|---|---|---|---|---|---|---|---|
| Hispaniola | Day | 0.378 | 4378 | -2.60 | 13.28 | 46.79 | 0.62 | 0.32 |
| Hispaniola | Night | 0.198 | 1132 | -1.02 | 2.47 | 17.72 | 0.93 | 0.25 |
| Mato Grosso | Day | 1.027 | 5580 | -27.80 | 122.66 | 630.62 | 0.85 | 0.22 |
| Mato Grosso | Night | 0.490 | 3119 | +0.64 | 20.84 | 123.72 | 0.68 | 0.61 |

## Key findings

- The MODIS-to-VIIRS relationship is **regional and day/night specific**. It is not a single global constant.
- Agreement is strong in high-activity weeks (high Pearson) and weak in sparse, low-count cells (low Spearman).
- FRP is close to conserved between sensors only in Mato Grosso during the day (ratio 1.03). In Hispaniola the ratio is 0.38, so FRP is not directly comparable there.

## Limitations

- Proof of concept on two regions only.
- Before 2018-04-01 the series is MODIS Aqua scaled with a ratio estimated in 2018-2022. This assumes the inter-sensor relationship stayed stable. A discontinuity at the 2018 break is possible and has not been validated backward in time.
- The 0.25° weekly grid hides fine-scale detail.
- Anomaly z-scores can be inflated in weeks and places with very low baseline activity.
- The data is historical (to December 2024). The "latest available week" is not real-time.
- Calibration agreement is weaker in low-activity cells.

## Future work

Validate backward in time using VIIRS S-NPP (2012-2018) against scaled MODIS; extend to more regions; estimate uncertainty bands for the scaled period.

## Run locally

Frontend (uses the pre-built JSON in `frontend/public/data`, no backend needed):

```bash
cd frontend
npm install
npm run dev
```

Data pipeline (requires FIRMS archive CSVs in `data/raw/`, which are not committed):

```bash
cd backend
python scripts/calibrate_poc.py
python scripts/export_frontend_data.py
```

## Repository structure

- `frontend/` React + TypeScript + Vite app (Leaflet map, Recharts charts)
- `frontend/public/data/` harmonized weekly data and metrics (JSON)
- `backend/scripts/calibrate_poc.py` calibration and validation
- `backend/scripts/export_frontend_data.py` builds the frontend JSON
- `backend/app/` minimal FastAPI health API

## Credits

Fire detections: NASA FIRMS (MODIS and VIIRS). Basemap: NASA GIBS. Built for NASA Space Apps Challenge 2026.