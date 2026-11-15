import { EmptyState } from '../common/EmptyState'
import type { BurningActivityRecord } from '../../types/fire'

interface BurningCalendarProps {
  data: readonly BurningActivityRecord[]
}

interface CalendarYear {
  year: number
  values: Map<number, number>
}

const cellSize = 3
const cellGap = 1
const rowHeight = 10
const labelWidth = 38
const daysInYear = 365
const maxDaysInYear = 366
const calendarWidth = labelWidth + maxDaysInYear * (cellSize + cellGap)

function getDayOfYear(date: Date): number {
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 0)
  return Math.floor((date.getTime() - startOfYear) / 86_400_000)
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

function buildCalendarYears(data: readonly BurningActivityRecord[]): CalendarYear[] {
  const years = new Map<number, Map<number, number>>()

  for (const record of data) {
    const date = new Date(`${record.date}T00:00:00Z`)
    if (Number.isNaN(date.getTime())) {
      continue
    }

    const year = date.getUTCFullYear()
    const day = getDayOfYear(date)
    const values = years.get(year) ?? new Map<number, number>()
    values.set(day, (values.get(day) ?? 0) + record.detections)
    years.set(year, values)
  }

  return [...years.entries()]
    .map(([year, values]) => ({ year, values }))
    .sort((left, right) => left.year - right.year)
}

function getActivityLevel(value: number, maxValue: number): number {
  if (value <= 0 || maxValue <= 0) {
    return 0
  }
  if (value / maxValue < 0.34) {
    return 1
  }
  if (value / maxValue < 0.67) {
    return 2
  }
  return 3
}

export function BurningCalendar({ data }: BurningCalendarProps) {
  const years = buildCalendarYears(data)

  if (years.length === 0) {
    return (
      <EmptyState message="Activity by year and day will appear here when fire detection data is loaded." />
    )
  }

  const maxValue = years.reduce(
    (largest, { values }) =>
      [...values.values()].reduce((currentMax, value) => Math.max(currentMax, value), largest),
    0,
  )
  const viewHeight = Math.max(1, years.length) * rowHeight + 4

  return (
    <>
      <div className="calendar-scroll">
        <svg
          aria-label="Burning activity calendar arranged by year and day of year"
          className="calendar-svg"
          role="img"
          viewBox={`0 0 ${calendarWidth} ${viewHeight}`}
        >
          <title>Burning activity by year and day of year</title>
          {years.map(({ year, values }, rowIndex) => {
            const daysForYear = isLeapYear(year) ? maxDaysInYear : daysInYear
            const y = rowIndex * rowHeight + 2

            return (
              <g key={year}>
                <text
                  className="calendar-year-label"
                  dominantBaseline="middle"
                  x="0"
                  y={y + cellSize / 2}
                >
                  {year}
                </text>
                {Array.from({ length: daysForYear }, (_, index) => {
                  const day = index + 1
                  const value = values.get(day) ?? 0
                  const level = getActivityLevel(value, maxValue)
                  const x = labelWidth + index * (cellSize + cellGap)

                  return (
                    <rect
                      aria-label={`${year}, day ${day}: ${value} detections`}
                      className={`calendar-cell calendar-cell--${level}`}
                      height={cellSize}
                      key={day}
                      rx="0.7"
                      width={cellSize}
                      x={x}
                      y={y}
                    >
                      <title>{`${year}, day ${day}: ${value} detections`}</title>
                    </rect>
                  )
                })}
              </g>
            )
          })}
        </svg>
      </div>
      <div aria-label="Detection intensity" className="calendar-legend">
        <span>Less</span>
        <span aria-hidden="true" className="calendar-legend-cell" />
        <span aria-hidden="true" className="calendar-legend-cell calendar-legend-cell--1" />
        <span aria-hidden="true" className="calendar-legend-cell calendar-legend-cell--2" />
        <span aria-hidden="true" className="calendar-legend-cell calendar-legend-cell--3" />
        <span>More</span>
      </div>
    </>
  )
}
