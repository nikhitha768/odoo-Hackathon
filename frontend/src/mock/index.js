/**
 * Single source of truth for mock mode.
 * Toggle USE_MOCK to switch between simulated mock data and real backend API.
 */
export const USE_MOCK =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_USE_MOCK !== undefined
    ? import.meta.env.VITE_USE_MOCK === 'true'
    : false

export { mockAdapter } from './adapter.js'
export * from './data.js'
