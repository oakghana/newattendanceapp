import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClientAndGetUser } from "@/lib/supabase/server"
import { isAdminRole, normalizeRole } from "@/lib/loan-workflow"
import { formatDateDDMMYYYY } from "@/lib/date-utils"
import { isNonRegionalLocation } from "@/lib/location-mappings"
import { MEMO_CORRECTION_ACTION, MEMO_CORRECTION_LAYOUT_VERSION, parseMemoLayoutFromText, stripStaffSummaryLinesFromMemoText } from "@/lib/loan-memo-layout"
import { GET as renderMemoRoute } from "../memo/[id]/route"

const CORRECTABLE_STATUSES = [
  "approved_director",
  "md_approved",
  "referenced",
  "staff_receiving_funds",
  "partially_recovered",
  "fully_recovered",
  "archived",
]

function monthLabel(value: unknown, fallback = "TBD") {
  if (!value) return fallback
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleDateString("en-GB", { month: "long" })
}

function dateLabel(value: unknown) {
  if (!value) return "the date of your application"
  const formatted = formatDateDDMMYYYY(String(value))
  return formatted === "Invalid Date" ? "the date of your application" : formatted
}

function amountInWords(value: number) {
  const units = ["zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]
  const underThousand = (n: number): string => {
    if (n < 20) return units[n]
    if (n < 100) return `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${units[n % 10].toLowerCase()}` : ""}`
    return `${units[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${underThousand(n % 100).toLowerCase()}` : ""}`
  }
  const whole = Math.floor(Math.round(value * 100) / 100)
  if (!Number.isFinite(whole) || whole < 0) return ""
  const words = whole >= 1000
    ? `${underThousand(Math.floor(whole / 1000))} Thousand${whole % 1000 ? ` ${underThousand(whole % 1000).toLowerCase()}` : ""}`
    : underThousand(whole)
  return `${words} Ghana Cedis`
}

const CORRECTION_COLUMNS = "id, request_number, status, director_letter, md_approved_at, md_approved_by_name, created_at, loan_type_label, loan_type_key, fixed_amount, requested_amount, salary_advance_amount, salary_advance_multiplier, recovery_months, deduction_period_months, repayment_duration_months, disbursement_date, recovery_start_date, hr_note, loan_office_note, staff_location_name"
const CORRECTION_ACTION = MEMO_CORRECTION_ACTION

async function loadEffectiveMemoText(request: NextRequest, loanId: string, fallback: string) {
  try {
    const url = new URL(`/api/loan/memo/${loanId}`, request.url)
    url.searchParams.set("format", "text")
    const headers = new Headers()
    const cookie = request.headers.get("cookie")
    const authorization = request.headers.get("authorization")
    if (cookie) headers.set("cookie", cookie)
    if (authorization) headers.set("authorization", authorization)
    const response = await renderMemoRoute(new NextRequest(url, { headers }), { params: Promise.resolve({ id: loanId }) })
    const json = await response.json().catch(() => null)
    if (response.ok && typeof json?.text === "string" && json.text.trim()) return json.text as string
    console.error("[v0] Memo text preview unavailable, using stored wording:", response.status, json?.error)
  } catch (error) {
    console.error("[v0] Memo text preview failed, using stored wording:", error)
  }
  return fallback
}

async function findOriginalSignedContent(admin: Awaited<ReturnType<typeof createAdminClient>>, loanId: string, fallback: string) {
  const { data } = await admin
    .from("audit_logs")
    .select("details")
    .eq("action", CORRECTION_ACTION)
    .eq("record_id", loanId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  const original = (data?.details as { original_signed_memo?: unknown } | null)?.original_signed_memo
  return typeof original === "string" && original.trim() ? original : fallback
}

function generatedMemoBody(loan: Record<string, unknown>) {
  const loanType = String(loan.loan_type_label || "Loan")
  const typeKey = String(loan.loan_type_key || "").toLowerCase()
  const isFuneralLoan = typeKey.includes("funeral") || loanType.toLowerCase().includes("funeral")
  const isSalaryAdvance = typeKey.includes("salary_advance") || loanType.toLowerCase().includes("salary advance")
  const amount = Number(loan.salary_advance_amount || loan.fixed_amount || loan.requested_amount || 0)
  const amountText = `GHc ${amount.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const created = dateLabel(loan.created_at)
  const disbursement = monthLabel(loan.disbursement_date || loan.md_approved_at)
  const recoveryStart = monthLabel(loan.recovery_start_date)
  const months = isSalaryAdvance
    ? Number(loan.salary_advance_multiplier || loan.recovery_months || loan.deduction_period_months || loan.repayment_duration_months || 0)
    : Number(loan.recovery_months || loan.deduction_period_months || loan.repayment_duration_months || 0)
  const plainAmount = amount.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const getRecipient = (note: unknown) => String(note || "").match(/\[MEMO_COPY:([^\]]+)\]/i)?.[1]?.trim() || null
  const recipient = getRecipient(loan.hr_note)
    || getRecipient(loan.loan_office_note)
    || (isNonRegionalLocation(String(loan.staff_location_name || "")) ? "Accounts Manager" : "Deputy Accounts Manager")

  const body = isSalaryAdvance
    ? [
        `We refer to your loan application dated ${created} on the above subject and wish to inform you that, Management has given approval for you to be granted a Salary Advance of ${amountInWords(amount)} (GHc${plainAmount}).`,
        `The loan would be recovered in ${months || "the approved recovery period"} Equal Monthly Instalment from your salary effective, ${recoveryStart}.`,
        `By a copy of this letter, the ${recipient} has been advised to release the said amount to you effective, ${disbursement}.`,
        "You can count on our co-operation.",
      ]
    : [
        `We refer to your loan application dated ${created} on the above subject and wish to inform you that Management has approved your application for a ${loanType} of ${amountText}.`,
        ...(isFuneralLoan
          ? ["This funeral support does not require repayment or monthly salary deductions."]
          : [`The loan will be recovered in ${months || "the approved recovery period"} equal monthly instalments from your salary, commencing in ${recoveryStart}.`]),
        `By a copy of this letter, the ${recipient} has been advised to release the approved amount to you effective ${disbursement}.`,
        "You can count on our co-operation.",
      ]
  return body.join("\n\n")
}

async function getAdministrator() {
  const { user, authError } = await createClientAndGetUser()
  if (authError || !user) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const admin = await createAdminClient()
  const { data: profile } = await admin.from("user_profiles").select("role").eq("id", user.id).maybeSingle()
  const role = normalizeRole(String(profile?.role || (user.user_metadata as Record<string, unknown> | undefined)?.role || ""))
  if (!isAdminRole(role)) return { response: NextResponse.json({ error: "Only administrators can correct an approved loan memo." }, { status: 403 }) }
  return { admin, user }
}

export async function GET(request: NextRequest) {
  try {
    const access = await getAdministrator()
    if ("response" in access) return access.response
    const loanId = String(request.nextUrl.searchParams.get("loanId") || "").trim()
    if (!loanId) return NextResponse.json({ error: "Loan id is required." }, { status: 400 })

    const { data: loan, error } = await access.admin
      .from("loan_requests")
      .select(CORRECTION_COLUMNS)
      .eq("id", loanId)
      .maybeSingle<Record<string, unknown> & { status: string; md_approved_at: string | null; director_letter: string | null }>()
    if (error) throw error
    if (!loan) return NextResponse.json({ error: "Loan request not found." }, { status: 404 })
    if (!loan.md_approved_at || !CORRECTABLE_STATUSES.includes(String(loan.status || ""))) {
      return NextResponse.json({ error: "Only an MD-approved loan memo can be corrected from this page." }, { status: 409 })
    }

    const storedContent = String(loan.director_letter || "")
    const currentContent = stripStaffSummaryLinesFromMemoText(
      await loadEffectiveMemoText(request, loanId, storedContent || generatedMemoBody(loan)),
    )
    return NextResponse.json({
      memoContent: currentContent,
      expectedContent: storedContent,
      originalSignedContent: await findOriginalSignedContent(access.admin, loanId, currentContent),
    })
  } catch (error) {
    console.error("[v0] Could not load approved loan memo for correction:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load approved memo content." }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { user, authError } = await createClientAndGetUser()
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const admin = await createAdminClient()
    const { data: profile } = await admin
      .from("user_profiles")
      .select("role, position")
      .eq("id", user.id)
      .maybeSingle()
    const role = normalizeRole(String(profile?.role || (user.user_metadata as Record<string, unknown> | undefined)?.role || ""))
    const isAdministrator = isAdminRole(role)
    if (!isAdministrator) return NextResponse.json({ error: "Only an administrator can correct an approved loan memo." }, { status: 403 })

    const body = await request.json()
    const loanId = String(body.loanId || "").trim()
    const correctedContent = String(body.correctedContent || "").trim()
    const expectedContent = String(body.expectedContent || "")
    const reason = String(body.reason || "").trim()
    if (!loanId) return NextResponse.json({ error: "Loan id is required." }, { status: 400 })
    if (correctedContent.length < 20) return NextResponse.json({ error: "Enter the corrected memo content (at least 20 characters)." }, { status: 400 })
    if (reason.length < 5) return NextResponse.json({ error: "A correction reason of at least 5 characters is required." }, { status: 400 })
    if (!parseMemoLayoutFromText(correctedContent).paragraphs?.length) {
      return NextResponse.json({ error: "The corrected memo must keep its body paragraphs (below the RE: line and above the closing line)." }, { status: 400 })
    }

    const { data: loan, error: loanError } = await admin
      .from("loan_requests")
      .select(CORRECTION_COLUMNS)
      .eq("id", loanId)
      .maybeSingle<Record<string, unknown> & { request_number: string; status: string; md_approved_at: string | null; md_approved_by_name: string | null; director_letter: string | null }>()
    if (loanError) throw loanError
    if (!loan) return NextResponse.json({ error: "Loan request not found." }, { status: 404 })
    if (!loan.md_approved_at || ![...CORRECTABLE_STATUSES].includes(String(loan.status || ""))) {
      return NextResponse.json({ error: "Only an MD-approved loan memo can be corrected from this page." }, { status: 409 })
    }

    const storedContent = String(loan.director_letter || "")
    const currentMemoContent = stripStaffSummaryLinesFromMemoText(
      await loadEffectiveMemoText(request, loanId, storedContent || generatedMemoBody(loan)),
    )
    const originalSignedContent = await findOriginalSignedContent(admin, loanId, currentMemoContent)
    if (storedContent !== expectedContent) return NextResponse.json({ error: "This memo was changed by another administrator. Refresh the page and open the editor again." }, { status: 409 })
    const normalize = (value: string) => value.replace(/\r/g, "").split("\n").map((line) => line.replace(/\s+/g, " ").trim()).join("\n").trim()
    if (normalize(correctedContent) === normalize(currentMemoContent)) return NextResponse.json({ error: "No memo wording changes were made." }, { status: 400 })

    const update = admin
      .from("loan_requests")
      .update({
        director_letter: correctedContent,
        updated_at: new Date().toISOString(),
      })
      .eq("id", loanId)
      .eq("status", loan.status)
      .eq("md_approved_at", loan.md_approved_at)
    const guardedUpdate = loan.director_letter === null
      ? update.is("director_letter", null)
      : update.eq("director_letter", storedContent)
    const { data: savedLoan, error: saveError } = await guardedUpdate
      .select("id, request_number, status, director_letter, md_approved_at, md_approved_by_name")
      .maybeSingle()
    if (saveError) throw saveError
    if (!savedLoan) return NextResponse.json({ error: "This memo changed in another session. Refresh the page and retry your correction." }, { status: 409 })

    const { error: auditError } = await admin.from("audit_logs").insert({
      user_id: user.id,
      action: CORRECTION_ACTION,
      table_name: "loan_requests",
      record_id: loanId,
      old_values: { director_letter: currentMemoContent },
      new_values: { director_letter: correctedContent },
      details: {
        reason,
        request_number: loan.request_number,
        status: loan.status,
        layout_version: MEMO_CORRECTION_LAYOUT_VERSION,
        original_signed_memo_preserved: true,
        original_signed_memo: originalSignedContent,
        md_approved_at: loan.md_approved_at,
        md_approved_by_name: loan.md_approved_by_name,
      },
    })
    if (auditError) {
      console.error("[v0] Approved loan memo correction saved but audit log failed:", auditError)
      return NextResponse.json({ error: "The memo was updated, but the audit record could not be saved. Contact support before making another correction." }, { status: 500 })
    }

    return NextResponse.json({ success: true, memo: savedLoan })
  } catch (error) {
    console.error("[v0] Approved loan memo correction failed:", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save approved memo correction." }, { status: 500 })
  }
}
