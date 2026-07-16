import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import client from '../api/client'
import toast from 'react-hot-toast'

const STATUS_LABELS = {
  available: { label: 'Available', color: 'bg-green-100 text-green-800' },
  in_use: { label: 'In Use', color: 'bg-yellow-100 text-yellow-800' },
  maintenance: { label: 'Maintenance', color: 'bg-orange-100 text-orange-800' },
  scrapped: { label: 'Scrapped', color: 'bg-red-100 text-red-800' },
}

export default function TemplateDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [template, setTemplate] = useState(null)
  const [movements, setMovements] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [id])

  const loadData = async () => {
    try {
      const [tplRes, movRes] = await Promise.all([
        client.get(`/templates/${id}`),
        client.get(`/movements/template/${id}`)
      ])
      setTemplate(tplRes.data)
      setMovements(movRes.data)
    } catch {
      toast.error('Gagal memuat data template')
      navigate('/templates')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!template) return null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Detail Template</h1>
        <div className="space-x-3">
          <Link to="/templates" className="btn btn-secondary">Kembali</Link>
          <Link to={`/templates/${id}/edit`} className="btn btn-primary">Edit</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Info Card */}
        <div className="card lg:col-span-1">
          <div className="card-body">
            <h2 className="text-lg font-semibold border-b pb-2 mb-4">Informasi Dasar</h2>
            
            <dl className="space-y-4">
              <div>
                <dt className="text-sm font-medium text-gray-500">Kode Template (QR)</dt>
                <dd className="mt-1 text-lg font-mono font-bold text-gray-900">{template.code}</dd>
              </div>
              
              <div>
                <dt className="text-sm font-medium text-gray-500">Status</dt>
                <dd className="mt-1">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${STATUS_LABELS[template.status]?.color}`}>
                    {STATUS_LABELS[template.status]?.label || template.status}
                  </span>
                </dd>
              </div>

              <div>
                <dt className="text-sm font-medium text-gray-500">Nama</dt>
                <dd className="mt-1 text-sm text-gray-900">{template.name || '-'}</dd>
              </div>

              <div>
                <dt className="text-sm font-medium text-gray-500">Part Number</dt>
                <dd className="mt-1 text-sm text-gray-900">{template.part_number || '-'}</dd>
              </div>

              <div>
                <dt className="text-sm font-medium text-gray-500">Tipe Mesin</dt>
                <dd className="mt-1 text-sm text-gray-900">{template.machine_type || '-'}</dd>
              </div>

              <div>
                <dt className="text-sm font-medium text-gray-500">Lokasi Storage Saat Ini</dt>
                <dd className="mt-1 text-sm text-gray-900">{template.storage_code || 'Tidak ada'}</dd>
              </div>

              <div>
                <dt className="text-sm font-medium text-gray-500">Siklus Pemakaian</dt>
                <dd className="mt-1 text-sm text-gray-900">{template.usage_count} kali</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* History Card */}
        <div className="card lg:col-span-2">
          <div className="card-body">
            <h2 className="text-lg font-semibold border-b pb-2 mb-4">Riwayat Pergerakan (Movement)</h2>
            
            {movements.length === 0 ? (
              <p className="text-center text-gray-500 py-4">Belum ada riwayat pergerakan.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Waktu</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipe</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Operator</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mesin</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Catatan</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {movements.map((mov) => (
                      <tr key={mov.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {new Date(mov.created_at).toLocaleString('id-ID')}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800 capitalize">
                            {mov.type.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">{mov.operator_name || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{mov.machine_number || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{mov.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}