import { useState, useEffect } from 'react'
import { AuthContext } from './authContext.js'
import client from '../api/client.js'

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => {
    return typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null
  })

  const [user, setUser] = useState(() => {
    try {
      const savedUser = typeof localStorage !== 'undefined' ? localStorage.getItem('user') : null
      return savedUser ? JSON.parse(savedUser) : null
    } catch {
      return null
    }
  })

  // Only start loading if there's an existing token to verify
  const [loading, setLoading] = useState(() => {
    return typeof localStorage !== 'undefined' ? Boolean(localStorage.getItem('token')) : false
  })

  useEffect(() => {
    if (!token) return

    let isMounted = true

    client
      .get('/auth/me/')
      .then((response) => {
        if (isMounted) {
          const fetchedUser = response.data
          setUser(fetchedUser)
          localStorage.setItem('user', JSON.stringify(fetchedUser))
        }
      })
      .catch((err) => {
        if (err.response && err.response.status === 401) {
          localStorage.removeItem('token')
          localStorage.removeItem('user')
          if (isMounted) {
            setToken(null)
            setUser(null)
          }
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [token])

  /**
   * Logs in with email and password via POST /api/auth/login/
   */
  const login = async (email, password) => {
    const response = await client.post('/auth/login/', { email, password })
    const { token: receivedToken, user: receivedUser } = response.data

    localStorage.setItem('token', receivedToken)
    localStorage.setItem('user', JSON.stringify(receivedUser))
    setToken(receivedToken)
    setUser(receivedUser)
    return receivedUser
  }

  /**
   * Registers a new customer user via POST /api/auth/signup/
   */
  const signup = async (name, email, password) => {
    const response = await client.post('/auth/signup/', { name, email, password })
    return response.data
  }

  /**
   * Logs out user via POST /api/auth/logout/ and clears local storage
   */
  const logout = async () => {
    try {
      await client.post('/auth/logout/')
    } catch {
      // Even if network fails, ensure client session is cleared
    } finally {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      setToken(null)
      setUser(null)
    }
  }

  const value = {
    token,
    user,
    loading,
    isAuthenticated: Boolean(token && user),
    login,
    signup,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

