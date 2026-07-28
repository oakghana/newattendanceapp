import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { createClientAndGetUser, createAdminClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  const admin = await createAdminClient()
  const { user, authError } = await createClientAndGetUser()
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await admin
    .from("user_profiles")
    .select("id, role, first_name, last_name, md_signature_url")
    .eq("id", user.id)
    .maybeSingle()

  if (!profile || !["managing_director", "admin", "it-admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Insufficient permissions to approve loans." }, { status: 403 })
  }

  const body = await req.json()
  const { loanIds } = body as { loanIds: string[] }

  if (!Array.isArray(loanIds) || loanIds.length === 0) {
    return NextResponse.json({ error: "No loan IDs provided." }, { status: 400 })
  }
  const mdName = `${profile.first_name} ${profile.last_name}`.trim()
  const now = new Date().toISOString()

  // Verify all provided loans are in 'approved_director' status before approving
  const { data: loans, error: fetchErr } = await admin
    .from("loan_requests")
    .select("id, status, request_number, loan_type_label, staff_full_name")
    .in("id", loanIds)
    .eq("status", "approved_director")

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!loans || loans.length === 0) {
    return NextResponse.json({ error: "No eligible loans found. Loans must be at HR Executive approved stage." }, { status: 404 })
  }

  const eligibleIds = loans.map((l: any) => l.id)

  // Stamp all eligible loans with MD approval
  const { error: updateErr } = await admin
    .from("loan_requests")
    .update({
      md_approved_at: now,
      md_approved_by: profile.id,
      md_approved_by_name: mdName,
    })
    .in("id", eligibleIds)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    approvedCount: eligibleIds.length,
    approvedBy: mdName,
    signatureUrl: profile.md_signature_url,
    approvedAt: now,
    loans: loans.map((l: any) => ({
      id: l.id,
      requestNumber: l.request_number,
      loanTypeLabel: l.loan_type_label,
      staffName: l.staff_full_name,
    })),
  })
}

// GET: fetch loans pending MD approval, grouped by today/week/month
export async function GET(req: NextRequest) {
  const admin = await createAdminClient()
  const { user, authError } = await createClientAndGetUser()
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await admin
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  if (!profile || !["managing_director", "secretary", "admin", "it-admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const url = new URL(req.url)
  const view = url.searchParams.get("view") || "pending" // "pending" | "approved"

  let query = admin
    .from("loan_requests")
    .select(`
      id,
      request_number,
      loan_type_label,
      fixed_amount,
      requested_amount,
      status,
      created_at,
      md_approved_at,
      md_approved_by_name,
      user_id,
      staff_full_name,
      staff_number,
      user_profiles!user_id (
        first_name,
        last_name,
        employee_id,
        profile_image_url
      )
    `)
    .order("created_at", { ascending: false })

  if (view === "pending") {
    query = query.eq("status", "approved_director").is("md_approved_at", null)
  } else {
    query = query.not("md_approved_at", "is", null).order("md_approved_at", { ascending: false })
  }

  const { data, error } = await query.limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ loans: data || [] })
}
