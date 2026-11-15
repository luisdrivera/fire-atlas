import { useEffect, useMemo } from 'react'
import type { LatLngBoundsExpression } from 'leaflet'
import {
  MapContainer,
  Rectangle,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { CalendarMetric, ZoneFireData } from '../../types/fire'

interface FireMapProps {
  data: ZoneFireData | null
  gridSize: number | null
  metric: CalendarMetric
}

interface MappedFireCell {
  id: number
  value: number
  level: number
  bounds: LatLngBoundsExpression
}

function getActivityLevel(value: number, maxValue: number): number {
  return Math.min(4, Math.ceil((value / maxValue) * 4))
}

function MapBounds({ bounds }: { bounds: LatLngBoundsExpression | null }) {
  const map = useMap()

  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [16, 16], maxZoom: 8 })
    }
  }, [bounds, map])

  return null
}

export function FireMap({ data, gridSize, metric }: FireMapProps) {
  const cellTotals = useMemo(() => {
    if (!data) {
      return []
    }

    const totals = data.cells.map(() => 0)
    for (const record of data.records) {
      const [cellIndex, , nDay, nNight, frpDay, frpNight] = record
      totals[cellIndex] +=
        metric === 'detections' ? nDay + nNight : frpDay + frpNight
    }
    return totals
  }, [data, metric])

  const maxCellTotal = cellTotals.reduce(
    (maximum, value) => Math.max(maximum, value),
    0,
  )

  const activeCells = useMemo((): MappedFireCell[] => {
    if (!data || gridSize === null || maxCellTotal <= 0) {
      return []
    }

    return data.cells.flatMap((cell, index) => {
      const value = cellTotals[index]
      if (value <= 0) {
        return []
      }

      return [
        {
          id: cell.id,
          value,
          level: getActivityLevel(value, maxCellTotal),
          bounds: [
            [cell.lat, cell.lon],
            [cell.lat + gridSize, cell.lon + gridSize],
          ],
        },
      ]
    })
  }, [cellTotals, data, gridSize, maxCellTotal])

  const zoneBounds = useMemo((): LatLngBoundsExpression | null => {
    if (!data || gridSize === null || data.cells.length === 0) {
      return null
    }

    const extent = data.cells.reduce(
      (bounds, cell) => ({
        minLat: Math.min(bounds.minLat, cell.lat),
        minLon: Math.min(bounds.minLon, cell.lon),
        maxLat: Math.max(bounds.maxLat, cell.lat + gridSize),
        maxLon: Math.max(bounds.maxLon, cell.lon + gridSize),
      }),
      {
        minLat: Number.POSITIVE_INFINITY,
        minLon: Number.POSITIVE_INFINITY,
        maxLat: Number.NEGATIVE_INFINITY,
        maxLon: Number.NEGATIVE_INFINITY,
      },
    )

    return [
      [extent.minLat, extent.minLon],
      [extent.maxLat, extent.maxLon],
    ]
  }, [data, gridSize])

  const numberFormatter = useMemo(
    () => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }),
    [],
  )
  const metricLabel = metric === 'detections' ? 'detections' : 'FRP'

  return (
    <div className="map-frame">
      <div
        aria-label="Interactive fire activity map"
        className="fire-map"
        role="application"
      >
        <MapContainer
          center={[18, 0]}
          maxBounds={[
            [-85, -180],
            [85, 180],
          ]}
          maxBoundsViscosity={1}
          maxZoom={8}
          minZoom={2}
          scrollWheelZoom
          zoom={2}
        >
          <MapBounds bounds={zoneBounds} />
          <TileLayer
            attribution="Imagery: NASA GIBS / EOSDIS"
            maxZoom={8}
            url="https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg"
          />
          {activeCells.map((cell) => (
            <Rectangle
              key={cell.id}
              bounds={cell.bounds}
              pathOptions={{
                color: 'var(--color-calendar-stroke)',
                fillColor: `var(--color-calendar-${cell.level})`,
                fillOpacity: 0.82,
                weight: 0.5,
              }}
            >
              <Tooltip sticky>
                <span>Cell {cell.id}</span>
                <strong>
                  {numberFormatter.format(cell.value)} {metricLabel}
                </strong>
              </Tooltip>
            </Rectangle>
          ))}
        </MapContainer>
      </div>
      {data && activeCells.length === 0 && (
        <div className="map-empty-label" role="status">
          <span aria-hidden="true" className="data-status-dot" />
          No fire detections plotted
        </div>
      )}
    </div>
  )
}
