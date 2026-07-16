import { useState, useEffect } from 'react'
import client from '../api/client'
import toast from 'react-hot-toast'

const STATUS_LABELS = {
  pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800' },
  in_progress: { label: 'In Progress', color: 'bg-blue-100 text-blue-800' },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-800' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800' },
}

const PRIORITY_LABELS = {
  low: { label: 'Low', color: 'bg-gray-100 text-gray-800' },
  medium: { label: 'Medium', color: 'bg-blue-100 text-blue-800' },
  high: { label: 'High', color: 'bg-orange-100 text-orange-800' },
  urgent: { label: 'Urgent', color: 'bg-red-100 text-red-800' },
}

export default function PetboardPage() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    template_id: '',
    priority: 'medium',
    assigned_to: '',
    due_date: ''
  })
  const [templates, setTemplates] = useState([])

  useEffect(() => {
    loadTasks()
    loadTemplates()
  }, [])

  const loadTasks = async () => {
    setLoading(true)
    try {
      const res = await client.get('/petboard')
      setTasks(res.data)
    } catch { toast.error('Gagal memuat data petboard') }
    finally { setLoading(false) }
  }

  const loadTemplates = async () => {
    try {
      const res = await client.get('/templates')
      setTemplates(res.data)
    } catch { console.error('Failed to load templates') }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    try {
      const payload = {
        ...formData,
        template_id: formData.template_id ? parseInt(formData.template_id) : null,
        due_date: formData.due_date || null
      }
      await client.post('/petboard', payload)
      toast.success('Task berhasil ditambahkan')
      setFormData({ title: '', description: '', template_id: '', priority: 'medium', assigned_to: '', due_date: '' })
      setShowForm(false)
      loadTasks()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menyimpan')
    }
  }

  const handleStatusChange = async (taskId, newStatus) => {
    try {
      await client.patch(`/petboard/${taskId}`, { status: newStatus })
      toast.success('Status diupdate')
      loadTasks()
    } catch { toast.error('Gagal update status') }
  }

  const handleDelete = async (taskId) => {
    if (!confirm('Hapus task ini?')) return
    try {
      await client.delete(`/petboard/${taskId}`)
      toast.success('Task dihapus')
      loadTasks()
    } catch { toast.error('Gagal hapus task') }
  }

  const columns = [
    { key: 'pending', title: 'Pending' },
    { key: 'in_progress', title: 'In Progress' },
    { key: 'completed', title: 'Completed' },
    { key: 'cancelled', title: 'Cancelled' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Petboard (Kanban)</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn btn-primary">{showForm ? 'Tutup' : '+ Tambah Task'}</button>
      </div>

      {showForm && (
        <div className="card">
          <form onSubmit={handleCreate} className="card-body grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input required placeholder="Judul Task" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="input-field" />
            <select value={formData.priority} onChange={e => setFormData({...formData, priority: e.target.value})} className="input-field">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            <input placeholder="Assigned To" value={formData.assigned_to} onChange={e => setFormData({...formData, assigned_to: e.target.value})} className="input-field" />
            <input type="date" value={formData.due_date} onChange={e => setFormData({...formData, due_date: e.target.value})} className="input-field" />
            <select value={formData.template_id} onChange={e => setFormData({...formData, template_id: e.target.value})} className="input-field">
              <option value="">-- Pilih Template (Opsional) --</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.code} - {t.name}</option>)}
            </select>
            <textarea placeholder="Deskripsi" rows={2} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="input-field sm:col-span-2" />
            <button type="submit" className="btn btn-primary sm:col-span-2">Simpan</button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {columns.map(col => (
            <div key={col.key} className="card flex flex-col min-h-[500px]">
              <div className="card-body flex-1 flex flex-col">
                <h3 className="font-semibold text-gray-700 mb-3 pb-2 border-b">{col.title}</h3>
                <div className="space-y-2 flex-1 overflow-y-auto">
                  {tasks.filter(t => t.status === col.key).map(task => (
                    <div key={task.id} className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between">
                        <h4 className="font-medium text-gray-900 text-sm">{task.title}</h4>
                        <button onClick={() => handleDelete(task.id)} className="text-gray-400 hover:text-red-500 text-xs">×</button>
                      </div>
                      {task.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{task.description}</p>}
                      <div className="mt-2 flex flex-wrap gap-1">
                        <span className={`inline-flex px-1.5 py-0.5 text-xs font-medium rounded ${PRIORITY_LABELS[task.priority]?.color}`}>
                          {PRIORITY_LABELS[task.priority]?.label}
                        </span>
                        {task.template_code && <span className="inline-flex px-1.5 py-0.5 text-xs font-mono bg-purple-100 text-purple-800 rounded">{task.template_code}</span>}
                        {task.due_date && <span className="inline-flex px-1.5 py-0.5 text-xs text-gray-600 bg-gray-100 rounded">📅 {new Date(task.due_date).toLocaleDateString('id-ID')}</span>}
                      </div>
                      {task.assigned_to && <p className="mt-1 text-xs text-gray-500">👤 {task.assigned_to}</p>}
                      <div className="mt-2 flex gap-1">
                        {['pending', 'in_progress', 'completed', 'cancelled'].filter(s => s !== task.status).map(s => (
                          <button
                            key={s}
                            onClick={() => handleStatusChange(task.id, s)}
                            className={`text-xs px-2 py-1 rounded ${task.status === s ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                          >
                            {STATUS_LABELS[s].label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {tasks.filter(t => t.status === col.key).length === 0 && (
                    <div className="text-center text-gray-400 text-sm py-4">Kosong</div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}