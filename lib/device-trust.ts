import { createHmac, timingSafeEqual } from "node:crypto"
import { type NextRequest } from "next/server"

type UnknownRecord = Record<string, unknown>

export interface TrustedDeviceInput {
  request: NextRequest
  userId: string
  deviceInfo?: UnknownRecord | null
}

export interface TrustedDeviceResult {
  ipAddress: string | null
  trustedMacAddress: string | null
  trustedSignaturePresent: boolean
  strictModeEnabled: boolean
  isDesktopClient: boolean
  verified: boolean
  reason: string
}

function toBoolean(value: string | undefined, fallback = false): boolean {
  if (typeof value !== "string") return fallback
  const normalized = value.trim().toLowerCase()
  if (["1", "true", "yes", "on"].includes(normalized)) return true
  if (["0", "false", "no", "off"].includes(normalized)) return false
  return fallback
}

export function getClientIpAddress(request: NextRequest): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for")
  const forwardedCandidates = forwardedFor
    ? forwardedFor
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : []

  const possibleIps = [
    request.headers.get("x-vercel-forwarded-for"),
    request.headers.get("cf-connecting-ip"),
    request.headers.get("x-real-ip"),
    request.headers.get("x-client-ip"),
    request.ip,
    ...forwardedCandidates,
  ]

  for (const rawIp of possibleIps) {
    if (!rawIp || rawIp === "unknown") continue

    const normalizedIp = rawIp.startsWith("::ffff:") ? rawIp.slice(7) : rawIp
    if (normalizedIp === "::1" || normalizedIp === "127.0.0.1") continue

    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(normalizedIp) || /^[0-9a-fA-F:]+$/.test(normalizedIp)) {
      return normalizedIp
    }
  }

  return null
}

function isDesktopDeviceType(deviceInfo?: UnknownRecord | null): boolean {
  const deviceType = String(deviceInfo?.device_type || "").toLowerCase()
  return deviceType === "desktop" || deviceType === "laptop"
}

function isTimestampFresh(timestampMs: number, maxSkewMs: number): boolean {
  const now = Date.now()
  return Math.abs(now - timestampMs) <= maxSkewMs
}

function verifySignature(payload: string, providedSignature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(payload).digest("hex")
  const provided = providedSignature.toLowerCase().trim()

  if (!/^[a-f0-9]{64}$/.test(provided)) return false

  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(provided, "hex"))
  } catch {
    return false
  }
}

export function evaluateTrustedDesktopDevice(input: TrustedDeviceInput): TrustedDeviceResult {
  const { request, userId, deviceInfo } = input
  const ipAddress = getClientIpAddress(request)
  const strictModeEnabled = toBoolean(process.env.DEVICE_SHARING_STRICT_MODE, false)
  const isDesktopClient = isDesktopDeviceType(deviceInfo)

  const trustedMacAddress = request.headers.get("x-qcc-device-mac")?.trim() || null
  const timestampHeader = request.headers.get("x-qcc-device-ts")?.trim() || null
  const signatureHeader = request.headers.get("x-qcc-device-signature")?.trim() || null
  const trustedSignaturePresent = Boolean(trustedMacAddress && timestampHeader && signatureHeader)

  if (!isDesktopClient) {
    return {
      ipAddress,
      trustedMacAddress,
      trustedSignaturePresent,
      strictModeEnabled,
      isDesktopClient,
      verified: true,
      reason: "non-desktop client",
    }
  }

  const secret = process.env.DEVICE_AGENT_SHARED_SECRET

  if (!trustedSignaturePresent) {
    if (strictModeEnabled) {
      return {
        ipAddress,
        trustedMacAddress,
        trustedSignaturePresent,
        strictModeEnabled,
        isDesktopClient,
        verified: false,
        reason: "missing trusted device headers",
      }
    }

    return {
      ipAddress,
      trustedMacAddress,
      trustedSignaturePresent,
      strictModeEnabled,
      isDesktopClient,
      verified: true,
      reason: "trusted headers optional in non-strict mode",
    }
  }

  if (!secret) {
    return {
      ipAddress,
      trustedMacAddress,
      trustedSignaturePresent,
      strictModeEnabled,
      isDesktopClient,
      verified: !strictModeEnabled,
      reason: strictModeEnabled ? "strict mode misconfigured: missing DEVICE_AGENT_SHARED_SECRET" : "agent secret missing",
    }
  }

  const timestampMs = Number(timestampHeader)
  if (!Number.isFinite(timestampMs) || !isTimestampFresh(timestampMs, 5 * 60 * 1000)) {
    return {
      ipAddress,
      trustedMacAddress,
      trustedSignaturePresent,
      strictModeEnabled,
      isDesktopClient,
      verified: false,
      reason: "stale or invalid trusted device timestamp",
    }
  }

  if (!trustedMacAddress || trustedMacAddress.length < 11) {
    return {
      ipAddress,
      trustedMacAddress,
      trustedSignaturePresent,
      strictModeEnabled,
      isDesktopClient,
      verified: false,
      reason: "invalid trusted mac address",
    }
  }

  const payload = `${trustedMacAddress}|${timestampHeader}|${ipAddress || ""}|${userId}`
  const valid = verifySignature(payload, signatureHeader!, secret)

  return {
    ipAddress,
    trustedMacAddress,
    trustedSignaturePresent,
    strictModeEnabled,
    isDesktopClient,
    verified: valid || !strictModeEnabled,
    reason: valid ? "trusted signature verified" : "trusted signature mismatch",
  }
}

export function withTrustedDeviceMetadata(
  deviceInfo: UnknownRecord | null | undefined,
  trusted: TrustedDeviceResult,
): UnknownRecord {
  const current = deviceInfo && typeof deviceInfo === "object" ? deviceInfo : {}
  return {
    ...current,
    trusted_mac_address: trusted.trustedMacAddress,
    trusted_signature_present: trusted.trustedSignaturePresent,
    trusted_signature_verified: trusted.verified,
    trusted_reason: trusted.reason,
    trusted_ip_address: trusted.ipAddress,
    trusted_strict_mode: trusted.strictModeEnabled,
  }
}
