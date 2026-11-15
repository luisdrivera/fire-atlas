export const ZONE_NAMES = ['hispaniola', 'mato_grosso'] as const

export type ZoneName = (typeof ZONE_NAMES)[number]
export type DataSourceId = 0 | 1
export type CalendarMetric = 'detections' | 'frp'
export type SensorGroup = 'MODIS_AQUA' | 'VIIRS_N20' | 'VIIRS_SNPP'

export interface WeekRange {
  start: string
  end: string
}

export interface ZoneBounds {
  min_lat: number
  min_lon: number
  max_lat: number
  max_lon: number
}

export interface ManifestZone {
  name: ZoneName
  week_range: WeekRange
  bounds: ZoneBounds
  history_included: boolean
}

export interface CalibrationRatio {
  zone: ZoneName
  daynight: 'D' | 'N'
  quantity: 'n_detections' | 'sum_frp'
  training_ratio_modis_over_viirs: number
}

export interface FireDataSource {
  id: DataSourceId
  name: string
}

export interface FireDataManifest {
  zones: ManifestZone[]
  grid_size_degrees: number
  week_range: WeekRange
  history_included: boolean
  ratios_used: CalibrationRatio[]
  sources: FireDataSource[]
  notes: string[]
}

export interface FireCell {
  id: number
  lat: number
  lon: number
}

export type FireDataRecord = readonly [
  cellIndex: number,
  weekIndex: number,
  nDay: number,
  nNight: number,
  frpDay: number,
  frpNight: number,
  source: DataSourceId,
]

export interface SensorWeeklySeries {
  n_detections: Array<number | null>
  sum_frp: Array<number | null>
}

export interface ZoneFireData {
  cells: FireCell[]
  weeks: string[]
  records: FireDataRecord[]
  sensor_series: Record<SensorGroup, SensorWeeklySeries>
}

export interface WeeklyFireActivity {
  date: string
  weekYear: number
  weekNumber: number
  detections: number
  frp: number
  value: number
  source: DataSourceId
  hasCoverage: boolean
}

export type FireSensor = 'MODIS' | 'VIIRS'

export interface BurningActivityRecord {
  date: string
  detections: number
}

export interface SensorComparisonPoint {
  date: string
  modis: number
  viirs: number
}
