import { createClient } from "@/lib/supabase/server"

export interface GhanaHoliday {
  id?: string
  holiday_date: string
  holiday_name: string
  is_custom: boolean
}

// Ghana public holidays for 2024-2027
const GHANA_PUBLIC_HOLIDAYS: GhanaHoliday[] = [
  { holiday_date: "2024-01-01", holiday_name: "New Year's Day", is_custom: false },
  { holiday_date: "2024-03-06", holiday_name: "Founders' Day", is_custom: false },
  { holiday_date: "2024-03-29", holiday_name: "Good Friday", is_custom: false },
  { holiday_date: "2024-04-01", holiday_name: "Easter Monday", is_custom: false },
  { holiday_date: "2024-05-01", holiday_name: "Labour Day", is_custom: false },
  { holiday_date: "2024-07-01", holiday_name: "Republic Day", is_custom: false },
  { holiday_date: "2024-09-21", holiday_name: "Independence Day", is_custom: false },
  { holiday_date: "2024-12-01", holiday_name: "Farmer's Day", is_custom: false },
  { holiday_date: "2024-12-25", holiday_name: "Christmas Day", is_custom: false },
  { holiday_date: "2024-12-26", holiday_name: "Boxing Day", is_custom: false },
  
  { holiday_date: "2025-01-01", holiday_name: "New Year's Day", is_custom: false },
  { holiday_date: "2025-03-06", holiday_name: "Founders' Day", is_custom: false },
  { holiday_date: "2025-04-18", holiday_name: "Good Friday", is_custom: false },
  { holiday_date: "2025-04-21", holiday_name: "Easter Monday", is_custom: false },
  { holiday_date: "2025-05-01", holiday_name: "Labour Day", is_custom: false },
  { holiday_date: "2025-07-01", holiday_name: "Republic Day", is_custom: false },
  { holiday_date: "2025-09-21", holiday_name: "Independence Day", is_custom: false },
  { holiday_date: "2025-12-01", holiday_name: "Farmer's Day", is_custom: false },
  { holiday_date: "2025-12-25", holiday_name: "Christmas Day", is_custom: false },
  { holiday_date: "2025-12-26", holiday_name: "Boxing Day", is_custom: false },
  
  { holiday_date: "2026-01-01", holiday_name: "New Year's Day", is_custom: false },
  { holiday_date: "2026-03-06", holiday_name: "Founders' Day", is_custom: false },
  { holiday_date: "2026-04-10", holiday_name: "Good Friday", is_custom: false },
  { holiday_date: "2026-04-13", holiday_name: "Easter Monday", is_custom: false },
  { holiday_date: "2026-05-01", holiday_name: "Labour Day", is_custom: false },
  { holiday_date: "2026-07-01", holiday_name: "Republic Day", is_custom: false },
  { holiday_date: "2026-09-21", holiday_name: "Independence Day", is_custom: false },
  { holiday_date: "2026-12-01", holiday_name: "Farmer's Day", is_custom: false },
  { holiday_date: "2026-12-25", holiday_name: "Christmas Day", is_custom: false },
  { holiday_date: "2026-12-26", holiday_name: "Boxing Day", is_custom: false },
  
  { holiday_date: "2027-01-01", holiday_name: "New Year's Day", is_custom: false },
  { holiday_date: "2027-03-06", holiday_name: "Founders' Day", is_custom: false },
  { holiday_date: "2027-04-02", holiday_name: "Good Friday", is_custom: false },
  { holiday_date: "2027-04-05", holiday_name: "Easter Monday", is_custom: false },
  { holiday_date: "2027-05-01", holiday_name: "Labour Day", is_custom: false },
  { holiday_date: "2027-07-01", holiday_name: "Republic Day", is_custom: false },
  { holiday_date: "2027-09-21", holiday_name: "Independence Day", is_custom: false },
  { holiday_date: "2027-12-01", holiday_name: "Farmer's Day", is_custom: false },
  { holiday_date: "2027-12-25", holiday_name: "Christmas Day", is_custom: false },
  { holiday_date: "2027-12-26", holiday_name: "Boxing Day", is_custom: false },
]

