/**
 * Response caching utility for API endpoints
 * Provides in-memory caching with automatic invalidation
 */

interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number
}

const responseCache = new Map<string, CacheEntry<any>>()

export const getCacheKey = (endpoint: string, params?: Record<string, any>): string => {
  if (!params || Object.keys(params).length === 0) {
    return endpoint
  }
  const queryString = Object.keys(params)
    .sort()
    .map((key) => `${key}=${JSON.stringify(params[key])}`)
    .join('&')
  return `${endpoint}?${queryString}`
}

export const getCachedResponse = <T>(key: string): T | null => {
  const entry = responseCache.get(key)
  if (!entry) return null

  const now = Date.now()
  if (now - entry.timestamp > entry.ttl) {
    responseCache.delete(key)
    return null
  }

  return entry.data
}

export const setCachedResponse = <T>(key: string, data: T, ttlMs: number = 60000): void => {
  responseCache.set(key, {
    data,
    timestamp: Date.now(),
    ttl: ttlMs,
  })
}

export const invalidateCache = (pattern?: string): void => {
  if (!pattern) {
    responseCache.clear()
    return
  }

  const regex = new RegExp(pattern)
  for (const key of responseCache.keys()) {
    if (regex.test(key)) {
      responseCache.delete(key)
    }
  }
}

export const cacheDuration = {
  IMMEDIATE: 5000,      // 5 seconds
  SHORT: 30000,         // 30 seconds
  MEDIUM: 60000,        // 1 minute
  LONG: 300000,         // 5 minutes
  VERY_LONG: 3600000,   // 1 hour
}
