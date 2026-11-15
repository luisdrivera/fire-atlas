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
          minZoom={2}
          scrollWheelZoom
          zoom={2}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
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
