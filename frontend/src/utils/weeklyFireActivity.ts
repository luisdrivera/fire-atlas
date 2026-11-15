import type {
  DataSourceId,
  FireDataManifest,
  WeeklyFireActivity,
  ZoneFireData,
  CalendarMetric,
} from '../types/fire'

const millisecondsPerWeek = 7 * 24 * 60 * 60 * 1000

function getTransitionWeek(manifest: FireDataManifest): string {
  const note = manifest.notes.find((item) => item.startsWith('From '))
  const date = note?.match(/^From (\d{4}-\d{2}-\d{2}),/)?.[1]
  if (!date) {
    throw new Error('The manifest does not identify the observed data start date.')
  }

  const dateValue = new Date(`${date}T00:00:00Z`)
  const dayOfWeek = (dateValue.getUTCDay() + 6) % 7
  dateValue.setUTCDate(dateValue.getUTCDate() - dayOfWeek)
  return dateValue.toISOString().slice(0, 10)
}

function getIsoWeekParts(weekStart: string): {
  weekYear: number
  weekNumber: number
} {
  const date = new Date(`${weekStart}T00:00:00Z`)
  const dayOfWeek = (date.getUTCDay() + 6) % 7
  const thursday = new Date(date)
  thursday.setUTCDate(date.getUTCDate() + 3 - dayOfWeek)
  const weekYear = thursday.getUTCFullYear()
  const januaryFourth = new Date(Date.UTC(weekYear, 0, 4))
  const firstMonday = new Date(januaryFourth)
  firstMonday.setUTCDate(
    januaryFourth.getUTCDate() - ((januaryFourth.getUTCDay() + 6) % 7),
  )
  const weekNumber =
    Math.floor((date.getTime() - firstMonday.getTime()) / millisecondsPerWeek) +
    1
  return { weekYear, weekNumber }
}

export function summarizeWeeklyActivity(
  data: ZoneFireData,
  manifest: FireDataManifest,
  metric: CalendarMetric,
): WeeklyFireActivity[] {
  const totals = data.weeks.map((week) => ({
    date: week,
    detections: 0,
    frp: 0,
    source: null as DataSourceId | null,
  }))

  for (const record of data.records) {
    const [cellIndex, weekIndex, nDay, nNight, frpDay, frpNight, source] = record
    if (
      !Number.isInteger(cellIndex) ||
      cellIndex < 0 ||
      cellIndex >= data.cells.length ||
      !Number.isInteger(weekIndex) ||
      weekIndex < 0 ||
      weekIndex >= totals.length
    ) {
      throw new Error('Zone data contains a record with an invalid cell or week index.')
    }

    const weeklyTotal = totals[weekIndex]
    if (weeklyTotal.source !== null && weeklyTotal.source !== source) {
      throw new Error(`Week ${weeklyTotal.date} contains multiple data sources.`)
    }
    weeklyTotal.source = source
    weeklyTotal.detections += nDay + nNight
    weeklyTotal.frp += frpDay + frpNight
  }

  const transitionWeek = getTransitionWeek(manifest)
  return totals.map((weeklyTotal, weekIndex) => {
    const source =
      weeklyTotal.source ??
      (weeklyTotal.date >= transitionWeek ? 0 : 1)
    const sensor = source === 0 ? 'VIIRS_N20' : 'MODIS_AQUA'
    const hasCoverage =
      weeklyTotal.source !== null ||
      data.sensor_series[sensor].n_detections[weekIndex] !== null
    const { weekYear, weekNumber } = getIsoWeekParts(weeklyTotal.date)

    return {
      ...weeklyTotal,
      source,
      hasCoverage,
      weekYear,
      weekNumber,
      value:
        metric === 'detections' ? weeklyTotal.detections : weeklyTotal.frp,
    }
  })
}
