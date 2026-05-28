import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

// HR Executive roles that can approve deferment/recall requests
const HR_EXECUTIVE_ROLES = ["hr_executive", "hr_director", "hr_head", "admin", "department_head", "regional_manager", "hr_officer", "manager_hr", "director_hr", "hr_leave_office"]

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
    
    const hrExecutiveId = searchParams.get('hr_executive_id')
    const userRole = searchParams.get('user_role')
    const status = searchParams.get('status') // 'pending', 'approved', 'rejected', 'all'
    const type = searchParams.get('type') // 'deferment', 'recall', 'all'

    if (!hrExecutiveId) {
      return NextResponse.json(
        { error: "Missing required parameter: hr_executive_id" },
        { status: 400 }
      )
    }

    // Verify user role has access
    const normalizedRole = String(userRole || "").toLowerCase().replace(/[-\s]+/g, "_")
    if (!HR_EXECUTIVE_ROLES.includes(normalizedRole)) {
      return NextResponse.json(
        { error: "Access denied. Only HR Executives can view this data." },
        { status: 403 }
      )
    }

    const results: { deferments: unknown[], recalls: unknown[] } = { deferments: [], recalls: [] }

    // Fetch deferment requests assigned to this HR executive
    if (type === 'deferment' || type === 'all' || !type) {
      let defermentQuery = supabase
        .from('leave_deferment_requests')
        .select(`
          *,
          user_profiles!leave_deferment_requests_user_id_fkey(
            id, first_name, last_name, employee_id, position, department_id,
            departments(name)
          ),
          initiator:user_profiles!leave_deferment_requests_initiated_by_user_id_fkey(
            id, first_name, last_name, employee_id, position
          ),
          leave_plan_requests(
            id, leave_type_key, preferred_start_date, preferred_end_date,
            adjusted_start_date, adjusted_end_date, requested_days, adjusted_days
          )
        `)
        .eq('assigned_hr_executive_id', hrExecutiveId)
        .order('created_at', { ascending: false })

      // Filter by status
      if (status && status !== 'all') {
        if (status === 'pending') {
          defermentQuery = defermentQuery.eq('hr_executive_decision', 'pending')
        } else {
          defermentQuery = defermentQuery.eq('hr_executive_decision', status)
        }
      }

      const { data: deferments, error: defError } = await defermentQuery

      if (defError) {
        console.error('[v0] Error fetching deferments:', defError)
      } else {
        results.deferments = deferments || []
      }
    }

    // Fetch recall requests assigned to this HR executive
    if (type === 'recall' || type === 'all' || !type) {
      let recallQuery = supabase
        .from('leave_recall_requests')
        .select(`
          *,
          user_profiles!leave_recall_requests_staff_user_id_fkey(
            id, first_name, last_name, employee_id, position, department_id,
            departments(name)
          ),
          initiator:user_profiles!leave_recall_requests_initiated_by_user_id_fkey(
            id, first_name, last_name, employee_id, position
          ),
          leave_plan_requests(
            id, leave_type_key, preferred_start_date, preferred_end_date,
            adjusted_start_date, adjusted_end_date
          )
        `)
        .eq('assigned_hr_executive_id', hrExecutiveId)
        .order('created_at', { ascending: false })

      // Filter by status
      if (status && status !== 'all') {
        if (status === 'pending') {
          recallQuery = recallQuery.eq('hr_executive_decision', 'pending')
        } else {
          recallQuery = recallQuery.eq('hr_executive_decision', status)
        }
      }

      const { data: recalls, error: recError } = await recallQuery

      if (recError) {
        console.error('[v0] Error fetching recalls:', recError)
      } else {
        results.recalls = recalls || []
      }
    }

    return NextResponse.json({
      ...results,
      total: results.deferments.length + results.recalls.length,
      pending_count: [...results.deferments, ...results.recalls].filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (r: any) => r.hr_executive_decision === 'pending'
      ).length
    })
  } catch (error) {
    console.error("[v0] HR Executive requests API error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
