import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { createClientAndGetUser, createAdminClient } from "@/lib/supabase/server"
import { isUsableSignatureImage } from "@/lib/loan-memo-forwarding"

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
  const view = url.searchParams.get("view") || "pending" // "pending" | "approved" | "signature"

  // Admin-only: the signature Executive HR applied when signing, for the view-only memo
  // preview. Read from the loan itself so it is the signature actually used at signing.
  if (view === "signature") {
    if (!["admin", "administrator"].includes(String(profile.role || "").toLowerCase())) {
      return NextResponse.json({ error: "Only administrators can view the HR Executive signature preview." }, { status: 403 })
    }
    const loanId = url.searchParams.get("id")
    if (!loanId) return NextResponse.json({ error: "Loan id is required." }, { status: 400 })
    const { data: signedLoan, error: signedError } = await admin
      .from("loan_requests")
      .select("id, director_hr_id, director_signature_mode, director_signature_text, director_signature_data_url, director_decision_at")
      .eq("id", loanId)
      .maybeSingle()
    if (signedError) return NextResponse.json({ error: signedError.message }, { status: 500 })
    if (!signedLoan?.director_decision_at) {
      return NextResponse.json({ error: "This memo has not been signed by Executive HR yet." }, { status: 404 })
    }

    const mode = signedLoan.director_signature_mode || null
    let dataUrl = isUsableSignatureImage(signedLoan.director_signature_data_url) ? signedLoan.director_signature_data_url : null
    let signerName: string | null = null
    let signerPosition: string | null = null
    if (signedLoan.director_hr_id) {
      const { data: signer } = await admin
        .from("user_profiles")
        .select("first_name, last_name, position, signature_data_url")
        .eq("id", signedLoan.director_hr_id)
        .maybeSingle()
      signerName = `${signer?.first_name || ""} ${signer?.last_name || ""}`.trim() || null
      signerPosition = signer?.position || null
      // Only a signer who chose a drawn/uploaded signature falls back to their saved profile image.
      if (!dataUrl && mode !== "typed" && isUsableSignatureImage(signer?.signature_data_url)) dataUrl = signer?.signature_data_url || null
    }

    return NextResponse.json({
      signature: {
        mode,
        text: signedLoan.director_signature_text || null,
        dataUrl,
        signerName,
        signerPosition,
        signedAt: signedLoan.director_decision_at,
      },
    })
  }

  // Fetch loan types for category mapping (no FK join needed — separate query)
  const { data: loanTypesRows } = await admin
    .from("loan_types")
    .select("loan_key, category")

  const loanTypeCategoryMap: Record<string, string> = {}
  for (const lt of loanTypesRows || []) {
    if (lt.loan_key && lt.category) loanTypeCategoryMap[lt.loan_key] = lt.category
  }

  const loanSelect = `
    id,
    request_number,
    loan_type_label,
    loan_type_key,
    fixed_amount,
    requested_amount,
    status,
    created_at,
    disbursement_date,
    md_approved_at,
    md_approved_by_name,
    director_letter,
    memo_cc,
    director_hr_id,
    director_signature_text,
    director_decision_at,
    reference_number,
    memo_reference_locked,
    user_id,
    staff_full_name,
    staff_number,
    staff_location_name,
    staff_district_name,
    staff_rank,
    department_id,
    departments!department_id (name),
    user_profiles!user_id (
      first_name,
      last_name,
      employee_id,
      profile_image_url,
      assigned_location_id,
      position,
      geofence_locations!user_profiles_assigned_location_id_fkey (name)
    )
  `

  let data: Record<string, unknown>[] = []
  if (view === "pending") {
    const { data: pending, error } = await admin
      .from("loan_requests")
      .select(loanSelect)
      .eq("status", "awaiting_director_hr")
      .is("md_approved_at", null)
      .order("created_at", { ascending: false })
      .limit(200)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    data = (pending || []) as Record<string, unknown>[]
    let adminPreviewLoans: Record<string, unknown>[] = []
    if (["admin", "administrator"].includes(String(profile.role || "").toLowerCase())) {
      const { data: signedForReference, error: previewError } = await admin
        .from("loan_requests")
        .select(loanSelect)
        .eq("status", "pending_hr_records_reference")
        .is("md_approved_at", null)
        .not("director_letter", "is", null)
        .not("director_decision_at", "is", null)
        .not("director_signature_text", "is", null)
        .order("created_at", { ascending: false })
        .limit(200)
      if (previewError) return NextResponse.json({ error: previewError.message }, { status: 500 })
      adminPreviewLoans = (signedForReference || []) as Record<string, unknown>[]
    }
    return NextResponse.json({ loans: data, adminPreviewLoans })
  } else {
    // The approved-memo feed must include both loans approved through the
    // current MD workflow and legacy/imported loans already disbursed and
    // still running. These are stored with different status values.
    const [{ data: mdApproved, error: mdError }, { data: running, error: runningError }] = await Promise.all([
      admin
        .from("loan_requests")
        .select(loanSelect)
        .in("status", ["approved_director", "md_approved"])
        .not("md_approved_at", "is", null)
        .order("md_approved_at", { ascending: false })
        .limit(500),
      admin
        .from("loan_requests")
        .select(loanSelect)
        .in("status", ["approved", "active", "staff_receiving_funds", "partially_recovered"])
        .not("disbursement_date", "is", null)
        .order("created_at", { ascending: false })
        .limit(500),
    ])
    if (mdError || runningError) {
      return NextResponse.json({ error: (mdError || runningError)?.message || "Failed to load approved loans" }, { status: 500 })
    }

    const byId = new Map<string, Record<string, unknown>>()
    for (const loan of [...(mdApproved || []), ...(running || [])] as Record<string, unknown>[]) {
      const id = String(loan.id || "")
      if (id) byId.set(id, loan)
    }
    data = Array.from(byId.values()).sort((a, b) => {
      const aDate = String(a.md_approved_at || a.disbursement_date || a.created_at || "")
      const bDate = String(b.md_approved_at || b.disbursement_date || b.created_at || "")
      return bDate.localeCompare(aDate)
    })
  }

  // Attach category and resolve the staff location from the profile assignment.
  const loans = data.map((l: Record<string, unknown>) => {
    const profile = l.user_profiles as Record<string, unknown> | null
    const assignedLocation = profile?.geofence_locations as { name?: string } | null
    const isLegacyRunningLoan = view === "approved" && !l.md_approved_at
    return {
      ...l,
      // Legacy records are already disbursed/active; use their disbursement
      // date for the memo timeline without changing the stored audit fields.
      md_approved_at: l.md_approved_at || (isLegacyRunningLoan ? l.disbursement_date : null),
      md_approved_by_name: l.md_approved_by_name || (isLegacyRunningLoan ? "Legacy approved loan" : null),
      staff_location_name: assignedLocation?.name || l.staff_location_name || "Unknown location",
      loan_category: l.loan_type_key ? (loanTypeCategoryMap[l.loan_type_key as string] || null) : null,
    }
  })

  return NextResponse.json({ loans, loanTypeCategoryMap })
}
