import { Database } from 'lucide-react'

interface EmptyStateProps {
  message: string
  title?: string
}

export function EmptyState({
  message,
  title = 'No data available',
}: EmptyStateProps) {
  return (
    <div className="empty-state" role="status">
      <span aria-hidden="true" className="empty-state-icon">
        <Database size={16} strokeWidth={1.8} />
      </span>
      <strong>{title}</strong>
      <p>{message}</p>
    </div>
  )
}
