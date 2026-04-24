import type { NextRequest } from "next/server"

// Rate limiting store (in production, use Redis or database)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

export interface RateLimitConfig {
  windowMs: number // Time window in milliseconds
  maxRequests: number // Maximum requests per window
}

// Temporary operational switch: disable forced password-change enforcement.
export const PASSWORD_CHANGE_ENFORCEMENT_ENABLED = false

export function rateLimit(identifier: string, config: RateLimitConfig): boolean {
  const now = Date.now()
  const key = identifier
  const existing = rateLimitStore.get(key)

  if (!existing || now > existing.resetTime) {
    // Reset or create new entry
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + config.windowMs,
    })
    return true
  }

  if (existing.count >= config.maxRequests) {
    return false // Rate limit exceeded
  }

  existing.count++
  return true
}

export function getClientIdentifier(request: NextRequest): string {
  // Use IP address as identifier (in production, consider user ID for authenticated requests)
  return (request as any).ip || request.headers.get("x-forwarded-for") || "unknown"
}

export function sanitizeInput(input: string): string {
  if (!input) return ""

  return input
    .replace(/[<>]/g, "") // Remove potential HTML tags
    .replace(/javascript:/gi, "") // Remove javascript: protocol
    .replace(/on\w+=/gi, "") // Remove event handlers
    .trim()
}

export function validatePassword(password: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = []

  if (password.length < 8) {
    errors.push("Password must be at least 8 characters long")
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter")
  }

  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter")
  }

  if (!/\d/.test(password)) {
    errors.push("Password must contain at least one number")
  }

  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push("Password must contain at least one special character")
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

export function isPasswordChangeRequired(passwordChangedAt?: string | null, referenceDate: Date = new Date()): boolean {
  if (!PASSWORD_CHANGE_ENFORCEMENT_ENABLED) return false

  if (!passwordChangedAt) return true

  const changedAt = new Date(passwordChangedAt)
  if (Number.isNaN(changedAt.getTime())) return true

  const startOfCurrentQuarter = new Date(referenceDate)
  const currentMonth = startOfCurrentQuarter.getMonth()
  const quarterStartMonth = Math.floor(currentMonth / 3) * 3
  startOfCurrentQuarter.setMonth(quarterStartMonth, 1)
  startOfCurrentQuarter.setHours(0, 0, 0, 0)

  return changedAt < startOfCurrentQuarter
}

export function isEndOfQuarter(referenceDate: Date = new Date()): boolean {
  const month = referenceDate.getMonth()
  const isQuarterEndMonth = month === 2 || month === 5 || month === 8 || month === 11
  if (!isQuarterEndMonth) return false

  const tomorrow = new Date(referenceDate)
  tomorrow.setDate(referenceDate.getDate() + 1)
  return tomorrow.getMonth() !== referenceDate.getMonth()
}

export function getPasswordEnforcementMessage(): string {
  if (!PASSWORD_CHANGE_ENFORCEMENT_ENABLED) {
    return "Password-change enforcement is temporarily disabled."
  }
  return "For security, your password must be changed quarterly before you can continue using the app."
}

type PasswordMetadata = Record<string, unknown> | null | undefined

export function buildForcedPasswordChangeMetadata(
  metadata: PasswordMetadata,
  issuedAt: string = new Date().toISOString(),
): Record<string, unknown> {
  return {
    ...(metadata || {}),
    force_password_change: true,
    temporary_password: true,
    temp_password_issued_at: issuedAt,
  }
}

export function clearForcedPasswordChangeMetadata(metadata: PasswordMetadata): Record<string, unknown> {
  return {
    ...(metadata || {}),
    force_password_change: false,
    temporary_password: false,
    temp_password_issued_at: null,
  }
}

export function generateTemporaryPassword(length = 6): string {
  const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ"
  const lowercase = "abcdefghijkmnopqrstuvwxyz"
  const numbers = "23456789"
  const special = "!@#$%^&*"
  const allChars = `${uppercase}${lowercase}${numbers}${special}`

  const pick = (source: string) => source[Math.floor(Math.random() * source.length)]

  const passwordChars = [pick(uppercase), pick(lowercase), pick(numbers), pick(special)]

  while (passwordChars.length < Math.max(length, 10)) {
    passwordChars.push(pick(allChars))
  }

  return passwordChars.sort(() => Math.random() - 0.5).join("")
}

export function createSecurityHeaders() {
  return {
    "Cache-Control": "no-cache, no-store, must-revalidate, private",
    Pragma: "no-cache",
    Expires: "0",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  }
}
