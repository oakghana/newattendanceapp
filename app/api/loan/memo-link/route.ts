import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClientAndGetUser } from "@/lib/supabase/server"
import {
  canDoAccounts,
  canDoCommittee,
  canDoDirectorHr,
  canDoHodReview,
  canDoHrOffice,
  canDoLoanOffice,
  normalizeRole,
} from "@/lib/loan-workflow"
import { createMemoToken } from "@/lib/secure-memo"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    const admin = await createAdminClient()
    const { user, authError } = await createClientAndGetUser()

    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id, disposition } = await request.json()
    const loanId = String(id || "")
    const wantsAttachment = disposition === "attachment"
    if (!loanId) return NextResponse.json({ error: "Loan id is required" }, { status: 400 })

    const [{ data: profile, error: profileError }, { data: loan, error: loanError }] = await Promise.all([
      admin
        .from("user_profiles")
        .select("id, role, assigned_location_id, departments(name, code)")
        .eq("id", user.id)
        .single(),
      admin.from("loan_requests").select("id, user_id, status, workflow_stage, reference_number, md_approved_at, md_approved_by_name, staff_location_id, hod_reviewer_id, committee_reviewer_id, hr_officer_id, director_hr_id").eq("id", loanId).single(),
    ])

    if (profileError || !profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    if (loanError || !loan) return NextResponse.json({ error: "Loan not found" }, { status: 404 })

    const role = normalizeRole((profile as any).role)
    const isAdministrator = role === "admin" || role === "administrator"
    const loanStatus = String((loan as any).status || "")
    const isArchived = loanStatus === "archived"
    const postManagingDirectorStatuses = new Set(["approved_director", "md_approved", "pending_hr_records_reference", "referenced", "staff_receiving_funds", "partially_recovered", "fully_recovered"])
    const hasManagingDirectorApproval = Boolean((loan as any).md_approved_at || (loan as any).md_approved_by_name)
    if (isArchived ? !isAdministrator : (!postManagingDirectorStatuses.has(loanStatus) || !hasManagingDirectorApproval)) {
      return NextResponse.json({ error: "This loan cannot be downloaded until it has been approved by the Managing Director." }, { status: 409 })
    }
    if (!String((loan as any).reference_number || "").trim()) {
      return NextResponse.json({ error: "Memo reference pending HR Records." }, { status: 409 })
    }

    const deptName = (profile as any)?.departments?.name || null
    const deptCode = (profile as any)?.departments?.code || null
    const { data: memoHodLink } = await admin
      .from("loan_hod_linkages")
      .select("id")
      .eq("hod_user_id", user.id)
      .eq("staff_user_id", loan.user_id)
      .maybeSingle()
    const isLinkedHodForLoan = Boolean(memoHodLink)

    const isRegionalManagerForLoan =
      role === "regional_manager" &&
      Boolean((profile as any).assigned_location_id) &&
      (profile as any).assigned_location_id === (loan as any).staff_location_id

    const canAccess =
      loan.user_id === user.id ||
      isRegionalManagerForLoan ||
      role === "admin" ||
      role === "managing_director" ||
      role === "secretary" ||
      ["hr_records", "hr_records_officer", "hr_records_manager"].includes(role) ||
      ["regional_hr_leave_office", "regional_hr", "regional_leave_office"].includes(role) ||
      role === "it-admin" ||
      canDoHodReview(role, isLinkedHodForLoan) ||
      canDoCommittee(role) ||
      canDoLoanOffice(role, deptName, deptCode) ||
      canDoHrOffice(role, deptName, deptCode) ||
      canDoDirectorHr(role, deptName, deptCode) ||
      canDoAccounts(role, deptName, deptCode) ||
      [loan.hod_reviewer_id, loan.committee_reviewer_id, loan.hr_officer_id, loan.director_hr_id].includes(user.id)

    if (!canAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const token = createMemoToken({
      loanId,
      userId: user.id,
      exp: Date.now() + 10 * 60 * 1000,
    })

    const path = `/api/loan/memo/${loanId}?token=${encodeURIComponent(token)}${wantsAttachment ? "&disposition=attachment" : ""}`
    return NextResponse.json({ success: true, path, expiresInSeconds: 600 })
  } catch (error: any) {
    console.error("memo-link error", error)
    return NextResponse.json({ error: error?.message || "Failed to generate secure memo link" }, { status: 500 })
  }
}
