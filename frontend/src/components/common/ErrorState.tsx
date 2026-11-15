import { TriangleAlert } from 'lucide-react'

interface ErrorStateProps {
  message: string
  title: string
}

export function ErrorState({ message, title }: ErrorStateProps) {
  return (
    <div className="state-banner" role="alert">
      <TriangleAlert
        aria-hidden="true"
        className="state-banner-icon"
        size={17}
      />
      <div>
        <strong>{title}</strong>
        <p>{message}</p>
      </div>
    </div>
  )
}
