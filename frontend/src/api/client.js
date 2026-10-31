import axios from 'axios'
import { USE_MOCK, mockAdapter } from '../mock/index.js'

const baseURL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) ||
  'http://localhost:8080/api'

const client = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Attach DRF TokenAuthentication header
client.interceptors.request.use(
  (config) => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null
    if (token) {
      config.headers.Authorization = `Token ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

// Intercept with mockAdapter when USE_MOCK is enabled
if (USE_MOCK) {
  client.defaults.adapter = mockAdapter
}

export default client
