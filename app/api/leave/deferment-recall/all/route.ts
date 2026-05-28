import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

// Define roles that can see ALL deferment/recall requests
const HR_ADMIN_ROLES = ["hr_leave_office", "admin", "manager_hr", "director_hr", "hr_director", "hr_officer", "hr_office", "hr"]

// Define roles that can see department/regional data
const HOD_RM_ROLES = ["department_head", "regional_manager"]

export async function GET(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    const { searchParams } = new URL(request.url)
    const type = searchParams.get("type") || "all" // "deferment", "recall", or "all"
    const status = searchParams.get("status") // "pending", "approved", "rejected", or null for all
    
    // Role-based access control parameters
    const userId = searchParams.get("user_id")
    const userRole = searchParams.get("user_role")?.toLowerCase().replace(/[-\s]+/g, "_") || ""
    const userDepartment = searchParams.get("user_department")
    const userLocation = searchParams.get("user_location")

    // Determine access level
    const canViewAll = HR_ADMIN_ROLES.includes(userRole)
    const isHodRm = HOD_RM_ROLES.includes(userRole)
    const isNormalStaff = !canViewAll && !isHodRm

    const results: { deferments: any[], recalls: any[] } = { deferments: [], recalls: [] }

    // Fetch deferment requests with leave request and user info
    if (type === "all" || type === "deferment") {
      let defermentQuery = supabase
        .from("leave_deferment_requests")
        .select(`
          *,
          leave_plan_requests!leave_deferment_requests_leave_plan_request_id_fkey (
            id,
            leave_type_key,
            preferred_start_date,
            preferred_end_date,
            requested_days,
            adjusted_days,
            adjusted_start_date,
            adjusted_end_date,
            status,
            user_id,
            leave_year_period
          ),
          user_profiles!leave_deferment_requests_user_id_fkey (
            id,
            first_name,
            last_name,
            employee_id,
            position,
            department_id,
            assigned_location_id,
            departments (name)
          ),
          hod_reviewer:user_profiles!leave_deferment_requests_hod_reviewed_by_fkey (
            first_name,
            last_name
          ),
          hr_reviewer:user_profiles!leave_deferment_requests_hr_office_reviewed_by_fkey (
            first_name,
            last_name
          )
        `)
        .order("created_at", { ascending: false })

      if (status) {
        defermentQuery = defermentQuery.eq("status", status)
      }

      // Role-based filtering for normal staff - only their own requests
      if (isNormalStaff && userId) {
        defermentQuery = defermentQuery.eq("user_id", userId)
      }

      const { data: deferments, error: defermentError } = await defermentQuery

      if (defermentError) {
        console.error("[v0] Deferment fetch error:", defermentError)
        // Try simpler query without joins
        let simpleDefermentQuery = supabase
          .from("leave_deferment_requests")
          .select("*")
          .order("created_at", { ascending: false })
        
        if (isNormalStaff && userId) {
          simpleDefermentQuery = simpleDefermentQuery.eq("user_id", userId)
        }
        
        const { data: simpleDeferments, error: simpleError } = await simpleDefermentQuery
        
        if (!simpleError && simpleDeferments) {
          // Manually fetch related data
          for (const def of simpleDeferments) {
            // Get user info (staff whose leave is being deferred)
            const { data: user } = await supabase
              .from("user_profiles")
              .select("first_name, last_name, employee_id, position, department_id, assigned_location_id")
              .eq("id", def.user_id)
              .single()
            
            // Get initiator info (HOD/RM who made the request)
            let initiator = null
            if (def.initiated_by_user_id) {
              const { data: initiatorData } = await supabase
                .from("user_profiles")
                .select("id, first_name, last_name, employee_id, position")
                .eq("id", def.initiated_by_user_id)
                .single()
              initiator = initiatorData
            }
            
            // HOD/RM filtering - only their department/location
            if (isHodRm && user) {
              const userDeptId = user.department_id
              const userLocId = user.assigned_location_id
              
              // Get current user's department/location for comparison
              if (userId) {
                const { data: currentUser } = await supabase
                  .from("user_profiles")
                  .select("department_id, assigned_location_id")
                  .eq("id", userId)
                  .single()
                
                if (currentUser) {
                  // Skip if not in same department (for HOD) or location (for RM)
                  if (userRole === "department_head" && userDeptId !== currentUser.department_id) {
                    continue
                  }
                  if (userRole === "regional_manager" && userLocId !== currentUser.assigned_location_id) {
                    continue
                  }
                }
              }
            }
            
            // Get leave request info
            const { data: leaveReq } = await supabase
              .from("leave_plan_requests")
              .select("id, leave_type_key, preferred_start_date, preferred_end_date, requested_days, status, leave_year_period")
              .eq("id", def.leave_plan_request_id)
              .single()
            
            // Get department name
            let deptName = ""
            if (user?.department_id) {
              const { data: dept } = await supabase
                .from("departments")
                .select("name")
                .eq("id", user.department_id)
                .single()
              deptName = dept?.name || ""
            }

            results.deferments.push({
              ...def,
              staff_name: user ? `${user.first_name} ${user.last_name}` : "Unknown",
              employee_id: user?.employee_id || "",
              position: user?.position || "",
              department: deptName,
              department_id: user?.department_id,
              location_id: user?.assigned_location_id,
              initiator: initiator,
              initiator_name: initiator ? `${initiator.first_name} ${initiator.last_name}` : null,
              leave_type: leaveReq?.leave_type_key || "",
              start_date: leaveReq?.preferred_start_date,
              end_date: leaveReq?.preferred_end_date,
              requested_days: leaveReq?.requested_days,
              leave_status: leaveReq?.status,
              leave_year: leaveReq?.leave_year_period
            })
          }
        }
      } else if (deferments) {
        // Filter results based on role for HOD/RM
        let filteredDeferments = deferments
        
        if (isHodRm && userId) {
          // Get current user's department/location
          const { data: currentUser } = await supabase
            .from("user_profiles")
            .select("department_id, assigned_location_id")
            .eq("id", userId)
            .single()
          
          if (currentUser) {
            filteredDeferments = deferments.filter(def => {
              const userDeptId = def.user_profiles?.department_id
              const userLocId = def.user_profiles?.assigned_location_id
              
              if (userRole === "department_head") {
                return userDeptId === currentUser.department_id
              }
              if (userRole === "regional_manager") {
                return userLocId === currentUser.assigned_location_id
              }
              return true
            })
          }
        }
        
        results.deferments = filteredDeferments.map(def => ({
          ...def,
          staff_name: def.user_profiles 
            ? `${def.user_profiles.first_name} ${def.user_profiles.last_name}` 
            : "Unknown",
          employee_id: def.user_profiles?.employee_id || "",
          position: def.user_profiles?.position || "",
          department: def.user_profiles?.departments?.name || "",
          department_id: def.user_profiles?.department_id,
          location_id: def.user_profiles?.assigned_location_id,
          leave_type: def.leave_plan_requests?.leave_type_key || "",
          start_date: def.leave_plan_requests?.preferred_start_date,
          end_date: def.leave_plan_requests?.preferred_end_date,
          requested_days: def.leave_plan_requests?.requested_days,
          leave_status: def.leave_plan_requests?.status,
          leave_year: def.leave_plan_requests?.leave_year_period,
          hod_reviewer_name: def.hod_reviewer 
            ? `${def.hod_reviewer.first_name} ${def.hod_reviewer.last_name}` 
            : null,
          hr_reviewer_name: def.hr_reviewer 
            ? `${def.hr_reviewer.first_name} ${def.hr_reviewer.last_name}` 
            : null
        }))
      }
    }

    // Fetch recall requests with leave request and user info
    if (type === "all" || type === "recall") {
      let recallQuery = supabase
        .from("leave_recall_requests")
        .select(`
          *,
          leave_plan_requests!leave_recall_requests_leave_plan_request_id_fkey (
            id,
            leave_type_key,
            preferred_start_date,
            preferred_end_date,
            requested_days,
            status,
            user_id,
            leave_year_period
          ),
          staff:user_profiles!leave_recall_requests_staff_user_id_fkey (
            id,
            first_name,
            last_name,
            employee_id,
            position,
            department_id,
            assigned_location_id,
            departments (name)
          ),
          initiator:user_profiles!leave_recall_requests_initiated_by_user_id_fkey (
            first_name,
            last_name,
            position
          ),
          hr_reviewer:user_profiles!leave_recall_requests_hr_reviewed_by_fkey (
            first_name,
            last_name
          )
        `)
        .order("created_at", { ascending: false })

      if (status) {
        recallQuery = recallQuery.eq("status", status)
      }

      // Role-based filtering for normal staff - only their own requests
      if (isNormalStaff && userId) {
        recallQuery = recallQuery.eq("staff_user_id", userId)
      }

      const { data: recalls, error: recallError } = await recallQuery

      if (recallError) {
        console.error("[v0] Recall fetch error:", recallError)
        // Try simpler query
        let simpleRecallQuery = supabase
          .from("leave_recall_requests")
          .select("*")
          .order("created_at", { ascending: false })
        
        if (isNormalStaff && userId) {
          simpleRecallQuery = simpleRecallQuery.eq("staff_user_id", userId)
        }
        
        const { data: simpleRecalls, error: simpleError } = await simpleRecallQuery
        
        if (!simpleError && simpleRecalls) {
          for (const rec of simpleRecalls) {
            // Get staff info
            const { data: staff } = await supabase
              .from("user_profiles")
              .select("first_name, last_name, employee_id, position, department_id, assigned_location_id")
              .eq("id", rec.staff_user_id)
              .single()
            
            // HOD/RM filtering
            if (isHodRm && staff && userId) {
              const { data: currentUser } = await supabase
                .from("user_profiles")
                .select("department_id, assigned_location_id")
                .eq("id", userId)
                .single()
              
              if (currentUser) {
                if (userRole === "department_head" && staff.department_id !== currentUser.department_id) {
                  continue
                }
                if (userRole === "regional_manager" && staff.assigned_location_id !== currentUser.assigned_location_id) {
                  continue
                }
              }
            }
            
            // Get initiator info
            const { data: initiator } = await supabase
              .from("user_profiles")
              .select("first_name, last_name, position")
              .eq("id", rec.initiated_by_user_id)
              .single()
            
            // Get leave request info
            const { data: leaveReq } = await supabase
              .from("leave_plan_requests")
              .select("id, leave_type_key, preferred_start_date, preferred_end_date, requested_days, status, leave_year_period")
              .eq("id", rec.leave_plan_request_id)
              .single()
            
            // Get department name
            let deptName = ""
            if (staff?.department_id) {
              const { data: dept } = await supabase
                .from("departments")
                .select("name")
                .eq("id", staff.department_id)
                .single()
              deptName = dept?.name || ""
            }

            results.recalls.push({
              ...rec,
              staff_name: staff ? `${staff.first_name} ${staff.last_name}` : "Unknown",
              employee_id: staff?.employee_id || "",
              position: staff?.position || "",
              department: deptName,
              department_id: staff?.department_id,
              location_id: staff?.assigned_location_id,
              initiator_name: initiator ? `${initiator.first_name} ${initiator.last_name}` : "Unknown",
              initiator_position: initiator?.position || "",
              leave_type: leaveReq?.leave_type_key || "",
              start_date: leaveReq?.preferred_start_date,
              end_date: leaveReq?.preferred_end_date,
              requested_days: leaveReq?.requested_days,
              leave_status: leaveReq?.status,
              leave_year: leaveReq?.leave_year_period
            })
          }
        }
      } else if (recalls) {
        // Filter results based on role for HOD/RM
        let filteredRecalls = recalls
        
        if (isHodRm && userId) {
          const { data: currentUser } = await supabase
            .from("user_profiles")
            .select("department_id, assigned_location_id")
            .eq("id", userId)
            .single()
          
          if (currentUser) {
            filteredRecalls = recalls.filter(rec => {
              const staffDeptId = rec.staff?.department_id
              const staffLocId = rec.staff?.assigned_location_id
              
              if (userRole === "department_head") {
                return staffDeptId === currentUser.department_id
              }
              if (userRole === "regional_manager") {
                return staffLocId === currentUser.assigned_location_id
              }
              return true
            })
          }
        }
        
        results.recalls = filteredRecalls.map(rec => ({
          ...rec,
          staff_name: rec.staff 
            ? `${rec.staff.first_name} ${rec.staff.last_name}` 
            : "Unknown",
          employee_id: rec.staff?.employee_id || "",
          position: rec.staff?.position || "",
          department: rec.staff?.departments?.name || "",
          department_id: rec.staff?.department_id,
          location_id: rec.staff?.assigned_location_id,
          initiator_name: rec.initiator 
            ? `${rec.initiator.first_name} ${rec.initiator.last_name}` 
            : "Unknown",
          initiator_position: rec.initiator?.position || "",
          leave_type: rec.leave_plan_requests?.leave_type_key || "",
          start_date: rec.leave_plan_requests?.preferred_start_date,
          end_date: rec.leave_plan_requests?.preferred_end_date,
          requested_days: rec.leave_plan_requests?.requested_days,
          leave_status: rec.leave_plan_requests?.status,
          leave_year: rec.leave_plan_requests?.leave_year_period,
          hr_reviewer_name: rec.hr_reviewer 
            ? `${rec.hr_reviewer.first_name} ${rec.hr_reviewer.last_name}` 
            : null
        }))
      }
    }

    return NextResponse.json({
      success: true,
      deferments: results.deferments,
      recalls: results.recalls,
      summary: {
        total_deferments: results.deferments.length,
        pending_deferments: results.deferments.filter(d => {
          const status = String(d.status || "").toLowerCase()
          return status === "pending" || 
                 status.includes("pending") || 
                 status === "sent_to_hr_executive" ||
                 status === "hod_approved" ||
                 (d.hr_office_decision === null && d.hod_decision !== "rejected")
        }).length,
        total_recalls: results.recalls.length,
        pending_recalls: results.recalls.filter(r => {
          const status = String(r.status || "").toLowerCase()
          return status === "pending" || 
                 status.includes("pending") || 
                 (r.hr_decision === null && r.hod_decision !== "rejected")
        }).length
      },
      access_level: canViewAll ? "full" : isHodRm ? "department_regional" : "own_only"
    })
  } catch (error) {
    console.error("[v0] Deferment/Recall fetch error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
