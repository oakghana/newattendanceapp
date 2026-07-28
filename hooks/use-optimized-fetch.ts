'use client'

import useSWR from 'swr'
import { useCallback } from 'react'
import { getCacheKey, getCachedResponse, setCachedResponse, cacheDuration } from '@/lib/response-cache'

/**
 * Optimized fetch hook using SWR with intelligent caching
 * Features: automatic deduplication, cache invalidation, retry logic
 */

interface FetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: any
  cacheDuration?: number
  revalidateOnFocus?: boolean
  revalidateOnReconnect?: boolean
  retries?: number
}

const fetcher = async (url: string, options: FetchOptions = {}) => {
  const cacheKey = getCacheKey(url, options.body)
  
  // Check in-memory cache first
  const cached = getCachedResponse(cacheKey)
  if (cached) {
    return cached
  }

  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const data = await response.json()

    // Cache the response
    setCachedResponse(cacheKey, data, options.cacheDuration || cacheDuration.MEDIUM)

    return data
  } catch (error) {
    console.error('[v0] Fetch error:', error)
    throw error
  }
}

export function useOptimizedFetch<T = any>(
  url: string | null,
  options: FetchOptions & { shouldFetch?: boolean } = {}
): {
  data: T | undefined
  error: any
  isLoading: boolean
  mutate: () => Promise<T | undefined>
} {
  const { shouldFetch = true, ...fetchOptions } = options

  const { data, error, mutate, isLoading } = useSWR(
    shouldFetch && url ? [url, fetchOptions] : null,
    ([url, opts]) => fetcher(url, opts),
    {
      revalidateOnFocus: options.revalidateOnFocus ?? false,
      revalidateOnReconnect: options.revalidateOnReconnect ?? false,
      dedupingInterval: 60000, // 1 minute
      focusThrottleInterval: 300000, // 5 minutes
      errorRetryCount: options.retries ?? 3,
      errorRetryInterval: 5000,
    }
  )

  const optimizedMutate = useCallback(async () => {
    return mutate()
  }, [mutate])

  return {
    data,
    error,
    isLoading,
    mutate: optimizedMutate,
  }
}

export { cacheDuration }
