import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { month } = await request.json()

    if (!month || !month.match(/^\d{4}-\d{2}$/)) {
      return NextResponse.json(
        { error: "Invalid month format. Use YYYY-MM." },
        { status: 400 }
      )
    }

    // Parse month boundaries
    const [year, monthNum] = month.split("-")
    const monthStart = `${year}-${monthNum}-01`
    const monthEnd = new Date(parseInt(year), parseInt(monthNum), 0)
      .toISOString()
      .split("T")[0]

    console.log("[v0] Query parameters:", {
      month,
      monthStart,
      monthEnd,
      leaveTypeKey: "annual",
      statuses: ["approved", "hr_approved", "hod_approved"],
    })

    // Query staff on annual leave for this month
    // Status can be: approved, hr_approved, hod_approved (all are approved states)
    // FIXED: Use START DATE ONLY to prevent multi-month leaves from appearing in multiple months
    // This ensures each leave generates only ONE payment memo in the month it starts
    // CRITICAL: Use admin client to bypass RLS policies - HR Leave Office needs to see ALL approved leave requests, not just their own
    let staffOnLeave: any = []
    let error: any = null

    try {
      // Try using admin/service role client first to bypass RLS
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

      if (supabaseUrl && supabaseServiceKey) {
        const { createClient: createAdminClient } = await import("@supabase/supabase-js")
        const adminClient = createAdminClient(supabaseUrl, supabaseServiceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        })

        const response = await adminClient
          .from("leave_plan_requests")
          .select(
            `
            id,
            user_id,
            staff_category,
            preferred_start_date,
            preferred_end_date,
            leave_type_key,
            status,
            requested_days,
            adjusted_days,
            entitlement_days,
            travelling_days_added,
            year_outstanding_balance
          `
          )
          .eq("leave_type_key", "annual")
          .in("status", ["approved", "hr_approved", "hod_approved"])
          // Filter by START DATE ONLY - leave must start in this month
          .gte("preferred_start_date", monthStart)
          .lte("preferred_start_date", monthEnd)

        staffOnLeave = response.data || []
        error = response.error
      } else {
        // Fallback to regular client if service role not available
        const response = await supabase
          .from("leave_plan_requests")
          .select(
            `
            id,
            user_id,
            staff_category,
            preferred_start_date,
            preferred_end_date,
            leave_type_key,
            status,
            requested_days,
            adjusted_days,
            entitlement_days,
            travelling_days_added,
            year_outstanding_balance
          `
          )
          .eq("leave_type_key", "annual")
          .in("status", ["approved", "hr_approved", "hod_approved"])
          .gte("preferred_start_date", monthStart)
          .lte("preferred_start_date", monthEnd)

        staffOnLeave = response.data || []
        error = response.error
      }
    } catch (err) {
      console.error("[v0] Error creating admin client:", err)
      error = err
    }

    if (error) {
      console.error("[v0] Error querying staff:", error)
      return NextResponse.json(
        { error: "Failed to query staff", details: error.message },
        { status: 500 }
      )
    }

    // Get leave request IDs and exclude those that already have approved payment advice
    const leaveRequestIds = (staffOnLeave || []).map((r: any) => r.id).filter(Boolean)
    
    let requestsWithPaymentMemos: string[] = []
    
    if (leaveRequestIds.length > 0) {
      // Query leave_payment_memos to find which leave requests already have approved payment memos
      const { data: existingMemos, error: memoError } = await supabase
        .from("leave_payment_memos")
        .select("leave_plan_request_id")
        .in("leave_plan_request_id", leaveRequestIds)
        .eq("status", "approved")
      
      if (!memoError && existingMemos) {
        requestsWithPaymentMemos = existingMemos.map((m: any) => m.leave_plan_request_id).filter(Boolean)
        console.log("[v0] Found existing approved payment memos for requests:", requestsWithPaymentMemos)
      } else if (memoError) {
        console.warn("[v0] Warning checking for existing payment memos:", memoError.message)
      }
    }

    // Filter out leave requests that already have approved payment memos
    const staffOnLeaveFiltered = (staffOnLeave || []).filter((record: any) => 
      !requestsWithPaymentMemos.includes(record.id)
    )

    if (staffOnLeaveFiltered.length < staffOnLeave.length) {
      console.log(`[v0] Filtered out ${staffOnLeave.length - staffOnLeaveFiltered.length} leave requests that already have approved payment memos`)
    }

    // Get user IDs and fetch user profiles separately with department names
    const userIds = (staffOnLeaveFiltered || []).map((r: any) => r.user_id).filter(Boolean)
    
    let userProfiles: any[] = []
    let departments: any[] = []
    let locations: any[] = []
    
    if (userIds.length > 0) {
      // Fetch user profiles with location information
      const { data: profiles, error: profileError } = await supabase
        .from("user_profiles")
        .select("id, first_name, last_name, employee_id, position, role, department_id, assigned_location_id")
        .in("id", userIds)

      if (profileError) {
        console.error("[v0] Error querying user profiles:", profileError)
      } else {
        userProfiles = profiles || []
        console.log("[v0] Fetched user profiles:", userProfiles.length)
      }

      // Fetch all departments
      const { data: depts, error: deptError } = await supabase
        .from("departments")
        .select("id, name")

      if (deptError) {
        console.error("[v0] Error querying departments:", deptError)
      } else {
        departments = depts || []
        console.log("[v0] Fetched departments:", departments.length)
      }

      // Fetch all locations (geofence_locations)
      const { data: locs, error: locError } = await supabase
        .from("geofence_locations")
        .select("id, name")

      if (locError) {
        console.error("[v0] Error querying locations:", locError)
      } else {
        locations = locs || []
        console.log("[v0] Fetched locations:", locations.length)
      }
    }

    // Create a map of departments for easy lookup
    const departmentMap = new Map(departments.map((d: any) => [d.id, d.name]))
    
    // Create a map of locations for easy lookup
    const locationMap = new Map(locations.map((l: any) => [l.id, l.name]))
    
    // Create a map of user profiles for easy lookup
    const profileMap = new Map(userProfiles.map((p: any) => [p.id, p]))

    // If no staff found at all, return early with helpful message
    if (!staffOnLeave || staffOnLeave.length === 0) {
      return NextResponse.json({
        success: true,
        staff: [],
        count: 0,
        message: `No staff members are scheduled on annual leave starting in ${month}. Please verify the leave plan requests have been created and approved.`,
      })
    }

    // Function to calculate actual days between two dates (excluding weekends)
    const calculateLeaveDays = (startDate: string | Date, endDate: string | Date): number => {
      try {
        const start = new Date(startDate)
        const end = new Date(endDate)
        
        // Debug: Check what we received
        console.log("[v0] calculateLeaveDays inputs:", { 
          startDate, 
          endDate,
          startParsed: start.toISOString(),
          endParsed: end.toISOString(),
          startTime: start.getTime(),
          endTime: end.getTime()
        })
        
        // If dates are invalid, return 0
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          console.warn("[v0] Invalid dates for calculation:", { startDate, endDate })
          return 0
        }
        
        // Calculate total days between dates (inclusive of start and end date)
        let totalDays = 0
        const current = new Date(start)
        
        while (current <= end) {
          // Include all days (working days are handled by HR, we just count calendar days)
          totalDays++
          current.setDate(current.getDate() + 1)
        }
        
        console.log("[v0] Calculated leave days:", { startDate, endDate, totalDays })
        return totalDays
      } catch (err) {
        console.error("[v0] Error calculating leave days:", err)
        return 0
      }
    }

    // Function to derive staff_category from role/position if NULL
    const deriveStaffCategory = (record: any, profile: any): string => {
      // If staff_category is already set, use it
      if (record.staff_category) return record.staff_category

      // Otherwise derive from role or position
      if (profile?.role) {
        const role = String(profile.role).toLowerCase()
        if (role.includes("director") || role.includes("manager")) return "Manager"
        if (role.includes("senior") || role.includes("snr")) return "Senior"
      }

      if (profile?.position) {
        const position = String(profile.position).toLowerCase()
        if (position.includes("director") || position.includes("manager")) return "Manager"
        if (position.includes("senior") || position.includes("snr")) return "Senior"
      }

      // Default to Junior if no match
      return "Junior"
    }

    const formatted = (staffOnLeaveFiltered || []).map((record: any) => {
      const profile = profileMap.get(record.user_id)
      const staffCategory = deriveStaffCategory(record, profile)
      
      // CRITICAL: Ensure we always have these required fields
      const recordId = record.id
      const userId = record.user_id
      
      // Construct full name from first_name and last_name
      const fullName = profile ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim() : "Unknown"
      
      // Get department name from the map
      const departmentName = profile?.department_id ? (departmentMap.get(profile.department_id) || "N/A") : (profile?.department_name || "N/A")
      
      // Get location name from the map (beneficiary location)
      const locationName = profile?.assigned_location_id ? (locationMap.get(profile.assigned_location_id) || "HQ") : "HQ"
      
      // Get position from profile
      const position = profile?.position || "N/A"

      return {
        // REQUIRED fields for payment memo creation - MUST ALWAYS BE PRESENT
        leave_plan_request_id: recordId,
        user_id: userId,
        // Staff details
        full_name: fullName,
        staff_number: profile?.employee_id || "N/A",
        employee_id: profile?.employee_id || "N/A",
        department_name: departmentName,
        position: position,
        rank: position, // Actual rank/position name (e.g., "Senior Officer", "Manager"), not category (e.g., "junior")
        category: staffCategory,
        staff_category: staffCategory,
        // Location information (beneficiary location)
        location_name: locationName,
        location_id: profile?.assigned_location_id || null,
        assigned_location_id: profile?.assigned_location_id || null,
        assigned_location_name: locationName,
        // Leave details
        preferred_start_date: record.preferred_start_date,
        preferred_end_date: record.preferred_end_date,
        leave_start_date: record.preferred_start_date,
        leave_end_date: record.preferred_end_date,
        leave_type: record.leave_type_key,
        requested_days: record.requested_days || record.entitlement_days || 0,
        // CRITICAL: Calculate actual days from preferred_start_date to preferred_end_date (database source of truth)
        // NOT from hardcoded adjusted_days field which may contain incorrect values
        calculated_days: calculateLeaveDays(record.preferred_start_date, record.preferred_end_date),
        adjusted_days: record.adjusted_days || record.requested_days || record.entitlement_days || 0,
        // FIXED: Approved days now uses calculated days from actual dates + travelling allowance
        // outstanding balance is not added here as it's a separate adjustment
        approved_days: (
          calculateLeaveDays(record.preferred_start_date, record.preferred_end_date) + 
          (record.travelling_days_added || 0)
        ),
        travelling_days_added: record.travelling_days_added || 0,
      }
    })

    // Filter out any null entries and validate required fields
    const validatedStaff = formatted.filter((staff: any) => {
      return staff !== null && 
             staff.leave_plan_request_id && 
             staff.user_id
    })

    // Check if all staff records are valid
    if (formatted.length > 0 && validatedStaff.length === 0) {
      return NextResponse.json({
        error: "All staff records are missing required fields (leave_plan_request_id or user_id)",
        details: "Staff detection failed to populate required fields",
        staff: [],
        count: 0
      }, { status: 400 })
    }

    // Log verification of calculated days to ensure no hardcoded values are used
    console.log("[v0] Staff detected with date-calculated approved days:", validatedStaff.map((s: any) => ({
      name: s.full_name,
      leave_period: `${s.preferred_start_date} to ${s.preferred_end_date}`,
      calculated_days: s.calculated_days,
      travelling_days: s.travelling_days_added,
      total_approved_days: s.approved_days,
      source: "calculated from preferred_start_date and preferred_end_date (database source of truth)"
    })))

    return NextResponse.json({
      success: true,
      staff: validatedStaff,
      count: validatedStaff.length,
    })
  } catch (err: any) {
    console.error("[v0] Error in detect-staff API:", err)
    const errorMessage = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { 
        error: "Internal server error", 
        details: errorMessage,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
      },
      { status: 500 }
    )
  }
}
