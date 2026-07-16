import { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import client from '../api/client'
import toast from 'react-hot-toast'

export default function TemplateForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    part_number: '',
    machine_type: '',
    storage_id: '',
    status: 'available'
  })
  
  const [storages, setStorages] = useState([])
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(isEdit)

  useEffect(() => {
    loadStorages()
    if (isEdit) {
      loadTemplate()
    }
  }, [id])

  const loadStorages = async () => {
    try {
      const res = await client.get('/storages')
      setStorages(res.data)
    } catch {
      toast.error('Gagal memuat daftar storage')
    }
  }

  const loadTemplate = async () => {
    try {
      const res = await client.get(`/templates/${id}`)
      const { code, name, description, part_number, machine_type, storage_id, status } = res.data
      setFormData({
        code,
        name: name || '',
        description: description || '',
        part_number: part_number || '',
        machine_type: machine_type || '',
        storage_id: storage_id || '',
        status
      })
    } catch {
      toast.error('Gagal memuat data template')
      navigate('/templates')
    } finally {
      setInitialLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      const payload = {
        ...formData,
        storage_id: formData.storage_id ? parseInt(formData.storage_id) : null
      }

      if (isEdit) {
        await client.put(`/templates/${id}`, payload)
        toast.success('Template berhasil diupdate')
      } else {
        await client.post('/templates', payload)
        toast.success('Template berhasil ditambahkan')
      }
      navigate('/templates')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          {isEdit ? 'Edit Template' : 'Tambah Template Baru'}
        </h1>
        <Link to="/templates" className="text-gray-500 hover:text-gray-700">Kembali</Link>
      </div>

      <div className="card">
        <form onSubmit={handleSubmit} className="card-body space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Kode Template (QR) *</label>
            <input
              type="text"
              required
              value={formData.code}
              onChange={(e) => setFormData({...formData, code: e.target.value})}
              className="mt-1 input-field"
              placeholder="Contoh: TMP-A001"
              disabled={isEdit}
            />
            {isEdit && <p className="mt-1 text-xs text-gray-500">Kode template tidak dapat diubah.</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Nama Template</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="mt-1 input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Part Number</label>
              <input
                type="text"
                value={formData.part_number}
                onChange={(e) => setFormData({...formData, part_number: e.target.value})}
                className="mt-1 input-field"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Tipe Mesin</label>
              <input
                type="text"
                value={formData.machine_type}
                onChange={(e) => setFormData({...formData, machine_type: e.target.value})}
                className="mt-1 input-field"
                placeholder="Contoh: CNC Milling 3-Axis"
              />
            </div>
            
            {isEdit && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({...formData, status: e.target.value})}
                  className="mt-1 input-field"
                >
                  <option value="available">Available</option>
                  <option value="in_use">In Use</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="scrapped">Scrapped</option>
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Storage Location</label>
            <select
              value={formData.storage_id}
              onChange={(e) => setFormData({...formData, storage_id: e.target.value})}
              className="mt-1 input-field"
            >
              <option value="">Pilih Storage (Opsional)</option>
              {storages.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Deskripsi / Catatan</label>
            <textarea
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              className="mt-1 input-field"
            />
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <Link to="/templates" className="btn btn-secondary">Batal</Link>
            <button type="submit" disabled={loading} className="btn btn-primary">
              {loading ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}