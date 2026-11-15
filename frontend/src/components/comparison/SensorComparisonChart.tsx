import { Flame, Satellite } from 'lucide-react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { EmptyState } from '../common/EmptyState'
import { ErrorState } from '../common/ErrorState'
import { LoadingState } from '../common/LoadingState'
import type {
  CalendarMetric,
  SensorGroup,
  ZoneFireData,
} from '../../types/fire'

interface SensorComparisonChartProps {
  data: ZoneFireData | null
  metric: CalendarMetric
  isLoading: boolean
  error: string | null
}

interface SensorChartPoint {
  date: string
  MODIS_AQUA: number | null
  VIIRS_N20: number | null
  VIIRS_SNPP: number | null
}

interface ChartTooltipProps {
  active?: boolean
  label?: string
  payload?: Array<{
    color?: string
    dataKey?: string
    value?: number | string | null
  }>
}

const sensorGroups: SensorGroup[] = [
  'MODIS_AQUA',
  'VIIRS_N20',
  'VIIRS_SNPP',
]
const sensorLabels: Record<SensorGroup, string> = {
  MODIS_AQUA: 'MODIS Aqua',
  VIIRS_N20: 'VIIRS NOAA-20',
  VIIRS_SNPP: 'VIIRS S-NPP',
}
const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
})

function ChartTooltip({ active, label, payload }: ChartTooltipProps) {
  if (!active || !payload?.length) {
    return null
  }

  return (
    <div className="chart-tooltip">
      <p>{label}</p>
      {payload.map((item, index) => {
        const group = sensorGroups.find((sensor) => sensor === item.dataKey)
        if (item.value === null || item.value === undefined || !group) {
          return null
        }

        return (
          <p
            className={`chart-tooltip-line chart-tooltip-line--${group.toLowerCase()}`}
            key={`${group}-${index}`}
          >
            {sensorLabels[group]}: {numberFormatter.format(Number(item.value))}
          </p>
        )
      })}
    </div>
  )
}

export function SensorComparisonChart({
  data,
  metric,
  isLoading,
  error,
}: SensorComparisonChartProps) {
  const hasFrpSeries =
    data !== null &&
    sensorGroups.every(
      (sensor) =>
        data.sensor_series[sensor].sum_frp?.length === data.weeks.length,
    )
  const useFrp = metric === 'frp' && hasFrpSeries
  const subtitle =
    'Raw weekly totals per sensor (not calibrated)' +
    (metric === 'frp' && !hasFrpSeries
      ? ' · FRP unavailable; showing detections.'
      : '')

  let chartState = null
  let chartData: SensorChartPoint[] = []
  if (isLoading) {
    chartState = <LoadingState message="Loading weekly sensor totals..." />
  } else if (error) {
    chartState = (
      <ErrorState message={error} title="Unable to load sensor totals" />
    )
  } else if (!data || data.weeks.length === 0) {
    chartState = (
      <EmptyState message="Weekly sensor totals will appear when observations are available." />
    )
  } else {
    chartData = data.weeks.map((date, weekIndex) => ({
      date,
      MODIS_AQUA: useFrp
        ? (data.sensor_series.MODIS_AQUA.sum_frp?.[weekIndex] ?? null)
        : data.sensor_series.MODIS_AQUA.n_detections[weekIndex],
      VIIRS_N20: useFrp
        ? (data.sensor_series.VIIRS_N20.sum_frp?.[weekIndex] ?? null)
        : data.sensor_series.VIIRS_N20.n_detections[weekIndex],
      VIIRS_SNPP: useFrp
        ? (data.sensor_series.VIIRS_SNPP.sum_frp?.[weekIndex] ?? null)
        : data.sensor_series.VIIRS_SNPP.n_detections[weekIndex],
    }))
    const hasObservations = chartData.some((point) =>
      sensorGroups.some((sensor) => point[sensor] !== null),
    )
    if (!hasObservations) {
      chartState = (
        <EmptyState message="No weekly sensor totals are available for this region." />
      )
    }
  }

  return (
    <>
      <p className="chart-subtitle">{subtitle}</p>
      {chartState ?? (
        <>
          <div aria-label="Sensor legend" className="sensor-legend">
            <span className="sensor-badge sensor-badge--modis">
              <Flame aria-hidden="true" size={13} />
              <strong>MODIS Aqua</strong>
            </span>
            <span className="sensor-badge sensor-badge--viirs-n20">
              <Satellite aria-hidden="true" size={13} />
              <strong>VIIRS NOAA-20</strong>
            </span>
            <span className="sensor-badge sensor-badge--viirs-snpp">
              <Satellite aria-hidden="true" size={13} />
              <strong>VIIRS S-NPP</strong>
            </span>
          </div>
          <div
            aria-label="Raw weekly totals per sensor"
            className="comparison-chart"
            role="img"
          >
            <ResponsiveContainer height="100%" width="100%">
              <LineChart
                data={chartData}
                margin={{ top: 5, right: 7, bottom: 0, left: -20 }}
              >
                <CartesianGrid
                  stroke="var(--color-chart-grid)"
                  strokeDasharray="3 4"
                  vertical={false}
                />
                <XAxis
                  axisLine={false}
                  dataKey="date"
                  interval="preserveStartEnd"
                  tick={{ fill: 'var(--color-text-muted)', fontSize: 9 }}
                  tickLine={false}
                />
                <YAxis
                  axisLine={false}
                  tick={{ fill: 'var(--color-text-muted)', fontSize: 9 }}
                  tickLine={false}
                  width={38}
                />
                <Tooltip content={<ChartTooltip />} />
                <Line
                  activeDot={{ r: 3 }}
                  connectNulls={false}
                  dataKey="MODIS_AQUA"
                  dot={false}
                  name={sensorLabels.MODIS_AQUA}
                  stroke="var(--sensor-modis)"
                  strokeWidth={2}
                  type="linear"
                />
                <Line
                  activeDot={{ r: 3 }}
                  connectNulls={false}
                  dataKey="VIIRS_N20"
                  dot={false}
                  name={sensorLabels.VIIRS_N20}
                  stroke="var(--sensor-viirs)"
                  strokeWidth={2}
                  type="linear"
                />
                <Line
                  activeDot={{ r: 3 }}
                  connectNulls={false}
                  dataKey="VIIRS_SNPP"
                  dot={false}
                  name={sensorLabels.VIIRS_SNPP}
                  stroke="var(--sensor-viirs-light)"
                  strokeDasharray="5 4"
                  strokeWidth={2}
                  type="linear"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </>
  )
}
