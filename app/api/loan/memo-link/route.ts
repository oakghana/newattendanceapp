import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import {
  canDoAccounts,
  canDoDirectorHr,
  canDoHrOffice,
  canDoLoanOffice,
  normalizeRole,
} from "@/lib/loan-workflow"
import { createMemoToken } from "@/lib/secure-memo"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await request.json()
    const loanId = String(id || "")
    if (!loanId) return NextResponse.json({ error: "Loan id is required" }, { status: 400 })

    const [{ data: profile, error: profileError }, { data: loan, error: loanError }] = await Promise.all([
      admin
        .from("user_profiles")
        .select("id, role, departments(name, code)")
        .eq("id", user.id)
        .single(),
      admin.from("loan_requests").select("id, user_id, status").eq("id", loanId).single(),
    ])

    if (profileError || !profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    if (loanError || !loan) return NextResponse.json({ error: "Loan not found" }, { status: 404 })

    const role = normalizeRole((profile as any).role)
    const deptName = (profile as any)?.departments?.name || null
    const deptCode = (profile as any)?.departments?.code || null

    const canAccess =
      loan.user_id === user.id ||
      role === "admin" ||
      canDoLoanOffice(role, deptName, deptCode) ||
      canDoHrOffice(role, deptName, deptCode) ||
      canDoDirectorHr(role, deptName, deptCode) ||
      canDoAccounts(role, deptName, deptCode)

    if (!canAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const token = createMemoToken({
      loanId,
      userId: user.id,
      exp: Date.now() + 10 * 60 * 1000,
    })

    const path = `/api/loan/memo/${loanId}?token=${encodeURIComponent(token)}`
    return NextResponse.json({ success: true, path, expiresInSeconds: 600 })
  } catch (error: any) {
    console.error("memo-link error", error)
    return NextResponse.json({ error: error?.message || "Failed to generate secure memo link" }, { status: 500 })
  }
}
