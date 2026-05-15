import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

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

      const { data: deferments, error: defermentError } = await defermentQuery

      if (defermentError) {
        console.error("[v0] Deferment fetch error:", defermentError)
        // Try simpler query without joins
        const { data: simpleDeferments, error: simpleError } = await supabase
          .from("leave_deferment_requests")
          .select("*")
          .order("created_at", { ascending: false })
        
        if (!simpleError && simpleDeferments) {
          // Manually fetch related data
          for (const def of simpleDeferments) {
            // Get user info
            const { data: user } = await supabase
              .from("user_profiles")
              .select("first_name, last_name, employee_id, position, department_id")
              .eq("id", def.user_id)
              .single()
            
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
        results.deferments = deferments.map(def => ({
          ...def,
          staff_name: def.user_profiles 
            ? `${def.user_profiles.first_name} ${def.user_profiles.last_name}` 
            : "Unknown",
          employee_id: def.user_profiles?.employee_id || "",
          position: def.user_profiles?.position || "",
          department: def.user_profiles?.departments?.name || "",
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

      const { data: recalls, error: recallError } = await recallQuery

      if (recallError) {
        console.error("[v0] Recall fetch error:", recallError)
        // Try simpler query
        const { data: simpleRecalls, error: simpleError } = await supabase
          .from("leave_recall_requests")
          .select("*")
          .order("created_at", { ascending: false })
        
        if (!simpleError && simpleRecalls) {
          for (const rec of simpleRecalls) {
            // Get staff info
            const { data: staff } = await supabase
              .from("user_profiles")
              .select("first_name, last_name, employee_id, position, department_id")
              .eq("id", rec.staff_user_id)
              .single()
            
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
        results.recalls = recalls.map(rec => ({
          ...rec,
          staff_name: rec.staff 
            ? `${rec.staff.first_name} ${rec.staff.last_name}` 
            : "Unknown",
          employee_id: rec.staff?.employee_id || "",
          position: rec.staff?.position || "",
          department: rec.staff?.departments?.name || "",
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
        pending_deferments: results.deferments.filter(d => d.status === "pending").length,
        total_recalls: results.recalls.length,
        pending_recalls: results.recalls.filter(r => r.status === "pending").length
      }
    })
  } catch (error) {
    console.error("[v0] Deferment/Recall fetch error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
