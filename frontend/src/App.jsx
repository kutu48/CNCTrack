import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from './store/useAuthStore'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import TemplateList from './pages/TemplateList'
import TemplateForm from './pages/TemplateForm'
import TemplateDetail from './pages/TemplateDetail'
import ScanPage from './pages/ScanPage'
import StorageList from './pages/StorageList'
import MovementHistory from './pages/MovementHistory'
import PetboardList from './pages/PetboardList'

function PrivateRoute({ children }) {
  const token = useAuthStore((s) => s.token)
  return token ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <>
      <Toaster position="top-center" />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="templates" element={<TemplateList />} />
          <Route path="templates/new" element={<TemplateForm />} />
          <Route path="templates/:id" element={<TemplateDetail />} />
          <Route path="templates/:id/edit" element={<TemplateForm />} />
          <Route path="scan" element={<ScanPage />} />
          <Route path="storages" element={<StorageList />} />
          <Route path="movements" element={<MovementHistory />} />
          <Route path="petboards" element={<PetboardList />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}