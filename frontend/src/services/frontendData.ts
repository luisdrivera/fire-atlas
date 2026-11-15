import {
  ZONE_NAMES,
  type CalibrationRatio,
  type DataSourceId,
  type FireDataManifest,
  type FireDataSource,
  type ManifestZone,
  type SensorGroup,
  type SensorWeeklySeries,
  type WeekRange,
  type ZoneBounds,
  type ZoneFireData,
} from '../types/fire'
import type { ZoneName } from '../types/fire'

type TypeGuard<T> = (value: unknown) => value is T

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isWeekRange(value: unknown): value is WeekRange {
  return (
    isObject(value) &&
    typeof value.start === 'string' &&
    typeof value.end === 'string'
  )
}

function isBounds(value: unknown): value is ZoneBounds {
  return (
    isObject(value) &&
    isFiniteNumber(value.min_lat) &&
    isFiniteNumber(value.min_lon) &&
    isFiniteNumber(value.max_lat) &&
    isFiniteNumber(value.max_lon)
  )
}

function isManifestZone(value: unknown): value is ManifestZone {
  return (
    isObject(value) &&
    ZONE_NAMES.some((name) => name === value.name) &&
    isWeekRange(value.week_range) &&
    isBounds(value.bounds) &&
    typeof value.history_included === 'boolean'
  )
}

function isSourceId(value: unknown): value is DataSourceId {
  return value === 0 || value === 1
}

function isCalibrationRatio(value: unknown): value is CalibrationRatio {
  return (
    isObject(value) &&
    ZONE_NAMES.some((name) => name === value.zone) &&
    (value.daynight === 'D' || value.daynight === 'N') &&
    (value.quantity === 'n_detections' || value.quantity === 'sum_frp') &&
    isFiniteNumber(value.training_ratio_modis_over_viirs)
  )
}

function isFireDataSource(value: unknown): value is FireDataSource {
  return (
    isObject(value) &&
    isSourceId(value.id) &&
    typeof value.name === 'string'
  )
}

function isManifest(value: unknown): value is FireDataManifest {
  return (
    isObject(value) &&
    Array.isArray(value.zones) &&
    value.zones.every(isManifestZone) &&
    isFiniteNumber(value.grid_size_degrees) &&
    isWeekRange(value.week_range) &&
    typeof value.history_included === 'boolean' &&
    Array.isArray(value.ratios_used) &&
    value.ratios_used.every(isCalibrationRatio) &&
    Array.isArray(value.sources) &&
    value.sources.every(isFireDataSource) &&
    Array.isArray(value.notes) &&
    value.notes.every((note) => typeof note === 'string')
  )
}

function isFireCell(value: unknown): boolean {
  return (
    isObject(value) &&
    Number.isInteger(value.id) &&
    isFiniteNumber(value.lat) &&
    isFiniteNumber(value.lon)
  )
}

function isFireRecord(value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== 7) {
    return false
  }
  const record: unknown[] = value
  return record.slice(0, 6).every(isFiniteNumber) && isSourceId(record[6])
}

function isSeries(value: unknown, weekCount: number): value is SensorWeeklySeries {
  if (!isObject(value)) {
    return false
  }
  const isAlignedSeries = (series: unknown): series is Array<number | null> =>
    Array.isArray(series) &&
    series.length === weekCount &&
    series.every((item) => item === null || isFiniteNumber(item))

  return (
    isAlignedSeries(value.n_detections) &&
    isAlignedSeries(value.sum_frp)
  )
}

function isZoneFireData(value: unknown): value is ZoneFireData {
  if (
    !isObject(value) ||
    !Array.isArray(value.cells) ||
    !value.cells.every(isFireCell) ||
    !Array.isArray(value.weeks) ||
    !value.weeks.every((week) => typeof week === 'string') ||
    !Array.isArray(value.records) ||
    !value.records.every(isFireRecord)
  ) {
    return false
  }

  const sensorSeries = value.sensor_series
  if (!isObject(sensorSeries)) {
    return false
  }
  const weekCount = value.weeks.length
  const sensorGroups: SensorGroup[] = [
    'MODIS_AQUA',
    'VIIRS_N20',
    'VIIRS_SNPP',
  ]
  return sensorGroups.every((sensor) =>
    isSeries(sensorSeries[sensor], weekCount),
  )
}

async function fetchJson<T>(
  path: string,
  isExpectedShape: TypeGuard<T>,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch(path, { signal })
  if (!response.ok) {
    throw new Error(`Failed to load ${path} (${response.status}).`)
  }

  const payload: unknown = await response.json()
  if (!isExpectedShape(payload)) {
    throw new Error(`Unexpected JSON structure in ${path}.`)
  }
  return payload
}

export function loadFireManifest(signal: AbortSignal): Promise<FireDataManifest> {
  return fetchJson('/data/manifest.json', isManifest, signal)
}

export function loadZoneFireData(
  zone: ZoneName,
  signal: AbortSignal,
): Promise<ZoneFireData> {
  return fetchJson(`/data/${zone}.json`, isZoneFireData, signal)
}
