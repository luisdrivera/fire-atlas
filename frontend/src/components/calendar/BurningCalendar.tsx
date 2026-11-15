import { useState } from 'react'
import { EmptyState } from '../common/EmptyState'
import type {
  AnomalyAnalysis,
  AnomalyColorBand,
  WeeklyAnomaly,
} from '../../utils/anomaly'
import { getAnomalyColorBand, MIN_BASELINE_YEARS } from '../../utils/anomaly'
import type {
  CalendarMetric,
  DataSourceId,
  FireDataManifest,
  WeeklyFireActivity,
} from '../../types/fire'

interface BurningCalendarProps {
  anomalyAnalysis: AnomalyAnalysis
  manifest: FireDataManifest
  metric: CalendarMetric
  weeklyActivity: WeeklyFireActivity[]
}

interface HeatmapCell {
  key: string
  year: number
  week: number
  activity: WeeklyFireActivity | undefined
  anomaly: WeeklyAnomaly | undefined
}

type CalendarMode = 'activity' | 'anomaly'

const weekCount = 53
const cellSize = 11
const cellGap = 3
const cellStep = cellSize + cellGap
const labelWidth = 44
const headerHeight = 24
const rowHeight = 23
const calendarWidth = labelWidth + weekCount * cellStep
const legendWeekLabels = [1, 13, 26, 39, 53]
const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
})
const anomalyLegend: Array<{
  band: AnomalyColorBand
  label: string
}> = [
  { band: 'negative-3', label: '≤ −2' },
  { band: 'negative-2', label: '−2 to −1' },
  { band: 'negative-1', label: '−1 to −0.5' },
  { band: 'neutral', label: '−0.5 to 0.5' },
  { band: 'positive-1', label: '0.5 to 1' },
  { band: 'positive-2', label: '1 to 2' },
  { band: 'positive-3', label: '≥ 2' },
]

function getActivityLevel(value: number, maxValue: number): number {
  if (value <= 0 || maxValue <= 0) {
    return 0
  }
  return Math.min(4, Math.ceil((value / maxValue) * 4))
}

function getSourceName(
  manifest: FireDataManifest,
  source: DataSourceId,
): string {
  return manifest.sources.find((item) => item.id === source)?.name ?? 'Unknown source'
}

function buildHeatmapCells(
  weeklyActivity: WeeklyFireActivity[],
  anomalies: WeeklyAnomaly[],
): HeatmapCell[] {
  const activityByWeek = new Map(
    weeklyActivity.map((activity) => [
      `${activity.weekYear}-${activity.weekNumber}`,
      activity,
    ]),
  )
  const anomalyByWeek = new Map(
    anomalies.map((anomaly) => [
      `${anomaly.weekYear}-${anomaly.weekNumber}`,
      anomaly,
    ]),
  )
  const years = [...new Set(weeklyActivity.map((activity) => activity.weekYear))]
  const cells: HeatmapCell[] = []

  for (const year of years) {
    for (let week = 1; week <= weekCount; week += 1) {
      const key = `${year}-${week}`
      cells.push({
        key,
        year,
        week,
        activity: activityByWeek.get(key),
        anomaly: anomalyByWeek.get(key),
      })
    }
  }
  return cells
}

function formatValue(value: number, metricLabel: string): string {
  return `${numberFormatter.format(value)} ${metricLabel}`
}

function getAnomalyTooltip(
  anomaly: WeeklyAnomaly,
  metricLabel: string,
): string {
  const value = formatValue(anomaly.value, metricLabel)
  const mean =
    anomaly.climatologicalMean === null
      ? 'unavailable'
      : formatValue(anomaly.climatologicalMean, metricLabel)

  if (anomaly.baselineStatus === 'insufficient') {
    return `Week starts ${anomaly.date}: value ${value}; climatological mean ${mean}; insufficient baseline (${anomaly.baselineYears}/${MIN_BASELINE_YEARS} years); z unavailable.`
  }
  if (anomaly.baselineStatus === 'zero-variance') {
    return `Week starts ${anomaly.date}: value ${value}; climatological mean ${mean}; z unavailable because baseline standard deviation is zero.`
  }
  if (anomaly.baselineStatus === 'no-coverage') {
    return `Week starts ${anomaly.date}: no coverage; z unavailable.`
  }
  if (anomaly.zScore === null) {
    return `Week starts ${anomaly.date}: value ${value}; climatological mean ${mean}; z unavailable.`
  }
  return `Week starts ${anomaly.date}: value ${value}; climatological mean ${mean}; z ${numberFormatter.format(anomaly.zScore)}.`
}

