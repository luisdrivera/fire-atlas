import { Flame, Globe2, Satellite, TrendingUp } from 'lucide-react'
import { StatCard } from './StatCard'

const statisticLabels = [
  { label: 'Active fire detections', icon: Flame },
  { label: 'Burning area', icon: Globe2 },
  { label: 'Days with activity', icon: TrendingUp },
  { label: 'Sensors reporting', icon: Satellite },
]

export function StatsPanel() {
  return (
    <section aria-label="Fire activity statistics" className="stats-grid">
      {statisticLabels.map(({ label, icon }) => (
        <StatCard icon={icon} key={label} label={label} />
      ))}
    </section>
  )
}
