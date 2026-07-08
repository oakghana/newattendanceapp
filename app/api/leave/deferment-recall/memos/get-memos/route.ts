import { createClient, createAdminClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const memoType = searchParams.get('type') || 'all' // 'deferment', 'recall', or 'all'
    const status = searchParams.get('status') || 'all' // 'pending', 'approved', 'rejected', 'all'
    const search = searchParams.get('search') || ''
    const departmentId = searchParams.get('department_id') || ''

    const results: {
      deferment_memos: any[]
      recall_memos: any[]
      total: number
      pending_count: number
    } = {
      deferment_memos: [],
      recall_memos: [],
      total: 0,
      pending_count: 0
    }

    // Fetch deferment memos assigned to this HR Executive
    if (memoType === 'deferment' || memoType === 'all') {
      let query = admin
        .from("deferment_memos")
        .select(`
          *,
          staff:user_profiles!deferment_memos_staff_id_fkey(
            id, first_name, last_name, employee_id, position, department_id,
            departments(name)
          ),
          deferment_request:leave_deferment_requests(
            id, reason, requested_deferment_year, requested_deferment_period,
            created_at, assigned_hr_executive_id
          ),
          signer:user_profiles!deferment_memos_hr_signer_id_fkey(
            first_name, last_name, position
          )
        `)
        // Filter: Only show memos assigned to this HR Executive
        // A memo should be visible if:
        // 1. It's assigned to the current user in the deferment request, OR
        // 2. The current user is the HR signer of the memo (already approved/rejected)
        .or(`deferment_request.assigned_hr_executive_id.eq.${user.id},hr_signer_id.eq.${user.id}`)
        .order('generated_at', { ascending: false })

      // Filter by status
      if (status !== 'all') {
        query = query.eq('status', status)
      }

      // Filter by search term
      if (search) {
        query = query.or(
          `staff->first_name.ilike.%${search}%,staff->last_name.ilike.%${search}%,staff->employee_id.ilike.%${search}%`
        )
      }

      const { data: defermentMemos, error: defError } = await query

      if (defError) {
        console.error("[v0] Error fetching deferment memos:", defError)
      } else {
        results.deferment_memos = defermentMemos || []
      }
    }

    // Fetch recall memos assigned to this HR Executive
    if (memoType === 'recall' || memoType === 'all') {
      let query = admin
        .from("recall_memos")
        .select(`
          *,
          staff:user_profiles!recall_memos_staff_id_fkey(
            id, first_name, last_name, employee_id, position, department_id,
            departments(name)
          ),
          recall_request:leave_recall_requests(
            id, recall_reason, recall_date, created_at, assigned_hr_executive_id
          ),
          signer:user_profiles!recall_memos_hr_signer_id_fkey(
            first_name, last_name, position
          )
        `)
        // Filter: Only show memos assigned to this HR Executive
        // A memo should be visible if:
        // 1. It's assigned to the current user in the recall request, OR
        // 2. The current user is the HR signer of the memo (already approved/rejected)
        .or(`recall_request.assigned_hr_executive_id.eq.${user.id},hr_signer_id.eq.${user.id}`)
        .order('generated_at', { ascending: false })

      // Filter by status
      if (status !== 'all') {
        query = query.eq('status', status)
      }

      // Filter by search term
      if (search) {
        query = query.or(
          `staff->first_name.ilike.%${search}%,staff->last_name.ilike.%${search}%,staff->employee_id.ilike.%${search}%`
        )
      }

      const { data: recallMemos, error: recError } = await query

      if (recError) {
        console.error("[v0] Error fetching recall memos:", recError)
      } else {
        results.recall_memos = recallMemos || []
      }
    }

    // Calculate totals
    const allMemos = [...results.deferment_memos, ...results.recall_memos]
    results.total = allMemos.length
    results.pending_count = allMemos.filter(m => m.status === 'pending').length

    return NextResponse.json(results)
  } catch (error) {
    console.error("[v0] Error in get-memos:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
