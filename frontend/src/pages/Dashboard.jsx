import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import client from '../api/client'

export default function Dashboard() {
  const [stats, setStats] = useState({
    total_templates: 0,
    available: 0,
    in_use: 0,
    maintenance: 0,
    scrapped: 0,
    total_storages: 0,
    recent_movements: []
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboard()
  }, [])

  const loadDashboard = async () => {
    try {
      const [templatesRes, storagesRes, movementsRes] = await Promise.all([
        client.get('/templates'),
        client.get('/storages'),
        client.get('/movements?limit=10')
      ])

      const templates = templatesRes.data
      setStats({
        total_templates: templates.length,
        available: templates.filter(t => t.status === 'available').length,
        in_use: templates.filter(t => t.status === 'in_use').length,
        maintenance: templates.filter(t => t.status === 'maintenance').length,
        scrapped: templates.filter(t => t.status === 'scrapped').length,
        total_storages: storagesRes.data.length,
        recent_movements: movementsRes.data.slice(0, 10)
      })
    } catch (err) {
      console.error('Dashboard load error:', err)
    } finally {
      setLoading(false)
    }
  }

  const statCards = [
    { label: 'Total Template', value: stats.total_templates, color: 'bg-blue-500', icon: '📁' },
    { label: 'Available', value: stats.available, color: 'bg-green-500', icon: '✅' },
    { label: 'In Use', value: stats.in_use, color: 'bg-yellow-500', icon: '🔧' },
    { label: 'Maintenance', value: stats.maintenance, color: 'bg-orange-500', icon: '⚠️' },
    { label: 'Scrapped', value: stats.scrapped, color: 'bg-red-500', icon: '🗑️' },
    { label: 'Storage', value: stats.total_storages, color: 'bg-purple-500', icon: '🗄️' },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <Link to="/scan" className="btn btn-primary">
          📷 Scan QR
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="card">
            <div className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-2xl">{card.icon}</span>
                <span className={`text-xs font-medium text-white px-2 py-1 rounded-full ${card.color}`}>
                  {card.value}
                </span>
              </div>
              <p className="mt-2 text-sm font-medium text-gray-600">{card.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="card">
        <div className="card-body">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Link to="/templates/new" className="btn btn-secondary text-center">📝 Tambah Template</Link>
            <Link to="/scan" className="btn btn-secondary text-center">📷 Scan QR Code</Link>
            <Link to="/storages" className="btn btn-secondary text-center">🗄️ Kelola Storage</Link>
            <Link to="/movements" className="btn btn-secondary text-center">📋 Riwayat Movement</Link>
          </div>
        </div>
      </div>

      {/* Recent Movements */}
      <div className="card">
        <div className="card-body">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Movement Terbaru</h2>
          {stats.recent_movements.length === 0 ? (
            <p className="text-gray-500 text-sm">Belum ada movement tercatat</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Template</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Operator</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Waktu</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {stats.recent_movements.map((mov) => (
                    <tr key={mov.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{mov.template_code || `ID: ${mov.template_id}`}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          mov.type === 'distribute' ? 'bg-yellow-100 text-yellow-800' :
                          mov.type === 'return' ? 'bg-green-100 text-green-800' :
                          mov.type === 'maintenance_in' ? 'bg-orange-100 text-orange-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {mov.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{mov.operator_name || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{new Date(mov.created_at).toLocaleString('id-ID')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}