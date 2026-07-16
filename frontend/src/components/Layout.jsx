import { Outlet, Link, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore'
import { useState } from 'react'

const navItems = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  { path: '/templates', label: 'Templates', icon: '📁' },
  { path: '/scan', label: 'Scan', icon: '📷' },
  { path: '/storages', label: 'Storage', icon: '🗄️' },
  { path: '/movements', label: 'Movement', icon: '📋' },
  { path: '/petboards', label: 'Petboard', icon: '🧩' },
]

export default function Layout() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  return (
    <div className="min-h-screen flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-gray-600 bg-opacity-75 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-primary-800 transform transition-transform lg:translate-x-0 lg:static lg:inset-auto ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between h-16 px-4 border-b border-primary-700">
          <Link to="/" className="flex items-center space-x-2">
            <span className="text-white text-xl font-bold">CNC Tracker</span>
          </Link>
          <button className="text-white lg:hidden" onClick={() => setSidebarOpen(false)}>
            ✕
          </button>
        </div>

        <nav className="mt-4 space-y-1 px-2">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive(item.path)
                  ? 'bg-primary-900 text-white'
                  : 'text-primary-100 hover:bg-primary-700 hover:text-white'
              }`}
            >
              <span className="mr-3 text-lg">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-primary-700">
          <div className="flex items-center justify-between">
            <div className="text-sm text-primary-100 truncate">
              <p className="font-medium">{user?.full_name || user?.username}</p>
              <p className="text-primary-300 capitalize">{user?.role}</p>
            </div>
            <button onClick={logout} className="text-primary-300 hover:text-white text-sm px-2 py-1 rounded hover:bg-primary-700 transition-colors">
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top header */}
        <header className="sticky top-0 z-30 bg-white shadow-sm border-b border-gray-200 lg:hidden">
          <div className="flex items-center justify-between h-14 px-4">
            <button onClick={() => setSidebarOpen(true)} className="text-gray-600 hover:text-gray-900">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="font-semibold text-gray-900">CNC Tracker</span>
            <div className="w-6" />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}