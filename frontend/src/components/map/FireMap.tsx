import { MapContainer, TileLayer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

export function FireMap() {
  return (
    <div className="map-frame">
      <div aria-label="Interactive global map" className="fire-map" role="application">
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
          <TileLayer
            attribution="Imagery: NASA GIBS / EOSDIS"
            maxZoom={8}
            url="https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg"
          />
        </MapContainer>
      </div>
      <div className="map-empty-label">
        <span aria-hidden="true" className="data-status-dot" />
        No fire detections plotted
      </div>
    </div>
  )
}
