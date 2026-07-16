import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import client from '../api/client'
import toast from 'react-hot-toast'

const STATUS_LABELS = {
  available: { label: 'Available', color: 'bg-green-100 text-green-800' },
  in_use: { label: 'In Use', color: 'bg-yellow-100 text-yellow-800' },
  maintenance: { label: 'Maintenance', color: 'bg-orange-100 text-orange-800' },
  scrapped: { label: 'Scrapped', color: 'bg-red-100 text-red-800' },
}

export default function TemplateList() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    loadTemplates()
  }, [statusFilter])

  const loadTemplates = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.append('status', statusFilter)
      const res = await client.get(`/templates?${params}`)
      setTemplates(res.data)
    } catch {
      toast.error('Gagal memuat data template')
    } finally {
      setLoading(false)
    }
  }

  const filtered = templates.filter(t =>
    t.code.toLowerCase().includes(search.toLowerCase()) ||
    (t.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (t.part_number || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Templates</h1>
        <Link to="/templates/new" className="btn btn-primary">+ Tambah</Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari kode, nama, part number..."
          className="input-field max-w-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input-field max-w-xs"
        >
          <option value="">Semua Status</option>
          <option value="available">Available</option>
          <option value="in_use">In Use</option>
          <option value="maintenance">Maintenance</option>
          <option value="scrapped">Scrapped</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <div className="card-body text-center text-gray-500">Tidak ada data template ditemukan</div>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kode</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nama</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Part No</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Storage</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Aksi</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filtered.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-mono font-medium text-gray-900">{t.code}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{t.name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{t.part_number || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${STATUS_LABELS[t.status]?.color}`}>
                        {STATUS_LABELS[t.status]?.label || t.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{t.storage_code || '-'}</td>
                    <td className="px-4 py-3 text-sm">
                      <Link to={`/templates/${t.id}`} className="text-primary-600 hover:text-primary-800 font-medium mr-3">Detail</Link>
                      <Link to={`/templates/${t.id}/edit`} className="text-gray-600 hover:text-gray-900">Edit</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 bg-gray-50 text-sm text-gray-500">
            Menampilkan {filtered.length} dari {templates.length} template
          </div>
        </div>
      )}
    </div>
  )
}