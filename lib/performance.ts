/**
 * Performance monitoring and optimization utilities
 */

export interface PerformanceMetrics {
  name: string
  duration: number
  startTime: number
  endTime: number
  memory?: number
}

const metrics: PerformanceMetrics[] = []

export const measurePerformance = (name: string, fn: () => void | Promise<void>): void | Promise<void> => {
  const startTime = performance.now()
  const startMemory = process.memoryUsage?.().heapUsed

  const result = fn()

  if (result instanceof Promise) {
    return result.then(() => {
      const endTime = performance.now()
      const endMemory = process.memoryUsage?.().heapUsed
      const duration = endTime - startTime
      const memory = startMemory && endMemory ? endMemory - startMemory : undefined

      const metric: PerformanceMetrics = {
        name,
        duration,
        startTime,
        endTime,
        memory,
      }

      metrics.push(metric)

      if (duration > 100) {
        console.warn(`[v0] Slow operation: ${name} took ${duration.toFixed(2)}ms`)
      }
    })
  } else {
    const endTime = performance.now()
    const endMemory = process.memoryUsage?.().heapUsed
    const duration = endTime - startTime
    const memory = startMemory && endMemory ? endMemory - startMemory : undefined

    const metric: PerformanceMetrics = {
      name,
      duration,
      startTime,
      endTime,
      memory,
    }

    metrics.push(metric)

    if (duration > 100) {
      console.warn(`[v0] Slow operation: ${name} took ${duration.toFixed(2)}ms`)
    }
  }
}

export const getMetrics = (): PerformanceMetrics[] => [...metrics]

export const clearMetrics = (): void => {
  metrics.length = 0
}

export const reportMetrics = (): void => {
  if (metrics.length === 0) {
    console.log('[v0] No performance metrics recorded')
    return
  }

  const totalDuration = metrics.reduce((sum, m) => sum + m.duration, 0)
  const avgDuration = totalDuration / metrics.length
  const slowestOperations = metrics.sort((a, b) => b.duration - a.duration).slice(0, 5)

  console.log('[v0] Performance Report')
  console.log(`  Total operations: ${metrics.length}`)
  console.log(`  Total time: ${totalDuration.toFixed(2)}ms`)
  console.log(`  Average time: ${avgDuration.toFixed(2)}ms`)
  console.log('  Slowest operations:')
  slowestOperations.forEach((m) => {
    console.log(`    - ${m.name}: ${m.duration.toFixed(2)}ms${m.memory ? ` (+${(m.memory / 1024 / 1024).toFixed(2)}MB)` : ''}`)
  })
}

/**
 * Web Vitals tracking for production
 */
export const trackWebVital = (name: string, value: number): void => {
  if (typeof window === 'undefined') return

  // Track via analytics if available
  if ((window as any).gtag) {
    ;(window as any).gtag('event', name, {
      value: Math.round(value),
      event_category: 'Web Vitals',
      event_label: window.location.pathname,
    })
  }

  // Log in development
  if (process.env.NODE_ENV === 'development') {
    console.log(`[v0] Web Vital - ${name}: ${value.toFixed(2)}`)
  }
}

/**
 * Debounce function for expensive operations
 */
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout
  return (...args: Parameters<T>) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

/**
 * Throttle function for scroll and resize listeners
 */
export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle: boolean
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }
}

/**
 * Request idle callback polyfill
 */
export const requestIdleCallback = (callback: IdleRequestCallback, options?: IdleRequestOptions): number => {
  if (typeof window === 'undefined') return -1
  if ('requestIdleCallback' in window) {
    return window.requestIdleCallback(callback, options)
  }
  // Fallback for browsers that don't support requestIdleCallback
  return window.setTimeout(() => {
    callback({
      didTimeout: false,
      timeRemaining: () => 50,
    } as IdleDeadline)
  }, 1)
}
