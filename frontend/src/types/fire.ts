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
