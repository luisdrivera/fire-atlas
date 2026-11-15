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
import type { SensorComparisonPoint } from '../../types/fire'

interface SensorComparisonChartProps {
  data: readonly SensorComparisonPoint[]
}

interface ChartTooltipProps {
  active?: boolean
  label?: string
  payload?: Array<{
    color?: string
    dataKey?: string
    value?: number | string
  }>
}

function ChartTooltip({ active, label, payload }: ChartTooltipProps) {
  if (!active || !payload?.length) {
    return null
  }

  return (
    <div className="chart-tooltip">
      <p>{label}</p>
      {payload.map((item) => {
        const sensorClass =
          item.dataKey === 'modis' ? 'tooltip-modis' : 'tooltip-viirs'
        const sensorLabel = item.dataKey === 'modis' ? 'MODIS' : 'VIIRS'

        return (
          <p className={sensorClass} key={item.dataKey}>
            {sensorLabel}: {item.value}
          </p>
        )
      })}
    </div>
  )
}

export function SensorComparisonChart({ data }: SensorComparisonChartProps) {
  if (data.length === 0) {
    return (
      <EmptyState message="MODIS and VIIRS detections will be compared here when observations are available." />
    )
  }

  return (
    <>
      <div aria-label="Sensor legend" className="sensor-legend">
        <span className="sensor-badge sensor-badge--modis">
          <Flame aria-hidden="true" size={13} />
          <strong>MODIS</strong>
          <span>Active fire</span>
        </span>
        <span className="sensor-badge sensor-badge--viirs">
          <Satellite aria-hidden="true" size={13} />
          <strong>VIIRS</strong>
          <span>Active fire</span>
        </span>
      </div>
      <div className="comparison-chart">
        <ResponsiveContainer height="100%" width="100%">
          <LineChart data={[...data]} margin={{ top: 5, right: 7, bottom: 0, left: -20 }}>
            <CartesianGrid
              stroke="var(--color-chart-grid)"
              strokeDasharray="3 4"
              vertical={false}
            />
            <XAxis
              axisLine={false}
              dataKey="date"
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
              dataKey="modis"
              dot={false}
              name="MODIS"
              stroke="var(--sensor-modis)"
              strokeWidth={2}
              type="monotone"
            />
            <Line
              activeDot={{ r: 3 }}
              dataKey="viirs"
              dot={false}
              name="VIIRS"
              stroke="var(--sensor-viirs)"
              strokeWidth={2}
              type="monotone"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  )
}
