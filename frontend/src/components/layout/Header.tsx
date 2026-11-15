import { Menu } from 'lucide-react'

interface HeaderProps {
  isMenuOpen: boolean
  onMenuClick: () => void
}

export function Header({
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
        <div aria-label="Data source: static files" className="static-data-badge">
          <span aria-hidden="true" className="static-data-dot" />
          <span>Static data</span>
        </div>
      </div>
    </header>
  )
}
