import { createClient, createAdminClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * GET: Fetch approved payment advice memos WHERE this user is the beneficiary staff member.
 * Used so any staff member can see and download their own approved leave payment memos.
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get this user's profile to find their employee_id and staff identifiers
    const { data: profile } = await admin
      .from("user_profiles")
      .select("id, first_name, last_name, employee_id")
      .eq("id", user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ memos: [], count: 0 })
    }

    // Query memos where this person is the beneficiary:
    // Match by staff_id (auth user id) OR by staff_number (employee_id)
    const { data: memos, error } = await admin
      .from("leave_payment_memos")
      .select(`
        id,
        staff_id,
        staff_name,
        staff_number,
        staff_category,
        memo_subject,
        memo_body,
        leave_period_start,
        leave_period_end,
        approved_days,
        signer_name,
        status,
        created_at,
        updated_at
      `)
      .or(`staff_id.eq.${user.id}${profile.employee_id ? `,staff_number.eq.${profile.employee_id}` : ""}`)
      .in("status", ["reviewed_by_hr", "forwarded_to_accounts", "acknowledged_by_accounts", "signed_by_hr_executive", "approved", "finalized"])
      .order("created_at", { ascending: false })
      .limit(50)

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch your memos", details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      memos: memos || [],
      count: memos?.length || 0,
    })
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
