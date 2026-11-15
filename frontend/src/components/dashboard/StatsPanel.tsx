import { CalendarDays, Flame, TrendingUp } from 'lucide-react'
import { EmptyState } from '../common/EmptyState'
import type {
  CalendarMetric,
  FireDataManifest,
  ZoneFireData,
} from '../../types/fire'
import { summarizeWeeklyActivity } from '../../utils/weeklyFireActivity'
import { StatCard } from './StatCard'

interface StatsPanelProps {
  data: ZoneFireData
  manifest: FireDataManifest
  metric: CalendarMetric
}

const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
})
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

function formatNumber(value: number): string {
  return numberFormatter.format(value)
}

function formatDate(value: string): string {
  return dateFormatter.format(new Date(`${value}T00:00:00Z`))
}

export function StatsPanel({ data, manifest, metric }: StatsPanelProps) {
  const weeklyActivity = summarizeWeeklyActivity(data, manifest, metric)
  const coveredWeeks = weeklyActivity.filter((week) => week.hasCoverage)

  if (coveredWeeks.length === 0) {
    return (
      <section aria-label="Fire activity statistics" className="stats-grid">
        <EmptyState message="No covered weeks are available for this region." />
      </section>
    )
  }

  const totalDetections = coveredWeeks.reduce(
    (total, week) => total + week.detections,
    0,
  )
  const peakWeek = coveredWeeks.reduce((peak, week) =>
    week.value > peak.value ? week : peak,
  )
  const activeWeeks = coveredWeeks.filter((week) => week.detections > 0).length
  const firstWeek = data.weeks[0]
  const lastWeek = data.weeks[data.weeks.length - 1]
  const metricLabel = metric === 'detections' ? 'detections' : 'FRP'

  return (
    <section aria-label="Fire activity statistics" className="stats-grid">
      <StatCard
        description="Across the selected date range"
        icon={Flame}
        label="VIIRS-equivalent detections"
        value={formatNumber(totalDetections)}
      />
      <StatCard
        description={`${formatNumber(peakWeek.value)} ${metricLabel}`}
        icon={TrendingUp}
        label="Peak week"
        value={formatDate(peakWeek.date)}
        compactValue
      />
      <StatCard
        description="Weeks with at least one detection"
        icon={CalendarDays}
        label="Weeks with activity"
        value={formatNumber(activeWeeks)}
      />
      <StatCard
        description="First to last reported week"
        icon={CalendarDays}
        label="Data span"
        value={`${formatDate(firstWeek)} – ${formatDate(lastWeek)}`}
        compactValue
      />
    </section>
  )
}
