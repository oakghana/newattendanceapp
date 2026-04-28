export interface DeviceInfo {
  device_id: string
  device_name: string
  device_type: string
  browser_info: string
  ip_address?: string
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean
  isLaptop?: boolean
}

const DEVICE_ID_STORAGE_KEY = "qcc_device_fingerprint_v3"

function hashString(input: string): string {
  // FNV-1a 32-bit hash (fast, deterministic, browser-safe)
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = (hash * 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, "0")
}

function buildStableFingerprintSource(): string {
  // Keep fingerprint browser-agnostic so the same physical device remains the same
  // identity across Chrome/Edge/Firefox for the same staff account.
  const uaData = (navigator as any).userAgentData
  const brands = uaData && Array.isArray(uaData.brands)
    ? uaData.brands.map((b: any) => `${b.brand}:${b.version}`).join(",")
    : ""
  
  return [
    navigator.platform || "",
    navigator.language || "",
    navigator.languages?.join(",") || "",
    `${screen.width}x${screen.height}`,
    String(screen.colorDepth || ""),
    String(new Date().getTimezoneOffset()),
    String(navigator.hardwareConcurrency || ""),
    String((navigator as any).deviceMemory || ""),
    String(navigator.maxTouchPoints || 0),
    navigator.vendor || "",
    brands,
  ].join("|")
}

function formatDeviceId(hash: string): string {
  const normalized = hash.toUpperCase().padEnd(12, "0").slice(0, 12)
  const chunks = normalized.match(/.{1,4}/g) || [normalized]
  return `DEV:${chunks.join("-")}`
}

export function generateDeviceId(): string {
  if (typeof document === "undefined") {
    throw new Error("generateDeviceId must be called on the client side.")
  }

  // Browsers do not expose the real MAC address for privacy reasons.
  // We use a stable device fingerprint id instead.
  try {
    const storedId = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY)
    if (storedId && storedId.startsWith("DEV:")) {
      return storedId
    }
  } catch {
    // ignore localStorage failures
  }

  const fingerprintSource = buildStableFingerprintSource()
  const deviceId = formatDeviceId(hashString(fingerprintSource))

  try {
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId)
  } catch {
    // ignore localStorage failures
  }

  return deviceId
}

export function getDeviceInfo(): DeviceInfo {
  if (typeof window === "undefined") {
    throw new Error("getDeviceInfo must be called on the client side.")
  }

  const deviceId = generateDeviceId()
  function getFriendlyDeviceName(): string {
    try {
      // Prefer userAgentData when available (Chromium-based browsers)
      const uaData = (navigator as any).userAgentData
      if (uaData && uaData.platform) {
        const brand = Array.isArray(uaData.brands) && uaData.brands.length > 0 ? uaData.brands[0].brand : uaData.ua || 'Browser'
        const platform = uaData.platform || navigator.platform || 'Device'
        return `${brand} on ${platform}`
      }

      // Fallback: detect browser name + simplified platform
      const ua = navigator.userAgent || ''
      let browser = 'Browser'
      if (/firefox/i.test(ua)) browser = 'Firefox'
      else if (/edg\//i.test(ua)) browser = 'Edge'
      else if (/chrome\//i.test(ua) && !/edg\//i.test(ua)) browser = 'Chrome'
      else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari'
      else if (/opr\//i.test(ua) || /opera/i.test(ua)) browser = 'Opera'

      const platform = navigator.platform || (() => {
        const lower = ua.toLowerCase()
        if (lower.includes('windows')) return 'Windows'
        if (lower.includes('mac os') || lower.includes('macintosh')) return 'macOS'
        if (lower.includes('android')) return 'Android'
        if (lower.includes('iphone') || lower.includes('ipad')) return 'iOS'
        if (lower.includes('linux')) return 'Linux'
        return 'Device'
      })()

      // Keep result short — avoid exposing full UA string in UI
      return `${browser} on ${platform}`
    } catch (e) {
      return navigator.userAgent.slice(0, 80) + (navigator.userAgent.length > 80 ? '…' : '')
    }
  }

  const deviceName = getFriendlyDeviceName()
  const isMobile = /Mobi|Android/i.test(navigator.userAgent)
  const isTablet = /Tablet|iPad/i.test(navigator.userAgent)
  const isDesktop = !isMobile && !isTablet
  const isLaptop = isDesktop // Heuristic: treat desktops as laptops for broader compatibility

  return {
    device_id: deviceId,
    device_name: deviceName,
    device_type: isMobile ? "mobile" : isTablet ? "tablet" : isLaptop ? "laptop" : "desktop",
    browser_info: navigator.userAgent,
    isMobile,
    isTablet,
    isDesktop,
    isLaptop,
  }
}
