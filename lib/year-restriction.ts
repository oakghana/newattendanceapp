// Year restriction validation for leave applications
// Staff cannot apply for next year if they have pending/applicable leave for current year

import { createClient } from "@/lib/supabase/client"

export async function checkYearRestriction(userId: string, requestedYear: string): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const supabase = createClient()
    
    const currentYear = new Date().getFullYear()
    const requestedYearNum = Number(requestedYear)
    
    // If applying for current year or past, allow
    if (requestedYearNum <= currentYear) {
      return { allowed: true }
    }
    
    // If applying for next year, check for pending/applicable leave in current year
    const { data: currentYearLeaves, error } = await supabase
      .from("leave_plan_requests")
      .select("id, status, leave_year_period")
      .eq("user_id", userId)
      .in("leave_year_period", [`${currentYear}/${currentYear + 1}`])
      .in("status", ["pending_hod", "pending_hr", "hod_approved", "pending_hod_review", "manager_confirmed"])
    
    if (error) {
      console.log("[v0] Year restriction check error:", error.message)
      return { allowed: true } // Allow on error to not block user
    }
    
    if ((currentYearLeaves || []).length > 0) {
      return {
        allowed: false,
        reason: `You have ${currentYearLeaves!.length} pending leave request(s) for ${currentYear}/${currentYear + 1}. Please wait for approval or withdrawal before applying for next year.`
      }
    }
    
    return { allowed: true }
  } catch (e) {
    console.log("[v0] Year restriction check exception:", e)
    return { allowed: true } // Allow on error
  }
}

export function getApplicableLeaveYears(currentYear: number = new Date().getFullYear()): string[] {
  // Generate list of applicable years (current + next 5 years)
  const years: string[] = []
  for (let i = 0; i <= 5; i++) {
    const year = currentYear + i
    years.push(`${year}`)
  }
  return years
}
