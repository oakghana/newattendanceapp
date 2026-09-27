import { createAdminClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

// GET /api/loan/staff-history?userId=<uid>
// Returns the current-year and previous-year loan requests for a given staff member.
// Used by HR/Loan Office reviewers to see a staff member's full loan history —
// what has already been approved or denied — before deciding on a new request.
const APPROVED_STATUSES = new Set(["approved_director", "director_approved", "md_approved", "disbursed", "completed"])
const REJECTED_STATUSES = new Set(["hod_rejected", "rejected_fd", "committee_rejected", "director_rejected", "cancelled", "withdrawn"])
const PENDING_STATUSES = new Set([
  "pending_hod",
  "pending_loan_office",
  "pending_fd",
  "pending_committee",
  "pending_hr_terms",
  "pending_hr_executive",
  "pending_director",
])

function statusBucket(status: string) {
  if (APPROVED_STATUSES.has(status)) return "approved"
  if (REJECTED_STATUSES.has(status)) return "rejected"
  if (PENDING_STATUSES.has(status)) return "pending"
  return "other"
}

export async function GET(request: NextRequest) {
  try {
    const admin = await createAdminClient()
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("userId")

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 })
    }

    const now = new Date()
    const currentYear = now.getFullYear()
    const previousYear = currentYear - 1

    const { data: records, error } = await admin
      .from("loan_requests")
      .select(`
        id,
        request_number,
        loan_type_key,
        loan_type_label,
        status,
        requested_amount,
        fixed_amount,
        repayment_status,
        created_at,
        submitted_at,
        director_note,
        hod_review_note,
        hr_note
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[v0] Error fetching staff loan history:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const withYear = (records || []).map((r: any) => ({
      ...r,
      _year: new Date(r.created_at).getFullYear(),
      _bucket: statusBucket(String(r.status || "")),
    }))

    const current = withYear.filter((r: any) => r._year === currentYear)
    const previous = withYear.filter((r: any) => r._year === previousYear)

    const currentApproved = current.filter((r: any) => r._bucket === "approved")
    const currentRejected = current.filter((r: any) => r._bucket === "rejected")
    const currentPending = current.filter((r: any) => r._bucket === "pending")

    const previousApproved = previous.filter((r: any) => r._bucket === "approved")
    const previousRejected = previous.filter((r: any) => r._bucket === "rejected")

    return NextResponse.json({
      success: true,
      currentPeriod: String(currentYear),
      previousPeriod: String(previousYear),
      current,
      previous,
      stats: {
        currentYear: {
          total: current.length,
          approved: currentApproved.length,
          rejected: currentRejected.length,
          pending: currentPending.length,
        },
        previousYear: {
          total: previous.length,
          approved: previousApproved.length,
          rejected: previousRejected.length,
        },
      },
    })
  } catch (err) {
    console.error("[v0] Unhandled error in loan staff-history:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
