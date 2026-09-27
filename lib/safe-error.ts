/**
 * Returns a client-safe error message and logs the real error server-side only.
 *
 * Never return `error.message` (or the raw error) directly in an API response.
 * Thrown errors can embed sensitive values from misconfigured environment
 * variables or third-party libraries (e.g. web-push echoing an invalid VAPID
 * subject back in its Error message), which would otherwise leak secrets to
 * the client.
 */
export function toSafeErrorMessage(error: unknown, fallback: string, context?: string): string {
  console.error(context ? `[v0] ${context}:` : "[v0] Unexpected error:", error)
  return fallback
}
