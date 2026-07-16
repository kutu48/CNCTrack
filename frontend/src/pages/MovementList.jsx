import { useState, useEffect } from 'react'
import client from '../api/client'
import toast from 'react-hot-toast'

const MOV_TYPE_LABELS = {
  distribute: { label: 'Distribusi', color: 'bg-yellow-100 text-yellow-800' },
  return: { label: 'Pengembalian', color: 'bg-green-100 text-green-800' },
  maintenance_in: { label: 'Masuk Maintenance', color: 'bg-orange-100 text-orange-800' },
  scrap: { label: 'Scrap', color: 'bg-red-100 text-red-800' },
}

export default function MovementList() {
  const [movements, setMovements] = useState([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => { loadMovements() }, [typeFilter, dateFrom, dateTo])

  const loadMovements = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (typeFilter) params.append('type', typeFilter)
      if (dateFrom) params.append('from', dateFrom)
      if (dateTo) params.append('to', dateTo)
      const res = await client.get(`/movements?${params}`)
      setMovements(res.data)
    } catch { toast.error('Gagal memuat data movement') }
    finally { setLoading(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Riwayat Movement</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="input-field max-w-xs">
          <option value="">Semua Tipe</option>
          <option value="distribute">Distribusi</option>
          <option value="return">Pengembalian</option>
          <option value="maintenance_in">Maintenance</option>
          <option value="scrap">Scrap</option>
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input-field max-w-[160px]" />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input-field max-w-[160px]" />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
        </div>
      ) : movements.length === 0 ? (
        <div className="card"><div className="card-body text-center text-gray-500">Belum ada data movement</div></div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Waktu</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Template</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipe</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Op/WO</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Operator</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mesin</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Storage</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Catatan</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {movements.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{new Date(m.created_at).toLocaleString('id-ID')}</td>
                    <td className="px-4 py-3 text-sm font-mono font-medium text-gray-900">{m.template_code || `ID: ${m.template_id}`}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${MOV_TYPE_LABELS[m.type]?.color}`}>
                        {MOV_TYPE_LABELS[m.type]?.label || m.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{m.work_order || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{m.operator_name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{m.machine_number || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{m.to_storage_code || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 max-w-[200px] truncate">{m.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 bg-gray-50 text-sm text-gray-500">Total: {movements.length} records</div>
        </div>
      )}
    </div>
  )
}