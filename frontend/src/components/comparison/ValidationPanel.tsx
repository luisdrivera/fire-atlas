import { EmptyState } from '../common/EmptyState'
import { ErrorState } from '../common/ErrorState'
import { LoadingState } from '../common/LoadingState'
import type { CalibrationMetric, ZoneName } from '../../types/fire'

interface ValidationPanelProps {
  zone: ZoneName | null
  metrics: CalibrationMetric[] | null
  isLoading: boolean
  error: string | null
}

const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
})

function formatQuantity(quantity: CalibrationMetric['quantity']): string {
  return quantity === 'n_detections' ? 'Detections' : 'FRP'
}

export function ValidationPanel({
  zone,
  metrics,
  isLoading,
  error,
}: ValidationPanelProps) {
  if (isLoading) {
    return <LoadingState message="Loading validation metrics..." />
  }
  if (error) {
    return (
      <ErrorState
        message={error}
        title="Unable to load validation metrics"
      />
    )
  }
  if (!zone || !metrics) {
    return (
      <EmptyState message="Validation metrics will appear when the data is available." />
    )
  }

  const zoneMetrics = metrics.filter((metric) => metric.zone === zone)
  if (zoneMetrics.length === 0) {
    return (
      <EmptyState message="No validation metrics are available for this region." />
    )
  }

  return (
    <>
      <div className="validation-table-scroll">
        <table className="validation-table">
          <caption className="visually-hidden">
            Test-period sensor validation metrics
          </caption>
          <thead>
            <tr>
              <th scope="col">Day/night</th>
              <th scope="col">Quantity</th>
              <th scope="col">Training ratio</th>
              <th scope="col">Pearson</th>
              <th scope="col">Spearman</th>
              <th scope="col">MAE</th>
            </tr>
          </thead>
          <tbody>
            {zoneMetrics.map((metric) => (
              <tr key={`${metric.daynight}-${metric.quantity}`}>
                <th scope="row">
                  {metric.daynight === 'D' ? 'Day' : 'Night'}
                </th>
                <td>{formatQuantity(metric.quantity)}</td>
                <td>
                  {numberFormatter.format(
                    metric.training_ratio_modis_over_viirs,
                  )}
                </td>
                <td>{numberFormatter.format(metric.pearson_r)}</td>
                <td>{numberFormatter.format(metric.spearman_r)}</td>
                <td>{numberFormatter.format(metric.mae)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="validation-note">
        Agreement is strongest in high-activity weeks; rank agreement
        (Spearman) is lower where activity is sparse.
      </p>
    </>
  )
}
