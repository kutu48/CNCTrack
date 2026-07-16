import { useState, useEffect } from 'react'
import client from '../api/client'
import toast from 'react-hot-toast'

export default function StorageList() {
  const [storages, setStorages] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ code: '', name: '', max_capacity: 10, location: '', description: '' })

  useEffect(() => { loadStorages() }, [])

  const loadStorages = async () => {
    setLoading(true)
    try {
      const res = await client.get('/storages')
      setStorages(res.data)
    } catch { toast.error('Gagal memuat data storage') }
    finally { setLoading(false) }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    try {
      await client.post('/storages', { ...formData, max_capacity: parseInt(formData.max_capacity) })
      toast.success('Storage berhasil ditambahkan')
      setFormData({ code: '', name: '', max_capacity: 10, location: '', description: '' })
      setShowForm(false)
      loadStorages()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menyimpan')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Manajemen Storage / Rak</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn btn-primary">{showForm ? 'Tutup' : '+ Tambah'}</button>
      </div>

      {showForm && (
        <div className="card">
          <form onSubmit={handleCreate} className="card-body grid grid-cols-1 sm:grid-cols-3 gap-4">
            <input required placeholder="Kode" value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} className="input-field" />
            <input required placeholder="Nama Rak" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="input-field" />
            <input required type="number" min="1" placeholder="Kapasitas" value={formData.max_capacity} onChange={e => setFormData({...formData, max_capacity: e.target.value})} className="input-field" />
            <input placeholder="Lokasi (contoh: Blok A)" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} className="input-field" />
            <input placeholder="Deskripsi" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="input-field" />
            <button type="submit" className="btn btn-primary">Simpan</button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div></div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kode</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nama</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kapasitas</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lokasi</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Deskripsi</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {storages.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-mono font-medium text-gray-900">{s.code}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{s.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{s.current_count || 0}/{s.max_capacity}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{s.location || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{s.description || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}