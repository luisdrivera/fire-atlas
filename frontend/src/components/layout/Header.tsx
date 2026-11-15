import { Menu } from 'lucide-react'
import type { ApiHealthState } from '../../hooks/useApiHealth'

interface HeaderProps {
  connectionStatus: ApiHealthState
  isMenuOpen: boolean
  onMenuClick: () => void
}

const connectionLabels: Record<ApiHealthState, string> = {
  connecting: 'Connecting',
  connected: 'Connected',
  offline: 'Offline',
}

export function Header({
  connectionStatus,
  isMenuOpen,
  onMenuClick,
}: HeaderProps) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          aria-controls="main-navigation"
          aria-expanded={isMenuOpen}
          aria-label="Open navigation menu"
          className="menu-toggle"
          onClick={onMenuClick}
          type="button"
        >
          <Menu aria-hidden="true" size={18} />
        </button>
        <div className="topbar-context">
          <strong>FIRE ATLAS</strong>
          <span aria-hidden="true">/</span>
          <span>Fire activity dashboard</span>
        </div>
      </div>
      <div className="topbar-right">
        <div
          aria-live="polite"
          className="connection-status"
          role="status"
        >
          <span
            aria-hidden="true"
            className={`status-dot status-dot--${connectionStatus}`}
          />
          <span>Backend {connectionLabels[connectionStatus]}</span>
        </div>
      </div>
    </header>
  )
}
