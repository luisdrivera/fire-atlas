import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  icon: LucideIcon
  label: string
}

export function StatCard({ icon: Icon, label }: StatCardProps) {
  return (
    <article aria-label={`${label}: no data loaded`} className="stat-card">
      <div className="stat-card-top">
        <span className="stat-label">{label}</span>
        <span className="stat-icon">
          <Icon aria-hidden="true" size={16} strokeWidth={1.8} />
        </span>
      </div>
      <p className="stat-value">—</p>
      <p className="stat-description">No data loaded</p>
    </article>
  )
}
