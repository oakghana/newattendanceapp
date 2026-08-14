/**
 * Location Mapping Utility
 * Maps QCC locations to standardized memo addresses
 */

export const NON_REGIONAL_LOCATION_NAMES = [
  "Awutu Stores",
  "HEAD OFFICE SWANZY ARCADE",
  "QCC Head Office",
  "Nsawam Archive Center",
] as const

export function normalizeLocationName(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
}

export function isNonRegionalLocation(value: unknown): boolean {
  const normalized = normalizeLocationName(value)
  return NON_REGIONAL_LOCATION_NAMES.some((name) => normalizeLocationName(name) === normalized)
}

export const LOCATION_MEMO_MAPPINGS: Record<string, string> = {
  "QCC Head Office SWANZY ARCADE": "HEAD OFFICE ACCRA, GHANA",
  "QCC Head Office Swanzy Arcade": "HEAD OFFICE ACCRA, GHANA",
  "QCC HEAD OFFICE SWANZY ARCADE": "HEAD OFFICE ACCRA, GHANA",
  "Head Office Swanzy Arcade": "HEAD OFFICE ACCRA, GHANA",
  "SWANZY ARCADE": "HEAD OFFICE ACCRA, GHANA",
  "Swanzy Arcade": "HEAD OFFICE ACCRA, GHANA",
}

/**
 * Get the standardized memo location address for a given assigned location
 * @param locationName - The assigned location name from user_profiles or assigned_locations
 * @param fallback - Fallback address if no mapping found
 * @returns Standardized location for memo display
 */
export function getMemoLocationAddress(locationName: string | null | undefined, fallback: string = "QCC Office"): string {
  if (!locationName) return fallback

  // Check for exact matches first
  if (LOCATION_MEMO_MAPPINGS[locationName]) {
    return LOCATION_MEMO_MAPPINGS[locationName]
  }

  // Check for case-insensitive matches
  const normalized = locationName.toUpperCase().trim()
  for (const [key, value] of Object.entries(LOCATION_MEMO_MAPPINGS)) {
    if (key.toUpperCase() === normalized) {
      return value
    }
  }

  // Check if locationName contains any mapping keywords
  for (const [key, value] of Object.entries(LOCATION_MEMO_MAPPINGS)) {
    if (normalized.includes(key.toUpperCase())) {
      return value
    }
  }

  // Return the location name as-is if no mapping found
  return locationName
}

/**
 * All locations that should display "HEAD OFFICE ACCRA, GHANA" in memos
 */
export const HEAD_OFFICE_LOCATIONS = [
  "QCC Head Office",
  "QCC HEAD OFFICE",
  "HEAD OFFICE",
  "Swanzy Arcade",
  "SWANZY ARCADE",
  "Accra",
  "ACCRA",
]

/**
 * Get location address for display in memos (with standardization)
 */
export function formatMemoLocationAddress(
  assignedLocationName: string | null | undefined,
  assignedLocationAddress: string | null | undefined,
  employeeDistrict: string | null | undefined
): string {
  // If assigned location is a head office location, use standardized format
  if (assignedLocationName) {
    const memoAddress = getMemoLocationAddress(assignedLocationName)
    if (memoAddress !== assignedLocationName) {
      // Mapping was applied - use it
      return memoAddress
    }
  }

  // Fall back to provided address
  if (assignedLocationAddress) {
    return assignedLocationAddress
  }

  // Fall back to district
  if (employeeDistrict) {
    return employeeDistrict
  }

  return "QCC Office"
}
