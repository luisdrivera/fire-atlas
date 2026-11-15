import { useState } from 'react'
import { BurningCalendar } from './components/calendar/BurningCalendar'
import { ErrorState } from './components/common/ErrorState'
import { LoadingState } from './components/common/LoadingState'
import { SensorComparisonChart } from './components/comparison/SensorComparisonChart'
import { StatsPanel } from './components/dashboard/StatsPanel'
import { Header } from './components/layout/Header'
import { Sidebar } from './components/layout/Sidebar'
import { FireMap } from './components/map/FireMap'
import { useApiHealth } from './hooks/useApiHealth'
import { useFrontendFireData } from './hooks/useFrontendFireData'
import type { CalendarMetric } from './types/fire'
import './App.css'

function formatZoneName(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [metric, setMetric] = useState<CalendarMetric>('detections')
  const connectionStatus = useApiHealth()
  const {
    manifest,
    zone,
    data,
    isLoading,
    error,
    selectZone,
  } = useFrontendFireData()

  const handleZoneChange = (value: string) => {
    const selected = manifest?.zones.find((item) => item.name === value)
    if (selected) {
      selectZone(selected.name)
    }
  }

  const handleMetricChange = (value: string) => {
    if (value === 'detections' || value === 'frp') {
      setMetric(value)
    }
  }

  return (
    <div className="app-shell">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      {sidebarOpen && (
        <button
          aria-label="Close navigation menu"
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          type="button"
        />
      )}

      <div className="app-main">
        <Header
          connectionStatus={connectionStatus}
          isMenuOpen={sidebarOpen}
          onMenuClick={() => setSidebarOpen(true)}
        />
        <main className="dashboard-content" id="overview">
          {connectionStatus === 'connecting' && (
            <LoadingState message="Checking backend connection..." />
          )}
          {connectionStatus === 'offline' && (
            <ErrorState
              message="The dashboard is available, but the backend health endpoint could not be reached."
              title="Backend unavailable"
            />
          )}

          <section aria-labelledby="overview-title" className="welcome-section">
            <div>
              <p className="eyebrow">GLOBAL FIRE MONITORING</p>
              <h1 id="overview-title">Fire activity overview</h1>
              <p className="welcome-copy">
                Historical active fire detections from NASA satellite sensors.
              </p>
            </div>
            <div className="dashboard-toolbar">
              {manifest && zone && (
                <label className="dashboard-control" htmlFor="zone-select">
                  Region
                  <select
                    id="zone-select"
                    onChange={(event) =>
                      handleZoneChange(event.currentTarget.value)
                    }
                    value={zone}
                  >
                    {manifest.zones.map((item) => (
                      <option key={item.name} value={item.name}>
                        {formatZoneName(item.name)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="dashboard-control" htmlFor="metric-select">
                Metric
                <select
                  id="metric-select"
                  onChange={(event) =>
                    handleMetricChange(event.currentTarget.value)
                  }
                  value={metric}
                >
                  <option value="detections">Detections</option>
                  <option value="frp">FRP</option>
                </select>
              </label>
            </div>
          </section>

          {isLoading && <LoadingState message="Loading fire activity data..." />}
          {error && (
            <ErrorState
              message={error}
              title="Unable to load public fire data"
            />
          )}
          {manifest && !manifest.history_included && (
            <div className="history-warning" role="note">
              <span aria-hidden="true" className="history-warning-mark">
                !
              </span>
              <span>Pre-2018 MODIS history not included</span>
            </div>
          )}
          {manifest && (
            <details className="method-notes">
              <summary>Method notes</summary>
              <ul>
                {manifest.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </details>
          )}

          {manifest && data && (
            <StatsPanel data={data} manifest={manifest} metric={metric} />
          )}

          <section aria-labelledby="map-title" className="dashboard-section" id="map">
            <div className="section-heading">
              <div>
                <p className="eyebrow">GEOGRAPHIC DISTRIBUTION</p>
                <h2 id="map-title">Global fire map</h2>
              </div>
              <span className="section-meta">WORLDWIDE</span>
            </div>
            <FireMap />
          </section>

          <div className="analysis-grid">
            <section
              aria-labelledby="calendar-title"
              className="dashboard-section analysis-panel"
              id="calendar"
            >
              <div className="section-heading">
                <div>
                  <p className="eyebrow">HISTORICAL PATTERNS</p>
                  <h2 id="calendar-title">Burning Activity Calendar</h2>
                </div>
                <span className="section-meta">
                  {metric === 'detections' ? 'DETECTIONS' : 'FRP'}
                </span>
              </div>
              {manifest && data && (
                <BurningCalendar
                  data={data}
                  manifest={manifest}
                  metric={metric}
                />
              )}
            </section>

            <section
              aria-labelledby="comparison-title"
              className="dashboard-section analysis-panel"
              id="comparison"
            >
              <div className="section-heading">
                <div>
                  <p className="eyebrow">SENSOR COVERAGE</p>
                  <h2 id="comparison-title">MODIS vs VIIRS</h2>
                </div>
                <span aria-hidden="true" className="panel-icon">vs</span>
              </div>
              <SensorComparisonChart data={[]} />
            </section>
          </div>

          <footer className="dashboard-footer">
            <span>NASA FIRMS data integration is not yet available.</span>
            <span>FIRE ATLAS · SCIENTIFIC DATA VISUALIZATION</span>
          </footer>
        </main>
      </div>

      <aside aria-label="Implementation status" className="harmonization-notice">
        <span aria-hidden="true" className="notice-mark">!</span>
        <span>Harmonization: proof of concept</span>
      </aside>
    </div>
  )
}

export default App
