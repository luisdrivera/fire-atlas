import type { WeeklyFireActivity } from '../types/fire'

export const MIN_BASELINE_YEARS = 5
export const CRITICAL_THRESHOLD = 0.6
export const Z_CLIP = 3
export const Z_ABOVE = 1
export const Z_BELOW = -1

const ISO_WEEK_COUNT = 53

export type AnomalyBaselineStatus =
  | 'no-coverage'
  | 'insufficient'
  | 'zero-variance'
  | 'scored'

export type AnomalyClassification =
  | 'Above normal'
  | 'Below normal'
  | 'Normal'
  | 'Unclassified'

export type AnomalyColorBand =
  | 'negative-3'
  | 'negative-2'
  | 'negative-1'
  | 'neutral'
  | 'positive-1'
  | 'positive-2'
  | 'positive-3'

export interface WeekClimatology {
  weekNumber: number
  baselineYears: number
  mean: number | null
  standardDeviation: number | null
  insufficientBaseline: boolean
}

export interface WeeklyAnomaly extends WeeklyFireActivity {
  baselineYears: number
  climatologicalMean: number | null
  climatologicalStandardDeviation: number | null
  zScore: number | null
  clippedZScore: number | null
  baselineStatus: AnomalyBaselineStatus
}

export interface CriticalSeason {
  startWeek: number
  endWeek: number
  length: number
  wrapsAcrossYear: boolean
  weeks: number[]
}

export interface AnomalyAnalysis {
  climatology: WeekClimatology[]
  weeks: WeeklyAnomaly[]
  topAnomalies: WeeklyAnomaly[]
  latestAvailableWeek: WeeklyAnomaly | null
  latestClassification: AnomalyClassification
  criticalSeason: CriticalSeason | null
  availableIsoYears: number[]
  minimumWeeklyBaselineYears: number
  maximumWeeklyBaselineYears: number
  insufficientWeekNumbers: number[]
}

function calculateClimatology(
  weeklyActivity: readonly WeeklyFireActivity[],
): WeekClimatology[] {
  const valuesByWeek = new Map<number, number[]>()
  for (let weekNumber = 1; weekNumber <= ISO_WEEK_COUNT; weekNumber += 1) {
    valuesByWeek.set(weekNumber, [])
  }

  for (const activity of weeklyActivity) {
    if (activity.hasCoverage) {
      valuesByWeek.get(activity.weekNumber)?.push(activity.value)
    }
  }

  return Array.from({ length: ISO_WEEK_COUNT }, (_, index) => {
    const weekNumber = index + 1
    const values = valuesByWeek.get(weekNumber) ?? []
    const baselineYears = values.length
    if (baselineYears === 0) {
      return {
        weekNumber,
        baselineYears,
        mean: null,
        standardDeviation: null,
        insufficientBaseline: true,
      }
    }

    // The climatological mean is the average of covered values for this ISO week.
    const mean = values.reduce((total, value) => total + value, 0) / baselineYears
    // Use population standard deviation because the available years define the full baseline.
    const variance =
      values.reduce((total, value) => total + (value - mean) ** 2, 0) /
      baselineYears

    return {
      weekNumber,
      baselineYears,
      mean,
      standardDeviation: Math.sqrt(variance),
      insufficientBaseline: baselineYears < MIN_BASELINE_YEARS,
    }
  })
}

function getCriticalSeason(
  climatology: readonly WeekClimatology[],
): CriticalSeason | null {
  const eligible = climatology.filter(
    (week): week is WeekClimatology & { mean: number } =>
      week.baselineYears >= MIN_BASELINE_YEARS && week.mean !== null,
  )
  const maximumMean = eligible.reduce(
    (maximum, week) => Math.max(maximum, week.mean),
    0,
  )
  if (eligible.length === 0 || maximumMean <= 0) {
    return null
  }

  const threshold = CRITICAL_THRESHOLD * maximumMean
  const qualifyingWeeks = new Set(
    eligible
      .filter((week) => week.mean >= threshold)
      .map((week) => week.weekNumber),
  )
  if (qualifyingWeeks.size === ISO_WEEK_COUNT) {
    return {
      startWeek: 1,
      endWeek: ISO_WEEK_COUNT,
      length: ISO_WEEK_COUNT,
      wrapsAcrossYear: false,
      weeks: Array.from({ length: ISO_WEEK_COUNT }, (_, index) => index + 1),
    }
  }

  const runs: CriticalSeason[] = []
  for (const startWeek of qualifyingWeeks) {
    const previousWeek =
      startWeek === 1 ? ISO_WEEK_COUNT : startWeek - 1
    if (qualifyingWeeks.has(previousWeek)) {
      continue
    }

    const weeks: number[] = []
    let currentWeek = startWeek
    while (qualifyingWeeks.has(currentWeek) && weeks.length < ISO_WEEK_COUNT) {
      weeks.push(currentWeek)
      currentWeek = currentWeek === ISO_WEEK_COUNT ? 1 : currentWeek + 1
    }

    const endWeek = weeks[weeks.length - 1]
    runs.push({
      startWeek,
      endWeek,
      length: weeks.length,
      wrapsAcrossYear: endWeek < startWeek,
      weeks,
    })
  }

  return (
    runs.sort(
      (left, right) =>
        right.length - left.length || left.startWeek - right.startWeek,
    )[0] ?? null
  )
}

