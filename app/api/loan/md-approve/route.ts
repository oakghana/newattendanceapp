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

  // Verify all provided loans are in the post-HR-Records MD approval stage
  const { data: loans, error: fetchErr } = await admin
    .from("loan_requests")
    .select("id, status, request_number, loan_type_label, staff_full_name, reference_number, memo_reference_locked")
    .in("id", loanIds)
    .eq("status", "awaiting_director_hr")

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!loans || loans.length === 0) {
    return NextResponse.json({ error: "No eligible loans found. Loans must be at HR Executive approved stage." }, { status: 404 })
  }

  const unreferencedLoans = loans.filter((loan: any) => {
    const reference = String(loan.reference_number || "").trim()
    return !reference || loan.memo_reference_locked !== true
  })
  if (unreferencedLoans.length > 0) {
    return NextResponse.json({
      error: "Caution: this memo cannot be signed yet. HR Records must first assign and lock the official memo reference.",
      code: "HR_RECORDS_REFERENCE_REQUIRED",
      loanIds: unreferencedLoans.map((loan: any) => loan.id),
      requestNumbers: unreferencedLoans.map((loan: any) => loan.request_number),
    }, { status: 409 })
  }

  const eligibleIds = loans.map((l: any) => l.id)

  // Stamp all eligible loans with MD approval
  const { error: updateErr } = await admin
    .from("loan_requests")
    .update({
      md_approved_at: now,
      md_approved_by: profile.id,
      md_approved_by_name: mdName,
      status: "approved_director",
      workflow_stage: "md_approved",
      updated_at: now,
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

  // Fetch loan types for category mapping (no FK join needed — separate query)
  const { data: loanTypesRows } = await admin
    .from("loan_types")
    .select("loan_key, category")

  const loanTypeCategoryMap: Record<string, string> = {}
  for (const lt of loanTypesRows || []) {
    if (lt.loan_key && lt.category) loanTypeCategoryMap[lt.loan_key] = lt.category
  }

  let query = admin
    .from("loan_requests")
    .select(`
      id,
      request_number,
      loan_type_label,
      loan_type_key,
      fixed_amount,
      requested_amount,
      status,
      created_at,
      md_approved_at,
      md_approved_by_name,
      reference_number,
      memo_reference_locked,
      user_id,
      staff_full_name,
      staff_number,
      staff_location_name,
      staff_district_name,
      staff_rank,
      department_id,
      departments!department_id (
        name
      ),
      user_profiles!user_id (
        first_name,
        last_name,
        employee_id,
        profile_image_url,
        assigned_location_id,
  position,
  geofence_locations!user_profiles_assigned_location_id_fkey (name)
  )
  `)
    .order("created_at", { ascending: false })

  if (view === "pending") {
  query = query
  .eq("status", "awaiting_director_hr")
  .is("md_approved_at", null)
  } else {
    // A timestamp alone is not proof of approval. Only final MD-approved
    // statuses belong in this tab; this prevents in-progress loans with a
    // stale/incorrect md_approved_at value from appearing as approved.
    query = query
      .in("status", ["approved_director", "md_approved"])
      .not("md_approved_at", "is", null)
      .order("md_approved_at", { ascending: false })
  }

  const { data, error } = await query.limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Attach category and resolve the staff location from the profile assignment.
  const loans = (data || []).map((l: Record<string, unknown>) => {
    const profile = l.user_profiles as Record<string, unknown> | null
    const assignedLocation = profile?.geofence_locations as { name?: string } | null
    return {
      ...l,
      staff_location_name: assignedLocation?.name || l.staff_location_name || "Unknown location",
      loan_category: l.loan_type_key ? (loanTypeCategoryMap[l.loan_type_key as string] || null) : null,
    }
  })

  return NextResponse.json({ loans, loanTypeCategoryMap })
}
