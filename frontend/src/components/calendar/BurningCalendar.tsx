import { EmptyState } from '../common/EmptyState'
import type {
  CalendarMetric,
  DataSourceId,
  FireDataManifest,
  WeeklyFireActivity,
  ZoneFireData,
} from '../../types/fire'
import { summarizeWeeklyActivity } from '../../utils/weeklyFireActivity'

interface BurningCalendarProps {
  data: ZoneFireData
  manifest: FireDataManifest
  metric: CalendarMetric
}

interface HeatmapCell {
  key: string
  year: number
  week: number
  activity: WeeklyFireActivity | undefined
}

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
): HeatmapCell[] {
  const activityByWeek = new Map(
    weeklyActivity.map((activity) => [
      `${activity.weekYear}-${activity.weekNumber}`,
      activity,
    ]),
  )
  const years = [...new Set(weeklyActivity.map((activity) => activity.weekYear))]
  const cells: HeatmapCell[] = []

  for (const year of years) {
    for (let week = 1; week <= weekCount; week += 1) {
      cells.push({
        key: `${year}-${week}`,
        year,
        week,
        activity: activityByWeek.get(`${year}-${week}`),
      })
    }
  }
  return cells
}

export function BurningCalendar({
  data,
  manifest,
  metric,
}: BurningCalendarProps) {
  const weeklyActivity = summarizeWeeklyActivity(data, manifest, metric)
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
  const heatmapCells = buildHeatmapCells(weeklyActivity)
  const years = [...new Set(weeklyActivity.map((activity) => activity.weekYear))]
  const viewHeight = headerHeight + years.length * rowHeight + 4
  const metricLabel = metric === 'detections' ? 'detections' : 'FRP'
  const scaledSource = manifest.sources.find((source) => source.id === 1)
  const observedSource = manifest.sources.find((source) => source.id === 0)

  return (
    <>
      <div className="calendar-scroll">
        <svg
          aria-label={`Weekly ${metricLabel} heatmap by ISO year`}
          className="calendar-svg"
          role="img"
          viewBox={`0 0 ${calendarWidth} ${viewHeight}`}
        >
          <title>{`Weekly ${metricLabel} heatmap`}</title>
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
                    const hasData = activity !== undefined && activity.hasCoverage
                    const level = hasData && activity
                      ? getActivityLevel(activity.value, maxValue)
                      : 'no-data'
                    const scaled = hasData && activity?.source === 1
                    const sourceName = hasData && activity
                      ? getSourceName(manifest, activity.source)
                      : 'No data'
                    const valueText = hasData && activity
                      ? `${numberFormatter.format(activity.value)} ${metricLabel}`
                      : 'No data'
                    const tooltip = hasData && activity
                      ? `Week starts ${activity.date}: ${valueText}; ${sourceName}`
                      : activity
                        ? `Week starts ${activity.date}: No data`
                        : `ISO year ${year}, week ${cell.week}: No data`
                    const classes = [
                      'calendar-cell',
                      `calendar-cell--${level}`,
                      scaled ? 'calendar-cell--scaled' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')
                    const x =
                      labelWidth + (cell.week - 1) * cellStep
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

      <div aria-label="Heatmap legends" className="calendar-legends">
        <div aria-label="Activity intensity" className="calendar-legend">
          <span>Activity</span>
          <span className="calendar-legend-item">
            <span aria-hidden="true" className="calendar-legend-cell calendar-legend-cell--no-data" />
            No data
          </span>
          <span className="calendar-legend-item">
            <span aria-hidden="true" className="calendar-legend-cell calendar-legend-cell--zero" />
            0
          </span>
          <span className="calendar-legend-item">
            <span aria-hidden="true" className="calendar-legend-cell calendar-legend-cell--1" />
            Low
          </span>
          <span aria-hidden="true" className="calendar-legend-cell calendar-legend-cell--2" />
          <span aria-hidden="true" className="calendar-legend-cell calendar-legend-cell--3" />
          <span className="calendar-legend-item">
            <span aria-hidden="true" className="calendar-legend-cell calendar-legend-cell--4" />
            High
          </span>
        </div>
        <div aria-label="Data source styling" className="calendar-source-legend">
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
    </>
  )
}