function getBaselineSummary(analysis: AnomalyAnalysis): string {
  const yearRange =
    analysis.availableIsoYears.length > 0
      ? `${analysis.availableIsoYears[0]}–${analysis.availableIsoYears[analysis.availableIsoYears.length - 1]}`
      : 'none'
  const yearCount = analysis.availableIsoYears.length
  const insufficientCount = analysis.insufficientWeekNumbers.length
  const insufficientText =
    insufficientCount === 1
      ? '1 ISO week has insufficient baseline.'
      : `${insufficientCount} ISO weeks have insufficient baseline.`

  return `Baseline years represented: ${yearCount} (${yearRange}); per-week samples: ${analysis.minimumWeeklyBaselineYears}–${analysis.maximumWeeklyBaselineYears}; ${MIN_BASELINE_YEARS} required. ${insufficientText}`
}

export function BurningCalendar({
  anomalyAnalysis,
  manifest,
  metric,
  weeklyActivity,
}: BurningCalendarProps) {
  const [mode, setMode] = useState<CalendarMode>('activity')
  const coveredWeeks = weeklyActivity.filter((week) => week.hasCoverage)

  if (weeklyActivity.length === 0 || coveredWeeks.length === 0) {
    return (
      <EmptyState message="Weekly fire activity will appear here when covered observations are available." />
    )
  }

  const maxValue = coveredWeeks.reduce(
    (max, week) => Math.max(max, week.value),
    0,
  )
  const heatmapCells = buildHeatmapCells(
    weeklyActivity,
    anomalyAnalysis.weeks,
  )
  const years = [...new Set(weeklyActivity.map((activity) => activity.weekYear))]
  const viewHeight = headerHeight + years.length * rowHeight + 4
  const metricLabel = metric === 'detections' ? 'detections' : 'FRP'
  const scaledSource = manifest.sources.find((source) => source.id === 1)
  const observedSource = manifest.sources.find((source) => source.id === 0)
  const peakSeasonWeeks = new Set(
    anomalyAnalysis.criticalSeason?.weeks ?? [],
  )
  const criticalSeasonLabel = anomalyAnalysis.criticalSeason
    ? `Typical peak season: weeks ${anomalyAnalysis.criticalSeason.startWeek}–${anomalyAnalysis.criticalSeason.endWeek}`
    : 'Typical peak season: unavailable'

  return (
    <>
      <div className="calendar-controls">
        <div
          aria-label="Calendar display mode"
          className="calendar-mode-toggle"
          role="group"
        >
          <span>View</span>
          <button
            aria-pressed={mode === 'activity'}
            onClick={() => setMode('activity')}
            type="button"
          >
            Activity
          </button>
          <button
            aria-pressed={mode === 'anomaly'}
            onClick={() => setMode('anomaly')}
            type="button"
          >
            Anomaly
          </button>
        </div>
        <p className="anomaly-baseline-summary">
          {getBaselineSummary(anomalyAnalysis)}
        </p>
      </div>
      <p className="peak-season-note">{criticalSeasonLabel}</p>

      <div className="calendar-scroll">
        <svg
          aria-label={`Weekly ${metricLabel} ${mode} heatmap by ISO year`}
          className="calendar-svg"
          role="img"
          viewBox={`0 0 ${calendarWidth} ${viewHeight}`}
        >
          <title>{`Weekly ${metricLabel} ${mode} heatmap`}</title>
          {[...peakSeasonWeeks].map((week) => (
            <rect
              aria-label={`Typical peak season, ISO week ${week}`}
              className="calendar-peak-band"
              height={18}
              key={`peak-${week}`}
              rx="2"
              width={cellStep}
              x={labelWidth + (week - 1) * cellStep}
              y={2}
            >
              <title>{`Typical peak season, ISO week ${week}`}</title>
            </rect>
          ))}
          {legendWeekLabels.map((week) => (
            <text
              className="calendar-week-label"
              key={week}
              textAnchor="middle"
              x={labelWidth + (week - 1) * cellStep + cellSize / 2}
              y={15}
            >
              {week}
            </text>
          ))}
          {years.map((year, rowIndex) => {
            const rowY = headerHeight + rowIndex * rowHeight
            return (
              <g key={year}>
                <text
                  className="calendar-year-label"
                  dominantBaseline="middle"
                  x="0"
                  y={rowY + cellSize / 2}
                >
                  {year}
                </text>
                {heatmapCells
                  .filter((cell) => cell.year === year)
                  .map((cell) => {
                    const activity = cell.activity
                    const anomaly = cell.anomaly
                    const hasData =
                      activity !== undefined && activity.hasCoverage
                    const activityLevel =
                      hasData && activity
                        ? getActivityLevel(activity.value, maxValue)
                        : 'no-data'
                    const anomalyClass =
                      anomaly?.baselineStatus === 'insufficient'
                        ? 'calendar-cell--anomaly-insufficient'
                        : anomaly?.baselineStatus === 'zero-variance'
                          ? 'calendar-cell--anomaly-neutral'
                          : anomaly?.clippedZScore !== null &&
                              anomaly?.clippedZScore !== undefined
                            ? `calendar-cell--anomaly-${getAnomalyColorBand(anomaly.clippedZScore)}`
                            : 'calendar-cell--no-data'
                    const level =
                      mode === 'activity'
                        ? `calendar-cell--${activityLevel}`
                        : anomalyClass
                    const scaled =
                      mode === 'activity' &&
                      hasData &&
                      activity?.source === 1
                    const activityTooltip =
                      hasData && activity
                        ? `Week starts ${activity.date}: ${formatValue(activity.value, metricLabel)}; ${getSourceName(manifest, activity.source)}`
                        : activity
                          ? `Week starts ${activity.date}: No data`
                          : `ISO year ${year}, week ${cell.week}: No data`
                    const tooltip =
                      mode === 'anomaly' && anomaly
                        ? getAnomalyTooltip(anomaly, metricLabel)
                        : activityTooltip
                    const classes = [
                      'calendar-cell',
                      level,
                      scaled ? 'calendar-cell--scaled' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')
                    const x = labelWidth + (cell.week - 1) * cellStep
                    const y = rowY

                    return (
                      <rect
                        aria-label={tooltip}
                        className={classes}
                        height={cellSize}
                        key={cell.key}
                        rx="2"
                        tabIndex={0}
                        width={cellSize}
                        x={x}
                        y={y}
                      >
                        <title>{tooltip}</title>
                      </rect>
                    )
                  })}
              </g>
            )
          })}
        </svg>
      </div>

      {mode === 'activity' ? (
        <div aria-label="Activity heatmap legend" className="calendar-legends">
          <div aria-label="Activity intensity" className="calendar-legend">
            <span>Activity</span>
            <span className="calendar-legend-item">
              <span
                aria-hidden="true"
                className="calendar-legend-cell calendar-legend-cell--no-data"
              />
              No data
            </span>
            <span className="calendar-legend-item">
              <span
                aria-hidden="true"
                className="calendar-legend-cell calendar-legend-cell--zero"
              />
              0
            </span>
            <span className="calendar-legend-item">
              <span
                aria-hidden="true"
                className="calendar-legend-cell calendar-legend-cell--1"
              />
              Low
            </span>
            <span
              aria-hidden="true"
              className="calendar-legend-cell calendar-legend-cell--2"
            />
            <span
              aria-hidden="true"
              className="calendar-legend-cell calendar-legend-cell--3"
            />
            <span className="calendar-legend-item">
              <span
                aria-hidden="true"
                className="calendar-legend-cell calendar-legend-cell--4"
              />
              High
            </span>
          </div>
          <div
            aria-label="Data source styling"
            className="calendar-source-legend"
          >
            <span className="calendar-source-key">
              <span aria-hidden="true" className="calendar-source-swatch" />
              {observedSource?.name ?? 'Observed source'}
            </span>
            <span className="calendar-source-key">
              <span
                aria-hidden="true"
                className="calendar-source-swatch calendar-source-swatch--scaled"
              />
              {scaledSource?.name ?? 'Scaled source'}
            </span>
          </div>
        </div>
      ) : (
        <div aria-label="Anomaly heatmap legend" className="calendar-legends">
          <div className="calendar-legend calendar-legend--anomaly">
            <span>Standard deviations from climatological mean (z)</span>
            {anomalyLegend.map((item) => (
              <span className="calendar-legend-item" key={item.band}>
                <span
                  aria-hidden="true"
                  className={`calendar-legend-cell calendar-legend-cell--anomaly-${item.band}`}
                />
                {item.label}
              </span>
            ))}
            <span className="calendar-legend-item">
              <span
                aria-hidden="true"
                className="calendar-legend-cell calendar-legend-cell--anomaly-insufficient"
              />
              Insufficient baseline
            </span>
            <span className="calendar-legend-item">
              <span
                aria-hidden="true"
                className="calendar-legend-cell calendar-legend-cell--no-data"
              />
              No coverage
            </span>
          </div>
        </div>
      )}
    </>
  )
}
