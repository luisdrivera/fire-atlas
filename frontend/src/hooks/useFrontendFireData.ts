import { useEffect, useState } from 'react'
import { loadFireManifest, loadZoneFireData } from '../services/frontendData'
import type {
  FireDataManifest,
  ZoneFireData,
  ZoneName,
} from '../types/fire'

interface FrontendFireDataState {
  manifest: FireDataManifest | null
  zone: ZoneName | null
  data: ZoneFireData | null
  isLoading: boolean
  error: string | null
  selectZone: (zone: ZoneName) => void
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected loading error occurred.'
}

export function useFrontendFireData(): FrontendFireDataState {
  const [manifest, setManifest] = useState<FireDataManifest | null>(null)
  const [zone, setZone] = useState<ZoneName | null>(null)
  const [data, setData] = useState<ZoneFireData | null>(null)
  const [isManifestLoading, setIsManifestLoading] = useState(true)
  const [isZoneLoading, setIsZoneLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void loadFireManifest(controller.signal)
      .then((loadedManifest) => {
        if (loadedManifest.zones.length === 0) {
          throw new Error('The data manifest contains no zones.')
        }
        setManifest(loadedManifest)
        setIsZoneLoading(true)
        setZone(loadedManifest.zones[0].name)
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setError(getErrorMessage(loadError))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsManifestLoading(false)
        }
      })

    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!zone) {
      return
    }

    const controller = new AbortController()
    void loadZoneFireData(zone, controller.signal)
      .then((loadedData) => setData(loadedData))
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setError(getErrorMessage(loadError))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsZoneLoading(false)
        }
      })

    return () => controller.abort()
  }, [zone])

  const selectZone = (selectedZone: ZoneName) => {
    if (selectedZone === zone) {
      return
    }
    setIsZoneLoading(true)
    setData(null)
    setError(null)
    setZone(selectedZone)
  }

  return {
    manifest,
    zone,
    data,
    isLoading: isManifestLoading || isZoneLoading,
    error,
    selectZone,
  }
}
