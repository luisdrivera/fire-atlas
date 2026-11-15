import { useEffect, useState } from 'react'
import { loadCalibrationMetrics } from '../services/frontendData'
import type { CalibrationMetric } from '../types/fire'

interface CalibrationMetricsState {
  metrics: CalibrationMetric[] | null
  isLoading: boolean
  error: string | null
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'An unexpected loading error occurred.'
}

export function useCalibrationMetrics(): CalibrationMetricsState {
  const [metrics, setMetrics] = useState<CalibrationMetric[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void loadCalibrationMetrics(controller.signal)
      .then(setMetrics)
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setError(getErrorMessage(loadError))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      })

    return () => controller.abort()
  }, [])

  return { metrics, isLoading, error }
}
