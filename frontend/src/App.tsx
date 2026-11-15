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
import type { BurningActivityRecord, SensorComparisonPoint } from './types/fire'
import './App.css'

const burningActivity: BurningActivityRecord[] = []
const sensorComparison: SensorComparisonPoint[] = []

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const connectionStatus = useApiHealth()

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
            <div className="data-status">
              <span aria-hidden="true" className="data-status-dot" />
              Awaiting data
            </div>
          </section>

          <StatsPanel />

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
                <span aria-hidden="true" className="panel-icon">DOY</span>
              </div>
              <BurningCalendar data={burningActivity} />
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
              <SensorComparisonChart data={sensorComparison} />
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
        <span>Harmonization method: not implemented yet</span>
      </aside>
    </div>
  )
}

export default App