/**
 * Check if a date is a weekend (Saturday or Sunday)
 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay()
  return day === 0 || day === 6 // 0 = Sunday, 6 = Saturday
}

/**
 * Fetch all holidays for a date range from database
 */
export async function getHolidaysForRange(
  startDate: Date,
  endDate: Date
): Promise<GhanaHoliday[]> {
  try {
    const supabase = await createClient()
    const startStr = startDate.toISOString().split("T")[0]
    const endStr = endDate.toISOString().split("T")[0]

    const { data, error } = await supabase
      .from("ghana_public_holidays")
      .select("*")
      .gte("holiday_date", startStr)
      .lte("holiday_date", endStr)
      .order("holiday_date")

    if (error) {
      console.error("[v0] Error fetching holidays:", error)
      return []
    }

    return data || []
  } catch (err) {
    console.error("[v0] Error getting holidays for range:", err)
    return []
  }
}

/**
 * Check if a specific date is a holiday
 */
export async function isHoliday(date: Date): Promise<boolean> {
  const dateStr = date.toISOString().split("T")[0]
  const holidays = await getHolidaysForRange(date, date)
  return holidays.some((h) => h.holiday_date === dateStr)
}

/**
 * Calculate leave days excluding weekends and holidays
 * @param startDate Leave start date
 * @param endDate Leave end date (inclusive)
 * @returns Number of working days (excluding weekends and holidays)
 */
export async function calculateLeaveDaysExcludingHolidaysWeekends(
  startDate: Date,
  endDate: Date
): Promise<number> {
  // Ensure end date is after start date
  if (endDate < startDate) {
    return 0
  }

  // Get all holidays in the range
  const holidays = await getHolidaysForRange(startDate, endDate)
  const holidayDates = new Set(holidays.map((h) => h.holiday_date))

  let workingDays = 0
  const current = new Date(startDate)

  // Iterate through each day in the range
  while (current <= endDate) {
    const dateStr = current.toISOString().split("T")[0]
    const isWeek = !isWeekend(current)
    const isHol = !holidayDates.has(dateStr)

    if (isWeek && isHol) {
      workingDays++
    }

    current.setDate(current.getDate() + 1)
  }

  return workingDays
}

/**
 * Calculate total calendar days (simple count for reference)
 */
export function calculateCalendarDays(startDate: Date, endDate: Date): number {
  const time = endDate.getTime() - startDate.getTime()
  return Math.floor(time / (1000 * 60 * 60 * 24)) + 1 // +1 to include both start and end days
}

/**
 * Initialize Ghana public holidays in database (one-time setup)
 */
export async function initializeGhanaHolidays(): Promise<void> {
  try {
    const supabase = await createClient()

    // Check if holidays already exist
    const { data: existing } = await supabase
      .from("ghana_public_holidays")
      .select("id")
      .limit(1)

    if (existing && existing.length > 0) {
      console.log("[v0] Ghana holidays already initialized")
      return
    }

    // Insert all Ghana public holidays
    const { error } = await supabase.from("ghana_public_holidays").insert(GHANA_PUBLIC_HOLIDAYS)

    if (error) {
      console.error("[v0] Error initializing Ghana holidays:", error)
    } else {
      console.log("[v0] Ghana public holidays initialized successfully")
    }
  } catch (err) {
    console.error("[v0] Error in initializeGhanaHolidays:", err)
  }
}

/**
 * Get summary of Ghana holidays by month
 */
export async function getHolidaysSummaryByMonth(year: number): Promise<Record<string, string[]>> {
  const startDate = new Date(year, 0, 1)
  const endDate = new Date(year, 11, 31)

  const holidays = await getHolidaysForRange(startDate, endDate)
  const summary: Record<string, string[]> = {}

  holidays.forEach((holiday) => {
    const date = new Date(holiday.holiday_date)
    const month = (date.getMonth() + 1).toString().padStart(2, "0")
    const monthKey = `${year}-${month}`

    if (!summary[monthKey]) {
      summary[monthKey] = []
    }
    summary[monthKey].push(holiday.holiday_name)
  })

  return summary
}
