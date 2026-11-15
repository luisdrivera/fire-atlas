import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  icon: LucideIcon
  label: string
  value: string
  description: string
  compactValue?: boolean
}

export function StatCard({
  icon: Icon,
  label,
  value,
  description,
  compactValue = false,
}: StatCardProps) {
  return (
    <article
      aria-label={`${label}: ${value}. ${description}`}
      className="stat-card"
    >
      <div className="stat-card-top">
        <span className="stat-label">{label}</span>
        <span className="stat-icon">
          <Icon aria-hidden="true" size={16} strokeWidth={1.8} />
        </span>
      </div>
      <p className={`stat-value${compactValue ? ' stat-value--compact' : ''}`}>
        {value}
      </p>
      <p className="stat-description">{description}</p>
    </article>
  )
}
