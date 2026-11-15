import { Activity, Flame, Layers3, Map, Menu, X } from 'lucide-react'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

const navigationItems = [
  { href: '#overview', label: 'Overview', icon: Activity },
  { href: '#map', label: 'Global map', icon: Map },
  { href: '#calendar', label: 'Burning calendar', icon: Layers3 },
  { href: '#comparison', label: 'Sensor comparison', icon: Flame },
]

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  return (
    <aside
      aria-label="Main navigation"
      className={`sidebar${isOpen ? ' sidebar--open' : ''}`}
      id="main-navigation"
    >
      <div className="sidebar-heading-row">
        <a
          aria-label="FIRE ATLAS home"
          className="brand-lockup"
          href="#overview"
          onClick={onClose}
        >
          <span className="brand-mark">
            <Flame aria-hidden="true" size={20} />
          </span>
          <span>
            <span className="brand-name">FIRE ATLAS</span>
            <span className="brand-subtitle">EARTH OBSERVATION</span>
          </span>
        </a>
        <button
          aria-label="Close navigation menu"
          className="sidebar-close"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" size={17} />
        </button>
      </div>

      <p className="nav-label">WORKSPACE</p>
      <nav aria-label="Dashboard sections" className="side-nav">
        {navigationItems.map(({ href, label, icon: Icon }, index) => (
          <a
            aria-current={index === 0 ? 'page' : undefined}
            className="nav-link"
            href={href}
            key={href}
            onClick={onClose}
          >
            <Icon aria-hidden="true" size={16} strokeWidth={1.8} />
            <span>{label}</span>
          </a>
        ))}
      </nav>

      <div className="sidebar-spacer" />
      <div className="sidebar-footnote">
        <span aria-hidden="true" className="footnote-mark">
          <Menu size={12} />
        </span>
        <span>NASA FIRMS · MODIS + VIIRS</span>
      </div>
    </aside>
  )
}