function classifyAnomaly(zScore: number | null): AnomalyClassification {
  if (zScore === null) {
    return 'Unclassified'
  }
  if (zScore >= Z_ABOVE) {
    return 'Above normal'
  }
  if (zScore <= Z_BELOW) {
    return 'Below normal'
  }
  return 'Normal'
}

export function getAnomalyColorBand(zScore: number): AnomalyColorBand {
  const clipped = Math.max(-Z_CLIP, Math.min(Z_CLIP, zScore))
  if (clipped <= -2) {
    return 'negative-3'
  }
  if (clipped <= -1) {
    return 'negative-2'
  }
  if (clipped < -0.5) {
    return 'negative-1'
  }
  if (clipped <= 0.5) {
    return 'neutral'
  }
  if (clipped < 1) {
    return 'positive-1'
  }
  if (clipped < 2) {
    return 'positive-2'
  }
  return 'positive-3'
}

export function calculateAnomalyAnalysis(
  weeklyActivity: readonly WeeklyFireActivity[],
): AnomalyAnalysis {
  const climatology = calculateClimatology(weeklyActivity)
  const climatologyByWeek = new Map(
    climatology.map((week) => [week.weekNumber, week]),
  )

  const weeks = weeklyActivity.map((activity): WeeklyAnomaly => {
    const baseline = climatologyByWeek.get(activity.weekNumber)
    const baselineYears = baseline?.baselineYears ?? 0
    const climatologicalMean = baseline?.mean ?? null
    const climatologicalStandardDeviation =
      baseline?.standardDeviation ?? null

    if (!activity.hasCoverage) {
      return {
        ...activity,
        baselineYears,
        climatologicalMean,
        climatologicalStandardDeviation,
        zScore: null,
        clippedZScore: null,
        baselineStatus: 'no-coverage',
      }
    }
    if (
      !baseline ||
      baseline.insufficientBaseline ||
      climatologicalMean === null ||
      climatologicalStandardDeviation === null
    ) {
      return {
        ...activity,
        baselineYears,
        climatologicalMean,
        climatologicalStandardDeviation,
        zScore: null,
        clippedZScore: null,
        baselineStatus: 'insufficient',
      }
    }
    if (climatologicalStandardDeviation <= 0) {
      return {
        ...activity,
        baselineYears,
        climatologicalMean,
        climatologicalStandardDeviation,
        zScore: null,
        clippedZScore: null,
        baselineStatus: 'zero-variance',
      }
    }

    // The z-score measures deviation in weekly baseline standard deviations.
    const zScore =
      (activity.value - climatologicalMean) / climatologicalStandardDeviation
    // Clipping is only for the heatmap color; retain the raw score for display and ranking.
    const clippedZScore = Math.max(-Z_CLIP, Math.min(Z_CLIP, zScore))

    return {
      ...activity,
      baselineYears,
      climatologicalMean,
      climatologicalStandardDeviation,
      zScore,
      clippedZScore,
      baselineStatus: 'scored',
    }
  })

  const scoredWeeks = weeks.filter(
    (week): week is WeeklyAnomaly & { zScore: number } =>
      week.zScore !== null,
  )
  const topAnomalies = [...scoredWeeks]
    .sort(
      (left, right) =>
        right.zScore - left.zScore || left.date.localeCompare(right.date),
    )
    .slice(0, 5)

  let latestAvailableWeek: WeeklyAnomaly | null = null
  for (const week of weeks) {
    if (week.hasCoverage) {
      latestAvailableWeek = week
    }
  }

  const coveredWeeks = weeklyActivity.filter((week) => week.hasCoverage)
  const availableIsoYears = [
    ...new Set(coveredWeeks.map((week) => week.weekYear)),
  ].sort((left, right) => left - right)
  const baselineCounts = climatology.map((week) => week.baselineYears)
  const insufficientWeekNumbers = climatology
    .filter((week) => week.insufficientBaseline)
    .map((week) => week.weekNumber)

  return {
    climatology,
    weeks,
    topAnomalies,
    latestAvailableWeek,
    latestClassification: classifyAnomaly(latestAvailableWeek?.zScore ?? null),
    criticalSeason: getCriticalSeason(climatology),
    availableIsoYears,
    minimumWeeklyBaselineYears: Math.min(...baselineCounts),
    maximumWeeklyBaselineYears: Math.max(...baselineCounts),
    insufficientWeekNumbers,
  }
}
