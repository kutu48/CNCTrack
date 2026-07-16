import { create } from 'zustand'
import axios from 'axios'

const API_URL = '/api/v1/auth'

export const useAuthStore = create((set) => ({
  user: JSON.parse(localStorage.getItem('user')) || null,
  token: localStorage.getItem('token') || null,
  refreshToken: localStorage.getItem('refresh_token') || null,
  loading: false,
  error: null,

  login: async (username, password) => {
    set({ loading: true, error: null })
    try {
      const response = await axios.post(`${API_URL}/login`, { username, password })
      const { access_token, refresh_token, user } = response.data
      
      localStorage.setItem('token', access_token)
      localStorage.setItem('refresh_token', refresh_token)
      localStorage.setItem('user', JSON.stringify(user))
      
      set({ user, token: access_token, refreshToken: refresh_token, loading: false })
      return true
    } catch (err) {
      const msg = err.response?.data?.detail || 'Login gagal. Hubungi admin.'
      set({ error: msg, loading: false })
      return false
    }
  },

  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')
    set({ user: null, token: null, refreshToken: null, error: null })
  },

  updateProfile: (updatedUser) => {
    localStorage.setItem('user', JSON.stringify(updatedUser))
    set({ user: updatedUser })
  }
}))