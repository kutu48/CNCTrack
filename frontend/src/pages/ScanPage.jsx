import { useState, useEffect, useRef } from 'react'
import { Html5QrcodeScanner } from 'html5-qrcode'
import client from '../api/client'
import toast from 'react-hot-toast'

export default function ScanPage() {
  const [scannedCode, setScannedCode] = useState('')
  const [template, setTemplate] = useState(null)
  const [storages, setStorages] = useState([])
  const [loading, setLoading] = useState(false)
  
  // Movement form state
  const [movType, setMovType] = useState('distribute')
  const [machineNumber, setMachineNumber] = useState('')
  const [workOrder, setWorkOrder] = useState('')
  const [operatorName, setOperatorName] = useState('')
  const [toStorageId, setToStorageId] = useState('')
  const [notes, setNotes] = useState('')

  const scannerRef = useRef(null)

  useEffect(() => {
    loadStorages()
    
    // Initialize html5-qrcode scanner
    const scanner = new Html5QrcodeScanner('reader', {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      aspectRatio: 1.0
    })

    scanner.render(onScanSuccess, onScanError)
    scannerRef.current = scanner

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(err => console.error(err))
      }
    }
  }, [])

  const loadStorages = async () => {
    try {
      const res = await client.get('/storages')
      setStorages(res.data)
    } catch {
      toast.error('Gagal memuat daftar storage')
    }
  }

  const onScanSuccess = async (decodedText) => {
    // Avoid double scans
    if (decodedText === scannedCode) return
    
    setScannedCode(decodedText)
    toast.success(`QR Code terdeteksi: ${decodedText}`)
    
    // Fetch template info from server
    setLoading(true)
    try {
      const res = await client.get(`/templates/code/${decodedText}`)
      setTemplate(res.data)
      // Auto-set movement type based on current status
      if (res.data.status === 'available') {
        setMovType('distribute')
      } else if (res.data.status === 'in_use') {
        setMovType('return')
      }
    } catch (err) {
      toast.error('Template tidak terdaftar di sistem. Silakan registrasi terlebih dahulu.')
      setTemplate(null)
    } finally {
      setLoading(false)
    }
  }

  const onScanError = (err) => {
    // Just silent or log, as it triggers frequently when no QR is visible
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!template) return
    setLoading(true)

    try {
      const payload = {
        template_id: template.id,
        type: movType,
        machine_number: machineNumber || null,
        work_order: workOrder || null,
        operator_name: operatorName || null,
        to_storage_id: toStorageId ? parseInt(toStorageId) : null,
        notes: notes || null
      }

      await client.post('/movements', payload)
      toast.success('Movement berhasil disimpan!')
      
      // Reset form and reload template info
      setMachineNumber('')
      setWorkOrder('')
      setOperatorName('')
      setToStorageId('')
      setNotes('')
      
      // Reload template status
      const res = await client.get(`/templates/${template.id}`)
      setTemplate(res.data)
      if (res.data.status === 'available') {
        setMovType('distribute')
      } else if (res.data.status === 'in_use') {
        setMovType('return')
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Gagal menyimpan movement')
    } finally {
      setLoading(false)
    }
  }

  const handleManualSearch = async (e) => {
    e.preventDefault()
    if (!scannedCode.trim()) return
    onScanSuccess(scannedCode.trim())
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900">Scan QR Code Template</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Scanner Panel */}
        <div className="card">
          <div className="card-body space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Kamera Scanner</h2>
            <div id="reader" className="overflow-hidden rounded-lg border border-gray-200"></div>
            
            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-gray-300"></div>
              <span className="flex-shrink mx-4 text-gray-400 text-xs">ATAU INPUT MANUAL</span>
              <div className="flex-grow border-t border-gray-300"></div>
            </div>

            <form onSubmit={handleManualSearch} className="flex gap-2">
              <input
                type="text"
                placeholder="Masukkan Kode Template..."
                value={scannedCode}
                onChange={(e) => setScannedCode(e.target.value)}
                className="input-field font-mono"
              />
              <button type="submit" className="btn btn-primary">Cari</button>
            </form>
          </div>
        </div>

        {/* Template Info & Action Panel */}
        <div className="card">
          <div className="card-body">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Informasi & Transaksi</h2>
            
            {loading && (
              <div className="flex items-center justify-center h-40">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              </div>
            )}

            {!loading && !template && (
              <div className="text-center py-10 text-gray-500">
                <p className="text-4xl mb-2">📷</p>
                <p>Silakan scan QR code template atau masukkan kode secara manual untuk melakukan transaksi pergerakan.</p>
              </div>
            )}

            {!loading && template && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-xs text-gray-500 font-semibold uppercase">Template Terdeteksi</p>
                  <p className="text-lg font-mono font-bold text-primary-800">{template.code}</p>
                  <p className="text-sm font-medium text-gray-700">{template.name || '-'}</p>
                  <div className="mt-2 flex gap-2">
                    <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-800 rounded">
                      Siklus: {template.usage_count}
                    </span>
                    <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-800 rounded">
                      Lokasi: {template.storage_code || 'Gudang'}
                    </span>
                    <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded">
                      Status: {template.status}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Tipe Pergerakan (Movement) *</label>
                  <select
                    value={movType}
                    onChange={(e) => setMovType(e.target.value)}
                    className="mt-1 input-field"
                    required
                  >
                    <option value="distribute">Distribusi (Ambil untuk Produksi)</option>
                    <option value="return">Pengembalian (Kembalikan ke Rak)</option>
                    <option value="maintenance_in">Masuk Maintenance (Perbaikan/Kalibrasi)</option>
                    <option value="scrap">Scrap (Rusak & Dibuang)</option>
                  </select>
                </div>

                {/* Form fields depending on movement type */}
                {movType === 'distribute' && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">No. Mesin CNC *</label>
                        <input
                          type="text"
                          required
                          value={machineNumber}
                          onChange={(e) => setMachineNumber(e.target.value)}
                          placeholder="Contoh: CNC-01"
                          className="mt-1 input-field"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Work Order (WO) *</label>
                        <input
                          type="text"
                          required
                          value={workOrder}
                          onChange={(e) => setWorkOrder(e.target.value)}
                          placeholder="WO-2026-XXXX"
                          className="mt-1 input-field"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Nama Operator Penerima *</label>
                      <input
                        type="text"
                        required
                        value={operatorName}
                        onChange={(e) => setOperatorName(e.target.value)}
                        placeholder="Nama Operator CNC"
                        className="mt-1 input-field"
                      />
                    </div>
                  </>
                )}

                {movType === 'return' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Pilih Rak/Storage Pengembalian *</label>
                    <select
                      required
                      value={toStorageId}
                      onChange={(e) => setToStorageId(e.target.value)}
                      className="mt-1 input-field"
                    >
                      <option value="">-- Pilih Rak Storage --</option>
                      {storages.map(s => (
                        <option key={s.id} value={s.id}>{s.name} ({s.code}) - Slot: {s.current_count}/{s.max_capacity}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700">Catatan / Keterangan</label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Masukkan catatan tambahan jika diperlukan..."
                    className="mt-1 input-field"
                  />
                </div>

                <button type="submit" className="btn btn-primary w-full py-2.5">
                  Simpan Transaksi Pergerakan
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}