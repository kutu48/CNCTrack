import axios from 'axios'

/**
 * API Client with automatic environment detection
 * 
 * - Development (Vite dev server on port 3000): 
 *   Uses relative '/api/v1' and proxies to backend on port 8000
 * - Production (XAMPP/Apache):
 *   Uses VITE_API_URL env var, or defaults to http://localhost:8000/api/v1
 * - Docker / Cloud:
 *   Uses VITE_API_URL env var for the full API base URL
 */
const getBaseURL = () => {
  // If VITE_API_URL is set (production/XAMPP/cloud), use it
  if (import.meta.env.VITE_API_URL) {
    return `${import.meta.env.VITE_API_URL}/api/v1`
  }
  // Development: use relative path (Vite proxy handles routing to :8000)
  return '/api/v1'
}

const client = axios.create({
  baseURL: getBaseURL(),
  headers: { 'Content-Type': 'application/json' }
})

// Request interceptor to add auth token
client.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor to handle token refresh on 401
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true
      
      try {
        const refreshToken = localStorage.getItem('refresh_token')
        // Use the same base URL logic for refresh token request
        const refreshURL = `${client.defaults.baseURL}/auth/refresh`
        const response = await axios.post(refreshURL, { refresh_token: refreshToken })
        const { access_token, refresh_token, user } = response.data
        
        localStorage.setItem('token', access_token)
        localStorage.setItem('refresh_token', refresh_token)
        localStorage.setItem('user', JSON.stringify(user))
        
        originalRequest.headers.Authorization = `Bearer ${access_token}`
        return client(originalRequest)
      } catch (refreshError) {
        // Refresh failed, clear storage and reload
        localStorage.clear()
        window.location.href = '/login'
        return Promise.reject(refreshError)
      }
    }
    
    return Promise.reject(error)
  }
)

export default client