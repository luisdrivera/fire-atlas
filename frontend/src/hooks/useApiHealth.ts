import { useEffect, useState } from 'react'
import { fetchApiHealth } from '../services/api'

export type ApiHealthState = 'connecting' | 'connected' | 'offline'

export function useApiHealth(): ApiHealthState {
  const [status, setStatus] = useState<ApiHealthState>('connecting')

  useEffect(() => {
    const controller = new AbortController()

    const checkHealth = () => {
      void fetchApiHealth(controller.signal)
        .then(() => setStatus('connected'))
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') {
            return
          }
          setStatus('offline')
        })
    }

    checkHealth()
    const intervalId = window.setInterval(checkHealth, 30_000)

    return () => {
      controller.abort()
      window.clearInterval(intervalId)
    }
  }, [])

  return status
}
