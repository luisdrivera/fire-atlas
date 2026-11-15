interface LoadingStateProps {
  message: string
}

export function LoadingState({ message }: LoadingStateProps) {
  return (
    <div aria-live="polite" className="loading-state" role="status">
      <span aria-hidden="true" className="loading-spinner" />
      <span>{message}</span>
    </div>
  )
}
