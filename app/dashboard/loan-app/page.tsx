"use client"
// Payment evidence fix: loadData moved to finally block
// Restored from production main branch (oakghana/newattendanceapp@cdda885)

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import Image from "next/image"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { SignaturePad } from "@/components/leave/signature-pad"
import { LoanOfficePaymentAdviceTab } from "@/components/leave/loan-office-payment-advice-tab"
import { LeaveResumptionBadge } from "@/components/leave/leave-resumption-badge"
import { GlobalWarningsToasts } from "@/components/leave/global-warnings-toasts"
import { AccountsExecutiveFDDashboard } from "@/components/loan/accounts-executive-fd-dashboard"
import { FDCalculationSubmission } from "@/components/loan/fd-calculation-submission"
import { HRLoanOfficeFDApproved } from "@/components/loan/hr-loan-office-fd-approved"
import { useToast } from "@/hooks/use-toast"
import { validateMeaningfulText } from "@/lib/meaningful-text"
import { generateProfessionalMemoPDF, downloadMemoPDF } from "@/lib/professional-memo-generator"
import { Activity, AlertCircle, BarChart3, Calculator, CheckCircle2, ChevronDown, Clock, Download, Edit3, FileText, Filter, LayoutGrid, LayoutList, Loader2, MapPin, Receipt, Upload, Users, Wallet, XCircle } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type LoanType = {
  loan_key: string
  loan_label: string
  category: string
  requires_committee: boolean
  requires_fd_check: boolean
  min_fd_score: number
  min_qualification_note?: string | null
  loan_terms?: string | null
  default_recovery_months?: number | null
  fixed_amount: number
  max_amount?: number | null
  is_active?: boolean
}

type TimelineEntry = {
  id: string
  loan_request_id: string
  actor_role: string | null
  action_key: string
  from_status: string | null
  to_status: string | null
  note: string | null
  metadata: any
  created_at: string
}

type LoanRequest = {
  id: string
  request_number: string
  reference_number?: string | null
  user_id: string
  corporate_email: string | null
  staff_number: string | null
  staff_rank: string | null
  staff_full_name?: string | null
  staff_location_id?: string | null
  staff_location_name?: string | null
  staff_location_address?: string | null
  staff_district_name?: string | null
  loan_type_key: string
  loan_type_label: string
  loan_office_note?: string | null
  requested_amount: number | null
  fixed_amount: number | null
  reason: string | null
  status: string
  fd_score: number | null
  fd_good: boolean | null
  recovery_start_date: string | null
  disbursement_date: string | null
  recovery_months: number | null
  director_letter: string | null
  director_signature_text: string | null
  director_decision_at: string | null
  supporting_document_url: string | null
  fd_document_url?: string | null
  fd_note?: string | null
  fd_checked_at?: string | null
  hod_reviewer_id?: string | null
  accounts_reviewer_id?: string | null
  accounts_reviewer_name?: string | null
  director_hr_id?: string | null
  director_hr_name?: string | null
  director_hr_position?: string | null
  hod_review_note?: string | null
  hod_name?: string | null
  hod_rank?: string | null
  hod_location?: string | null
  created_at: string
  submitted_at: string
  updated_at?: string
  hr_note?: string | null
  
  // FD / Accounts fields
  monthly_deduction?: number | null

  // Repayment tracking
  repayment_plan_generated_at?: string | null
  repayment_duration_months?: number
  repayment_status?: string
  outstanding_balance?: number
  total_paid?: number
  next_payment_due?: string
  expected_completion_date?: string
  last_payment_date?: string
  last_payment_amount?: number
  processed_by_name?: string
  approved_by_name?: string
  hire_date?: string | null
  category?: string | null
  memo_cc?: string | null
  md_approved_at?: string | null
  department_name?: string | null
  loan_label?: string | null
  category_name?: string | null
  user?: { email?: string | null; [key: string]: any } | null
}

type WorkflowResponse = {
  degraded: boolean
  warning?: string
  error?: string
  profile: {
    id: string
    firstName: string
    lastName: string
    employeeId: string
    email: string
    role: string
    position: string
    staffCategory: string | null
    yearsOfService: number | null
    dateOfAppointment: string | null
    departmentName: string | null
    assignedLocationId?: string | null
    assignedLocationName?: string | null
    assignedLocationAddress?: string | null
    assignedDistrictName?: string | null
    linkedHodName?: string | null
    currentHodProfile?: {
      id: string
      name: string | null
      rank: string | null
      location: string | null
    } | null
  }
  permissions: {
    hod: boolean
    loanOffice: boolean
    accounts: boolean
    committee: boolean
    hrOffice: boolean
    directorHr: boolean
    viewAllTabs: boolean
    allLoans?: boolean
  }
  loanTypes: LoanType[]
  directorApprovers?: Array<{ id: string; full_name: string; position?: string | null; role?: string | null }>
  myRequests: LoanRequest[]
  myTimelines: { loan_request_id: string; entries: TimelineEntry[] }[]
  myTasks?: LoanRequest[]
  inbox: {
    hod: LoanRequest[]
    loanOffice: LoanRequest[]
    accounts: LoanRequest[]
    accountsSigned: LoanRequest[]
    committee: LoanRequest[]
    hrOffice: LoanRequest[]
    directorHr: LoanRequest[]
    directorGoodFd: LoanRequest[]
    allLoans: LoanRequest[]
  }
}

type LookupPayload = {
  loanTypes: LoanType[]
  locations: Array<{ id: string; name: string; address?: string | null; districts?: { name?: string | null } | null }>
  staff: Array<{
    id: string
    first_name: string
    last_name: string
    employee_id: string | null
    position: string | null
    role: string
    department_id?: string | null
    departments?: { name?: string | null; code?: string | null } | null
    assigned_location_id: string | null
    geofence_locations?: { name?: string | null; address?: string | null; districts?: { name?: string | null } | null } | null
  }>
  hods: Array<{ id: string; first_name: string; last_name: string; employee_id: string | null; position: string | null; role: string; email?: string | null }>
  linkages: Array<{ id: string; staff_user_id: string; hod_user_id: string }>
  linkageRequests: Array<{
    id: string
    title: string
    message: string
    created_at: string
    is_read: boolean
    read_at?: string | null
    request_status: "pending" | "approved" | "rejected"
    request_note?: string | null
    resolution_note?: string | null
    resolved_at?: string | null
    requester?: { id: string; full_name: string; employee_id?: string | null; position?: string | null; role?: string | null } | null
    staff?: { id: string; full_name: string; employee_id?: string | null; position?: string | null; role?: string | null } | null
    requested_hod?: { id: string; full_name: string; employee_id?: string | null; position?: string | null; role?: string | null } | null
    resolved_by?: { id: string; full_name: string; employee_id?: string | null; position?: string | null; role?: string | null } | null
  }>
}

type RegistrySignature = {
  id: string
  workflow_domain: string
  approval_stage: string
  signature_mode: "typed" | "draw" | "upload"
  signature_text: string | null
  signature_data_url: string | null
  is_active: boolean
  updated_at: string
}

type WorkflowTemplate = {
  id: string
  workflow_domain: "loan" | "leave"
  template_key: string
  title: string
  subject: string | null
  body: string
  is_active: boolean
  updated_at: string
}

type RegistryPayload = {
  signatures: RegistrySignature[]
  templates: WorkflowTemplate[]
  canManageTemplates: boolean
}

const STATUS_COLORS: Record<string, string> = {
  pending_hod: "bg-amber-100 text-amber-800",
  hod_approved: "bg-green-100 text-green-800",
  hod_rejected: "bg-red-100 text-red-800",
  sent_to_accounts: "bg-blue-100 text-blue-800",
  rejected_fd: "bg-red-100 text-red-800",
  awaiting_committee: "bg-purple-100 text-purple-800",
  committee_rejected: "bg-red-100 text-red-800",
  awaiting_hr_terms: "bg-cyan-100 text-cyan-800",
  awaiting_director_hr: "bg-indigo-100 text-indigo-800",
  approved_director: "bg-emerald-100 text-emerald-800",
  director_rejected: "bg-red-100 text-red-800",
  archived: "bg-slate-200 text-slate-700",
}

const STATUS_LABELS: Record<string, string> = {
  pending_hod: "Pending HOD",
  hod_approved: "HOD Approved",
  hod_rejected: "HOD Rejected",
  sent_to_accounts: "Sent to Accounts",
  rejected_fd: "FD Not Cleared",
  awaiting_committee: "Awaiting Committee",
  committee_rejected: "Committee Rejected",
  awaiting_hr_terms: "Awaiting HR Terms",
  awaiting_director_hr: "Awaiting HR Executives",
  archived: "Archived",
  approved_director: "Approved by HR Executives",
  director_rejected: "HR Executives Rejected",
}

const ACTION_LABELS: Record<string, string> = {
  staff_submit: "Staff Submitted",
  staff_edit: "Staff Edited",
  hod_decision: "HOD Decision",
  loan_office_update_request: "Loan Office Updated Request",
  loan_office_forward: "Loan Office Forward",
  accounts_fd_update: "Accounts FD Update",
  committee_decision: "Committee Decision",
  hr_set_terms: "HR Terms Set",
  director_finalize: "Director HR Final Decision",
}

const LOAN_SUBMISSION_LOCKED = false

const WORKFLOW_ORDER = [
  "pending_hod",
  "hod_approved",
  "sent_to_accounts",
  "awaiting_committee",
  "awaiting_hr_terms",
  "awaiting_director_hr",
  "approved_director",
] as const

function fmtDate(d?: string | null) {
  if (!d) return "N/A"
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

function fmtAmount(n?: number | null) {
  return (Number(n || 0)).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10)
}

function currentMonthValue() {
  return toIsoDate(new Date()).slice(0, 7)
}

function monthLabel(monthValue: string) {
  const [year, month] = monthValue.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, 1))
  return date.toLocaleDateString("en-GH", { month: "long", year: "numeric" })
}

function statusText(value: string) {
  return STATUS_LABELS[value] || value.replace(/_/g, " ")
}

function statusBadgeClass(status: string, emphasis: "soft" | "solid" = "soft") {
  if (emphasis === "solid") {
    const solidMap: Record<string, string> = {
      pending_hod: "bg-amber-600 text-white",
      hod_approved: "bg-green-700 text-white",
      hod_rejected: "bg-red-700 text-white",
      sent_to_accounts: "bg-blue-700 text-white",
      rejected_fd: "bg-rose-700 text-white",
      awaiting_committee: "bg-violet-700 text-white",
      committee_rejected: "bg-red-700 text-white",
      awaiting_hr_terms: "bg-cyan-700 text-white",
      awaiting_director_hr: "bg-indigo-700 text-white",
      approved_director: "bg-emerald-700 text-white",
      director_rejected: "bg-red-800 text-white",
    }
    return `text-[11px] font-semibold whitespace-nowrap px-2.5 py-1 ${solidMap[status] || "bg-slate-700 text-white"}`
  }

  return `text-[11px] font-semibold whitespace-nowrap ${STATUS_COLORS[status] || "bg-slate-100 text-slate-800"}`
}

function stageOwner(status: string) {
  const map: Record<string, string> = {
    pending_hod: "HOD",
    hod_approved: "Loan Office",
    sent_to_accounts: "Accounts",
    awaiting_committee: "Committee",
    awaiting_hr_terms: "HR Office",
    awaiting_director_hr: "Executive HR",
    approved_director: "Completed",
    hod_rejected: "Closed at HOD",
    rejected_fd: "Closed at Accounts",
    committee_rejected: "Closed at Committee",
    director_rejected: "Closed at HR Executives",
  }
  return map[status] || "In progress"
}

function requiresProofAttachment(
  loanTypeKey: string,
  loanTypeLabel?: string | null,
  loanTypeCategory?: string | null,
): boolean {
  const key = String(loanTypeKey || "").toLowerCase()
  const label = String(loanTypeLabel || "").toLowerCase()
  const category = String(loanTypeCategory || "").toLowerCase()
  return (
    key.includes("funeral") ||
    key.includes("insurance") ||
    label.includes("funeral") ||
    label.includes("insurance") ||
    category.includes("funeral") ||
    category.includes("insurance")
  )
}

function capitalizeLabel(value: string) {
  return String(value || "").replace(/^(.)/, (match) => match.toUpperCase())
}

function getLoanTypeBaseKey(loanType: LoanType) {
  const rawKey = String(loanType.loan_key || "").toLowerCase().trim()
  return rawKey.replace(/_(junior|senior|manager)$/, "")
}

function getExplicitLoanTypeTier(loanType: LoanType): "junior" | "senior" | "manager" | null {
  const key = String(loanType.loan_key || "").toLowerCase()
  const label = String(loanType.loan_label || "").toLowerCase()

  if (key.includes("_manager") || /\bmanager\b/i.test(label)) return "manager"
  if (key.includes("_senior") || /\bsenior\b|\bsr\b|sr\./i.test(label)) return "senior"
  if (key.includes("_junior") || /\bjunior\b|\bjr\b/i.test(label)) return "junior"
  return null
}

function resolveLoanTypeTier(loanType: LoanType, allTypes: LoanType[]) {
  const explicit = getExplicitLoanTypeTier(loanType)
  if (explicit) return explicit

  const baseKey = getLoanTypeBaseKey(loanType)
  const sameGroup = allTypes.filter((type) => getLoanTypeBaseKey(type) === baseKey)
  const hasHigherTier = sameGroup.some((type) => {
    const tier = getExplicitLoanTypeTier(type)
    return tier === "senior" || tier === "manager"
  })

  return hasHigherTier ? "junior" : null
}

function getUserLoanTier(position?: string | null, role?: string | null): "junior" | "senior" | "manager" | null {
  const normalizedPosition = String(position || "").toLowerCase()
  const normalizedRole = String(role || "").toLowerCase()

  // Manager tier: manager, director, head, regional, admin
  if (/manager|director|head|regional|admin|executive/.test(normalizedPosition) || 
      /manager|director|admin/.test(normalizedRole)) {
    return "manager"
  }
  
  // Senior tier: officer, senior, sr., sr, supervisor, superintendent, principal
  if (/officer|senior|\bsr\b|sr\.|supervisor|superintendent|principal|chief/.test(normalizedPosition) || 
      /senior|sr\b|sr\./.test(normalizedRole)) {
    return "senior"
  }
  
  // Junior tier: junior, jr., clerk, assistant, artisan, apprentice, trainee
  if (/junior|\bjr\b|clerk|assistant|artisan|apprentice|trainee|technician/.test(normalizedPosition) || 
      /junior|\bjr\b/.test(normalizedRole)) {
    return "junior"
  }
  
  return null
}

function normalizeLoanTypeLabel(loanType: LoanType, allTypes: LoanType[]) {
  const rawLabel = String(loanType.loan_label || "").trim()
  const baseLabel = rawLabel.replace(/\s*\((junior|senior|manager)\)$/i, "").trim() || rawLabel
  const tier = resolveLoanTypeTier(loanType, allTypes)

  return tier ? `${baseLabel} (${capitalizeLabel(tier)})` : baseLabel
}

function loanTypeGroupKey(loanType: LoanType) {
  return getLoanTypeBaseKey(loanType)
}

function shouldIncludeLoanTypeForUser(loanType: LoanType, userTier: string | null, allTypes: LoanType[]) {
  const loanTier = resolveLoanTypeTier(loanType, allTypes)
  
  // If no user tier or no loan tier restriction, include it
  if (!userTier || !loanTier) {
    return true
  }
  
  return loanTier === userTier
}

function isQualifiedForLoan(loanTypeKey: string, staffRank?: string | null): boolean {
  const key = String(loanTypeKey || "").toLowerCase()
  const rank = String(staffRank || "").toLowerCase()
  const isSeniorOrAbove = /senior|\bsr\b|sr\.|manager|head|director|regional/.test(rank)
  const isManagerOrAbove = /manager|head|director|regional/.test(rank)

  if (key.includes("_manager")) return isManagerOrAbove
  if (key.includes("_senior")) return isSeniorOrAbove
  return true
}

function downloadApprovalLetter(row: LoanRequest, profile: WorkflowResponse["profile"]) {
  const content = [
    "QUALITY CONTROL COMPANY LIMITED",
    "HUMAN RESOURCES DEPARTMENT",
    "",
    `Ref: ${row.request_number}`,
    `Date: ${fmtDate(row.director_decision_at || row.created_at)}`,
    "",
    `Dear ${profile.firstName} ${profile.lastName},`,
    "",
    `Your ${row.loan_type_label} application has been approved.`,
    `Approved Amount: GHc ${fmtAmount(row.fixed_amount || row.requested_amount)}`,
    `Disbursement Date: ${row.disbursement_date || "TBD"}`,
    `Recovery Start Date: ${row.recovery_start_date || "TBD"}`,
    `Recovery Months: ${row.recovery_months || "TBD"}`,
    "",
    row.director_letter || "Please proceed with HR and Accounts for final completion.",
    "",
    "Signed:",
    row.director_signature_text || "DIRECTOR OF HR",
  ].join("\n")

  const blob = new Blob([content], { type: "text/plain" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${row.request_number}-director-approval.txt`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function downloadCsv(rows: LoanRequest[], fileName: string) {
  const headers = [
    "Request Number",
    "Loan Type",
    "Staff Number",
    "Staff Rank",
    "Amount",
    "Status",
    "Date",
  ]

  const data = rows.map((r) => [
    r.request_number,
    r.loan_type_label,
    r.staff_number || "",
    r.staff_rank || "",
    String(r.fixed_amount || r.requested_amount || 0),
    statusText(r.status),
    fmtDate(r.submitted_at || r.created_at),
  ])

  const csv = [headers, ...data]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll("\"", "\"\"")}"`).join(","))
    .join("\n")

  const blob = new Blob([csv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

async function downloadPdf(rows: LoanRequest[], fileName: string, title: string) {
  const [{ jsPDF }, autoTableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ])
  const autoTable = autoTableMod.default

  const doc = new jsPDF({ orientation: "landscape" })
  doc.setFontSize(14)
  doc.text(title, 14, 15)

  autoTable(doc, {
    startY: 22,
    head: [["Request #", "Loan Type", "Staff #", "Rank", "Amount (GHc)", "Status", "Date"]],
    body: rows.map((r) => [
      r.request_number,
      r.loan_type_label,
      r.staff_number || "",
      r.staff_rank || "",
      fmtAmount(r.fixed_amount || r.requested_amount),
      statusText(r.status),
      fmtDate(r.updated_at || r.created_at),
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [110, 25, 129] },
  })

  doc.save(fileName)
}

function normalizeRoleValue(value?: string | null) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_")
}

const ADMIN_ROLE_ALIASES = new Set(["admin", "super_admin", "god"])

function isAdminRoleValue(value?: string | null) {
  return ADMIN_ROLE_ALIASES.has(normalizeRoleValue(value))
}

function amountToWords(amount: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]
  if (amount === 0) return "Zero"
  if (amount < 0) return "Minus " + amountToWords(-amount)
  let words = ""
  const n = Math.floor(amount)
  if (n >= 1000000) { words += amountToWords(Math.floor(n / 1000000)) + " Million "; }
  if (n % 1000000 >= 1000) { words += amountToWords(Math.floor((n % 1000000) / 1000)) + " Thousand "; }
  const rem = n % 1000
  if (rem >= 100) { words += ones[Math.floor(rem / 100)] + " Hundred "; }
  const r2 = rem % 100
  if (r2 >= 20) { words += tens[Math.floor(r2 / 10)] + (r2 % 10 ? " " + ones[r2 % 10] : "") + " "; }
  else if (r2 > 0) { words += ones[r2] + " "; }
  return words.trim()
}

function fmtMemoMonth(dateStr: string | null | undefined): string {
  if (!dateStr) return "TBD"
  const d = new Date(dateStr + (dateStr.length === 7 ? "-01" : ""))
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" })
}

function deriveMemoRef(requestNumber: string | null | undefined): string {
  if (!requestNumber) return "QCC/HRD/SWL/V.2/—"
  const parts = requestNumber.split("-")
  const seq = parts[parts.length - 1] || "—"
  return `QCC/HRD/SWL/V.2/${seq}`
}

function formatReferenceNumber(referenceNumber?: string | null, requestNumber?: string | null) {
  const candidate = String(referenceNumber || "").trim()
  const match = candidate.match(/^QCC\/HRD\/SWL\/V\.2\/(\d+)$/i)
  if (match) return `QCC/HRD/SWL/V.2/${match[1]}`
  return deriveMemoRef(requestNumber)
}

function splitHrNoteAndThroTelephone(note?: string | null): { cleanedNote: string; throTelephone: string; throName: string; throRank: string; throLocation: string; memoRecipient: string } {
  const raw = String(note || "").trim()
  if (!raw) return { cleanedNote: "", throTelephone: "", throName: "", throRank: "", throLocation: "", memoRecipient: "" }
  let cleaned = raw
  const extract = (token: string) => {
    const re = new RegExp(`\\[${token}:([^\\]]+)\\]`, "i")
    const m = cleaned.match(re)
    if (!m) return ""
    cleaned = cleaned.replace(m[0], "").replace(/\s{2,}/g, " ").trim()
    return String(m[1] || "").trim()
  }
  const throTelephone = extract("THRO_TEL")
  const throName = extract("THRO_NAME")
  const throRank = extract("THRO_RANK")
  const throLocation = extract("THRO_LOC")
  const memoRecipient = extract("MEMO_COPY")
  return { cleanedNote: cleaned, throTelephone, throName, throRank, throLocation, memoRecipient }
}

function buildHrNoteWithThroTelephone(note: string, throTelephone: string, throName?: string, throRank?: string, throLocation?: string, memoCopyRecipient?: string) {
  const trimmedNote = String(note || "").trim()
  const tokens: string[] = []
  const telephone = String(throTelephone || "").trim()
  const rank = String(throRank || "").trim()
  const loc = String(throLocation || "").trim()
  if (telephone) tokens.push(`[THRO_TEL:${telephone}]`)
  if (rank) tokens.push(`[THRO_RANK:${rank}]`)
  if (loc) tokens.push(`[THRO_LOC:${loc}]`)
  if (memoCopyRecipient) tokens.push(`[MEMO_COPY:${memoCopyRecipient}]`)
  const tokenStr = tokens.join(" ")
  return [tokenStr, trimmedNote].filter(Boolean).join(" ")
}

function buildDirectorAutoMemoDraft(
  row: LoanRequest,
  entry?: { hodName?: string; hodRank?: string; hodLocation?: string; hodTelephone?: string; memoRef?: string; memoRecipient?: string },
  currentHodProfile?: any,
) {
  const amount = row.fixed_amount || row.requested_amount || 0
  const amtNum = Number(amount)
  const amtFormatted = amtNum.toLocaleString("en-GH", { minimumFractionDigits: 2 })
  const amtWords = amountToWords(amtNum)
  const loanLabel = row.loan_type_label || row.loan_type_key || "Loan"
  const staffName = (row.staff_full_name || "REQUESTING STAFF").toUpperCase()
  const staffNo = row.staff_number || "—"
  const staffRank = (row.staff_rank || "").toUpperCase()
  // Use current HOD profile if available (dynamic), otherwise fall back to entry or row data
  const hodRank = entry?.hodRank || currentHodProfile?.rank || (row.hod_rank || "").toUpperCase()
  const hodLocation = entry?.hodLocation || currentHodProfile?.location || row.hod_location || row.staff_location_name || "—"
  const memoRecipient = entry?.memoRecipient || "Deputy Director Finance"
  const memoRef = entry?.memoRef || formatReferenceNumber(row.reference_number, row.request_number)
  const today = new Date().toISOString().slice(0, 10)
  const recoveryMonth = fmtMemoMonth(row.recovery_start_date)
  const disbursementMonth = fmtMemoMonth(row.disbursement_date)
  const submittedDate = row.submitted_at ? row.submitted_at.slice(0, 10) : row.created_at.slice(0, 10)
  const months = row.recovery_months || "—"

  return [
    "QUALITY CONTROL COMPANY LTD. (COCOBOD)",
    "HUMAN RESOURCES DEPARTMENT",
    "P.O Box M14",
    "Accra Ghana",
    "",
    `Our Ref No: ${memoRef}${" ".repeat(Math.max(4, 40 - memoRef.length))}Date: ${today}`,
    "Your Ref No: ________________________",
    "",
    `${staffName} (S/No.: ${staffNo})`,
    `${staffRank}`,
    "",
    ...(hodRank ? [`THRO'   ${hodRank}`] : []),
    `        QUALITY CONTROL COMPANY LIMITED`,
    `        ${hodLocation}`,
    "",
    `RE: APPLICATION FOR ${loanLabel.toUpperCase()}`,
    "",
    `We refer to your loan application dated ${submittedDate} on the above subject and wish to inform you that, Management has given approval for you to be granted a ${loanLabel} of ${amtWords} Ghana Cedis (GHc${amtFormatted}).`,
    "",
    `The loan would be recovered in ${months} Equal Monthly Instalment from your salary effective, ${recoveryMonth}.`,
    "",
    `By a copy of this letter, the ${memoRecipient} has been advised to release the said amount to you effective, ${disbursementMonth}.`,
    "",
    "You can count on our co-operation.",
    "",
    "",
    "OHENEBA BOAMAH",
    "DEPUTY DIRECTOR HUMAN RESOURCE",
    "FOR: MANAGING DIRECTOR",
    "",
    "cc:  Managing Director",
    "     Deputy Managing Director",
    "     Deputy Director Finance",
    "     Deputy Director Human Resource",
    "     Audit Manager",
    "     Registry Unit",
    "     Records Unit",
  ].join("\n")
}

function filterAndSortRows(
  rows: LoanRequest[],
  search: string,
  status: string,
  sort: "newest" | "oldest",
  location?: string,
  dept?: string,
) {
  let next = [...rows]
  if (search.trim()) {
    const q = search.trim().toLowerCase()
    next = next.filter((r) =>
      `${r.request_number || ""} ${r.loan_type_label || ""} ${r.staff_number || ""} ${r.staff_rank || ""} ${r.staff_location_name || ""}`
        .toLowerCase()
        .includes(q),
    )
  }
  if (status !== "all") next = next.filter((r) => r.status === status)
  if (location && location !== "all") {
    next = next.filter((r) => {
      const loc = String((r as any).staff_location_name || (r as any).staff_district_name || "")
      return loc === location
    })
  }
  if (dept && dept !== "all") {
    next = next.filter((r) => {
      const d = String((r as any).user?.departments?.name || (r as any).departments?.name || (r as any).department_name || "")
      return d === dept
    })
  }
  // Prioritize pending/high-action-needed statuses first, then sort by date
  const priorityMap: Record<string, number> = {
    'pending_fd': 0,        // Most urgent - pending FD check
    'pending_hod': 1,       // HOD pending approval
    'hod_approved': 2,      // Approved but needs action
    'sent_for_approval': 3, // Sent for approval
    'good_fd': 4,           // Good FD but not yet processed
    'poor_fd': 5,           // Poor FD - needs review
  }
  
  next.sort((a, b) => {
    const aStatus = String(a.status || '')
    const bStatus = String(b.status || '')
    
    // First, sort by priority (pending items on top)
    const aPriority = priorityMap[aStatus] ?? 999
    const bPriority = priorityMap[bStatus] ?? 999
    
    if (aPriority !== bPriority) return aPriority - bPriority
    
    // Then sort by date within same priority
    const ad = new Date(a.updated_at || a.created_at).getTime()
    const bd = new Date(b.updated_at || b.created_at).getTime()
    return sort === "newest" ? bd - ad : ad - bd
  })
  return next
}

async function loadImageAsDataUrl(src: string): Promise<string | null> {
  try {
    const res = await fetch(src)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(String(reader.result || ""))
      reader.onerror = () => reject(new Error("Failed to read image data"))
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function LoanAnalyticsMetricCard({
  label,
  value,
  hint,
  accent,
  icon,
}: {
  label: string
  value: string | number
  hint: string
  accent: string
  icon: ReactNode
}) {
  return (
    <div className={`rounded-2xl border bg-white p-4 shadow-sm ${accent}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{hint}</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 text-slate-700 shadow-sm">{icon}</div>
      </div>
    </div>
  )
}

function LoanAnalyticsBarChart({
  title,
  rows,
  valueKey,
  colorClass,
  emptyMessage,
  formatter,
}: {
  title: string
  rows: any[]
  valueKey: string
  colorClass: string
  emptyMessage: string
  formatter?: (row: any) => string
}) {
  const maxValue = rows.reduce((max, row) => Math.max(max, Number(row?.[valueKey] || 0)), 0)
  return (
    <Card className="border border-slate-200 bg-white shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm text-slate-900">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">{emptyMessage}</p>
        ) : (
          <div className="space-y-3">
            {rows.map((row, index) => {
              const value = Number(row?.[valueKey] || 0)
              const width = maxValue > 0 ? Math.max(8, Math.round((value / maxValue) * 100)) : 0
              return (
                <div key={`${title}-${index}`} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-slate-700">{formatter ? formatter(row) : String(row?.name || row?.status || row?.loanLabel || "Item")}</span>
                    <span className="text-slate-500">{value}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${width}%` }} />
                  </div>
                </div>
              )
            })}
                </div>
              )}
            </CardContent>
          </Card>
  )
}

// Helper function to resolve current HOD for a loan request
// Always fetches the latest HOD linkage instead of using static fields
function resolveCurrentHodForRequest(
  request: LoanRequest,
  currentHodProfile: any,
): { name: string; rank: string; location: string } {
  // If current HOD profile is available, use it (dynamic/real-time)
  if (currentHodProfile?.id) {
    return {
      name: currentHodProfile.name || "—",
      rank: currentHodProfile.rank || "—",
      location: currentHodProfile.location || "—",
    }
  }

  // Fallback to static HOD fields for archived requests or if linkage doesn't exist
  return {
    name: (request.hod_name || "—").trim() || "—",
    rank: (request.hod_rank || "—").toUpperCase() || "—",
    location: request.hod_location || "—",
  }
}

export default function LoanAppPage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<WorkflowResponse | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string>("")

  const [expandedLoanIds, setExpandedLoanIds] = useState<Set<string>>(new Set())
  const toggleLoanExpanded = (loanId: string) => {
    const newSet = new Set(expandedLoanIds)
    if (newSet.has(loanId)) {
      newSet.delete(loanId)
    } else {
      newSet.add(loanId)
    }
    setExpandedLoanIds(newSet)
  }

  const [editingId, setEditingId] = useState<string | null>(null)
  const [loanTypeKey, setLoanTypeKey] = useState("")
  const [reason, setReason] = useState("")
  const [supportingDocumentUrl, setSupportingDocumentUrl] = useState<string | null>(null)
  const [repaymentMonths, setRepaymentMonths] = useState<number>(12)
  const [supportingDocumentName, setSupportingDocumentName] = useState<string>("")
  const [uploadingDocument, setUploadingDocument] = useState(false)

  const [hodNotes, setHodNotes] = useState<Record<string, string>>({})
  const [loanOfficeNotes, setLoanOfficeNotes] = useState<Record<string, string>>({})
  const [fdInputs, setFdInputs] = useState<Record<string, { score: string; note: string }>>({})
  const [committeeNotes, setCommitteeNotes] = useState<Record<string, string>>({})
  const [hrInputs, setHrInputs] = useState<Record<string, { disbursement: string; recovery: string; months: string; note: string; hodName: string; hodRank: string; hodLocation: string; hodTelephone: string; memoRef: string; memoRecipient: string }>>({})

  const [directorDecision, setDirectorDecision] = useState<"approve" | "reject">("approve")
  const [directorLetter, setDirectorLetter] = useState("")
  const [memoPreviewLoanId, setMemoPreviewLoanId] = useState<string | null>(null)

  // ── Action modal state ──────────────────���───────────────────────────
  type ActionType = "hod" | "loan_office" | "accounts" | "committee" | "hr_terms" | "director" | "payment_completed" | "push_to_hr_executive"
  const [actionModal, setActionModal] = useState<{ open: boolean; row: LoanRequest | null; actionType: ActionType | null }>({ open: false, row: null, actionType: null })
  const [restoringLoanId, setRestoringLoanId] = useState<string | null>(null)
  const [isRestoringAll, setIsRestoringAll] = useState(false)
  const [selectedArchivedLoans, setSelectedArchivedLoans] = useState<Set<string>>(new Set())
  const [memoReviewModal, setMemoReviewModal] = useState<{ open: boolean; row: LoanRequest | null }>({ open: false, row: null })
  const [isSavingMemo, setIsSavingMemo] = useState(false)
  const [modalNote, setModalNote] = useState("")
  const [modalMemoCC, setModalMemoCC] = useState("Managing Director\nDeputy Managing Director\nDeputy Director Finance\nDeputy Director Human Resource\nAudit Manager\nRegistry Unit\nRecords Unit")
  const [modalDecision, setModalDecision] = useState<"approve" | "reject">("approve")
  const [modalFdScore, setModalFdScore] = useState("")
  const [modalFdNote, setModalFdNote] = useState("")
  const [modalFdProof, setModalFdProof] = useState<File | null>(null)

  const [modalDisbursement, setModalDisbursement] = useState("")
  const [modalRecovery, setModalRecovery] = useState("")
  const [modalMonths, setModalMonths] = useState("")
  const [modalHodName, setModalHodName] = useState("")
  const [modalHodRank, setModalHodRank] = useState("")
  const [modalHodLocation, setModalHodLocation] = useState("")
  const [modalHodTelephone, setModalHodTelephone] = useState("")
  const [modalMemoRef, setModalMemoRef] = useState("")
  const [modalCcRecipients, setModalCcRecipients] = useState("")
  const [modalAccountSignatory, setModalAccountSignatory] = useState("")
  const [modalHrSignatory, setModalHrSignatory] = useState("")
  const [modalMemoRecipient, setModalMemoRecipient] = useState("Deputy Director Finance")
  const [modalMemoText, setModalMemoText] = useState("")
  const [modalStaffFullName, setModalStaffFullName] = useState("")
  const [modalStaffNumber, setModalStaffNumber] = useState("")
  const [modalStaffRank, setModalStaffRank] = useState("")
  const [modalCorporateEmail, setModalCorporateEmail] = useState("")
  const [modalReferenceNumber, setModalReferenceNumber] = useState("")
  const [modalHodReviewerId, setModalHodReviewerId] = useState("")
  const [modalDirectorApproverId, setModalDirectorApproverId] = useState("")
  const [modalSignatureText, setModalSignatureText] = useState("")
  const [modalSignatureDataUrl, setModalSignatureDataUrl] = useState<string | null>(null)
  const [modalSignatureMode, setModalSignatureMode] = useState<"typed" | "draw" | "upload">("typed")
  const [signatureMode, setSignatureMode] = useState<"typed" | "draw" | "upload">("typed")
  const [signatureText, setSignatureText] = useState("")
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null)
  const [isSignatureMissing, setIsSignatureMissing] = useState(false)
  const [isEditingSignature, setIsEditingSignature] = useState(false)
  const [modalLengthOfService, setModalLengthOfService] = useState("")
  const [modalLastCarLoanDate, setModalLastCarLoanDate] = useState("")
  const [modalNeverHadCarLoan, setModalNeverHadCarLoan] = useState(false)
  const [modalAdditionalInfo, setModalAdditionalInfo] = useState("")

  const [lookupData, setLookupData] = useState<LookupPayload | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [registryData, setRegistryData] = useState<RegistryPayload | null>(null)
  const [registryLoading, setRegistryLoading] = useState(false)
  const [leavePaymentMemos, setLeavePaymentMemos] = useState<any[]>([])
  const [loadingLeavePaymentMemos, setLoadingLeavePaymentMemos] = useState(false)
  const [selectedLoanType, setSelectedLoanType] = useState("")
  const [setupFixedAmount, setSetupFixedAmount] = useState("")
  const [setupMaxAmount, setSetupMaxAmount] = useState("")
    const [setupLoanTerms, setSetupLoanTerms] = useState("")
    const [setupDefaultRecoveryMonths, setSetupDefaultRecoveryMonths] = useState("")
  const [setupQualification, setSetupQualification] = useState("")
  const [setupLoanLabel, setSetupLoanLabel] = useState("")
  const [setupIsActive, setSetupIsActive] = useState(true)
  const [salaryAdvanceMonths, setSalaryAdvanceMonths] = useState<number | null>(null)
  const [selectedTemplateDomain, setSelectedTemplateDomain] = useState<"loan" | "leave">("loan")
  const [selectedTemplateKey, setSelectedTemplateKey] = useState("loan_approval")
  const [templateTitle, setTemplateTitle] = useState("")
  const [templateSubject, setTemplateSubject] = useState("")
  const [templateBody, setTemplateBody] = useState("")
  const [selectedStaffForLink, setSelectedStaffForLink] = useState("")
  const [selectedHodsForLink, setSelectedHodsForLink] = useState<string[]>([])
  const [linkageRequestNote, setLinkageRequestNote] = useState("")
  const [linkageSearch, setLinkageSearch] = useState("")
  const [linkageLocationFilter, setLinkageLocationFilter] = useState("all")
  const [linkageDepartmentFilter, setLinkageDepartmentFilter] = useState("all")
  const [linkageRankFilter, setLinkageRankFilter] = useState("all")
  const [linkagePage, setLinkagePage] = useState(1)
  const [linkageRequestStatusFilter, setLinkageRequestStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending")
  const [linkageResolutionNotes, setLinkageResolutionNotes] = useState<Record<string, string>>({})
  const [selectedStaffsForBatchLink, setSelectedStaffsForBatchLink] = useState<string[]>([])
  const [selectedHodForBatchLink, setSelectedHodForBatchLink] = useState("")
  const [staffLocationFilter, setStaffLocationFilter] = useState("all")
  const [staffDepartmentFilter, setStaffDepartmentFilter] = useState("all")
  const [staffSearchFilter, setStaffSearchFilter] = useState("")
  const [selectedStaffForRank, setSelectedStaffForRank] = useState("")
  const [selectedRankLevel, setSelectedRankLevel] = useState<"junior" | "senior" | "manager">("junior")
  const [selectedLoanIds, setSelectedLoanIds] = useState<string[]>([])

  const [hodSearch, setHodSearch] = useState("")
  const [hodStatus, setHodStatus] = useState("all")
  const [hodSort, setHodSort] = useState<"newest" | "oldest">("newest")
  const [hodPage, setHodPage] = useState(1)
  const [hodLocation, setHodLocation] = useState("all")
  const [hodDept, setHodDept] = useState("all")

  const [loanOfficeSearch, setLoanOfficeSearch] = useState("")
  const [loanOfficeStatus, setLoanOfficeStatus] = useState("all")
  const [loanOfficeSort, setLoanOfficeSort] = useState<"newest" | "oldest">("newest")
  const [loanOfficePage, setLoanOfficePage] = useState(1)
  const [loanOfficeTypeTab, setLoanOfficeTypeTab] = useState("all")
  const [loanOfficeStageTab, setLoanOfficeStageTab] = useState("pending")
  const [loanOfficeViewMode, setLoanOfficeViewMode] = useState<"table" | "card">("table")
  const [isArchivingLoans, setIsArchivingLoans] = useState(false)
  const [loanOfficeLocation, setLoanOfficeLocation] = useState("all")
  const [loanOfficeDept, setLoanOfficeDept] = useState("all")

  const [accountsSearch, setAccountsSearch] = useState("")
  const [accountsStatus, setAccountsStatus] = useState("all")
  const [accountsSort, setAccountsSort] = useState<"newest" | "oldest">("newest")
  const [accountsPage, setAccountsPage] = useState(1)
  const [accountsViewMode, setAccountsViewMode] = useState<"table" | "card">("table")
  const [accountsLocation, setAccountsLocation] = useState("all")
  const [accountsDept, setAccountsDept] = useState("all")

  const [committeeSearch, setCommitteeSearch] = useState("")
  const [committeeStatus, setCommitteeStatus] = useState("all")
  const [committeeSort, setCommitteeSort] = useState<"newest" | "oldest">("newest")
  const [committeePage, setCommitteePage] = useState(1)
  const [committeeViewMode, setCommitteeViewMode] = useState<"table" | "card">("table")
  const [committeeLocation, setCommitteeLocation] = useState("all")
  const [committeeDept, setCommitteeDept] = useState("all")

  const [hrSearch, setHrSearch] = useState("")
  const [hrStatus, setHrStatus] = useState("all")
  const [hrSort, setHrSort] = useState<"newest" | "oldest">("newest")
  const [hrPage, setHrPage] = useState(1)
  const [hrViewMode, setHrViewMode] = useState<"table" | "card">("table")
  const [hrLocation, setHrLocation] = useState("all")
  const [hrDept, setHrDept] = useState("all")

  const [directorSearch, setDirectorSearch] = useState("")
  const [directorStatus, setDirectorStatus] = useState("all")
  const [directorSort, setDirectorSort] = useState<"newest" | "oldest">("newest")
  const [directorPage, setDirectorPage] = useState(1)
  const [directorViewMode, setDirectorViewMode] = useState<"table" | "card">("table")
  const [directorLocation, setDirectorLocation] = useState("all")
  const [directorDept, setDirectorDept] = useState("all")

  const [hodViewMode, setHodViewMode] = useState<"table" | "card">("table")

  const [tasksSearch, setTasksSearch] = useState("")
  const [tasksStatus, setTasksStatus] = useState("all")

  const [staffLoanRecordsSearch, setStaffLoanRecordsSearch] = useState("")
  const [staffLoanRecordsPage, setStaffLoanRecordsPage] = useState(1)
  const [staffLoanRecordsSort, setStaffLoanRecordsSort] = useState<"name" | "status">("name")

  // Payment Evidence Upload Modal State
  const [paymentEvidenceModal, setPaymentEvidenceModal] = useState({
    open: false,
    paymentDate: new Date().toISOString().split("T")[0],
    paymentAmount: "",
    paymentMethod: "bank_transfer",
    referenceNumber: "",
    description: "",
    evidenceFile: null as File | null,
    isSubmitting: false,
  })

  // Payment Approvals Tab State
  const [paymentApprovalsSearch, setPaymentApprovalsSearch] = useState("")
  const [paymentApprovalsFilter, setPaymentApprovalsFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending")
  const [paymentApprovalsSort, setPaymentApprovalsSort] = useState<"date" | "amount">("date")
  const [paymentRecords, setPaymentRecords] = useState<any[]>([])
  const [paymentRecordsLoading, setPaymentRecordsLoading] = useState(false)
  const [selectedPaymentForApproval, setSelectedPaymentForApproval] = useState<any>(null)
  const [approvalModalOpen, setApprovalModalOpen] = useState(false)
  const [approvalNotes, setApprovalNotes] = useState("")
  const [approvingPaymentId, setApprovingPaymentId] = useState<string | null>(null)
  const [selectedPaymentEvidence, setSelectedPaymentEvidence] = useState<any | null>(null)
  const [paymentApprovalModal, setPaymentApprovalModal] = useState({
    open: false,
    action: null as "approve" | "reject" | null,
    approvalNotes: "",
    rejectionReason: "",
    isSubmitting: false,
  })
  const [tasksSort, setTasksSort] = useState<"newest" | "oldest">("newest")
  const [tasksPage, setTasksPage] = useState(1)
  const [tasksViewMode, setTasksViewMode] = useState<"table" | "card">("table")
  const [allSearch, setAllSearch] = useState("")
  const [allStatus, setAllStatus] = useState("all")
  const [allSort, setAllSort] = useState<"newest" | "oldest">("newest")
  const [allFdFilter, setAllFdFilter] = useState<"all" | "good" | "poor" | "archive">("all")
  const [allPage, setAllPage] = useState(1)
  const [allLocation, setAllLocation] = useState("all")
  const [allDept, setAllDept] = useState("all")
  const pageSize = 10
  const previousHodQueueCountRef = useRef<number | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)

  const filteredLoanTypes = useMemo(() => {
    const rawTypes = data?.loanTypes || []
    const userTier = getUserLoanTier(data?.profile?.position, data?.profile?.role)

    const normalizedTypes = rawTypes.map((type) => ({
      ...type,
      loan_label: normalizeLoanTypeLabel(type, rawTypes),
    }))

    return normalizedTypes.filter((type) => shouldIncludeLoanTypeForUser(type, userTier, normalizedTypes))
  }, [data])

  const selectedType = useMemo(() => filteredLoanTypes.find((t) => t.loan_key === loanTypeKey), [filteredLoanTypes, loanTypeKey])
  const needsAttachment = useMemo(
    () => requiresProofAttachment(loanTypeKey, selectedType?.loan_label, selectedType?.category),
    [loanTypeKey, selectedType],
  )
  const isSalaryAdvanceRequest = useMemo(() => {
    const key = String(selectedType?.loan_key || "").toLowerCase()
    const label = String(selectedType?.loan_label || "").toLowerCase()
    return key === "salary_advance" || label.includes("salary advance")
  }, [selectedType])

  useEffect(() => {
    if (!isSalaryAdvanceRequest) {
      setSalaryAdvanceMonths(null)
    }
  }, [isSalaryAdvanceRequest])

  // Auto-populate Length of Service and reset car loan fields when committee modal opens
  useEffect(() => {
    if (actionModal.open && actionModal.actionType === "committee" && actionModal.row) {
      // Auto-calculate Length of Service from hire_date if available
      if (actionModal.row.hire_date) {
        const hireDate = new Date(actionModal.row.hire_date)
        const today = new Date()
        const yearsOfService = (today.getTime() - hireDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
        setModalLengthOfService(yearsOfService.toFixed(1))
      } else {
        setModalLengthOfService("")
      }
      setModalLastCarLoanDate("")
      setModalNeverHadCarLoan(false)
      setModalAdditionalInfo("")
    }
  }, [actionModal.open, actionModal.actionType, actionModal.row])

  const p = data?.permissions
  const normalizedRole = normalizeRoleValue(data?.profile?.role)
  const isAdmin = isAdminRoleValue(normalizedRole)
  const canSeeFdReviewerName = isAdmin || p?.directorHr || p?.hrOffice || p?.viewAllTabs
    // Loan Office workspace: loan_office/manager_hr ONLY if in HR dept (not Accounts dept)
  // Accounts-dept loan_office users get Accounts tab, not Loan Office tab
  const userDeptName = data?.profile?.departmentName || ""
  const userDeptIsAccounts = /account|finance/i.test(userDeptName)
  const canAccessLoanOfficeWorkspace =
    isAdmin ||
    (["loan_office", "manager_hr", "hr_executive"].includes(normalizedRole) && !userDeptIsAccounts) ||
    (normalizedRole === "manager_hr" && !userDeptIsAccounts)
  const canDirectLinkageUpdate = Boolean(isAdmin || p?.hrOffice || p?.loanOffice || p?.viewAllTabs)
  const canSaveLoanRequest = !LOAN_SUBMISSION_LOCKED
  const templateOptions = useMemo(
    () => (registryData?.templates || []).filter((template) => template.workflow_domain === selectedTemplateDomain),
    [registryData?.templates, selectedTemplateDomain],
  )
  const activeTemplate = useMemo(
    () => templateOptions.find((template) => template.template_key === selectedTemplateKey) || templateOptions[0] || null,
    [templateOptions, selectedTemplateKey],
  )

  const visibleTabs = useMemo(() => {
    const p = data?.permissions
    const isAdminUser = isAdmin // Use the calculated isAdmin flag
    const allLoansData = data?.inbox?.allLoans || []
    const activeLoansCount = allLoansData.filter((loan: any) => loan.status !== "archived").length
    const archivedLoansCount = allLoansData.filter((loan: any) => loan.status === "archived").length
    
    const c = {
      hod: data?.inbox?.hod?.length || 0,
      loanOffice: data?.inbox?.loanOffice?.length || 0,
      accounts: data?.inbox?.accounts?.length || 0,
      committee: data?.inbox?.committee?.length || 0,
      hr: data?.inbox?.hrOffice?.length || 0,
      director: data?.inbox?.directorHr?.length || 0,
      all: activeLoansCount,
      archived: archivedLoansCount,
      mine: data?.myTasks?.length || 0,
    }
    // Determine if this user is ONLY an HR Executive (director_hr) with no other elevated roles
    const isHrExecutive = !isAdminUser && !!p?.directorHr
    const isAccountsExecutive = !isAdminUser && !!p?.accounts
    const isHrExecutiveOnly = !isAdminUser && p?.directorHr && !p?.hod && !p?.loanOffice && !p?.accounts && !p?.hrOffice && !p?.viewAllTabs

    // Get loan type name for "My Loans" tab if a loan is selected
    let myLoansLabel = "My Loans"
    if (loanTypeKey && data?.loanTypes) {
      const selectedLoanType = data.loanTypes.find((lt: any) => lt.key === loanTypeKey)
      if (selectedLoanType?.name) {
        myLoansLabel = `My Loans - ${selectedLoanType.name}`
      }
    }

    const tabs: { key: string; label: string; href?: string }[] = [{ key: "staff", label: myLoansLabel }]
    // Tracking tab: hidden for pure HR Executives — they work on forwarded loans, not the full pipeline
    if (!isHrExecutiveOnly) tabs.push({ key: "tracking", label: "Tracking" })

    // Payment Approvals tab: only for HR and Accounts executives
    if (isHrExecutive || isAccountsExecutive) {
      tabs.push({ key: "payment-approvals", label: "Payment Approvals" })
    }

    // FD Approval tab: only for Accounts executives to review FD values from Loan Office
    if (isAccountsExecutive) {
      // TODO: Update when API is integrated to return pending FD count
      // For now, display FD Approval tab without count
      tabs.push({ 
        key: "fd-approval", 
        label: `FD Approval (${c.fdApproval || 0})`
      })
      // Add FD Completed tab for archived/historical FD records
      tabs.push({
        key: "fd-completed",
        label: "FD Completed/Archived"
      })
    }

    // Loan Office tab: ONLY for HR department loan office staff to process HOD-approved loans and perform FD checks
    // Supports both new (hr_loan_office) and legacy (loan_office in HR dept) role names
    const isHRLoanOffice = (["hr_loan_office", "loan_office", "manager_hr", "hr_executive"].includes(normalizedRole) && !userDeptIsAccounts) || (p?.loanOffice && !userDeptIsAccounts)
    if (isHRLoanOffice) {
      tabs.push({ key: "loan-office", label: `Loan Office (${c.loanOffice})` })
    }

    // Accounts tab: ONLY for Accounts department loan office staff OR users with direct accounts permission
    // Supports both new (accounts_loan_office) and legacy (loan_office in Accounts dept) role names
    const isAccountsOffice = (normalizedRole === "accounts_loan_office") || (normalizedRole === "loan_office" && userDeptIsAccounts) || p?.accounts
    if (isAccountsOffice) {
      tabs.push({ key: "accounts", label: `Accounts (${c.accounts})` })
    }

    // Repayment Tracking tab: for Loan Office, Accounts executives, and HR Loan Office
    if (canAccessLoanOfficeWorkspace || isAccountsExecutive || isHRLoanOffice) {
      tabs.push({ key: "repayment-tracking", label: "Repayment Tracking" })
    }

    // Analytics tab for Loan Office, Accounts executives, and HR Loan Office (view only)
    if (canAccessLoanOfficeWorkspace || p?.accounts || isHRLoanOffice) tabs.push({ key: "analytics", label: "Analytics" })
    // Leave Payment: Accounts executives, viewAllTabs, and HR Loan Office
    if (p?.accounts || p?.viewAllTabs || isHRLoanOffice) tabs.push({ key: "leave-payment", label: "Leave Payment" })
    if (canAccessLoanOfficeWorkspace && !p?.accounts && !p?.viewAllTabs) tabs.push({ key: "loan-payment-advice", label: "Payment & Download" })
    if (p?.committee || p?.viewAllTabs) tabs.push({ key: "committee", label: `Committee (${c.committee})` })
    if (p?.directorHr || p?.viewAllTabs) tabs.push({ key: "director", label: `Executive HR (${c.director})` })
    // Payment Approvals: HR/Accounts executives and HR Loan Office
    if (isHrExecutive || isAccountsExecutive || isHRLoanOffice) tabs.push({ key: "payment-approvals", label: "Payment Approvals" })
    if (canAccessLoanOfficeWorkspace) tabs.push({ key: "setup", label: "Setup & Linkage" })
    // My Tasks: hidden for pure HR Executives and HR Loan Office — they work on forwarded queues, not personal tasks
    if (!isHrExecutiveOnly && !isHRLoanOffice && (p?.hod || p?.loanOffice || p?.accounts || p?.committee || p?.hrOffice || p?.viewAllTabs || p?.allLoans)) {
      tabs.push({ key: "my-tasks", label: `My Tasks (${c.mine})` })
    }
    // All Loans: admins, viewAllTabs, and HR Loan Office (read-only view with download access)
    if (p?.allLoans || p?.viewAllTabs || isHRLoanOffice) {
      tabs.push({ key: "overview", label: `All Loans (${c.all})` })
      if (c.archived > 0) {
        tabs.push({ key: "archive", label: `Archive (${c.archived})` })
      }
    } else if (normalizedRole !== "hr_loan_office" && (p?.allLoans || p?.viewAllTabs)) {
      tabs.push({ key: "overview", label: `All Loans (${c.all})` })
    }
    return tabs
  }, [data, canAccessLoanOfficeWorkspace, isAdmin])

  // HR Executives land directly on their approval queue
  const defaultTab = (!isAdmin && p?.directorHr && !p?.hod && !p?.loanOffice && !p?.accounts && !p?.committee)
    ? "director"
    : visibleTabs[0]?.key || "staff"

  const filteredHod = useMemo(
    () => filterAndSortRows(data?.inbox?.hod || [], hodSearch, hodStatus, hodSort, hodLocation, hodDept),
    [data?.inbox?.hod, hodSearch, hodStatus, hodSort, hodLocation, hodDept],
  )
  const filteredLoanOffice = useMemo(
    () => filterAndSortRows(data?.inbox?.loanOffice || [], loanOfficeSearch, loanOfficeStatus, loanOfficeSort),
    [data?.inbox?.loanOffice, loanOfficeSearch, loanOfficeStatus, loanOfficeSort],
  )

  const loanOfficeWorkspaceRows = useMemo(() => {
    let allLoans = data?.inbox?.allLoans || []
    if (allLoans.length === 0) {
      const merged = [
        ...(data?.inbox?.loanOffice || []),
        ...(data?.inbox?.accounts || []),
        ...(data?.inbox?.committee || []),
        ...(data?.inbox?.hrOffice || []),
        ...(data?.inbox?.directorHr || []),
        ...(data?.inbox?.accountsSigned || []),
      ]
      allLoans = Array.from(new Map(merged.map((r) => [r.id, r])).values())
    }

    // Filter loans based on staff category
    const staffCategory = data?.profile?.staffCategory
    if (!staffCategory || staffCategory === "Manager") {
      return allLoans // Managers can see all loans
    }

    // Filter based on staff category (junior/senior)
    return allLoans.filter((loan) => {
      const loanCategory = String(loan.category || "").toLowerCase().trim()
      
      // If loan has no category suffix, everyone can see it
      if (!loanCategory) return true
      
      // If staff is junior, only show loans with no category or (junior) suffix
      if (staffCategory === "Junior") {
        return !loanCategory.includes("senior")
      }
      
      // If staff is senior, only show loans with no category or (senior) suffix
      if (staffCategory === "Senior") {
        return !loanCategory.includes("junior")
      }
      
      return true
    })
  }, [
    data?.inbox?.allLoans,
    data?.inbox?.loanOffice,
    data?.inbox?.accounts,
    data?.inbox?.committee,
    data?.inbox?.hrOffice,
    data?.inbox?.directorHr,
    data?.inbox?.accountsSigned,
    data?.profile?.staffCategory,
  ])

  const loanOfficeTypeOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const row of loanOfficeWorkspaceRows) {
      map.set(row.loan_type_key, row.loan_type_label || row.loan_type_key)
    }
    return Array.from(map.entries())
      .map(([loanKey, loanLabel]) => ({ loanKey, loanLabel }))
      .sort((a, b) => a.loanLabel.localeCompare(b.loanLabel))
  }, [loanOfficeWorkspaceRows])

  const loanOfficeRowsForSelectedType = useMemo(() => {
    if (loanOfficeTypeTab === "all") return loanOfficeWorkspaceRows
    return loanOfficeWorkspaceRows.filter((row) => row.loan_type_key === loanOfficeTypeTab)
  }, [loanOfficeWorkspaceRows, loanOfficeTypeTab])

  const loanOfficeStageBuckets = useMemo(() => {
    const isArchivableStatus = (status: string) => ["approved_director", "director_rejected", "rejected_fd", "committee_rejected", "hod_rejected"].includes(status)
    const isArchivedStatus = (status: string) => status === "archived"
    const isGoodFd = (row: LoanRequest) => row.fd_good === true
    const isPoorFd = (row: LoanRequest) => row.fd_good === false || row.status === "rejected_fd" || (typeof row.fd_score === "number" && row.fd_score < 39)
    const isGoodFdNotPushed = (row: LoanRequest) =>
      isGoodFd(row) && !["awaiting_director_hr", "approved_director", "director_rejected"].includes(row.status)
    const isPending = (row: LoanRequest) =>
      row.fd_good === null && row.fd_score === null && !isArchivableStatus(row.status) && !isArchivedStatus(row.status)
    const isFdApprovedByAccounts = (row: LoanRequest) =>
      row.status === "pending_hr_loan_office"

    return {
      pending: loanOfficeRowsForSelectedType.filter((row) => isPending(row)),
      "good-fd": loanOfficeRowsForSelectedType.filter((row) => isGoodFd(row)),
      "poor-fd": loanOfficeRowsForSelectedType.filter((row) => isPoorFd(row)),
      "good-fd-not-pushed": loanOfficeRowsForSelectedType.filter((row) => isGoodFdNotPushed(row)),
      "sent-for-approval": loanOfficeRowsForSelectedType.filter((row) => row.status === "awaiting_director_hr"),
      "fd-approved-accounts-exec": loanOfficeRowsForSelectedType.filter((row) => isFdApprovedByAccounts(row)),
      archivable: loanOfficeRowsForSelectedType.filter((row) => isArchivableStatus(row.status)),
      archived: loanOfficeRowsForSelectedType.filter((row) => isArchivedStatus(row.status)),
    }
  }, [loanOfficeRowsForSelectedType])

  const loanOfficeTypeSummary = useMemo(() => {
    const isArchivableStatus = (status: string) => ["approved_director", "director_rejected", "rejected_fd", "committee_rejected", "hod_rejected"].includes(status)
    const isGoodFd = (row: LoanRequest) => row.fd_good === true
    const isPoorFd = (row: LoanRequest) => row.fd_good === false || row.status === "rejected_fd" || (typeof row.fd_score === "number" && row.fd_score < 39)
    const isGoodFdNotPushed = (row: LoanRequest) =>
      isGoodFd(row) && !["awaiting_director_hr", "approved_director", "director_rejected"].includes(row.status)

    return loanOfficeTypeOptions.map((opt) => {
      const rows = loanOfficeWorkspaceRows.filter((row) => row.loan_type_key === opt.loanKey)
      const goodFd = rows.filter((row) => isGoodFd(row)).length
      const poorFd = rows.filter((row) => isPoorFd(row)).length
      const goodFdNotPushed = rows.filter((row) => isGoodFdNotPushed(row)).length
      const sentForApproval = rows.filter((row) => row.status === "awaiting_director_hr").length
      const archivable = rows.filter((row) => isArchivableStatus(row.status)).length
      const totalUnique = new Set(
        rows
          .filter(
            (row) =>
              isGoodFd(row) ||
              isPoorFd(row) ||
              isGoodFdNotPushed(row) ||
              row.status === "awaiting_director_hr" ||
              isArchivableStatus(row.status),
          )
          .map((row) => row.id),
      ).size

      return {
        ...opt,
        totalUnique,
        goodFd,
        poorFd,
        goodFdNotPushed,
        sentForApproval,
        archivable,
      }
    })
  }, [loanOfficeTypeOptions, loanOfficeWorkspaceRows])

  const filteredLoanOfficeStageRows = useMemo(() => {
    const bucketRows = loanOfficeStageBuckets[loanOfficeStageTab as keyof typeof loanOfficeStageBuckets] || []
    return filterAndSortRows(bucketRows, loanOfficeSearch, loanOfficeStatus, loanOfficeSort, loanOfficeLocation, loanOfficeDept)
  }, [loanOfficeStageBuckets, loanOfficeStageTab, loanOfficeSearch, loanOfficeStatus, loanOfficeSort, loanOfficeLocation, loanOfficeDept])

  const loanOfficeAnalytics = useMemo(() => {
    const rows = loanOfficeWorkspaceRows
    const terminalStatuses = new Set(["approved_director", "director_rejected", "rejected_fd", "committee_rejected", "hod_rejected"])
    const pendingStatuses = new Set(["pending_hod", "hod_approved", "pending_hr_loan_office"])

    const stageBreakdown = Array.from(
      rows.reduce((map, row) => {
        const status = String(row.status || "unknown")
        map.set(status, (map.get(status) || 0) + 1)
        return map
      }, new Map<string, number>()).entries(),
    )
      .map(([status, total]) => ({ status, total }))
      .sort((a, b) => b.total - a.total)

    const locationRanking = Array.from(
      rows.reduce((map, row) => {
        const name = String(row.staff_location_name || row.staff_district_name || "Unassigned Location")
        map.set(name, (map.get(name) || 0) + 1)
        return map
      }, new Map<string, number>()).entries(),
    )
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8)

    const monthlyIntake = Array.from(
      rows.reduce((map, row) => {
        const month = String(row.created_at || row.submitted_at || "").slice(0, 7)
        if (!month) return map
        map.set(month, (map.get(month) || 0) + 1)
        return map
      }, new Map<string, number>()).entries(),
    )
      .map(([month, total]) => ({ month, total }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-6)

    // Calculate monetary totals
    const rowAmount = (r: LoanRequest) => Number(r.fixed_amount || r.requested_amount || 0)
    const totalLoanValue = rows.reduce((sum: number, r: LoanRequest) => sum + rowAmount(r), 0)
    const approvedStatuses = new Set(["hod_approved", "sent_to_accounts", "approved_director", "awaiting_committee", "awaiting_hr_terms", "awaiting_director_hr", "staff_receiving_funds", "partially_recovered", "payment_completed"])
    const approvedRows = rows.filter((r: LoanRequest) => approvedStatuses.has(String(r.status || "")))
    const totalApprovedValue = approvedRows.reduce((sum: number, r: LoanRequest) => sum + rowAmount(r), 0)
    const avgLoanAmount = rows.length > 0 ? totalLoanValue / rows.length : 0

    return {
      totals: {
        total_requests: rows.length,
        worked_on: rows.filter((row) => !pendingStatuses.has(String(row.status || ""))).length,
        yet_to_be_worked: rows.filter((row) => pendingStatuses.has(String(row.status || ""))).length,
        finalized: rows.filter((row) => terminalStatuses.has(String(row.status || ""))).length,
        active_pipeline: rows.filter((row) => !terminalStatuses.has(String(row.status || ""))).length,
        good_fd: rows.filter((row) => row.fd_good === true).length,
        poor_fd: rows.filter((row) => row.fd_good === false || row.status === "rejected_fd" || (typeof row.fd_score === "number" && row.fd_score < 39)).length,
        total_loan_value: totalLoanValue,
        total_approved_value: totalApprovedValue,
        avg_loan_amount: avgLoanAmount,
      },
      stageBreakdown,
      locationRanking,
      monthlyIntake,
    }
  }, [loanOfficeWorkspaceRows])

  const filteredAccounts = useMemo(
    () => filterAndSortRows(data?.inbox?.accounts || [], accountsSearch, accountsStatus, accountsSort, accountsLocation, accountsDept),
    [data?.inbox?.accounts, accountsSearch, accountsStatus, accountsSort, accountsLocation, accountsDept],
  )
  const filteredCommittee = useMemo(
    () => filterAndSortRows(data?.inbox?.committee || [], committeeSearch, committeeStatus, committeeSort, committeeLocation, committeeDept),
    [data?.inbox?.committee, committeeSearch, committeeStatus, committeeSort, committeeLocation, committeeDept],
  )
  const filteredHr = useMemo(
    () => filterAndSortRows(data?.inbox?.hrOffice || [], hrSearch, hrStatus, hrSort, hrLocation, hrDept),
    [data?.inbox?.hrOffice, hrSearch, hrStatus, hrSort, hrLocation, hrDept],
  )
  const filteredDirector = useMemo(
    () => filterAndSortRows(data?.inbox?.directorHr || [], directorSearch, directorStatus, directorSort, directorLocation, directorDept),
    [data?.inbox?.directorHr, directorSearch, directorStatus, directorSort, directorLocation, directorDept],
  )

  const filteredMyTasks = useMemo(() => {
    return filterAndSortRows(data?.myTasks || [], tasksSearch, tasksStatus, tasksSort)
  }, [data?.myTasks, tasksSearch, tasksStatus, tasksSort])

  const filteredAllLoans = useMemo(() => {
    let loans = data?.inbox?.allLoans || []
    
    // Apply FD filter
    if (allFdFilter === "good") {
      loans = loans.filter(loan => loan.fd_good === true)
    } else if (allFdFilter === "poor") {
      loans = loans.filter(loan => loan.fd_good === false && loan.fd_score != null)
    } else if (allFdFilter === "archive") {
      loans = loans.filter(loan => loan.status === "archived")
    } else {
      // 'all' - exclude archived loans from active view
      loans = loans.filter(loan => loan.status !== "archived")
    }
    
    return filterAndSortRows(loans, allSearch, allStatus, allSort, allLocation, allDept)
  }, [data?.inbox?.allLoans, allSearch, allStatus, allSort, allLocation, allDept, allFdFilter])

  const filteredArchivedLoans = useMemo(() => {
    // Show only archived loans
    const archivedLoans = (data?.inbox?.allLoans || []).filter(loan => loan.status === "archived")
    return filterAndSortRows(archivedLoans, allSearch, allStatus, allSort, allLocation, allDept)
  }, [data?.inbox?.allLoans, allSearch, allStatus, allSort, allLocation, allDept])

  // Unique location and department options for loan filters
  const allLoanLocations = useMemo(() => {
    const allRows = [
      ...(data?.inbox?.hod || []),
      ...(data?.inbox?.loanOffice || []),
      ...(data?.inbox?.accounts || []),
      ...(data?.inbox?.committee || []),
      ...(data?.inbox?.hrOffice || []),
      ...(data?.inbox?.directorHr || []),
      ...(data?.inbox?.allLoans || []),
    ]
    const set = new Set<string>()
    for (const r of allRows) {
      const loc = String((r as any).staff_location_name || (r as any).staff_district_name || "")
      if (loc) set.add(loc)
    }
    return Array.from(set).sort()
  }, [data?.inbox])

  const allLoanDepts = useMemo(() => {
    const allRows = [
      ...(data?.inbox?.hod || []),
      ...(data?.inbox?.loanOffice || []),
      ...(data?.inbox?.accounts || []),
      ...(data?.inbox?.committee || []),
      ...(data?.inbox?.hrOffice || []),
      ...(data?.inbox?.directorHr || []),
      ...(data?.inbox?.allLoans || []),
    ]
    const set = new Set<string>()
    for (const r of allRows) {
      const dept = String((r as any).user?.departments?.name || (r as any).departments?.name || (r as any).department_name || "")
      if (dept) set.add(dept)
    }
    return Array.from(set).sort()
  }, [data?.inbox])

  const pagedHod = useMemo(() => filteredHod.slice((hodPage - 1) * pageSize, hodPage * pageSize), [filteredHod, hodPage])
  const pagedLoanOffice = useMemo(
    () => filteredLoanOffice.slice((loanOfficePage - 1) * pageSize, loanOfficePage * pageSize),
    [filteredLoanOffice, loanOfficePage],
  )
  const pagedLoanOfficeStage = useMemo(
    () => filteredLoanOfficeStageRows.slice((loanOfficePage - 1) * pageSize, loanOfficePage * pageSize),
    [filteredLoanOfficeStageRows, loanOfficePage],
  )
  const pagedAccounts = useMemo(
    () => filteredAccounts.slice((accountsPage - 1) * pageSize, accountsPage * pageSize),
    [filteredAccounts, accountsPage],
  )
  const pagedCommittee = useMemo(
    () => filteredCommittee.slice((committeePage - 1) * pageSize, committeePage * pageSize),
    [filteredCommittee, committeePage],
  )
  const pagedHr = useMemo(() => filteredHr.slice((hrPage - 1) * pageSize, hrPage * pageSize), [filteredHr, hrPage])
  const pagedDirector = useMemo(
    () => filteredDirector.slice((directorPage - 1) * pageSize, directorPage * pageSize),
    [filteredDirector, directorPage],
  )

  const pagedMyTasks = useMemo(() => {
    const start = (tasksPage - 1) * pageSize
    return filteredMyTasks.slice(start, start + pageSize)
  }, [filteredMyTasks, tasksPage])

  const pagedAllLoans = useMemo(() => {
    const start = (allPage - 1) * pageSize
    return filteredAllLoans.slice(start, start + pageSize)
  }, [filteredAllLoans, allPage])

  const totalMyTaskPages = Math.max(1, Math.ceil(filteredMyTasks.length / pageSize))
  const totalAllLoanPages = Math.max(1, Math.ceil(filteredAllLoans.length / pageSize))
  const totalHodPages = Math.max(1, Math.ceil(filteredHod.length / pageSize))
  const totalLoanOfficePages = Math.max(1, Math.ceil(filteredLoanOffice.length / pageSize))
  const totalLoanOfficeStagePages = Math.max(1, Math.ceil(filteredLoanOfficeStageRows.length / pageSize))
  const totalAccountsPages = Math.max(1, Math.ceil(filteredAccounts.length / pageSize))
  const totalCommitteePages = Math.max(1, Math.ceil(filteredCommittee.length / pageSize))
  const totalHrPages = Math.max(1, Math.ceil(filteredHr.length / pageSize))
  const totalDirectorPages = Math.max(1, Math.ceil(filteredDirector.length / pageSize))

  useEffect(() => setHodPage(1), [hodSearch, hodStatus, hodSort])
  useEffect(() => setLoanOfficePage(1), [loanOfficeSearch, loanOfficeStatus, loanOfficeSort])

  // Fetch payment records for approval
  useEffect(() => {
    const fetchPaymentRecords = async () => {
      const isApprover = ["hr_executive", "accounts_executive", "admin"].includes(data?.profile?.role || "")
      if (!isApprover) return

      setPaymentRecordsLoading(true)
      try {
        const response = await fetch(`/api/loan/payment-evidence?overallStatus=${paymentApprovalsFilter === "all" ? "" : paymentApprovalsFilter}`)
        if (response.ok) {
          const result = await response.json()
          const records = result.data || []
          
          // Filter and sort records
          let filtered = records
          if (paymentApprovalsSearch) {
            filtered = records.filter((r: any) =>
              r.reference_number?.toLowerCase().includes(paymentApprovalsSearch.toLowerCase()) ||
              r.description?.toLowerCase().includes(paymentApprovalsSearch.toLowerCase())
            )
          }
          
          if (paymentApprovalsSort === "amount") {
            filtered.sort((a: any, b: any) => Number(b.amount_paid) - Number(a.amount_paid))
          } else {
            filtered.sort((a: any, b: any) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())
          }
          
          setPaymentRecords(filtered)
        }
      } catch (err) {
        console.error("[v0] Error fetching payment records:", err)
      } finally {
        setPaymentRecordsLoading(false)
      }
    }

    fetchPaymentRecords()
  }, [data?.profile?.role, paymentApprovalsFilter, paymentApprovalsSearch, paymentApprovalsSort])
  useEffect(() => setLoanOfficePage(1), [loanOfficeTypeTab, loanOfficeStageTab])
  useEffect(() => setAccountsPage(1), [accountsSearch, accountsStatus, accountsSort])
  useEffect(() => setCommitteePage(1), [committeeSearch, committeeStatus, committeeSort])
  useEffect(() => setHrPage(1), [hrSearch, hrStatus, hrSort])
  useEffect(() => setDirectorPage(1), [directorSearch, directorStatus, directorSort])

  useEffect(() => {
    setTasksPage(1)
  }, [tasksSearch, tasksStatus, tasksSort])

  useEffect(() => {
    setAllPage(1)
  }, [allSearch, allStatus, allSort])

  useEffect(() => {
    if (tasksPage > totalMyTaskPages) setTasksPage(totalMyTaskPages)
  }, [tasksPage, totalMyTaskPages])

  useEffect(() => {
    if (allPage > totalAllLoanPages) setAllPage(totalAllLoanPages)
  }, [allPage, totalAllLoanPages])

  useEffect(() => {
    if (hodPage > totalHodPages) setHodPage(totalHodPages)
  }, [hodPage, totalHodPages])

  useEffect(() => {
    if (loanOfficePage > totalLoanOfficePages) setLoanOfficePage(totalLoanOfficePages)
  }, [loanOfficePage, totalLoanOfficePages])

  useEffect(() => {
    if (loanOfficePage > totalLoanOfficeStagePages) setLoanOfficePage(totalLoanOfficeStagePages)
  }, [loanOfficePage, totalLoanOfficeStagePages])

  useEffect(() => {
    if (loanOfficeTypeTab !== "all" && !loanOfficeTypeOptions.find((opt) => opt.loanKey === loanOfficeTypeTab)) {
      setLoanOfficeTypeTab("all")
    }
  }, [loanOfficeTypeTab, loanOfficeTypeOptions])

  useEffect(() => {
    if (accountsPage > totalAccountsPages) setAccountsPage(totalAccountsPages)
  }, [accountsPage, totalAccountsPages])

  useEffect(() => {
    if (committeePage > totalCommitteePages) setCommitteePage(totalCommitteePages)
  }, [committeePage, totalCommitteePages])

  useEffect(() => {
    if (hrPage > totalHrPages) setHrPage(totalHrPages)
  }, [hrPage, totalHrPages])

  useEffect(() => {
    if (directorPage > totalDirectorPages) setDirectorPage(totalDirectorPages)
  }, [directorPage, totalDirectorPages])

  const loadData = async (options?: { silent?: boolean }) => {
    const playQueueAlert = () => {
      try {
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContext()
        }
        const audioContext = audioContextRef.current
        const now = audioContext.currentTime
        const oscillator = audioContext.createOscillator()
        const gain = audioContext.createGain()

        oscillator.type = "sine"
        oscillator.frequency.setValueAtTime(880, now)
        oscillator.frequency.exponentialRampToValueAtTime(1240, now + 0.18)
        gain.gain.setValueAtTime(0.0001, now)
        gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26)

        oscillator.connect(gain)
        gain.connect(audioContext.destination)
        oscillator.start(now)
        oscillator.stop(now + 0.28)
      } catch {
        // Ignore sound errors when browser blocks autoplay until user interaction.
      }
    }

    const shouldShowLoader = !options?.silent
    if (shouldShowLoader) setLoading(true)
    try {
      const res = await fetch("/api/loan/workflow", { cache: "no-store" })
      const result = await res.json()
      
      // Check if result is an error object (has only error/code/message) rather than valid WorkflowResponse
      if (!res.ok || (result && typeof result === "object" && result.error && !result.inbox)) {
        throw new Error(result?.error || "Failed to load loan workflow")
      }

      const currentHodCount = Number(result?.inbox?.hod?.length || 0)
      const shouldQueueAlert = Boolean(result?.permissions?.hod || result?.permissions?.viewAllTabs)
      if (
        shouldQueueAlert &&
        previousHodQueueCountRef.current !== null &&
        currentHodCount > Number(previousHodQueueCountRef.current)
      ) {
        playQueueAlert()
        toast({
          title: "New Loan Request Alert",
          description: "A new request has entered your HOD review queue.",
        })
      }
      previousHodQueueCountRef.current = currentHodCount

      setData(result)
      setWarning(result.degraded ? result.warning || "Loan module is in degraded mode." : null)

      // Don't auto-set loan type - let user select with placeholder hint
    } catch (e: any) {
      toast({ title: "Loan Module Error", description: e?.message || "Failed to load", variant: "destructive" })
      setData(null) // Ensure data is cleared on error
    } finally {
      if (shouldShowLoader) setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  useEffect(() => {
    const shouldRefreshInBackground = Boolean(
      p?.hod || p?.loanOffice || p?.accounts || p?.committee || p?.hrOffice || p?.directorHr || p?.viewAllTabs,
    )
    if (!shouldRefreshInBackground) return

    const timer = window.setInterval(() => {
      void loadData({ silent: true })
    }, 15000)

    return () => window.clearInterval(timer)
  }, [p?.hod, p?.loanOffice, p?.accounts, p?.committee, p?.hrOffice, p?.directorHr, p?.viewAllTabs])

  const resetForm = () => {
    setEditingId(null)
    setReason("")
    setSupportingDocumentUrl(null)
    setSupportingDocumentName("")
    setSalaryAdvanceMonths(null)
    setRepaymentMonths(12)
    setLoanTypeKey("") // Clear to show placeholder hint
  }

  const restoreLoan = async (loanId: string) => {
    try {
      setRestoringLoanId(loanId)
      const response = await fetch("/api/loan/restore", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loanId,
          newStatus: "partially_recovered",
        }),
      })

      const json = await response.json()

      if (!response.ok) {
        toast({
          title: "Error",
          description: json.error || "Failed to restore loan",
          variant: "destructive",
        })
        return
      }

      toast({
        title: "Loan Restored",
        description: "The archived loan has been restored to mainstream tracking.",
      })

      // Refetch data to update the UI
      loadData({ silent: true })
    } catch (error) {
      console.error("Error restoring loan:", error)
      toast({
        title: "Error",
        description: "Failed to restore loan",
        variant: "destructive",
      })
    } finally {
      setRestoringLoanId(null)
    }
  }

  const toggleLoanSelection = (loanId: string) => {
    const newSelected = new Set(selectedArchivedLoans)
    if (newSelected.has(loanId)) {
      newSelected.delete(loanId)
    } else {
      newSelected.add(loanId)
    }
    setSelectedArchivedLoans(newSelected)
  }

  const toggleSelectAllArchived = () => {
    const archivedLoans = filteredArchivedLoans.map(l => l.id)
    if (selectedArchivedLoans.size === filteredArchivedLoans.length) {
      setSelectedArchivedLoans(new Set())
    } else {
      setSelectedArchivedLoans(new Set(archivedLoans))
    }
  }

  const restoreSelectedLoans = async () => {
    if (selectedArchivedLoans.size === 0) {
      toast({
        title: "No Loans Selected",
        description: "Please select loans to restore.",
      })
      return
    }

    console.log("[v0] Restoring selected loans:", {
      selectedCount: selectedArchivedLoans.size,
      selectedIds: Array.from(selectedArchivedLoans),
      availableLoans: filteredArchivedLoans.map(l => ({ id: l.id, status: l.status }))
    })

    try {
      setIsRestoringAll(true)
      let successCount = 0
      let failureCount = 0

      for (const loanId of selectedArchivedLoans) {
        try {
          const response = await fetch("/api/loan/restore", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              loanId,
              newStatus: "partially_recovered",
            }),
          })

          const json = await response.json()

          if (response.ok) {
            successCount++
          } else {
            console.error(`Failed to restore loan ${loanId}:`, json)
            failureCount++
          }
        } catch (error) {
          console.error(`Error restoring loan ${loanId}:`, error)
          failureCount++
        }
      }

      if (successCount > 0) {
        toast({
          title: "Loans Restored",
          description: `${successCount} archived loan${successCount !== 1 ? "s" : ""} restored successfully${failureCount > 0 ? `. ${failureCount} failed.` : "."}`,
        })
        setSelectedArchivedLoans(new Set())
      }

      if (failureCount > 0 && successCount === 0) {
        toast({
          title: "Error",
          description: "Failed to restore selected loans. Please try again.",
          variant: "destructive",
        })
      }

      loadData({ silent: true })
    } catch (error) {
      console.error("Error restoring selected loans:", error)
      toast({
        title: "Error",
        description: "Failed to restore loans",
        variant: "destructive",
      })
    } finally {
      setIsRestoringAll(false)
    }
  }

  const restoreAllLoans = async () => {
    try {
      const archivedLoans = (data?.inbox?.allLoans || []).filter((l: any) => l.status === "archived")
      
      console.log("[v0] Restoring all loans:", {
        archivedCount: archivedLoans.length,
        archivedIds: archivedLoans.map(l => ({ id: l.id, status: l.status }))
      })
      
      if (archivedLoans.length === 0) {
        toast({
          title: "No Archived Loans",
          description: "There are no archived loans to restore.",
        })
        return
      }

      setIsRestoringAll(true)
      let successCount = 0
      let failureCount = 0

      // Restore all archived loans
      for (const loan of archivedLoans) {
        try {
          const response = await fetch("/api/loan/restore", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              loanId: loan.id,
              newStatus: "partially_recovered",
            }),
          })

          const json = await response.json()

          if (response.ok) {
            successCount++
          } else {
            console.error(`Failed to restore loan ${loan.id}:`, json)
            failureCount++
          }
        } catch (error) {
          console.error(`Error restoring loan ${loan.id}:`, error)
          failureCount++
        }
      }

      // Show summary toast
      if (successCount > 0) {
        toast({
          title: "Loans Restored",
          description: `${successCount} archived loan${successCount !== 1 ? "s" : ""} restored successfully${failureCount > 0 ? `. ${failureCount} failed.` : "."}`,
        })
      }

      if (failureCount > 0 && successCount === 0) {
        toast({
          title: "Error",
          description: "Failed to restore archived loans. Please try again.",
          variant: "destructive",
        })
      }

      // Refetch data to update the UI
      loadData({ silent: true })
    } catch (error) {
      console.error("Error restoring all loans:", error)
      toast({
        title: "Error",
        description: "Failed to restore archived loans",
        variant: "destructive",
      })
    } finally {
      setIsRestoringAll(false)
    }
  }

  useEffect(() => {
    if (!selectedLoanType) return
    const found = (lookupData?.loanTypes || []).find((t) => t.loan_key === selectedLoanType)
    setSetupLoanLabel(found?.loan_label || "")
    setSetupIsActive(found?.is_active ?? true)
  }, [selectedLoanType, lookupData?.loanTypes])

  useEffect(() => {
    // Don't auto-select loan type - let user choose with placeholder hint
  }, [loanTypeKey, filteredLoanTypes])

  useEffect(() => {
    setSelectedHodsForLink([])
  }, [selectedStaffForLink])

  useEffect(() => {
    setSelectedStaffsForBatchLink([])
  }, [staffLocationFilter, staffDepartmentFilter, staffSearchFilter])

  const loadLookups = async () => {
    setLookupLoading(true)
    try {
      const res = await fetch("/api/loan/lookups?limit=20000", { cache: "no-store" })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || "Failed to load lookup data")
      setLookupData(result)
    } catch (e: any) {
      toast({ title: "Lookup error", description: e?.message || "Failed to load lookup data", variant: "destructive" })
    } finally {
      setLookupLoading(false)
    }
  }

  const loadRegistry = async () => {
    setRegistryLoading(true)
    try {
      const res = await fetch("/api/workflow/registry?domains=loan,leave", { cache: "no-store" })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || "Failed to load workflow registry")
      setRegistryData(result)

      const directorSignature = (result.signatures || []).find(
        (signature: RegistrySignature) => signature.workflow_domain === "loan" && signature.approval_stage === "director_hr",
      )
      if (directorSignature) {
        setSignatureMode(directorSignature.signature_mode)
        setSignatureText(directorSignature.signature_text || "")
        setSignatureDataUrl(directorSignature.signature_data_url || null)
        setIsSignatureMissing(false)
      } else {
        setIsSignatureMissing(true)
      }
    } catch (e: any) {
      toast({ title: "Registry error", description: e?.message || "Failed to load workflow registry", variant: "destructive" })
    } finally {
      setRegistryLoading(false)
    }
  }

  useEffect(() => {
    if (p?.hrOffice || p?.loanOffice || p?.viewAllTabs || p?.hod) {
      void loadLookups()
    }
  }, [p?.hrOffice, p?.loanOffice, p?.viewAllTabs, p?.hod])

  useEffect(() => {
    if (p?.directorHr || p?.hrOffice || p?.viewAllTabs || isAdmin) {
      void loadRegistry()
    }
  }, [p?.directorHr, p?.hrOffice, p?.viewAllTabs, isAdmin])

  useEffect(() => {
    if (!activeTemplate) return
    setSelectedTemplateKey(activeTemplate.template_key)
    setTemplateTitle(activeTemplate.title || "")
    setTemplateSubject(activeTemplate.subject || "")
    setTemplateBody(activeTemplate.body || "")
  }, [activeTemplate])

  // Fetch leave payment memos for Accounts users
  useEffect(() => {
    if (p?.accounts) {
      const fetchLeavePaymentMemos = async () => {
        setLoadingLeavePaymentMemos(true)
        try {
          const res = await fetch("/api/leave/payment-advice/for-accounts", { cache: "no-store" })
          if (res.ok) {
            const result = await res.json()
            setLeavePaymentMemos(result.memos || [])
          } else {
            console.error("[v0] Failed to fetch leave payment memos")
          }
        } catch (err) {
          console.error("[v0] Error fetching leave payment memos:", err)
        } finally {
          setLoadingLeavePaymentMemos(false)
        }
      }
      void fetchLeavePaymentMemos()
    }
  }, [p?.accounts])

  const submitRequest = async () => {
    if (!loanTypeKey) {
      toast({ title: "Missing loan type", description: "Please choose a loan type." })
      return
    }

    const trimmedReason = reason.trim()
    if (trimmedReason.length > 0) {
      const reasonValidation = validateMeaningfulText(trimmedReason, {
        fieldLabel: "Loan request reason",
        minLength: 10,
      })
      if (!reasonValidation.ok) {
        toast({ title: "Reason needs detail", description: reasonValidation.error, variant: "destructive" })
        return
      }
    }

    if (needsAttachment && !supportingDocumentUrl) {
      toast({
        title: "Attachment required",
        description: "Funeral and insurance loans require proof attachment.",
        variant: "destructive",
      })
      return
    }

    if (isSalaryAdvanceRequest && !salaryAdvanceMonths) {
      toast({
        title: "Select repayment months",
        description: "Salary advance requests require a 1-3 month recovery period.",
        variant: "destructive",
      })
      return
    }

    const payload = {
      id: editingId,
      loan_type_key: loanTypeKey,
      requested_amount: selectedType?.fixed_amount || 0,
      reason: trimmedReason,
      supporting_document_url: supportingDocumentUrl,
      recovery_months: salaryAdvanceMonths,
      repayment_duration_months: isSalaryAdvanceRequest ? salaryAdvanceMonths : repaymentMonths,
    }

    const res = await fetch("/api/loan/request", {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    const result = await res.json()
    if (!res.ok) {
      toast({ title: "Could not save request", description: result.error || "Try again", variant: "destructive" })
      return
    }

    toast({ title: editingId ? "Request updated" : "Request submitted", description: "Loan request saved successfully." })
    resetForm()
    await loadData()
  }

  const uploadSupportingDocument = async (file: File) => {
    try {
      setUploadingDocument(true)
      const fd = new FormData()
      fd.append("file", file)
      fd.append("folder", "loan-documents")
      const res = await fetch("/api/upload", { method: "POST", body: fd })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || "Upload failed")
      setSupportingDocumentUrl(result.url)
      setSupportingDocumentName(file.name)
      toast({ title: "Attachment uploaded", description: "Document uploaded successfully." })
    } catch (err: any) {
      const message = String(err?.message || "Try again")
      if (message.includes("BLOB_NOT_CONFIGURED") || message.toLowerCase().includes("storage is not configured")) {
        toast({
          title: "Uploads not configured",
          description: "Set BLOB_READ_WRITE_TOKEN in environment variables to enable attachment uploads.",
          variant: "destructive",
        })
      } else {
        toast({ title: "Upload failed", description: message, variant: "destructive" })
      }
    } finally {
      setUploadingDocument(false)
    }
  }

  const convertMonthToDate = (monthStr: string): string | null => {
    if (!monthStr) return null
    // Convert "YYYY-MM" to "YYYY-MM-01" (first day of month)
    return monthStr.includes("-") ? `${monthStr}-01` : null
  }

  const runAction = async (payload: any) => {
    const res = await fetch("/api/loan/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    const result = await res.json()
    if (!res.ok) {
      toast({ title: "Action failed", description: result.error || "Try again", variant: "destructive" })
      return
    }
    toast({ title: result.alreadyForwarded ? "Already forwarded" : "Action completed", description: result.message || "Workflow updated successfully." })
    await loadData()
  }

  const saveMemoChanges = async () => {
    if (!memoReviewModal.row) return
    setIsSavingMemo(true)
    try {
      const res = await fetch("/api/loan/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_memo_draft",
          id: memoReviewModal.row.id,
          director_letter: modalMemoText,
          note: "HR saved memo changes for review",
        }),
      })
      const result = await res.json()
      if (!res.ok) {
        toast({ title: "Failed to save", description: result.error || "Could not save memo changes", variant: "destructive" })
        return
      }
      toast({ title: "Saved successfully", description: "Memo changes have been saved. Staff will see the updated version." })
      await loadData()
    } catch (error) {
      toast({ title: "Save error", description: error instanceof Error ? error.message : "Failed to save changes", variant: "destructive" })
    } finally {
      setIsSavingMemo(false)
    }
  }

  const loadSignatureFromFile = async (file: File) => {
    const reader = new FileReader()
    const dataUrl = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(String(reader.result || ""))
      reader.onerror = () => reject(new Error("Failed to read signature file"))
      reader.readAsDataURL(file)
    })
    setSignatureMode("upload")
    setSignatureDataUrl(dataUrl)
    setSignatureText("")
    toast({ title: "Signature loaded", description: "Uploaded signature is ready for Director approval." })
  }

  const clearSignatureSelection = () => {
    setSignatureDataUrl(null)
    setSignatureText("")
    setSignatureMode("typed")
  }

  const preventCopy = (e: React.SyntheticEvent) => {
    e.preventDefault()
  }

  const deleteAllLoanRequests = async () => {
    if (!isAdmin) {
      toast({ title: "Forbidden", description: "Only admin can delete all loan requests.", variant: "destructive" })
      return
    }
    if (!window.confirm("Delete ALL loan requests and timelines? This cannot be undone.")) return

    const res = await fetch("/api/loan/request", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    })
    const result = await res.json()
    if (!res.ok) {
      toast({ title: "Delete failed", description: result.error || "Could not clear loan requests", variant: "destructive" })
      return
    }

    toast({ title: "Cleared", description: "All loan requests have been deleted by admin." })
    await loadData()
  }

  const runLookupAction = async (payload: any, successMessage: string) => {
    const res = await fetch("/api/loan/lookups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    const result = await res.json()
    if (!res.ok) {
      toast({ title: "Lookup update failed", description: result.error || "Try again", variant: "destructive" })
      return
    }
    toast({ title: "Updated", description: successMessage })
    await Promise.all([loadData(), loadLookups()])
  }

  const requestLinkageApproval = async () => {
    if (!selectedStaffForLink || selectedHodsForLink.length === 0) {
      toast({ title: "Select staff and HOD", description: "Choose at least one staff and one HOD before requesting linkage." })
      return
    }

    const requests = selectedHodsForLink.map((hodId) =>
      fetch("/api/loan/lookups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "request_hod_linkage",
          staff_user_id: selectedStaffForLink,
          requested_hod_user_id: hodId,
          note: linkageRequestNote.trim() || null,
        }),
      }),
    )

    const responses = await Promise.all(requests)
    const failed = responses.filter((response) => !response.ok)
    if (failed.length > 0) {
      toast({ title: "Request failed", description: "Some linkage requests could not be sent. Please try again.", variant: "destructive" })
      return
    }

    toast({ title: "Request submitted", description: "Admin has been notified to approve the requested staff-to-HOD linkage." })
    setLinkageRequestNote("")
    await loadLookups()
  }

  const resolveLinkageRequest = async (requestId: string, decision: "approve" | "reject") => {
    const note = linkageResolutionNotes[requestId]?.trim() || null
    const res = await fetch("/api/loan/lookups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "resolve_hod_linkage_request",
        request_id: requestId,
        decision,
        note,
      }),
    })
    const result = await res.json()
    if (!res.ok) {
      toast({ title: "Linkage approval failed", description: result.error || "Could not resolve linkage request.", variant: "destructive" })
      return
    }

    toast({ title: `Request ${decision === "approve" ? "approved" : "rejected"}`, description: result.message || "Linkage request updated successfully." })
    setLinkageResolutionNotes((prev) => ({ ...prev, [requestId]: "" }))
    await loadLookups()
  }

  const saveSignatureRegistry = async () => {
    if (!signatureText.trim() && !signatureDataUrl) {
      toast({ title: "Signature required", description: "Enter, draw, or upload a signature before saving.", variant: "destructive" })
      return
    }

    const res = await fetch("/api/workflow/registry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "upsert_signature",
        workflow_domain: "loan",
        approval_stage: "director_hr",
        signature_mode: signatureMode,
        signature_text: signatureMode === "typed" ? signatureText.trim() : null,
        signature_data_url: signatureMode !== "typed" ? signatureDataUrl : null,
      }),
    })
    const result = await res.json()
    if (!res.ok) {
      toast({ title: "Signature save failed", description: result.error || "Try again", variant: "destructive" })
      return
    }

    toast({ title: "Signature saved", description: "Executive HR signature registry updated." })
    setSignatureText("")
    setSignatureDataUrl(null)
    setIsEditingSignature(false)
    await loadRegistry()
  }

  const saveTemplateRegistry = async () => {
    const title = templateTitle.trim()
    const body = templateBody.trim()
    if (!title || !selectedTemplateKey || !body) {
      toast({ title: "Template incomplete", description: "Title, template key, and body are required.", variant: "destructive" })
      return
    }

    const res = await fetch("/api/workflow/registry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "upsert_template",
        workflow_domain: selectedTemplateDomain,
        template_key: selectedTemplateKey,
        title,
        subject: templateSubject.trim(),
        body,
      }),
    })
    const result = await res.json()
    if (!res.ok) {
      toast({ title: "Template save failed", description: result.error || "Try again", variant: "destructive" })
      return
    }

    toast({ title: "Template saved", description: "Workflow communication template updated." })
    await loadRegistry()
  }

  const toggleHodSelection = (hodId: string) => {
    setSelectedHodsForLink((prev) =>
      prev.includes(hodId) ? prev.filter((id) => id !== hodId) : [...prev, hodId],
    )
  }

  const toggleStaffBatchSelection = (staffId: string) => {
    setSelectedStaffsForBatchLink((prev) =>
      prev.includes(staffId) ? prev.filter((id) => id !== staffId) : [...prev, staffId],
    )
  }

  const filteredStaffCandidates = useMemo(() => {
    let rows = [...(lookupData?.staff || [])]
    if (staffLocationFilter !== "all") rows = rows.filter((s) => (s.assigned_location_id || "") === staffLocationFilter)
    if (staffDepartmentFilter !== "all") rows = rows.filter((s) => (s.department_id || "") === staffDepartmentFilter)
    if (staffSearchFilter.trim()) {
      const q = staffSearchFilter.trim().toLowerCase()
      rows = rows.filter((s) =>
        `${s.first_name || ""} ${s.last_name || ""} ${s.employee_id || ""} ${s.position || ""}`.toLowerCase().includes(q),
      )
    }
    return rows
  }, [lookupData?.staff, staffLocationFilter, staffDepartmentFilter, staffSearchFilter])

  const staffDepartmentOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const staff of lookupData?.staff || []) {
      const id = staff.department_id || ""
      if (!id) continue
      const label = staff?.departments?.name || staff?.departments?.code || id
      map.set(id, label)
    }
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }))
  }, [lookupData?.staff])

  const staffLocationOptions = useMemo(() => {
    const map = new Map<string, string>()

    for (const loc of lookupData?.locations || []) {
      if (!loc?.id) continue
      map.set(String(loc.id), loc.name || String(loc.id))
    }

    for (const staff of lookupData?.staff || []) {
      const locId = String(staff.assigned_location_id || "")
      if (!locId) continue
      if (!map.has(locId)) {
        const label = staff?.geofence_locations?.name || "Unlabeled Location"
        map.set(locId, label)
      }
    }

    return Array.from(map.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [lookupData?.locations, lookupData?.staff])

  const LINKAGE_PAGE_SIZE = 12

  const filteredLinkageRows = useMemo(() => {
    const q = linkageSearch.trim().toLowerCase()
    return (lookupData?.linkages || []).filter((link) => {
      const staff = (lookupData?.staff || []).find((row) => row.id === link.staff_user_id)
      const hod = (lookupData?.hods || []).find((row) => row.id === link.hod_user_id)

      // Text search
      if (q) {
        const searchText = [
          staff?.first_name,
          staff?.last_name,
          staff?.employee_id,
          staff?.position,
          staff?.geofence_locations?.name,
          staff?.geofence_locations?.districts?.name,
          hod?.first_name,
          hod?.last_name,
          hod?.position,
        ].filter(Boolean).join(" ").toLowerCase()
        if (!searchText.includes(q)) return false
      }

      // Location filter
      if (linkageLocationFilter !== "all") {
        if ((staff?.geofence_locations?.name || "") !== linkageLocationFilter) return false
      }

      // Department filter
      if (linkageDepartmentFilter !== "all") {
        if ((staff?.departments?.name || "") !== linkageDepartmentFilter) return false
      }

      // Rank filter
      if (linkageRankFilter !== "all") {
        if ((staff?.position || "").toLowerCase() !== linkageRankFilter.toLowerCase()) return false
      }

      return true
    })
  }, [lookupData?.linkages, lookupData?.staff, lookupData?.hods, linkageSearch, linkageLocationFilter, linkageDepartmentFilter, linkageRankFilter])

  const linkageTotalPages = Math.max(1, Math.ceil(filteredLinkageRows.length / LINKAGE_PAGE_SIZE))
  const paginatedLinkageRows = filteredLinkageRows.slice((linkagePage - 1) * LINKAGE_PAGE_SIZE, linkagePage * LINKAGE_PAGE_SIZE)

  // Unique filter options derived from data
  const linkageLocationOptions = useMemo(() => {
    const names = new Set<string>()
    ;(lookupData?.staff || []).forEach((s) => {
      const n = s?.geofence_locations?.name
      if (n) names.add(n)
    })
    return Array.from(names).sort()
  }, [lookupData?.staff])

  const linkageDeptOptions = useMemo(() => {
    const names = new Set<string>()
    ;(lookupData?.staff || []).forEach((s: any) => {
      const n = s?.departments?.name
      if (n) names.add(n)
    })
    return Array.from(names).sort()
  }, [lookupData?.staff])

  const linkageRankOptions = useMemo(() => {
    const positions = new Set<string>()
    ;(lookupData?.staff || []).forEach((s) => {
      const p = s?.position
      if (p) positions.add(p)
    })
    return Array.from(positions).sort()
  }, [lookupData?.staff])

  const filteredLinkageRequests = useMemo(() => {
    let rows = [...(lookupData?.linkageRequests || [])]
    if (linkageRequestStatusFilter !== "all") {
      rows = rows.filter((row) => row.request_status === linkageRequestStatusFilter)
    }
    return rows
  }, [lookupData?.linkageRequests, linkageRequestStatusFilter])

  const hodMemoCopyRows = useMemo(() => {
    const currentUserId = data?.profile?.id || ""
    if (!currentUserId) return []

    return (data?.myTasks || []).filter((row) => {
      const approvedByCurrentReviewer = String(row.hod_reviewer_id || "") === currentUserId
      const hasMemoCopy = ["rejected_fd", "director_rejected"].includes(String(row.status || ""))
      return approvedByCurrentReviewer && hasMemoCopy
    })
  }, [data?.myTasks, data?.profile?.id])

  const openSecureMemo = async (loanId: string) => {
    const res = await fetch("/api/loan/memo-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: loanId }),
    })
    const result = await res.json()
    if (!res.ok) {
      toast({ title: "Memo unavailable", description: result.error || "Failed to generate secure memo link", variant: "destructive" })
      return
    }
    window.open(result.path, "_blank", "noopener,noreferrer")
  }

  const openActionModal = (row: LoanRequest, actionType: ActionType) => {
        setModalNote("")
        setModalDecision("approve")
        setModalFdScore("")
        setModalFdNote("")
        setModalFdProof(null)
        setModalDisbursement("")
        setModalRecovery("")
        setModalMonths("")
        setModalHodName("")
        setModalHodRank("")
        setModalHodLocation("")
        setModalHodTelephone("")
        setModalMemoRef("")
        setModalCcRecipients("")
        setModalAccountSignatory("")
        setModalHrSignatory("")
        setModalMemoText("")
        setModalStaffFullName("")
        setModalStaffNumber("")
        setModalStaffRank("")
        setModalCorporateEmail("")
        setModalReferenceNumber("")
        setModalHodReviewerId("")
        setModalDirectorApproverId("")
        setModalSignatureText("")
        setModalSignatureDataUrl(null)
        setModalSignatureMode("typed")
        if (actionType === "loan_office") {
          const parsedLoanOfficeNote = splitHrNoteAndThroTelephone(loanOfficeNotes[row.id] || row.loan_office_note || "")
          setModalNote(loanOfficeNotes[row.id] || "")
          setModalStaffFullName(row.staff_full_name || "")
          setModalStaffNumber(row.staff_number || "")
          setModalStaffRank(row.staff_rank || "")
          setModalCorporateEmail(row.corporate_email || "")
          setModalReferenceNumber(formatReferenceNumber(row.reference_number, row.request_number))
          setModalHodName(parsedLoanOfficeNote.throName || data?.profile.currentHodProfile?.name || row.hod_name || "")
          setModalHodRank(parsedLoanOfficeNote.throRank || data?.profile.currentHodProfile?.rank || row.hod_rank || "")
          setModalHodLocation(parsedLoanOfficeNote.throLocation || data?.profile.currentHodProfile?.location || row.hod_location || row.staff_location_name || "")
          setModalHodTelephone(parsedLoanOfficeNote.throTelephone || "")
          setModalHodReviewerId(row.hod_reviewer_id || "")
          setModalDirectorApproverId(row.director_hr_id || "")
          setModalNote(parsedLoanOfficeNote.cleanedNote)
          setModalMemoCC(row.memo_cc || "Managing Director\nDeputy Managing Director\nDeputy Director Finance\nDeputy Director Human Resource\nAudit Manager\nRegistry Unit\nRecords Unit")
        }
        if (actionType === "accounts") {
          const fd = fdInputs[row.id]
          setModalFdScore(fd?.score || "")
          setModalFdNote(fd?.note || "")
        }
        if (actionType === "hr_terms") {
          const entry = hrInputs[row.id]
          const configuredLoanType = (lookupData?.loanTypes || []).find((loanType) => loanType.loan_key === row.loan_type_key)
          const fallbackMonths = configuredLoanType?.default_recovery_months ? String(configuredLoanType.default_recovery_months) : ""
          const fallbackTerms = String(configuredLoanType?.loan_terms || "").trim()
          const parsedHrNote = splitHrNoteAndThroTelephone(entry?.note || row.hr_note || fallbackTerms || "")
          setModalDisbursement(entry?.disbursement || "")
          setModalRecovery(entry?.recovery || "")
          setModalMonths(entry?.months || (row.recovery_months ? String(row.recovery_months) : fallbackMonths))
          setModalNote(parsedHrNote.cleanedNote)
          setModalHodName(entry?.hodName || parsedHrNote.throName || data?.profile.currentHodProfile?.name || row.hod_name || "")
          setModalHodRank(entry?.hodRank || parsedHrNote.throRank || data?.profile.currentHodProfile?.rank || row.hod_rank || "")
          setModalHodLocation(entry?.hodLocation || parsedHrNote.throLocation || data?.profile.currentHodProfile?.location || row.hod_location || row.staff_location_name || "")
          setModalHodTelephone(entry?.hodTelephone || parsedHrNote.throTelephone || "")
          setModalMemoRecipient(entry?.memoRecipient || parsedHrNote.memoRecipient || "Deputy Director Finance")
          setModalMemoRef(entry?.memoRef || formatReferenceNumber(row.reference_number, row.request_number))
          setModalMemoCC(row.memo_cc || "Managing Director\nDeputy Managing Director\nDeputy Director Finance\nDeputy Director Human Resource\nAudit Manager\nRegistry Unit\nRecords Unit")
          setModalDirectorApproverId(row.director_hr_id || "")
        }
        if (actionType === "director") {
          const entry = hrInputs[row.id]
          const draft = buildDirectorAutoMemoDraft(row, entry, data?.profile.currentHodProfile)
          setModalMemoText(draft)
          setModalSignatureText(signatureText)
          setModalSignatureDataUrl(signatureDataUrl)
          setModalSignatureMode(signatureMode)
          setModalDecision(directorDecision)
          setMemoReviewModal({ open: true, row })
          return
        }
        if (actionType === "payment_completed") {
          setModalNote(`Mark ${row.staff_full_name} loan (${row.request_number}) as payment completed.`)
        }
        setActionModal({ open: true, row, actionType })
      }

  const editLinkageFromCard = (staffUserId: string, hodUserId: string) => {
    setStaffLocationFilter("all")
    setStaffDepartmentFilter("all")
    setStaffSearchFilter("")
    setSelectedStaffForLink(staffUserId)
    setSelectedHodsForLink([hodUserId])
    toast({ title: "Linkage loaded", description: "You can now edit this linkage in the Single Staff HOD Linkage form." })
  }

      const generateMemoPdf = async (row: LoanRequest, memoText: string, sigText: string) => {
        const { jsPDF } = await import("jspdf")
        const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
        const pageWidth = doc.internal.pageSize.getWidth()
        const pageHeight = doc.internal.pageSize.getHeight()
        const watermarkText = "QCC-LOANLEAVE-APP"
        const marginLeft = 28
        const marginRight = 25
        const topMargin = 18
        const usableWidth = pageWidth - marginLeft - marginRight
        const logoDataUrl = await loadImageAsDataUrl(`${window.location.origin}/images/qcc-logo.png`)

        const applySignatureSideWatermark = () => {
          const targetPage = doc.getNumberOfPages()
          doc.setPage(targetPage)
          doc.setTextColor(200, 200, 200)
          doc.setFont("helvetica", "bold")
          doc.setFontSize(9)
          doc.text(watermarkText, marginLeft + 6, pageHeight - 72, { angle: -15 })
        }

        const addPageFrame = () => {
          doc.setDrawColor(210, 210, 210)
          doc.setLineWidth(0.2)
          doc.rect(12, 12, pageWidth - 24, pageHeight - 24)
        }

        const renderHeader = () => {
          addPageFrame()
          if (logoDataUrl) {
            try {
              doc.addImage(logoDataUrl, "PNG", 28, 27, 14, 14)
            } catch {
              // Keep PDF generation resilient if the logo fails to load.
            }
          }

          doc.setTextColor(53, 111, 23)
          doc.setFont("times", "bold")
          doc.setFontSize(18)
          doc.text("QUALITY CONTROL COMPANY LTD.", pageWidth / 2, 28, { align: "center" })
          doc.text("(COCOBOD)", pageWidth / 2, 37, { align: "center" })

          doc.setFontSize(6.8)
          doc.setFont("times", "italic")
          doc.setTextColor(70, 70, 70)
          doc.text(["P.O Box M14", "Accra Ghana"], pageWidth - 42, 36)
          doc.setFont("times", "normal")
          doc.setFontSize(7)
          doc.text(`Date: ${new Date().toISOString().slice(0, 10)}`, pageWidth - 42, 44)
          doc.setFont("times", "normal")
          doc.setTextColor(0, 0, 0)
        }

        renderHeader()

        const rawLines = memoText.split("\n")
        let y = topMargin + 30
        const lineGap = 4.9

        for (const line of rawLines) {
          const trimmed = line.trim()
          const isBlank = trimmed.length === 0

          if (isBlank) {
            y += 4.2
            continue
          }

          let fontStyle: "normal" | "bold" | "italic" | "bolditalic" = "normal"
          let fontSize = 8.8

          if (
            trimmed.startsWith("RE:") ||
            trimmed.startsWith("THRO'") ||
            trimmed.startsWith("Our Ref No:") ||
            trimmed.startsWith("Your Ref No:") ||
            trimmed === "OHENEBA BOAMAH" ||
            trimmed === "DEPUTY DIRECTOR HUMAN RESOURCE" ||
            trimmed === "FOR: MANAGING DIRECTOR"
          ) {
            fontStyle = "bold"
          }

          if (trimmed.startsWith("cc:")) {
            fontSize = 7.4
          }

          doc.setFont("times", fontStyle)
          doc.setFontSize(fontSize)

          const wrapped = doc.splitTextToSize(line, usableWidth)
          const projectedHeight = wrapped.length * lineGap
          if (y + projectedHeight > pageHeight - 22) {
            doc.addPage()
            renderHeader()
            y = topMargin + 18
          }

          doc.text(wrapped, marginLeft, y)
          y += projectedHeight
        }

        if (sigText && !memoText.includes(sigText)) {
          y += 4
          doc.setFont("times", "bold")
          doc.setFontSize(8.8)
          doc.text(sigText, marginLeft, y)
          y += 4.9
        }

        applySignatureSideWatermark()

        doc.save(`${row.request_number || "memo"}-qcc-loan-memo.pdf`)
      }

      const deleteLoanRequestById = async (id: string) => {
    if (!isAdmin) {
      toast({ title: "Forbidden", description: "Only admin can delete selected loan requests.", variant: "destructive" })
      return
    }
    const res = await fetch("/api/loan/request", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
    const result = await res.json()
    if (!res.ok) {
      toast({ title: "Delete failed", description: result.error || "Could not delete loan request", variant: "destructive" })
      return
    }
    toast({ title: "Deleted", description: "Loan request deleted." })
    setSelectedLoanIds((prev) => prev.filter((x) => x !== id))
    await loadData()
  }

  const toggleSelectedLoanId = (id: string) => {
    setSelectedLoanIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const deleteSelectedLoanRequests = async () => {
    if (!isAdmin) return
    if (selectedLoanIds.length === 0) {
      toast({ title: "No selection", description: "Select at least one loan request to delete." })
      return
    }
    if (!window.confirm(`Delete ${selectedLoanIds.length} selected loan request(s)?`)) return

    for (const id of selectedLoanIds) {
      const res = await fetch("/api/loan/request", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) {
        const result = await res.json().catch(() => ({}))
        toast({ title: "Delete failed", description: result.error || `Could not delete ${id}`, variant: "destructive" })
        return
      }
    }

    toast({ title: "Deleted", description: `${selectedLoanIds.length} loan request(s) deleted.` })
    setSelectedLoanIds([])
    await loadData()
  }

  const beginEdit = (row: LoanRequest) => {
    setEditingId(row.id)
    setLoanTypeKey(row.loan_type_key)
    setReason(row.reason || "")
    setSupportingDocumentUrl(row.supporting_document_url || null)
    setSupportingDocumentName(row.supporting_document_url ? "Uploaded document" : "")
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center p-16">
        <Loader2 className="h-8 w-8 animate-spin text-fuchsia-700" />
        <span className="ml-3 text-muted-foreground">Loading loan module...</span>
      </div>
    )
  }

  // Safety check: ensure data is valid WorkflowResponse structure, not an error object
  if (data && typeof data === "object" && data.error && !data.inbox) {
    return (
      <div className="flex items-center justify-center p-16">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-red-600 mb-2">Module Error</h2>
          <p className="text-sm text-muted-foreground">{(data as any).error || "Failed to load loan module"}</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <GlobalWarningsToasts />
      <div className="px-2">
        <LeaveResumptionBadge />
      </div>
      <div className="space-y-6 p-2 loan-theme">
      <Card className="overflow-hidden border border-violet-100 bg-[radial-gradient(circle_at_top_left,_rgba(168,85,247,0.14),_transparent_30%),linear-gradient(135deg,_#fcfaff_0%,_#f4efff_45%,_#ffffff_100%)] shadow-[0_18px_70px_rgba(15,23,42,0.08)]">
        <CardHeader className="border-b border-violet-100/80 bg-white/80 backdrop-blur">
          <div className="flex flex-col gap-5">
            <div className="flex items-start gap-4">
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-violet-200 bg-white shadow-sm">
                <Image src="/images/qcc-logo.png" alt="QCC logo" width={44} height={44} className="h-11 w-11 object-contain" />
              </div>
              <div className="space-y-2">
                <div className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-700">
                  Staff Welfare Loan Workspace
                </div>
                <CardTitle className="text-3xl font-semibold tracking-tight text-slate-900">QCC Loan Processing Hub</CardTitle>
                <div className="grid grid-cols-1 gap-x-8 gap-y-3 pt-3 text-sm text-slate-700 md:grid-cols-2">
                  <div><strong>Corporate Email:</strong>{" "}
                    {loading ? <span className="inline-block h-4 w-40 animate-pulse rounded bg-slate-200 align-middle" /> : <span className="text-slate-600">{data?.profile.email || <span className="text-slate-400">Not set</span>}</span>}
                  </div>
                  <div><strong>Staff Number:</strong>{" "}
                    {loading ? <span className="inline-block h-4 w-24 animate-pulse rounded bg-slate-200 align-middle" /> : <span className="text-slate-600">{data?.profile.employeeId || <span className="text-slate-400">Not set</span>}</span>}
                  </div>
                  <div><strong>Station / Department:</strong>{" "}
                    {loading ? <span className="inline-block h-4 w-32 animate-pulse rounded bg-slate-200 align-middle" /> : <span className="text-slate-600">{data?.profile.departmentName || <span className="text-slate-400">Not assigned</span>}</span>}
                  </div>
                  <div><strong>Rank / Position:</strong>{" "}
                    {loading ? <span className="inline-block h-4 w-36 animate-pulse rounded bg-slate-200 align-middle" /> : <span className="text-slate-600">{data?.profile.position || <span className="text-slate-400">Not set</span>}</span>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <strong>Category:</strong>{" "}
                    {loading
                      ? <span className="inline-block h-5 w-20 animate-pulse rounded-full bg-slate-200 align-middle" />
                      : data?.profile.staffCategory
                        ? <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            data.profile.staffCategory === "Manager" ? "bg-indigo-100 text-indigo-800" :
                            data.profile.staffCategory === "Senior" ? "bg-blue-100 text-blue-800" :
                            "bg-slate-100 text-slate-700"
                          }`}>{data.profile.staffCategory?.charAt(0).toUpperCase()}{data.profile.staffCategory?.slice(1)}</span>
                        : <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-slate-100 text-slate-700">Junior</span>}
                  </div>
                  <div><strong>Length of Service:</strong>{" "}
                    {loading
                      ? <span className="inline-block h-4 w-20 animate-pulse rounded bg-slate-200 align-middle" />
                      : (() => {
                          const yrs = data?.profile.yearsOfService != null 
                            ? data.profile.yearsOfService
                            : data?.profile.dateOfAppointment
                              ? Math.floor((Date.now() - new Date(data.profile.dateOfAppointment).getTime()) / (365.25 * 24 * 3600 * 1000))
                              : 0
                          console.log("[v0] Loan Admin YoS - yearsOfService:", data?.profile.yearsOfService, "dateOfAppointment:", data?.profile.dateOfAppointment, "calculated yrs:", yrs)
                          return <span className="text-slate-600">{yrs}y{data?.profile.dateOfAppointment && !data?.profile.yearsOfService ? <span className="text-slate-400 text-xs"> (since {fmtDate(data.profile.dateOfAppointment)})</span> : null}</span>
                        })()}
                  </div>
                  <div><strong>Assigned Location:</strong>{" "}
                    {loading ? <span className="inline-block h-4 w-32 animate-pulse rounded bg-slate-200 align-middle" /> : <span className="text-slate-600">{data?.profile.assignedLocationName || <span className="text-slate-400">Not assigned</span>}</span>}
                  </div>
                  <div><strong>Assigned District:</strong>{" "}
                    {loading ? <span className="inline-block h-4 w-24 animate-pulse rounded bg-slate-200 align-middle" /> : <span className="text-slate-600">{data?.profile.assignedDistrictName || <span className="text-slate-400">Not assigned</span>}</span>}
                  </div>
                  <div><strong>Linked HOD:</strong>{" "}
                    {loading
                      ? <span className="inline-block h-4 w-40 animate-pulse rounded bg-slate-200 align-middle" />
                      : data?.profile.currentHodProfile?.name
                        ? <span className="text-slate-600">{data.profile.currentHodProfile.name} <span className="text-slate-400 text-xs">({data.profile.currentHodProfile.rank})</span></span>
                        : <span className="text-slate-400">Not yet assigned</span>}
                  </div>
                  <div className="md:col-span-2"><strong>Location Address:</strong>{" "}
                    {loading ? <span className="inline-block h-4 w-56 animate-pulse rounded bg-slate-200 align-middle" /> : <span className="text-slate-600">{data?.profile.assignedLocationAddress || <span className="text-slate-400">Not set</span>}</span>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          {warning && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{warning}</p>}
        </CardContent>
      </Card>

      <Tabs value={activeTab || defaultTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex h-auto w-full flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white/80 p-2 shadow-sm backdrop-blur">
          {visibleTabs.map((tab) =>
            tab.href ? (
              <a
                key={tab.key}
                href={tab.href}
                className="rounded-xl border border-transparent px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              >
                {tab.label}
              </a>
            ) : (
              <TabsTrigger key={tab.key} value={tab.key} className="rounded-xl border border-transparent px-4 py-2 text-sm font-medium text-slate-600 data-[state=active]:border-emerald-200 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                {tab.label}
              </TabsTrigger>
            )
          )}
        </TabsList>

        <TabsContent value="staff" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{editingId ? "Edit Loan Request" : "New Loan Request"}</CardTitle>
              <CardDescription>Loan amount is fixed by selected loan type and auto-populated in GHc.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Loan Type</Label>
                  <SearchableSelect
                    value={loanTypeKey}
                    onChange={setLoanTypeKey}
                    placeholder="Select loan type"
                    searchPlaceholder="Search loan type..."
                    options={filteredLoanTypes.map((type) => ({
                      value: type.loan_key,
                      label: type.loan_label,
                      keywords: `${type.category || ""} ${type.min_qualification_note || ""}`,
                    }))}
                  />
                  {selectedType && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Fixed amount: GHc {fmtAmount(selectedType.fixed_amount)} | FD check: {selectedType.requires_fd_check ? "Required" : "Not required"} | Committee: {selectedType.requires_committee ? "Required" : "Not required"} | Qualification: {selectedType.min_qualification_note || "By staff grade"}
                    </p>
                  )}
                </div>
                <div>
                  <Label>Requested Amount (GHc)</Label>
                  <Input
                    value={fmtAmount(selectedType?.fixed_amount || 0)}
                    readOnly
                    disabled
                    className="bg-muted text-foreground"
                  />
                </div>
              </div>



              {isSalaryAdvanceRequest && (
                <div className="grid grid-cols-3 gap-3">
                  {[1, 2, 3].map((months) => (
                    <label key={months} className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm hover:border-emerald-300">
                      <input
                        type="checkbox"
                        checked={salaryAdvanceMonths === months}
                        onChange={() => setSalaryAdvanceMonths(salaryAdvanceMonths === months ? null : months)}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>{months} month{months > 1 ? "s" : ""}</span>
                    </label>
                  ))}
                </div>
              )}

              <div>
                <Label>Reason (Optional)</Label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} placeholder="You can add reason if needed" />
              </div>

              <div className="space-y-2">
                <Label>
                  Supporting Attachment {needsAttachment ? "(Required for funeral/insurance)" : "(Optional)"}
                </Label>
                <Input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    void uploadSupportingDocument(file)
                  }}
                />
                {uploadingDocument && <p className="text-xs text-muted-foreground">Uploading...</p>}
                {supportingDocumentUrl && (
                  <p className="text-xs text-muted-foreground">
                    Uploaded: {supportingDocumentName || "Document"} - <a href={supportingDocumentUrl} className="underline" target="_blank" rel="noreferrer">View</a>
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <Button onClick={submitRequest}>
                  Submit Request
                </Button>
                {editingId && <Button variant="outline" onClick={resetForm}>Cancel Edit</Button>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>My Requests</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(data?.myRequests || []).length === 0 && <p className="text-sm text-muted-foreground">No loan requests yet.</p>}
              {(data?.myRequests || []).map((row) => (
                <div key={row.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">{row.request_number} - {row.loan_type_label}</div>
                    <Badge className={statusBadgeClass(row.status, "soft")}>{statusText(row.status)}</Badge>
                  </div>
                  {row.staff_full_name && <div className="text-sm font-semibold text-purple-900">Staff: {row.staff_full_name}</div>}
                  <div className="text-sm text-muted-foreground">Amount: GHc {fmtAmount(row.fixed_amount || row.requested_amount)}</div>
                  <div className="text-xs text-muted-foreground">Current handler: <strong>{stageOwner(row.status)}</strong></div>
                  <div className="flex flex-wrap gap-1">
                    {WORKFLOW_ORDER.map((stage) => {
                      const activeIndex = WORKFLOW_ORDER.indexOf((row.status === "hod_rejected" || row.status === "rejected_fd" || row.status === "committee_rejected" || row.status === "director_rejected") ? "pending_hod" : (row.status as any))
                      const stageIndex = WORKFLOW_ORDER.indexOf(stage)
                      const done = activeIndex >= stageIndex && activeIndex !== -1
                      return (
                        <span
                          key={`${row.id}-${stage}`}
                          className={`rounded-full px-2 py-1 text-[11px] ${done ? "bg-fuchsia-100 text-fuchsia-800" : "bg-slate-100 text-slate-600"}`}
                        >
                          {statusText(stage)}
                        </span>
                      )
                    })}
                  </div>
                  {row.reason && <div className="text-sm">Reason: {row.reason}</div>}
                  {row.fd_score !== null && (
                    <div className="text-sm">FD Score: <strong>{row.fd_score}</strong> {row.fd_good ? "(Good standing)" : "(Below threshold)"}</div>
                  )}
                  {row.disbursement_date && (
                    <div className="text-sm">Disbursement: {row.disbursement_date} | Recovery Start: {row.recovery_start_date} | Months: {row.recovery_months}</div>
                  )}
                  {row.supporting_document_url && (
                    <div className="text-sm">
                      Attachment: <a href={row.supporting_document_url} target="_blank" rel="noreferrer" className="underline">View supporting document</a>
                    </div>
                  )}
                  {row.fd_document_url && (
                    <div className="text-sm">
                      FD Proof Document: <a href={row.fd_document_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-800 underline">View FD document</a>
                    </div>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    {["pending_hod", "hod_rejected"].includes(row.status) && (
                      <Button variant="outline" size="sm" onClick={() => beginEdit(row)}>
                        View / Edit
                      </Button>
                    )}
                    {row.status === "approved_director" && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => openSecureMemo(row.id)}>
                          <FileText className="h-4 w-4 mr-1" /> Secure Memo PDF
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tracking" className="space-y-5">
          {(data?.myRequests || []).length === 0 ? (
            <Card className="border-dashed border-2 border-violet-200 bg-violet-50/30">
              <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
                <div className="text-6xl select-none">📋</div>
                <p className="text-lg font-semibold text-slate-700">No active loan requests</p>
                <p className="text-sm text-slate-500">Your submitted loan requests will appear here with live tracking.</p>
              </CardContent>
            </Card>
          ) : (
            (data?.myRequests || []).map((req) => {
              const timeline = data?.myTimelines.find((x) => x.loan_request_id === req.id)?.entries || []
              const currentStepIdx = WORKFLOW_ORDER.indexOf(req.status as typeof WORKFLOW_ORDER[number])
              const isRejected = ["hod_rejected","rejected_fd","committee_rejected","director_rejected"].includes(req.status)
              const isApproved = req.status === "approved_director"

              const STEP_META: Record<string, { icon: string; label: string; owner: string; desc: string }> = {
                pending_hod:         { icon: "🏢", label: "HOD Review",       owner: "Department Head",    desc: "Awaiting your HOD to review and forward" },
                hod_approved:        { icon: "✅", label: "Loan Office",      owner: "Loan Officer",       desc: "Loan Office is processing your request" },
                sent_to_accounts:    { icon: "🔢", label: "Accounts / FD",    owner: "Accounts Team",      desc: "FD check & financial review in progress" },
                awaiting_committee:  { icon: "👥", label: "Committee",        owner: "Welfare Committee",  desc: "Under committee deliberation" },
                awaiting_hr_terms:   { icon: "📝", label: "HR Terms",         owner: "HR Office",          desc: "HR is setting loan repayment terms" },
                awaiting_director_hr:{ icon: "🎖️", label: "Executive HR",     owner: "Director / Executive","desc": "Final executive approval pending" },
                approved_director:   { icon: "🎉", label: "Approved!",        owner: "Complete",           desc: "Your loan has been fully approved" },
              }

              return (
                <Card key={req.id} className="overflow-hidden border border-violet-100 shadow-md">
                  {/* Header */}
                  <div className={`px-5 py-4 flex flex-wrap items-center justify-between gap-3 ${isApproved ? "bg-emerald-600" : isRejected ? "bg-red-600" : "bg-gradient-to-r from-violet-700 to-purple-600"} text-white`}>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest opacity-80">{req.request_number}</p>
                      <h3 className="text-lg font-bold leading-tight">{req.loan_type_label} - {req.staff_full_name || "REQUESTING STAFF"}</h3>
                      <p className="text-sm opacity-90 mt-0.5">GHc {fmtAmount(req.fixed_amount || req.requested_amount)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <Badge className={`${isApproved ? "bg-white text-emerald-700" : isRejected ? "bg-white text-red-700" : "bg-white/20 text-white border border-white/40"} font-semibold text-xs px-3 py-1`}>
                        {isApproved ? "🎉 Approved" : isRejected ? "����� " + statusText(req.status) : "⏳ " + statusText(req.status)}
                      </Badge>
                      <p className="text-xs opacity-70">Submitted {fmtDate(req.submitted_at || req.created_at)}</p>
                    </div>
                  </div>

                  <CardContent className="pt-6 pb-4 px-5 space-y-6">
                    {/* Visual Workflow Stepper */}
                    {!isRejected && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4">Loan Journey</p>
                        <div className="flex items-start gap-0 overflow-x-auto pb-2">
                          {WORKFLOW_ORDER.map((step, idx) => {
                            const meta = STEP_META[step]
                            const isDone = currentStepIdx > idx || isApproved
                            const isCurrent = currentStepIdx === idx && !isApproved
                            const isFuture = currentStepIdx < idx && !isApproved
                            return (
                              <div key={step} className="flex items-start flex-1 min-w-[80px]">
                                <div className="flex flex-col items-center flex-1">
                                  <div className={`relative flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold transition-all duration-500 ${
                                    isDone ? "bg-emerald-500 shadow-lg shadow-emerald-200" :
                                    isCurrent ? "bg-violet-600 shadow-lg shadow-violet-200 ring-4 ring-violet-200 animate-pulse" :
                                    "bg-slate-200 text-slate-400"
                                  }`}>
                                    {isDone ? "✓" : meta.icon}
                                  </div>
                                  <p className={`mt-2 text-center text-[10px] font-semibold leading-tight max-w-[72px] ${isCurrent ? "text-violet-700" : isDone ? "text-emerald-700" : "text-slate-400"}`}>
                                    {meta.label}
                                  </p>
                                </div>
                                {idx < WORKFLOW_ORDER.length - 1 && (
                                  <div className={`h-0.5 flex-1 mt-5 transition-all duration-700 ${isDone ? "bg-emerald-400" : isCurrent ? "bg-violet-300" : "bg-slate-200"}`} />
                                )}
                              </div>
                            )
                          })}
                        </div>
                        {STEP_META[req.status] && (
                          <div className="mt-3 rounded-xl bg-violet-50 border border-violet-100 px-4 py-3 flex items-center gap-3">
                            <span className="text-2xl">{STEP_META[req.status]?.icon}</span>
                            <div>
                              <p className="text-sm font-semibold text-violet-900">Currently with: {STEP_META[req.status]?.owner}</p>
                              <p className="text-xs text-violet-700">{STEP_META[req.status]?.desc}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Supporting Document */}
                    {req.supporting_document_url && (
                      <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">📎</span>
                          <div>
                            <p className="text-sm font-semibold text-blue-900">Supporting Document</p>
                            <p className="text-xs text-blue-700">View your attached supporting document</p>
                          </div>
                        </div>
                        <a
                          href={req.supporting_document_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
                        >
                          <Download className="h-4 w-4" /> Download
                        </a>
                      </div>
                    )}

                    {/* Download memo for approved loans */}
                    {isApproved && (
                      <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">✅</span>
                          <div>
                            <p className="text-sm font-semibold text-emerald-800">Your loan has been fully approved</p>
                            <p className="text-xs text-emerald-700 mt-0.5">
                              Signed by: <span className="font-semibold">Director</span>
                            </p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shrink-0"
                          onClick={() => void openSecureMemo(req.id)}
                        >
                          <Download className="h-4 w-4" /> Download Signed Memo
                        </Button>
                      </div>
                    )}

                    {isRejected && (
                      <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="text-3xl">❌</span>
                          <div>
                            <p className="text-sm font-semibold text-red-800">Application {statusText(req.status)}</p>
                            <p className="text-xs text-red-600">
                              {req.status === "rejected_fd"
                                ? "Your FD standing did not meet the required threshold."
                                : "Please contact HR for further assistance."}
                            </p>
                          </div>
                        </div>
                        {(req.status === "rejected_fd" || req.status === "director_rejected") && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-300 text-red-700 hover:bg-red-100 gap-1.5 shrink-0"
                            onClick={() => void openSecureMemo(req.id)}
                          >
                            <Download className="h-4 w-4" />
                            Download Rejection Memo
                          </Button>
                        )}
                      </div>
                    )}

                    {/* Timeline Events */}
                    {timeline.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">Activity Log</p>
                        <div className="relative space-y-0 before:absolute before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                          {timeline.map((entry, i) => {
                            const isLatest = i === timeline.length - 1
                            const actionIcon: Record<string, string> = {
                              staff_submit: "📤", staff_edit: "✏️", hod_decision: "🏢",
                              hod_auto_approved: "⚡", loan_office_update_request: "📋",
                              loan_office_forward: "➡️", accounts_fd_update: "🔢",
                              committee_decision: "👥", hr_set_terms: "📝",
                              director_finalize: "🎖️",
                            }
                            return (
                              <div key={entry.id} className="relative flex gap-4 pl-10 pb-4">
                                <div className={`absolute left-2 top-1 flex h-5 w-5 items-center justify-center rounded-full text-xs ring-2 ring-white ${isLatest ? "bg-violet-600 text-white" : "bg-slate-300 text-slate-600"}`}>
                                  {isLatest ? "●" : "���"}
                                </div>
                                <div className={`flex-1 rounded-xl border px-4 py-3 ${isLatest ? "border-violet-200 bg-violet-50/50" : "border-slate-100 bg-white"}`}>
                                  <div className="flex flex-wrap items-center justify-between gap-1">
                                    <span className="font-semibold text-sm text-slate-800">
                                      {actionIcon[entry.action_key] || "📌"} {ACTION_LABELS[entry.action_key] || entry.action_key.replace(/_/g," ")}
                                    </span>
                                    <span className="text-[11px] text-slate-400">{fmtDate(entry.created_at)}</span>
                                  </div>
                                  {entry.to_status && (
                                    <p className="mt-1 text-xs text-slate-500">
                                      Status moved to: <span className="font-semibold text-slate-700">{statusText(entry.to_status)}</span>
                                    </p>
                                  )}
                                  {entry.note && <p className="mt-1 text-xs italic text-slate-600">"{entry.note}"</p>}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {timeline.length === 0 && (
                      <div className="text-center py-4 text-slate-400 text-sm">
                        <span className="text-2xl block mb-1">🕐</span>
                        Timeline events will appear once action is taken on this request.
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })
          )}
        </TabsContent>

        <TabsContent value="hod" className="space-y-3">
          <ReadOnlyHint canAct={Boolean(p?.hod)} roleLabel="HOD" />
          <Card>
            <CardHeader>
              <CardTitle>HOD Review Queue</CardTitle>
              <CardDescription>
                Review staff applications at the first approval stage and route each request onward.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <Button variant={hodViewMode === "table" ? "default" : "outline"} size="sm" onClick={() => setHodViewMode("table")} className="gap-1"><LayoutList className="h-4 w-4" /> Table</Button>
                  <Button variant={hodViewMode === "card" ? "default" : "outline"} size="sm" onClick={() => setHodViewMode("card")} className="gap-1"><LayoutGrid className="h-4 w-4" /> Cards</Button>
                </div>
                <Button variant="outline" size="sm" onClick={() => downloadCsv(filteredHod, "hod-queue-filtered.csv")}>Export Filtered CSV</Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 items-end">
                <Input value={hodSearch} onChange={(e) => setHodSearch(e.target.value)} placeholder="Search requests" />
                <Select value={hodStatus} onValueChange={setHodStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {Object.keys(STATUS_LABELS).map((status) => (
                      <SelectItem key={`hod-${status}`} value={status}>{statusText(status)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={hodSort} onValueChange={(v: "newest" | "oldest") => setHodSort(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest first</SelectItem>
                    <SelectItem value="oldest">Oldest first</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={hodLocation} onValueChange={setHodLocation}>
                  <SelectTrigger><SelectValue placeholder="All locations" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All locations</SelectItem>
                    {allLoanLocations.map((loc) => <SelectItem key={loc} value={loc}>{loc}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={hodDept} onValueChange={setHodDept}>
                  <SelectTrigger><SelectValue placeholder="All departments" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All departments</SelectItem>
                    {allLoanDepts.map((dept) => <SelectItem key={dept} value={dept}>{dept}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="text-xs text-muted-foreground flex items-center md:justify-end">Showing {pagedHod.length} of {filteredHod.length}</div>
              </div>
            </CardContent>
          </Card>
          {filteredHod.length === 0 && (
            <Card>
              <CardContent className="pt-4 text-sm text-muted-foreground">
                No loan requests are currently awaiting HOD review.
              </CardContent>
            </Card>
          )}
          {hodViewMode === "table" && filteredHod.length > 0 && (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-purple-950/10">
                      <TableHead className="whitespace-nowrap">Request No.</TableHead>
                      <TableHead className="whitespace-nowrap">Staff Name</TableHead>
                      <TableHead className="whitespace-nowrap">Staff No.</TableHead>
                      <TableHead className="whitespace-nowrap">Rank</TableHead>
                      <TableHead className="whitespace-nowrap">Loan Type</TableHead>
                      <TableHead className="whitespace-nowrap">Amount (GHc)</TableHead>
                      <TableHead className="whitespace-nowrap">FD Score</TableHead>
                      {canSeeFdReviewerName && <TableHead className="whitespace-nowrap">FD Reviewer</TableHead>}
                      <TableHead className="whitespace-nowrap">Status</TableHead>
                      <TableHead className="whitespace-nowrap">Submitted</TableHead>
                      {p?.hod && <TableHead className="whitespace-nowrap">Action</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedHod.map((row) => (
                      <TableRow key={row.id} className="align-top">
                        <TableCell className="font-mono text-xs whitespace-nowrap">{row.request_number || row.id.slice(0, 8)}</TableCell>
                        <TableCell className="whitespace-nowrap font-medium">{row.staff_full_name || "—"}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{row.staff_number || "—"}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{row.staff_rank || "—"}</TableCell>
                        <TableCell className="text-xs">{row.loan_type_label || row.loan_type_key}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{row.requested_amount != null ? Number(row.requested_amount).toLocaleString("en-GH", { minimumFractionDigits: 2 }) : row.fixed_amount != null ? Number(row.fixed_amount).toLocaleString("en-GH", { minimumFractionDigits: 2 }) : "—"}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{row.fd_score ?? "—"}</TableCell>
                        {canSeeFdReviewerName && <TableCell className="text-xs whitespace-nowrap">{row.accounts_reviewer_name || "—"}</TableCell>}
                        <TableCell><Badge className={statusBadgeClass(row.status, "solid")}>{statusText(row.status)}</Badge></TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{row.submitted_at ? new Date(row.submitted_at).toLocaleDateString("en-GB") : "—"}</TableCell>
                        {p?.hod && (
                          <TableCell>
                            <Button size="sm" className="text-xs whitespace-nowrap" onClick={() => openActionModal(row, "hod")}>Review &amp; Decide</Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {hodViewMode === "card" && pagedHod.map((row) => (
            <StageCard key={row.id} row={row}>
              {p?.hod && <Button size="sm" onClick={() => openActionModal(row, "hod")}>Review &amp; Decide</Button>}
            </StageCard>
          ))}
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setHodPage((n) => Math.max(1, n - 1))} disabled={hodPage <= 1}>Prev</Button>
            <span className="text-xs text-muted-foreground">Page {hodPage} of {totalHodPages}</span>
            <Button variant="outline" size="sm" onClick={() => setHodPage((n) => Math.min(totalHodPages, n + 1))} disabled={hodPage >= totalHodPages}>Next</Button>
          </div>
        </TabsContent>

        <TabsContent value="loan-office" className="space-y-5">
          <ReadOnlyHint canAct={Boolean(p?.loanOffice || p?.hrOffice)} roleLabel="Loan Office / HR Office" />

          {/* ── Compact metric strip ── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Total", value: loanOfficeAnalytics.totals.total_requests, color: "bg-slate-900 text-white" },
              { label: "Active pipeline", value: loanOfficeAnalytics.totals.active_pipeline, color: "bg-violet-700 text-white" },
              { label: "FD good", value: loanOfficeAnalytics.totals.good_fd, color: "bg-emerald-600 text-white" },
              { label: "FD poor", value: loanOfficeAnalytics.totals.poor_fd, color: "bg-rose-600 text-white" },
            ].map((m) => (
              <div key={m.label} className={`flex flex-col gap-0.5 rounded-xl px-4 py-3 ${m.color}`}>
                <span className="text-[11px] font-medium uppercase tracking-widest opacity-75">{m.label}</span>
                <span className="text-2xl font-semibold tabular-nums leading-none">{m.value ?? 0}</span>
              </div>
            ))}
          </div>

          {/* ── Processing Queue ── */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            {/* section header */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
              <div>
                <p className="text-sm font-semibold text-slate-900">Processing Queue</p>
                <p className="text-xs text-slate-500">Review HOD-approved requests, score FD, and forward for approval</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-slate-600 hover:text-slate-900" onClick={() => setLoanOfficeViewMode(loanOfficeViewMode === "table" ? "card" : "table")}>
                  {loanOfficeViewMode === "table" ? <><LayoutGrid className="h-3.5 w-3.5" /> Cards</> : <><LayoutList className="h-3.5 w-3.5" /> Table</>}
                </Button>
                <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-slate-600 hover:text-slate-900" onClick={() => downloadCsv(filteredLoanOfficeStageRows, "loan-office-queue.csv")}>
                  <Download className="h-3.5 w-3.5" /> Export
                </Button>
              </div>
            </div>

            {/* stage pills */}
            <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-5 py-2.5">
              {([ 
                { key: "pending",                    label: "Pending FD" },
                { key: "good-fd",                    label: "Good FD" },
                { key: "poor-fd",                    label: "Poor FD" },
                { key: "good-fd-not-pushed",        label: "Not Pushed" },
                { key: "sent-for-approval",         label: "Sent for Approval" },
                { key: "fd-approved-accounts-exec", label: "✓ FD Approved by Accounts" },
                { key: "archivable",                label: "Archivable" },
                { key: "archived",                  label: "Archived" },
              ] as const).map(({ key, label }) => {
                const count = (loanOfficeStageBuckets as any)[key]?.length ?? 0
                const isActive = loanOfficeStageTab === key
                return (
                  <button
                    key={key}
                    onClick={() => setLoanOfficeStageTab(key)}
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      isActive
                        ? "border-violet-700 bg-violet-700 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:text-violet-700"
                    }`}
                  >
                    {label}
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                      isActive 
                        ? "bg-white/25" 
                        : (["pending", "good-fd", "fd-approved-accounts-exec"].includes(key) && count > 0)
                        ? "bg-red-100 text-red-700"
                        : "bg-slate-100 text-slate-500"
                    }`}>{count}</span>
                  </button>
                )
              })}
            </div>

            {/* search + filters row */}
            <div className="flex flex-wrap items-center gap-2 px-5 py-2.5">
              <Input
                value={loanOfficeSearch}
                onChange={(e) => setLoanOfficeSearch(e.target.value)}
                placeholder="Search name, staff no., request no…"
                className="h-8 w-56 text-xs"
              />
              <Select value={loanOfficeLocation} onValueChange={setLoanOfficeLocation}>
                <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="All locations" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All locations</SelectItem>
                  {allLoanLocations.map((loc) => <SelectItem key={loc} value={loc}>{loc}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={loanOfficeDept} onValueChange={setLoanOfficeDept}>
                <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="All departments" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All departments</SelectItem>
                  {allLoanDepts.map((dept) => <SelectItem key={dept} value={dept}>{dept}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={loanOfficeSort} onValueChange={(v: "newest" | "oldest") => setLoanOfficeSort(v)}>
                <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                </SelectContent>
              </Select>
              <span className="ml-auto text-xs text-slate-400">{filteredLoanOfficeStageRows.length} result{filteredLoanOfficeStageRows.length !== 1 ? "s" : ""}</span>
            </div>

            {/* archive banner */}
            {loanOfficeStageTab === "archivable" && p?.loanOffice && loanOfficeStageBuckets.archivable.length > 0 && (
              <div className="mx-5 mb-3 flex items-center justify-between rounded-lg border border-violet-200 bg-violet-50 px-4 py-2.5">
                <p className="text-xs text-violet-800">
                  <span className="font-semibold">{loanOfficeStageBuckets.archivable.length}</span> request{loanOfficeStageBuckets.archivable.length !== 1 ? "s" : ""} ready to archive
                </p>
                <Button
                  size="sm"
                  disabled={isArchivingLoans}
                  className="h-7 bg-violet-700 text-xs text-white hover:bg-violet-800"
                  onClick={async () => {
                    if (!window.confirm(`Archive all ${loanOfficeStageBuckets.archivable.length} archivable loan requests?`)) return
                    setIsArchivingLoans(true)
                    try {
                      const res = await fetch("/api/loan/bulk-archive", { method: "POST" })
                      const json = await res.json()
                      if (!res.ok) throw new Error(json.error || "Failed to archive")
                      toast({ title: "Loans Archived", description: json.message })
                      await loadData()
                    } catch (e: any) {
                      toast({ title: "Archive Failed", description: e.message, variant: "destructive" })
                    } finally {
                      setIsArchivingLoans(false)
                    }
                  }}
                >
                  {isArchivingLoans ? "Archiving…" : `Archive All (${loanOfficeStageBuckets.archivable.length})`}
                </Button>
              </div>
            )}

            {/* table */}
            {filteredLoanOfficeStageRows.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-slate-400">No requests in this stage.</div>
            ) : loanOfficeViewMode === "table" ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      <th className="px-5 py-2.5 whitespace-nowrap">Request No.</th>
                      <th className="px-4 py-2.5 whitespace-nowrap">Staff</th>
                      <th className="px-4 py-2.5 whitespace-nowrap">Type</th>
                      <th className="px-4 py-2.5 whitespace-nowrap">Amount (GHc)</th>
                      <th className="px-4 py-2.5 whitespace-nowrap">FD Score</th>
                      {canSeeFdReviewerName && <th className="px-4 py-2.5 whitespace-nowrap">FD Reviewer</th>}
                      <th className="px-4 py-2.5 whitespace-nowrap">Status</th>
                      <th className="px-4 py-2.5 whitespace-nowrap">Attachment</th>
                      <th className="px-4 py-2.5 whitespace-nowrap">Submitted</th>
                      {p?.loanOffice && <th className="px-4 py-2.5 whitespace-nowrap">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedLoanOfficeStage.map((row) => {
                      // Highlight priority/pending records
                      const pendingStatuses = ['pending_fd', 'pending_hod', 'hod_approved', 'sent_for_approval']
                      const isPending = pendingStatuses.includes(String(row.status || ''))
                      return (
                      <tr key={row.id} className={`transition-colors ${isPending ? 'bg-yellow-50/40 hover:bg-yellow-50/60 border-l-4 border-l-yellow-400' : 'hover:bg-slate-50/70'}`}>
                        <td className="px-5 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">{row.request_number || row.id.slice(0, 8)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <p className="font-medium text-slate-900 text-xs">{row.staff_full_name || "—"}</p>
                          <p className="text-[11px] text-slate-400">{row.staff_number || ""} {row.staff_rank ? `· ${row.staff_rank}` : ""}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-700 whitespace-nowrap">{row.loan_type_label || row.loan_type_key}</td>
                        <td className="px-4 py-3 text-xs font-semibold text-slate-800 whitespace-nowrap tabular-nums">
                          {row.requested_amount != null ? Number(row.requested_amount).toLocaleString("en-GH", { minimumFractionDigits: 2 }) : row.fixed_amount != null ? Number(row.fixed_amount).toLocaleString("en-GH", { minimumFractionDigits: 2 }) : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap tabular-nums">
                          {row.fd_score != null ? (
                            <span className={`font-semibold ${Number(row.fd_score) >= 60 ? "text-emerald-700" : "text-rose-600"}`}>{row.fd_score}</span>
                          ) : <span className="text-slate-400">—</span>}
                        </td>
                        {canSeeFdReviewerName && <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{row.accounts_reviewer_name || "—"}</td>}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            row.status === "hod_approved" ? "bg-emerald-100 text-emerald-800" :
                            row.status === "sent_to_accounts" ? "bg-blue-100 text-blue-800" :
                            row.status === "awaiting_committee" ? "bg-amber-100 text-amber-800" :
                            "bg-slate-100 text-slate-700"
                          }`}>
                            {statusText(row.status)}
                          </span>
                          {String(row.hod_review_note || "").toLowerCase().includes("auto-approved") && (
                            <span className="ml-1 inline-flex items-center rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 border border-amber-200">Auto</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap">
                          {row.supporting_document_url ? (
                            <a href={row.supporting_document_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-800 hover:underline font-medium">View</a>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                          {row.submitted_at ? new Date(row.submitted_at).toLocaleDateString("en-GB") : "—"}
                        </td>
                        {p?.loanOffice && (
                          <td className="px-4 py-3 whitespace-nowrap">
                            {row.status === "hod_approved" ? (
                              <Button size="sm" className="h-7 bg-violet-700 text-xs text-white hover:bg-violet-800" onClick={() => openActionModal(row, "loan_office")}>
                                Review &amp; Forward
                              </Button>
                            ) : row.status === "pending_hr_loan_office" ? (
                              <Button size="sm" className="h-7 bg-blue-600 text-xs text-white hover:bg-blue-700" onClick={() => openActionModal(row, "push_to_hr_executive")}>
                                Push to HR Exec
                              </Button>
                            ) : (
                              <span className="text-[11px] text-slate-400">{statusText(row.status)}</span>
                            )}
                          </td>
                        )}
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
                {pagedLoanOfficeStage.map((row) => (
                  <StageCard key={row.id} row={row}>
                    {row.status === "hod_approved" && p?.loanOffice
                      ? <Button size="sm" className="h-7 bg-violet-700 text-xs text-white hover:bg-violet-800" onClick={() => openActionModal(row, "loan_office")}>Review &amp; Forward</Button>
                      : row.status === "pending_hr_loan_office" && p?.loanOffice
                      ? <Button size="sm" className="h-7 bg-blue-600 text-xs text-white hover:bg-blue-700" onClick={() => openActionModal(row, "push_to_hr_executive")}>Push to HR Exec</Button>
                      : <span className="text-xs text-slate-500">{statusText(row.status)}</span>
                    }
                  </StageCard>
                ))}
              </div>
            )}

            {/* pagination */}
            {filteredLoanOfficeStageRows.length > 0 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-5 py-2.5">
                <span className="text-xs text-slate-400">Page {loanOfficePage} of {totalLoanOfficeStagePages}</span>
                <div className="flex gap-1.5">
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setLoanOfficePage((n) => Math.max(1, n - 1))} disabled={loanOfficePage <= 1}>Prev</Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setLoanOfficePage((n) => Math.min(totalLoanOfficeStagePages, n + 1))} disabled={loanOfficePage >= totalLoanOfficeStagePages}>Next</Button>
                </div>
              </div>
            )}
          </div>

          {/* ── HR Terms Queue ��─ */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
              <div>
                <p className="text-sm font-semibold text-slate-900">HR Terms Queue</p>
                <p className="text-xs text-slate-500">Set disbursement and recovery terms before forwarding to Executive HR</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-slate-600 hover:text-slate-900" onClick={() => setHrViewMode(hrViewMode === "table" ? "card" : "table")}>
                  {hrViewMode === "table" ? <><LayoutGrid className="h-3.5 w-3.5" /> Cards</> : <><LayoutList className="h-3.5 w-3.5" /> Table</>}
                </Button>
                <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-slate-600 hover:text-slate-900" onClick={() => downloadCsv(filteredHr, "hr-terms-queue.csv")}>
                  <Download className="h-3.5 w-3.5" /> Export
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-2.5">
              <Input value={hrSearch} onChange={(e) => setHrSearch(e.target.value)} placeholder="Search…" className="h-8 w-48 text-xs" />
              <Select value={hrLocation} onValueChange={setHrLocation}>
                <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="All locations" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All locations</SelectItem>
                  {allLoanLocations.map((loc) => <SelectItem key={loc} value={loc}>{loc}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={hrDept} onValueChange={setHrDept}>
                <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="All departments" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All departments</SelectItem>
                  {allLoanDepts.map((dept) => <SelectItem key={dept} value={dept}>{dept}</SelectItem>)}
                </SelectContent>
              </Select>
              <span className="ml-auto text-xs text-slate-400">{filteredHr.length} result{filteredHr.length !== 1 ? "s" : ""}</span>
            </div>

            {filteredHr.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-slate-400">No requests awaiting HR terms setup.</div>
            ) : hrViewMode === "table" ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      <th className="px-5 py-2.5 whitespace-nowrap">Request No.</th>
                      <th className="px-4 py-2.5 whitespace-nowrap">Staff</th>
                      <th className="px-4 py-2.5 whitespace-nowrap">Loan Type</th>
                      <th className="px-4 py-2.5 whitespace-nowrap">Amount (GHc)</th>
                      <th className="px-4 py-2.5 whitespace-nowrap">FD Score</th>
                      <th className="px-4 py-2.5 whitespace-nowrap">FD Reviewer</th>
                      <th className="px-4 py-2.5 whitespace-nowrap">Status</th>
                      <th className="px-4 py-2.5 whitespace-nowrap">Attachment</th>
                      {p?.hrOffice && <th className="px-4 py-2.5 whitespace-nowrap">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedHr.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-5 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">{row.request_number || row.id.slice(0, 8)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <p className="font-medium text-slate-900 text-xs">{row.staff_full_name || "—"}</p>
                          <p className="text-[11px] text-slate-400">{row.staff_number || ""}{row.staff_rank ? ` · ${row.staff_rank}` : ""}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-700 whitespace-nowrap">{row.loan_type_label || row.loan_type_key}</td>
                        <td className="px-4 py-3 text-xs font-semibold text-slate-800 whitespace-nowrap tabular-nums">
                          {row.requested_amount != null ? Number(row.requested_amount).toLocaleString("en-GH", { minimumFractionDigits: 2 }) : row.fixed_amount != null ? Number(row.fixed_amount).toLocaleString("en-GH", { minimumFractionDigits: 2 }) : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap tabular-nums">
                          {row.fd_score != null ? (
                            <span className={`font-semibold ${Number(row.fd_score) >= 60 ? "text-emerald-700" : "text-rose-600"}`}>{row.fd_score}</span>
                          ) : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{row.accounts_reviewer_name || "—"}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${statusBadgeClass(row.status, "soft")}`}>
                            {statusText(row.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap">
                          {row.supporting_document_url ? (
                            <a href={row.supporting_document_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-800 hover:underline font-medium">Download</a>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap text-slate-500">{fmtDate(row.submitted_at || row.created_at)}</td>
                        {p?.hrOffice && (
                          <td className="px-4 py-3 whitespace-nowrap">
                            <Button size="sm" className="h-7 bg-violet-700 text-xs text-white hover:bg-violet-800" onClick={() => openActionModal(row, "hr_terms")}>
                              Set Terms
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
                {pagedHr.map((row) => (
                  <StageCard key={row.id} row={row}>
                    {p?.hrOffice && <Button size="sm" className="h-7 bg-violet-700 text-xs text-white hover:bg-violet-800" onClick={() => openActionModal(row, "hr_terms")}>Set Terms</Button>}
                  </StageCard>
                ))}
              </div>
            )}

            {filteredHr.length > 0 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-5 py-2.5">
                <span className="text-xs text-slate-400">Page {hrPage} of {totalHrPages}</span>
                <div className="flex gap-1.5">
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setHrPage((n) => Math.max(1, n - 1))} disabled={hrPage <= 1}>Prev</Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setHrPage((n) => Math.min(totalHrPages, n + 1))} disabled={hrPage >= totalHrPages}>Next</Button>
                </div>
              </div>
            )}
          </div>

          {/* ── Payment Completion Queue ─��� */}
          {p?.hrOffice && (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-3.5">
                <p className="text-sm font-semibold text-slate-900">Mark Payment Completed</p>
                <p className="text-xs text-slate-500">Record staff loan repayment completion</p>
              </div>
              {(() => {
                const paymentReadyLoans = (data?.inbox?.hrOffice || []).filter(
                  (row) => ["awaiting_hr_terms", "awaiting_committee", "staff_receiving_funds", "partially_recovered"].includes(row.status) && row.recovery_months
                )
                if (paymentReadyLoans.length === 0) {
                  return (
                    <div className="px-5 py-8">
                      <p className="text-sm text-slate-500 text-center">No loans ready for payment completion marking</p>
                    </div>
                  )
                }
                return (
                  <div className="divide-y divide-slate-100">
                    {paymentReadyLoans.slice(0, 5).map((row) => (
                      <div key={row.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-slate-900">{row.staff_full_name || row.staff_number}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{row.request_number} — {row.loan_type_label}</p>
                          <p className="text-xs text-slate-400 mt-1">Recovery: {row.recovery_start_date || "TBD"} ({row.recovery_months} months)</p>
                        </div>
                        <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white whitespace-nowrap" onClick={() => openActionModal(row, "payment_completed")}>
                          Mark Completed
                        </Button>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>
          )}

          {/* ── Loan type breakdown ── */}
          {loanOfficeTypeSummary.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-3.5">
                <p className="text-sm font-semibold text-slate-900">Loan Type Breakdown</p>
                <p className="text-xs text-slate-500">Stage counts per loan type across the active queue</p>
              </div>
              <div className="grid gap-px bg-slate-100 divide-x-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {loanOfficeTypeSummary.map((item) => (
                  <div key={`loan-summary-${item.loanKey}`} className="bg-white px-5 py-4">
                    <p className="font-semibold text-slate-900 text-sm">{item.loanLabel}</p>
                    <p className="mt-0.5 text-xs text-slate-400 mb-3">Total: {item.totalUnique}</p>
                    <div className="space-y-1.5">
                      {[
                        { label: "Good FD", value: item.goodFd, color: "text-emerald-700" },
                        { label: "Poor FD", value: item.poorFd, color: "text-rose-600" },
                        { label: "Not Pushed", value: item.goodFdNotPushed, color: "text-amber-600" },
                        { label: "For Approval", value: item.sentForApproval, color: "text-blue-700" },
                        { label: "Archivable", value: item.archivable, color: "text-slate-500" },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="flex items-center justify-between">
                          <span className="text-xs text-slate-500">{label}</span>
                          <span className={`text-xs font-semibold tabular-nums ${color}`}>{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Analytics strip ── */}
          <div className="grid gap-4 xl:grid-cols-2">
            <LoanAnalyticsBarChart
              title="Stage Distribution"
              rows={loanOfficeAnalytics.stageBreakdown}
              valueKey="total"
              colorClass="bg-violet-600"
              emptyMessage="No stage data available."
              formatter={(row) => statusText(String(row?.status || "unknown"))}
            />
            <LoanAnalyticsBarChart
              title="Loan Intake Trend"
              rows={loanOfficeAnalytics.monthlyIntake}
              valueKey="total"
              colorClass="bg-emerald-600"
              emptyMessage="No monthly intake data."
              formatter={(row) => monthLabel(String(row?.month || currentMonthValue()))}
            />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <LoanAnalyticsBarChart
              title="Location Exposure"
              rows={loanOfficeAnalytics.locationRanking}
              valueKey="total"
              colorClass="bg-slate-700"
              emptyMessage="No location data available."
              formatter={(row) => String(row?.name || "Unassigned")}
            />
            <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">Pipeline Summary</p>
              <div className="space-y-2">
                {[
                  { label: "Worked on", value: loanOfficeAnalytics.totals.worked_on, pct: loanOfficeAnalytics.totals.total_requests ? Math.round((loanOfficeAnalytics.totals.worked_on / loanOfficeAnalytics.totals.total_requests) * 100) : 0, color: "bg-violet-600" },
                  { label: "Yet to work on", value: loanOfficeAnalytics.totals.yet_to_be_worked, pct: loanOfficeAnalytics.totals.total_requests ? Math.round((loanOfficeAnalytics.totals.yet_to_be_worked / loanOfficeAnalytics.totals.total_requests) * 100) : 0, color: "bg-amber-500" },
                  { label: "Finalized", value: loanOfficeAnalytics.totals.finalized, pct: loanOfficeAnalytics.totals.total_requests ? Math.round((loanOfficeAnalytics.totals.finalized / loanOfficeAnalytics.totals.total_requests) * 100) : 0, color: "bg-emerald-600" },
                ].map(({ label, value, pct, color }) => (
                  <div key={label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-slate-600">{label}</span>
                      <span className="text-xs font-semibold tabular-nums text-slate-800">{value} <span className="text-slate-400 font-normal">({pct}%)</span></span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-100">
                      <div className={`h-1.5 rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── FD-Approved from Accounts Executive ── */}
          {loanOfficeStageTab === "fd-approved-accounts-exec" && (
            <div className="mt-6 pt-6 border-t">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-slate-900">FD-Approved Loans from Accounts Executive</h3>
                <p className="text-sm text-slate-500">Loans with approved FD scores ready for HR Loan Office processing and disbursement</p>
              </div>
              <HRLoanOfficeFDApproved />
            </div>
          )}
        </TabsContent>

        <TabsContent value="accounts" className="space-y-3">
          <ReadOnlyHint canAct={Boolean(p?.accounts)} roleLabel="Accounts" />
          
          {/* FD Calculation Submission for Accounts Loan Office Staff */}
          {normalizedRole === "accounts_loan_office" && (
            <>
              {/* New FD Calculations (Pending) */}
              <Card className="border-blue-200 bg-blue-50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-blue-900">
                    <Calculator className="h-5 w-5" />
                    Submit FD Calculation for Loan Request
                  </CardTitle>
                  <CardDescription className="text-blue-800">
                    Enter staff financial information to automatically calculate their Financial Due Diligence (FD) score. No attachment needed.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {data?.inbox?.accounts && data.inbox.accounts.filter(r => !r.fd_score).length > 0 ? (
                    <div className="space-y-4">
                      {data.inbox.accounts.filter(r => !r.fd_score).map(loanReq => (
                        <FDCalculationSubmission 
                          key={loanReq.id}
                          loanRequest={{
                            id: loanReq.id,
                            request_number: loanReq.request_number || "",
                            staff_number: loanReq.staff_number || "",
                            staff_full_name: loanReq.staff_full_name || "",
                            requested_amount: loanReq.requested_amount || 0,
                            repayment_duration_months: loanReq.repayment_duration_months || 12,
                            loan_type_label: loanReq.loan_type_label,
                            monthly_deduction: loanReq.monthly_deduction ?? undefined,
                            status: loanReq.status,
                            fd_calculated: !!loanReq.fd_score,
                          }}
                          onSubmitComplete={() => void loadData()}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-blue-700">No loans awaiting FD calculation submission.</p>
                  )}
                </CardContent>
              </Card>

              {/* Edit Already-Calculated FD Scores */}
              {data?.inbox?.accounts && data.inbox.accounts.filter(r => r.fd_score).length > 0 && (
                <Card className="border-purple-200 bg-purple-50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-purple-900">
                      <Edit3 className="h-5 w-5" />
                      Edit FD Calculations
                    </CardTitle>
                    <CardDescription className="text-purple-800">
                      Already-calculated FD scores can be edited here to adjust financial data or re-calculate.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {data.inbox.accounts.filter(r => r.fd_score).map(loanReq => (
                        <FDCalculationSubmission 
                          key={`edit-${loanReq.id}`}
                          loanRequest={{
                            id: loanReq.id,
                            request_number: loanReq.request_number || "",
                            staff_number: loanReq.staff_number || "",
                            staff_full_name: loanReq.staff_full_name || "",
                            requested_amount: loanReq.requested_amount || 0,
                            repayment_duration_months: loanReq.repayment_duration_months || 12,
                            loan_type_label: loanReq.loan_type_label,
                            monthly_deduction: loanReq.monthly_deduction ?? undefined,
                            status: loanReq.status,
                            fd_calculated: !!loanReq.fd_score,
                            fd_score: loanReq.fd_score || undefined,
                            fd_note: loanReq.fd_note || undefined,
                          }}
                          onSubmitComplete={() => void loadData()}
                        />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
          

          <Card>
            <CardHeader>
              <CardTitle>Accounts FD Queue</CardTitle>
              <CardDescription>All requests pushed from Loan Office for FD scoring are listed here.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <Button variant={accountsViewMode === "table" ? "default" : "outline"} size="sm" onClick={() => setAccountsViewMode("table")} className="gap-1"><LayoutList className="h-4 w-4" /> Table</Button>
                  <Button variant={accountsViewMode === "card" ? "default" : "outline"} size="sm" onClick={() => setAccountsViewMode("card")} className="gap-1"><LayoutGrid className="h-4 w-4" /> Cards</Button>
                </div>
                <Button variant="outline" size="sm" onClick={() => downloadCsv(filteredAccounts, "accounts-queue-filtered.csv")}>Export Filtered CSV</Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 items-end">
                <Input value={accountsSearch} onChange={(e) => setAccountsSearch(e.target.value)} placeholder="Search requests" />
                <Select value={accountsStatus} onValueChange={setAccountsStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {Object.keys(STATUS_LABELS).map((status) => (
                      <SelectItem key={`accounts-${status}`} value={status}>{statusText(status)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={accountsSort} onValueChange={(v: "newest" | "oldest") => setAccountsSort(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest first</SelectItem>
                    <SelectItem value="oldest">Oldest first</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={accountsLocation} onValueChange={setAccountsLocation}>
                  <SelectTrigger><SelectValue placeholder="All locations" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All locations</SelectItem>
                    {allLoanLocations.map((loc) => <SelectItem key={loc} value={loc}>{loc}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={accountsDept} onValueChange={setAccountsDept}>
                  <SelectTrigger><SelectValue placeholder="All departments" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All departments</SelectItem>
                    {allLoanDepts.map((dept) => <SelectItem key={dept} value={dept}>{dept}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="text-xs text-muted-foreground flex items-center md:justify-end">Showing {pagedAccounts.length} of {filteredAccounts.length}</div>
              </div>
            </CardContent>
          </Card>

          {filteredAccounts.length === 0 && <p className="text-sm text-muted-foreground">No requests currently in Accounts queue.</p>}

          {accountsViewMode === "table" && filteredAccounts.length > 0 && (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-purple-950/10">
                      <TableHead className="whitespace-nowrap">Request No.</TableHead>
                      <TableHead className="whitespace-nowrap">Staff Name</TableHead>
                      <TableHead className="whitespace-nowrap">Staff No.</TableHead>
                      <TableHead className="whitespace-nowrap">Rank</TableHead>
                      <TableHead className="whitespace-nowrap">Loan Type</TableHead>
                      <TableHead className="whitespace-nowrap">Amount (GHc)</TableHead>
                      <TableHead className="whitespace-nowrap">FD Score</TableHead>
                      <TableHead className="whitespace-nowrap">FD Reviewer</TableHead>
                      <TableHead className="whitespace-nowrap">Status</TableHead>
                      <TableHead className="whitespace-nowrap">Attachment</TableHead>
                      <TableHead className="whitespace-nowrap">Submitted</TableHead>
                      {p?.accounts && <TableHead className="whitespace-nowrap">FD Action</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedAccounts.map((row) => {
                      const fd = fdInputs[row.id] || { score: "", note: "" }
                      return (
                        <TableRow key={row.id} className="align-top">
                          <TableCell className="font-mono text-xs whitespace-nowrap">{row.request_number || row.id.slice(0, 8)}</TableCell>
                          <TableCell className="whitespace-nowrap font-medium">{row.staff_full_name || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{row.staff_number || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{row.staff_rank || "�����"}</TableCell>
                          <TableCell className="text-xs">{row.loan_type_label || row.loan_type_key}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{row.requested_amount != null ? Number(row.requested_amount).toLocaleString("en-GH", { minimumFractionDigits: 2 }) : row.fixed_amount != null ? Number(row.fixed_amount).toLocaleString("en-GH", { minimumFractionDigits: 2 }) : "—"}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs font-semibold">{row.fd_score ?? "—"}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{row.accounts_reviewer_name || "���"}</TableCell>
                          <TableCell><Badge className={statusBadgeClass(row.status, "solid")}>{statusText(row.status)}</Badge></TableCell>
                          <TableCell className="text-xs whitespace-nowrap">
                            {row.supporting_document_url ? (
                              <a href={row.supporting_document_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-800 hover:underline font-medium">View</a>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs whitespace-nowrap">{row.submitted_at ? new Date(row.submitted_at).toLocaleDateString("en-GB") : "—"}</TableCell>
                          {p?.accounts && (
                            <TableCell>
                              <Button size="sm" className="text-xs whitespace-nowrap" onClick={() => openActionModal(row, "accounts")}>Set FD Score</Button>
                            </TableCell>
                          )}
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {accountsViewMode === "card" && pagedAccounts.map((row) => (
            <StageCard key={row.id} row={row}>
              {p?.accounts && <Button size="sm" onClick={() => openActionModal(row, "accounts")}>Set FD Score</Button>}
            </StageCard>
          ))}

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setAccountsPage((n) => Math.max(1, n - 1))} disabled={accountsPage <= 1}>Prev</Button>
            <span className="text-xs text-muted-foreground">Page {accountsPage} of {totalAccountsPages}</span>
            <Button variant="outline" size="sm" onClick={() => setAccountsPage((n) => Math.min(totalAccountsPages, n + 1))} disabled={accountsPage >= totalAccountsPages}>Next</Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Approved Loans for Accounts Records</CardTitle>
              <CardDescription>Download approved loans in PDF format only.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => void downloadPdf(data?.inbox.accountsSigned || [], "approved-loans-accounts.pdf", "Approved Loans for Accounts Records") }>
                  <Download className="h-4 w-4 mr-1" /> Download Approved Loans
                </Button>
              </div>
              {(data?.inbox.accountsSigned || []).map((row) => (
                <div key={row.id} className="border rounded p-3 text-sm space-y-1">
                  <div className="font-medium">{row.request_number} - {row.loan_type_label}</div>
                  {row.staff_full_name && <div className="font-semibold text-purple-900">Staff: {row.staff_full_name} {row.staff_number ? `(${row.staff_number})` : ""}</div>}
                  <div>Amount: GHc {fmtAmount(row.fixed_amount || row.requested_amount)} | Disbursement: {row.disbursement_date || "TBD"} | Recovery: {row.recovery_start_date || "TBD"} ({row.recovery_months || "?"} months)</div>
                  <div>Status: <strong>{statusText(row.status)}</strong></div>
                  <div className="flex gap-2 flex-wrap pt-1">
                    <Button variant="outline" size="sm" onClick={() => void openSecureMemo(row.id)}>
                      <Download className="h-4 w-4 mr-1" /> Download Signed Memo
                    </Button>
                  </div>
                </div>
              ))}
              {(data?.inbox.accountsSigned || []).length === 0 && <p className="text-sm text-muted-foreground">No approved records yet.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Staff Loan Records Tab ��─ */}
        <TabsContent value="staff-loan-records" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-600" />
                Staff Loan Records
              </CardTitle>
              <CardDescription>
                Manage all staff loan records. View approved loans, mark as completed, and track loan eligibility for future requests.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Search and filters */}
              <div className="space-y-4 mb-6">
                <div className="flex gap-3 items-center">
                  <input
                    type="text"
                    placeholder="Search staff name or number..."
                    value={staffLoanRecordsSearch}
                    onChange={(e) => {
                      setStaffLoanRecordsSearch(e.target.value)
                      setStaffLoanRecordsPage(1)
                    }}
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                  <select
                    value={staffLoanRecordsSort}
                    onChange={(e) => setStaffLoanRecordsSort(e.target.value as "name" | "status")}
                    className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  >
                    <option value="name">Sort by Name</option>
                    <option value="status">Sort by Loan Status</option>
                  </select>
                </div>
              </div>

              {/* Staff loan records table */}
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Staff Name</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Staff No.</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Current Loan</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Loan Amount</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Total Paid</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Outstanding</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Next Payment Due</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Completion Date</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Repayment Status</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Mark Completed</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-700">Eligible for New</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      // Compile all loans from all sources (not just allLoans, as staff may be viewing their own loans too)
                      const allSourceLoans = [
                        ...(data?.inbox?.allLoans || []),
                        ...(data?.inbox?.loanOffice || []),
                        ...(data?.inbox?.accounts || []),
                        ...(data?.inbox?.accountsSigned || []),
                        ...(data?.inbox?.hrOffice || []),
                        ...(data?.inbox?.directorHr || []),
                        ...(data?.myTasks || []),
                      ]

                      // Remove duplicates by id
                      const uniqueLoansMap = new Map<string, LoanRequest>()
                      allSourceLoans.forEach((loan) => {
                        if (!uniqueLoansMap.has(loan.id)) {
                          uniqueLoansMap.set(loan.id, loan)
                        }
                      })
                      const allLoans = Array.from(uniqueLoansMap.values())

                      // Get all approved or active loans (any status that means the loan has been formally approved)
                      // NOTE: awaiting_committee is NOT an approval — it means pending committee decision, so exclude it
                      const approvedLoans = allLoans.filter((r) => {
                        const activeStatuses = [
                          "approved_director",
                          "awaiting_hr_terms", "awaiting_director_hr", "staff_receiving_funds", "partially_recovered",
                          "payment_completed",
                        ]
                        return activeStatuses.includes(r.status)
                      })

                      // Group by staff member
                      const staffMap = new Map<string, LoanRequest[]>()
                      approvedLoans.forEach((loan) => {
                        const key = loan.user_id
                        if (!staffMap.has(key)) staffMap.set(key, [])
                        staffMap.get(key)!.push(loan)
                      })

                      // Convert to array and filter by search
                      let staffRecords = Array.from(staffMap.entries())
                        .map(([staffId, loans]) => ({
                          staffId,
                          name: loans[0]?.staff_full_name || "Unknown",
                          staffNo: loans[0]?.staff_number || "—",
                          loans,
                          // Current loan = MD-approved loans only, OR archived loans with outstanding balance
                          currentLoan: loans.find(l => {
                            // Only include MD-approved or post-approval active loans
                            const mdApprovedStatuses = ["approved_director", "staff_receiving_funds", "partially_recovered"]
                            if (mdApprovedStatuses.includes(l.status)) {
                              return true
                            }
                            // Also include archived loans that still have outstanding balance (they were previously MD-approved)
                            if (l.status === "archived") {
                              const loanAmount = Number(l.fixed_amount || l.requested_amount || 0)
                              const totalPaid = Number(l.total_paid || 0)
                              const outstanding = loanAmount - totalPaid
                              return outstanding > 0
                            }
                            return false
                          }),
                          completedLoans: loans.filter(l => l.status === "payment_completed")
                        }))

                      // Filter by search
                      if (staffLoanRecordsSearch) {
                        staffRecords = staffRecords.filter((r) =>
                          r.name.toLowerCase().includes(staffLoanRecordsSearch.toLowerCase()) ||
                          r.staffNo.toLowerCase().includes(staffLoanRecordsSearch.toLowerCase())
                        )
                      }

                      // Sort
                      if (staffLoanRecordsSort === "status") {
                        staffRecords.sort((a, b) => {
                          const aHasActive = a.currentLoan ? 1 : 0
                          const bHasActive = b.currentLoan ? 1 : 0
                          return bHasActive - aHasActive
                        })
                      } else {
                        staffRecords.sort((a, b) => a.name.localeCompare(b.name))
                      }

                      // Paginate
                      const itemsPerPage = 10
                      const totalPages = Math.ceil(staffRecords.length / itemsPerPage)
                      const paged = staffRecords.slice((staffLoanRecordsPage - 1) * itemsPerPage, staffLoanRecordsPage * itemsPerPage)

                      if (paged.length === 0) {
                        return (
                          <tr>
                            <td colSpan={12} className="px-4 py-6 text-center text-slate-500">
                              {staffRecords.length === 0 ? "No staff records found" : "No results match your search"}
                            </td>
                          </tr>
                        )
                      }

                      return paged.map((record) => {
                        const currentLoan = record.currentLoan
                        const isCompleted = currentLoan?.status === "payment_completed"
                        // Only allow marking as completed if loan is MD-approved and not yet completed
                        const isMdApproved = currentLoan && ["approved_director", "staff_receiving_funds", "partially_recovered", "archived"].includes(currentLoan.status)
                        const canMarkCompleted = currentLoan && !isCompleted && isMdApproved

                        return (
                          <tr key={record.staffId} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="px-4 py-3 font-medium text-slate-900">{record.name}</td>
                            <td className="px-4 py-3 text-slate-600">{record.staffNo}</td>
                            <td className="px-4 py-3">
                              {currentLoan ? (
                                <span className="text-slate-900 font-medium">{currentLoan.loan_type_label}</span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {currentLoan ? (
                                <span className="text-slate-900">GHc {Number(currentLoan.fixed_amount || currentLoan.requested_amount || 0).toLocaleString("en-GH", { minimumFractionDigits: 2 })}</span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            {/* Total Paid */}
                            <td className="px-4 py-3">
                              {currentLoan?.total_paid ? (
                                <span className="text-emerald-700 font-medium">GHc {Number(currentLoan.total_paid).toLocaleString("en-GH", { minimumFractionDigits: 2 })}</span>
                              ) : (
                                <span className="text-slate-400">GHc 0.00</span>
                              )}
                            </td>
                            {/* Outstanding Balance */}
                            <td className="px-4 py-3">
                              {(() => {
                                const outstanding = currentLoan?.outstanding_balance ?? (Number(currentLoan?.fixed_amount || currentLoan?.requested_amount || 0) - Number(currentLoan?.total_paid || 0))
                                return outstanding > 0 ? (
                                  <span className="font-semibold text-orange-700">
                                    GHc {Number(outstanding).toLocaleString("en-GH", { minimumFractionDigits: 2 })}
                                  </span>
                                ) : (
                                  <span className="font-semibold text-emerald-700">GHc 0.00</span>
                                )
                              })()}
                            </td>
                            {/* Monthly Payment Due */}
                            <td className="px-4 py-3">
                              {(() => {
                                const loanAmount = Number(currentLoan?.fixed_amount || currentLoan?.requested_amount || 0)
                                // Use recovery_months first (for loans with predefined recovery), then repayment_duration_months (for new loans)
                                const duration = currentLoan?.recovery_months || currentLoan?.repayment_duration_months || 12
                                const monthlyPayment = duration > 0 ? loanAmount / duration : 0
                                return monthlyPayment > 0 ? (
                                  <span className="font-semibold text-slate-900">GHc {monthlyPayment.toLocaleString("en-GH", { minimumFractionDigits: 2 })}</span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )
                              })()}
                            </td>
                            {/* Next Payment Due */}
                            <td className="px-4 py-3">
                              {(() => {
                                const nextDue = currentLoan?.next_payment_due
                                if (nextDue) {
                                  return <span className="text-sm text-slate-700">{new Date(nextDue).toLocaleDateString('en-GH', { month: 'short', day: 'numeric' })}</span>
                                }
                                // Calculate next due from approval date
                                if (currentLoan?.md_approved_at) {
                                  const approvalDate = new Date(currentLoan.md_approved_at)
                                  const nextPaymentDate = new Date(approvalDate.setMonth(approvalDate.getMonth() + 1))
                                  return <span className="text-sm text-slate-700">{nextPaymentDate.toLocaleDateString('en-GH', { month: 'short', day: 'numeric' })}</span>
                                }
                                return <span className="text-slate-400">—</span>
                              })()}
                            </td>
                            {/* Expected Completion Date */}
                            <td className="px-4 py-3">
                              {(() => {
                                const completionDate = currentLoan?.expected_completion_date
                                if (completionDate) {
                                  return <span className="text-sm text-slate-700">{new Date(completionDate).toLocaleDateString('en-GH', { month: 'short', year: '2-digit' })}</span>
                                }
                                // Calculate from approval date + duration (use recovery_months first, then repayment_duration_months)
                                if (currentLoan?.md_approved_at) {
                                  const duration = currentLoan?.recovery_months || currentLoan?.repayment_duration_months
                                  if (duration) {
                                    const approvalDate = new Date(currentLoan.md_approved_at)
                                    const lastPaymentDate = new Date(approvalDate.setMonth(approvalDate.getMonth() + duration))
                                    return <span className="text-sm text-slate-700">{lastPaymentDate.toLocaleDateString('en-GH', { month: 'short', year: '2-digit' })}</span>
                                  }
                                }
                                return <span className="text-slate-400">—</span>
                              })()}
                            </td>
                            {/* Repayment Status */}
                            <td className="px-4 py-3">
                              {currentLoan?.repayment_status ? (
                                <Badge className={
                                  currentLoan.repayment_status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                                  currentLoan.repayment_status === 'overdue' ? 'bg-red-100 text-red-700' :
                                  currentLoan.repayment_status === 'due_soon' ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-blue-100 text-blue-700'
                                }>
                                  {currentLoan.repayment_status === 'on_track' ? 'On Track' :
                                   currentLoan.repayment_status === 'due_soon' ? 'Due Soon' :
                                   currentLoan.repayment_status.charAt(0).toUpperCase() + currentLoan.repayment_status.slice(1)}
                                </Badge>
                              ) : (
                                <span className="text-slate-400 text-xs">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {currentLoan ? (
                                <div className="flex flex-col gap-1">
                                  <Badge className={statusBadgeClass(currentLoan.status, "solid")}>
                                    {statusText(currentLoan.status)}
                                  </Badge>
                                  {currentLoan.status === "archived" && (
                                    <Badge className="bg-slate-200 text-slate-700 text-xs">
                                      Archived - Repaying
                                    </Badge>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-400 text-xs">No Active Loan</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {canMarkCompleted && (
                                <Button
                                  size="sm"
                                  className="bg-green-600 hover:bg-green-700 text-white text-xs"
                                  onClick={() => openActionModal(currentLoan!, "payment_completed")}
                                >
                                  Mark Completed
                                </Button>
                              )}
                              {isCompleted && (
                                <Badge className="bg-green-100 text-green-800">Completed</Badge>
                              )}
                              {!currentLoan && (
                                <span className="text-slate-300 text-xs">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {!currentLoan || isCompleted ? (
                                <Badge className="bg-blue-100 text-blue-800">✓ Eligible</Badge>
                              ) : (
                                <Badge className="bg-slate-100 text-slate-700">Not Eligible</Badge>
                              )}
                            </td>
                          </tr>
                        )
                      })
                    })()}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {(() => {
                // Recalculate total pages using same logic as table
                const allSourceLoans = [
                  ...(data?.inbox?.allLoans || []),
                  ...(data?.inbox?.loanOffice || []),
                  ...(data?.inbox?.accounts || []),
                  ...(data?.inbox?.accountsSigned || []),
                  ...(data?.inbox?.hrOffice || []),
                  ...(data?.inbox?.directorHr || []),
                  ...(data?.myTasks || []),
                ]
                const uniqueLoansMap = new Map<string, LoanRequest>()
                allSourceLoans.forEach((loan) => {
                  if (!uniqueLoansMap.has(loan.id)) {
                    uniqueLoansMap.set(loan.id, loan)
                  }
                })
                const allLoans = Array.from(uniqueLoansMap.values())
                
                const approvedLoans = allLoans.filter((r) => {
                  const activeStatuses = [
                    "hod_approved", "sent_to_accounts", "approved_director", "awaiting_committee",
                    "awaiting_hr_terms", "awaiting_director_hr", "staff_receiving_funds", "partially_recovered",
                    "payment_completed", "awaiting_committee"
                  ]
                  return activeStatuses.includes(r.status)
                })

                const staffMap = new Map<string, LoanRequest[]>()
                approvedLoans.forEach((loan) => {
                  const key = loan.user_id
                  if (!staffMap.has(key)) staffMap.set(key, [])
                  staffMap.get(key)!.push(loan)
                })

                let staffRecords = Array.from(staffMap.entries()).map(([staffId, loans]) => ({
                  staffId,
                  name: loans[0]?.staff_full_name || "Unknown",
                  staffNo: loans[0]?.staff_number || "—",
                }))
                if (staffLoanRecordsSearch) {
                  staffRecords = staffRecords.filter((r) =>
                    r.name.toLowerCase().includes(staffLoanRecordsSearch.toLowerCase()) ||
                    r.staffNo.toLowerCase().includes(staffLoanRecordsSearch.toLowerCase())
                  )
                }
                const totalPages = Math.ceil(staffRecords.length / 10)
                return totalPages > 1 ? (
                  <div className="flex justify-between items-center mt-4">
                    <p className="text-sm text-slate-600">Page {staffLoanRecordsPage} of {totalPages}</p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={staffLoanRecordsPage === 1}
                        onClick={() => setStaffLoanRecordsPage(Math.max(1, staffLoanRecordsPage - 1))}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={staffLoanRecordsPage === totalPages}
                        onClick={() => setStaffLoanRecordsPage(Math.min(totalPages, staffLoanRecordsPage + 1))}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                ) : null
              })()} 
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Analytics Tab ── */}
        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-2xl">
                    <BarChart3 className="h-6 w-6 text-blue-600" />
                    Executive Analytics
                  </CardTitle>
                  <CardDescription className="mt-1">
                    View detailed loan analytics and performance metrics across your operations
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Filter Controls */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-slate-500" />
                  <span className="text-sm font-semibold text-slate-700">Filter Analytics</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1.5">Location</label>
                    <select className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">All Locations</option>
                      {Array.from(
                        new Set(
                          loanOfficeWorkspaceRows
                            .map((r) => r.staff_location_name)
                            .filter((loc) => loc && typeof loc === "string")
                        )
                      ).map((location) => (
                        <option key={location} value={location ?? ""}>{location}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1.5">Department</label>
                    <select className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">All Departments</option>
                      {Array.from(
                        new Set(
                          loanOfficeWorkspaceRows
                            .map((r) => String(r.department_name || r.user?.departments?.name || ""))
                            .filter((dept) => dept && dept !== "")
                        )
                      )
                        .sort()
                        .map((department) => (
                          <option key={department} value={department}>{department}</option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1.5">Loan Type</label>
                    <select className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">All Loan Types</option>
                      {Array.from(
                        new Set(
                          loanOfficeWorkspaceRows
                            .map((r) => r.loan_label)
                            .filter((type) => type && typeof type === "string")
                        )
                      )
                        .sort()
                        .map((loanType) => (
                          <option key={loanType} value={loanType ?? ""}>{loanType}</option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1.5">Category</label>
                    <select className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">All Categories</option>
                      {Array.from(
                        new Set(
                          loanOfficeWorkspaceRows
                            .map((r) => r.category_name)
                            .filter((cat) => cat && typeof cat === "string")
                        )
                      )
                        .sort()
                        .map((category) => (
                          <option key={category} value={category ?? ""}>{category}</option>
                        ))}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button className="w-full px-3 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 transition-colors">
                      Export Data
                    </button>
                  </div>
                </div>
              </div>

              {/* Key Metrics Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-600 font-semibold mb-1">Total Processed</p>
                      <p className="text-2xl font-bold text-slate-900">{loanOfficeAnalytics.totals.total_requests}</p>
                    </div>
                    <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center">
                      <CheckCircle2 className="h-5 w-5 text-slate-500" />
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-600 font-semibold mb-1">Active Pipeline</p>
                      <p className="text-2xl font-bold text-violet-700">{loanOfficeAnalytics.totals.active_pipeline}</p>
                    </div>
                    <div className="h-10 w-10 rounded-full bg-violet-100 flex items-center justify-center">
                      <Clock className="h-5 w-5 text-violet-600" />
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-600 font-semibold mb-1">Good Status</p>
                      <p className="text-2xl font-bold text-emerald-700">{loanOfficeAnalytics.totals.good_fd}</p>
                    </div>
                    <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-600 font-semibold mb-1">Poor Status</p>
                      <p className="text-2xl font-bold text-rose-700">{loanOfficeAnalytics.totals.poor_fd}</p>
                    </div>
                    <div className="h-10 w-10 rounded-full bg-rose-100 flex items-center justify-center">
                      <Clock className="h-5 w-5 text-rose-600" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Monetary Metrics Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-blue-600 font-semibold mb-1">Total Loan Value</p>
                      <p className="text-2xl font-bold text-blue-900">
                        GHc {loanOfficeAnalytics.totals.total_loan_value.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <p className="text-xs text-blue-500 mt-1">All {loanOfficeAnalytics.totals.total_requests} loans</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-emerald-600 font-semibold mb-1">Approved Value</p>
                      <p className="text-2xl font-bold text-emerald-900">
                        GHc {loanOfficeAnalytics.totals.total_approved_value.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <p className="text-xs text-emerald-500 mt-1">Active pipeline</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-amber-600 font-semibold mb-1">Average Amount</p>
                      <p className="text-2xl font-bold text-amber-900">
                        GHc {loanOfficeAnalytics.totals.avg_loan_amount.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <p className="text-xs text-amber-500 mt-1">Per request</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Charts Section */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <LoanAnalyticsBarChart
                  title="Loan Stage Breakdown"
                  rows={loanOfficeAnalytics.stageBreakdown || []}
                  valueKey="total"
                  colorClass="bg-blue-500"
                  emptyMessage="No stage data available"
                  formatter={(row) => row.status || "Unknown"}
                />
                <LoanAnalyticsBarChart
                  title="Monthly Intake Trend"
                  rows={loanOfficeAnalytics.monthlyIntake || []}
                  valueKey="total"
                  colorClass="bg-emerald-500"
                  emptyMessage="No monthly data available"
                  formatter={(row) => row.month || "Unknown"}
                />
              </div>

              {/* Processing Status Distribution */}
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <h4 className="font-semibold text-slate-900 mb-4 text-sm">Processing Status Distribution</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="flex items-center gap-3 p-3 bg-violet-50 rounded-lg">
                    <div className="h-3 w-3 rounded-full bg-violet-600" />
                    <div className="text-sm">
                      <p className="text-slate-600 text-xs">Worked On</p>
                      <p className="font-bold text-slate-900">{loanOfficeAnalytics.totals.worked_on}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg">
                    <div className="h-3 w-3 rounded-full bg-amber-500" />
                    <div className="text-sm">
                      <p className="text-slate-600 text-xs">Yet to Work</p>
                      <p className="font-bold text-slate-900">{loanOfficeAnalytics.totals.yet_to_be_worked}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-lg">
                    <div className="h-3 w-3 rounded-full bg-emerald-600" />
                    <div className="text-sm">
                      <p className="text-slate-600 text-xs">Finalized</p>
                      <p className="font-bold text-slate-900">{loanOfficeAnalytics.totals.finalized}</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leave-payment" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-purple-600" />
                Approved Leave Payment Advice
              </CardTitle>
              <CardDescription>
                View and download approved leave payment advice records for voucher processing in Accpac
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingLeavePaymentMemos ? (
                <div className="flex justify-center py-8">
                  <div className="text-center">
                    <Loader2 className="h-6 w-6 animate-spin text-purple-600 mx-auto" />
                    <p className="mt-2 text-gray-600 text-sm">Loading leave payment records...</p>
                  </div>
                </div>
              ) : leavePaymentMemos.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-40" />
                  <p className="text-lg font-medium">No Approved Records</p>
                  <p className="text-sm text-gray-400 mt-1">No approved leave payment advice records are available for processing.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50 hover:bg-slate-50">
                        <TableHead className="font-semibold text-slate-900">Employee Name</TableHead>
                        <TableHead className="font-semibold text-slate-900">Staff ID</TableHead>
                        <TableHead className="font-semibold text-slate-900">Leave Period</TableHead>
                        <TableHead className="text-right font-semibold text-slate-900">Days</TableHead>
                        <TableHead className="font-semibold text-slate-900">Date Approved</TableHead>
                        <TableHead className="text-center font-semibold text-slate-900">Status</TableHead>
                        <TableHead className="text-center font-semibold text-slate-900">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leavePaymentMemos.map((memo: any) => (
                        <TableRow key={memo.id} className="hover:bg-slate-50">
                          <TableCell className="font-medium">{memo.staff_name || "N/A"}</TableCell>
                          <TableCell>{memo.staff_number || "N/A"}</TableCell>
                          <TableCell>
                            {memo.leave_period_start && memo.leave_period_end
                              ? `${new Date(memo.leave_period_start).toLocaleDateString()} – ${new Date(memo.leave_period_end).toLocaleDateString()}`
                              : "N/A"}
                          </TableCell>
                          <TableCell className="text-right">{memo.approved_days || 0}</TableCell>
                          <TableCell>
                            {memo.updated_at ? new Date(memo.updated_at).toLocaleDateString() : new Date(memo.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Approved</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={async () => {
                                try {
                                  const currentDate = new Date()
                                  const dateStr = `${currentDate.getDate()}/${currentDate.getMonth() + 1}/${currentDate.getFullYear()}`

                                  // Parse memo_body to get actual signer info
                                  let signerName = "HUMAN RESOURCE MANAGER"
                                  let signerTitle = "HR DEPARTMENT"
                                  let signerSignatureUrl = ""
                                  let staffPosition = "Staff Position"
                                  let staffDepartment = "Department"

                                  if (memo.memo_body) {
                                    try {
                                      const memoBody = typeof memo.memo_body === "string" ? JSON.parse(memo.memo_body) : memo.memo_body
                                      // Get signer from memo_body
                                      if (memoBody.selectedSigner) {
                                        signerName = memoBody.selectedSigner.name || signerName
                                        signerTitle = memoBody.selectedSigner.position || signerTitle
                                        signerSignatureUrl = memoBody.selectedSigner.signature_data_url || ""
                                      }
                                      // Get staff details if available
                                      if (memoBody.staffList && memoBody.staffList[0]) {
                                        staffPosition = memoBody.staffList[0].position || staffPosition
                                        staffDepartment = memoBody.staffList[0].department || staffDepartment
                                      }
                                    } catch (parseErr) {
                                      console.warn("[v0] Could not parse memo_body:", parseErr)
                                    }
                                  }

                                  // Prepare memo data using ACTUAL signer from the memo
                                  const memoData = {
                                    to: "DEPUTY DIRECTOR, FINANCE",
                                    from: "HUMAN RESOURCE MANAGER",
                                    subject: `PAYMENT OF LEAVE ALLOWANCE - ${memo.staff_name || "Staff"}`,
                                    date: dateStr,
                                    refNo: "QCC/",
                                    body: `We wish to inform you that the undermentioned staff member has been approved for leave payment.\n\nWe, therefore, kindly request you to process and pay their leave allowance accordingly.\n\nWe count on your co-operation.`,
                                    signatory: {
                                      name: signerName.toUpperCase(),
                                      title: signerTitle.toUpperCase(),
                                      signature_image_url: signerSignatureUrl,
                                    },
                                    ccList: ["Finance Director", "HR Department", "Internal Audit"],
                                    memoType: "payment" as const,
                                    staffList: [
                                      {
                                        no: 1,
                                        name: memo.staff_name || "N/A",
                                        employeeId: memo.staff_number || "N/A",
                                        position: staffPosition,
                                        department: staffDepartment,
                                        leaveDate: memo.leave_period_start ? new Date(memo.leave_period_start).toLocaleDateString() : "N/A",
                                      },
                                    ],
                                  }

                                  // Generate professional PDF with actual signature
                                  const pdf = await generateProfessionalMemoPDF(
                                    memoData,
                                    `leave-payment-${(memo.staff_name || "staff").toLowerCase().replace(/\s+/g, "-")}.pdf`
                                  )

                                  // Download
                                  await downloadMemoPDF(
                                    pdf,
                                    `leave-payment-${(memo.staff_name || "staff").toLowerCase().replace(/\s+/g, "-")}-${currentDate.getFullYear()}${String(currentDate.getMonth() + 1).padStart(2, "0")}${String(currentDate.getDate()).padStart(2, "0")}.pdf`
                                  )
                                } catch (err) {
                                  console.error("[v0] Download error:", err)
                                  toast({ title: "Error", description: "Failed to download memo", variant: "destructive" })
                                }
                              }}
                              className="gap-1"
                            >
                              <Download className="h-3 w-3" />
                              Download
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="loan-payment-advice" className="space-y-4">
          <LoanOfficePaymentAdviceTab />
        </TabsContent>

        <TabsContent value="committee" className="space-y-3">
          <ReadOnlyHint canAct={Boolean(p?.committee)} roleLabel="Loan Committee" />
          <Card>
            <CardHeader>
              <CardTitle>Committee Decisions</CardTitle>
              <CardDescription>
                Committee members approve or reject requests that require committee endorsement after FD clearance.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <Button variant={committeeViewMode === "table" ? "default" : "outline"} size="sm" onClick={() => setCommitteeViewMode("table")} className="gap-1"><LayoutList className="h-4 w-4" /> Table</Button>
                  <Button variant={committeeViewMode === "card" ? "default" : "outline"} size="sm" onClick={() => setCommitteeViewMode("card")} className="gap-1"><LayoutGrid className="h-4 w-4" /> Cards</Button>
                </div>
                <Button variant="outline" size="sm" onClick={() => downloadCsv(filteredCommittee, "committee-queue-filtered.csv")}>Export Filtered CSV</Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 items-end">
                <Input value={committeeSearch} onChange={(e) => setCommitteeSearch(e.target.value)} placeholder="Search requests" />
                <Select value={committeeStatus} onValueChange={setCommitteeStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {Object.keys(STATUS_LABELS).map((status) => (
                      <SelectItem key={`committee-${status}`} value={status}>{statusText(status)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={committeeSort} onValueChange={(v: "newest" | "oldest") => setCommitteeSort(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest first</SelectItem>
                    <SelectItem value="oldest">Oldest first</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={committeeLocation} onValueChange={setCommitteeLocation}>
                  <SelectTrigger><SelectValue placeholder="All locations" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All locations</SelectItem>
                    {allLoanLocations.map((loc) => <SelectItem key={loc} value={loc}>{loc}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={committeeDept} onValueChange={setCommitteeDept}>
                  <SelectTrigger><SelectValue placeholder="All departments" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All departments</SelectItem>
                    {allLoanDepts.map((dept) => <SelectItem key={dept} value={dept}>{dept}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="text-xs text-muted-foreground flex items-center md:justify-end">Showing {pagedCommittee.length} of {filteredCommittee.length}</div>
              </div>
            </CardContent>
          </Card>
          {filteredCommittee.length === 0 && (
            <Card>
              <CardContent className="pt-4 text-sm text-muted-foreground">
                No committee-required loans are waiting for decision right now.
              </CardContent>
            </Card>
          )}
          {committeeViewMode === "table" && filteredCommittee.length > 0 && (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-purple-950/10">
                      <TableHead className="whitespace-nowrap">Request No.</TableHead>
                      <TableHead className="whitespace-nowrap">Staff Name</TableHead>
                      <TableHead className="whitespace-nowrap">Staff No.</TableHead>
                      <TableHead className="whitespace-nowrap">Rank</TableHead>
                      <TableHead className="whitespace-nowrap">Loan Type</TableHead>
                      <TableHead className="whitespace-nowrap">Amount (GHc)</TableHead>
                      <TableHead className="whitespace-nowrap">FD Score</TableHead>
                      <TableHead className="whitespace-nowrap">FD Reviewer</TableHead>
                      <TableHead className="whitespace-nowrap">Status</TableHead>
                      <TableHead className="whitespace-nowrap">Attachment</TableHead>
                      <TableHead className="whitespace-nowrap">Submitted</TableHead>
                      {p?.committee && <TableHead className="whitespace-nowrap">Action</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedCommittee.map((row) => (
                      <TableRow key={row.id} className="align-top">
                        <TableCell className="font-mono text-xs whitespace-nowrap">{row.request_number || row.id.slice(0, 8)}</TableCell>
                        <TableCell className="whitespace-nowrap font-medium">{row.staff_full_name || "—"}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{row.staff_number || "—"}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{row.staff_rank || "—"}</TableCell>
                        <TableCell className="text-xs">{row.loan_type_label || row.loan_type_key}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{row.requested_amount != null ? Number(row.requested_amount).toLocaleString("en-GH", { minimumFractionDigits: 2 }) : row.fixed_amount != null ? Number(row.fixed_amount).toLocaleString("en-GH", { minimumFractionDigits: 2 }) : "—"}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{row.fd_score ?? "—"}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{row.accounts_reviewer_name || "—"}</TableCell>
                        <TableCell><Badge className={statusBadgeClass(row.status, "solid")}>{statusText(row.status)}</Badge></TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {row.supporting_document_url ? (
                            <a href={row.supporting_document_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-800 hover:underline font-medium">Download</a>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{row.submitted_at ? new Date(row.submitted_at).toLocaleDateString("en-GB") : "—"}</TableCell>
                        {p?.committee && (
                          <TableCell>
                            <Button size="sm" className="text-xs whitespace-nowrap" onClick={() => openActionModal(row, "committee")}>Further Information</Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {committeeViewMode === "card" && pagedCommittee.map((row) => (
            <StageCard key={row.id} row={row}>
              {p?.committee && <Button size="sm" onClick={() => openActionModal(row, "committee")}>Further Information</Button>}
            </StageCard>
          ))}
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setCommitteePage((n) => Math.max(1, n - 1))} disabled={committeePage <= 1}>Prev</Button>
            <span className="text-xs text-muted-foreground">Page {committeePage} of {totalCommitteePages}</span>
            <Button variant="outline" size="sm" onClick={() => setCommitteePage((n) => Math.min(totalCommitteePages, n + 1))} disabled={committeePage >= totalCommitteePages}>Next</Button>
          </div>
        </TabsContent>

        {/* ── Payment Approvals Tab (HR Executive) ── */}
        <TabsContent value="payment-approvals" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-blue-600" />
                Payment Evidence Approvals
              </CardTitle>
              <CardDescription>
                Review and approve payment evidence submitted by HR/Accounts staff. Only approve evidence that has complete and valid payment documentation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Search and Filters */}
              <div className="space-y-4 mb-6">
                <div className="flex gap-3 items-center flex-wrap">
                  <input
                    type="text"
                    placeholder="Search staff name or reference..."
                    value={paymentApprovalsSearch}
                    onChange={(e) => setPaymentApprovalsSearch(e.target.value)}
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                  <select
                    value={paymentApprovalsFilter}
                    onChange={(e) => setPaymentApprovalsFilter(e.target.value as any)}
                    className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  >
                    <option value="pending">Pending Approval</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                    <option value="all">All</option>
                  </select>
                  <select
                    value={paymentApprovalsSort}
                    onChange={(e) => setPaymentApprovalsSort(e.target.value as any)}
                    className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  >
                    <option value="date">Sort by Date (Newest)</option>
                    <option value="amount">Sort by Amount</option>
                  </select>
                </div>
              </div>

              {/* Payment Evidence List */}
              <div className="space-y-3">
                {(() => {
                  // For HR/Accounts executives, fetch pending payments for their approval
                  const userRole = data?.profile?.role || ""
                  const isHrApprover = ["hr_executive", "admin"].includes(userRole)
                  const isAccountsApprover = ["accounts_executive", "admin"].includes(userRole)
                  
                  if (!isHrApprover && !isAccountsApprover) {
                    return (
                      <div className="rounded-lg border border-slate-200 p-6 text-center text-slate-500">
                        <Receipt className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-sm">Payment approvals are only visible to HR and Accounts Executives.</p>
                      </div>
                    )
                  }

                  if (paymentRecordsLoading) {
                    return (
                      <div className="rounded-lg border border-slate-200 p-6 text-center text-slate-500">
                        <Loader2 className="h-8 w-8 text-slate-400 mx-auto mb-3 animate-spin" />
                        <p className="text-sm">Loading payment records...</p>
                      </div>
                    )
                  }

                  if (paymentRecords.length === 0) {
                    return (
                      <div className="rounded-lg border border-slate-200 p-6 text-center text-slate-500">
                        <Receipt className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-sm">No payment evidence pending your approval.</p>
                      </div>
                    )
                  }

                  return paymentRecords.map((payment) => {
                    const needsHrApproval = isHrApprover && payment.hr_approval_status === "pending"
                    const needsAccountsApproval = isAccountsApprover && payment.accounts_approval_status === "pending"
                    const canApprove = needsHrApproval || needsAccountsApproval
                    const approvalType = needsHrApproval ? "hr" : needsAccountsApproval ? "accounts" : null

                    return (
                      <div key={payment.id} className="rounded-lg border border-slate-200 p-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                          <div>
                            <div className="text-xs text-slate-500 font-semibold">Payment Reference</div>
                            <div className="text-sm font-semibold text-slate-900">{payment.reference_number || payment.id}</div>
                            <div className="text-xs text-slate-600">{payment.description || "Payment record"}</div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-500 font-semibold">Payment Details</div>
                            <div className="text-sm font-semibold text-slate-900">GHc {Number(payment.amount_paid).toLocaleString("en-GH", { minimumFractionDigits: 2 })}</div>
                            <div className="text-xs text-slate-600">{new Date(payment.payment_date).toLocaleDateString("en-GH")}</div>
                            <div className="text-xs text-slate-600">{payment.payment_method || "—"}</div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-500 font-semibold">Submitted By</div>
                            <div className="text-sm font-semibold text-slate-900">{payment.submitted_by || "System"}</div>
                            <div className="text-xs text-slate-600">{new Date(payment.submitted_at).toLocaleDateString("en-GH")}</div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-500 font-semibold">Approval Status</div>
                            <div className="flex flex-col gap-1 mt-1">
                              <div className="text-xs">
                                <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                                  payment.hr_approval_status === "approved" ? "bg-emerald-100 text-emerald-700" :
                                  payment.hr_approval_status === "rejected" ? "bg-red-100 text-red-700" :
                                  "bg-amber-100 text-amber-700"
                                }`}>
                                  HR: {payment.hr_approval_status === "pending" ? "Pending" : payment.hr_approval_status === "approved" ? "✓ Approved" : "✗ Rejected"}
                                </span>
                              </div>
                              <div className="text-xs">
                                <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                                  payment.accounts_approval_status === "approved" ? "bg-emerald-100 text-emerald-700" :
                                  payment.accounts_approval_status === "rejected" ? "bg-red-100 text-red-700" :
                                  "bg-amber-100 text-amber-700"
                                }`}>
                                  Accts: {payment.accounts_approval_status === "pending" ? "Pending" : payment.accounts_approval_status === "approved" ? "✓ Approved" : "✗ Rejected"}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Action buttons */}
                        {canApprove && (
                          <div className="border-t border-slate-200 pt-3 flex gap-2 justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-700 border-red-200 hover:bg-red-50"
                              onClick={() => {
                                setSelectedPaymentForApproval(payment)
                                setApprovalNotes("")
                                setApprovingPaymentId(`reject-${payment.id}`)
                                setApprovalModalOpen(true)
                              }}
                              disabled={approvingPaymentId !== null}
                            >
                              Reject
                            </Button>
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700"
                              onClick={() => {
                                setSelectedPaymentForApproval(payment)
                                setApprovalNotes("")
                                setApprovingPaymentId(`approve-${payment.id}`)
                                setApprovalModalOpen(true)
                              }}
                              disabled={approvingPaymentId !== null}
                            >
                              Approve Payment
                            </Button>
                          </div>
                        )}
                        {!canApprove && (
                          <div className="border-t border-slate-200 pt-3 flex gap-2 justify-end">
                            <span className="text-xs text-slate-500">No action required for this record</span>
                          </div>
                        )}
                      </div>
                    )
                  })
                })()}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── FD Approval Tab (Accounts Executive) ── */}
        <TabsContent value="fd-approval" className="space-y-4">
          <AccountsExecutiveFDDashboard userId={data?.profile?.id || ""} userRole={data?.profile?.role || "user"} />
        </TabsContent>

        {/* ── FD Completed/Archived Tab (Accounts Executive) ── */}
        <TabsContent value="fd-completed" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>FD Completed & Archived Records</CardTitle>
              <CardDescription>Historical FD calculations that have been approved or rejected for archival and record-keeping.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border p-4 text-center text-sm text-slate-500">
                <p>FD completed records component - Ready for implementation with filtering and archive management</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="director" className="space-y-3">
                    <ReadOnlyHint canAct={Boolean(p?.directorHr)} roleLabel="Executive HR" />
          <Card>
            <CardHeader>
              <CardTitle>FD-Cleared Requests from Loan Office</CardTitle>
              <CardDescription>All requests with good FD status awaiting Director pipeline completion.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => downloadCsv(data?.inbox?.directorGoodFd || [], "director-good-fd-requests.csv")}>Export FD-Cleared CSV</Button>
              </div>
              {(data?.inbox?.directorGoodFd || []).map((row) => (
                <div key={`good-fd-${row.id}`} className="rounded border p-2 text-sm">
                  <div className="font-medium">{row.request_number} - {row.loan_type_label}</div>
                  {row.staff_full_name && <div className="font-semibold text-purple-900">Staff: {row.staff_full_name}</div>}
                  <div>FD: {row.fd_score ?? "N/A"} | FD Reviewer: {row.accounts_reviewer_name || "—"} | Status: {statusText(row.status)}</div>
                  <div>Staff No: {row.staff_number || "N/A"} | Rank: {row.staff_rank || "N/A"}</div>
                </div>
              ))}
              {(data?.inbox?.directorGoodFd || []).length === 0 && <p className="text-sm text-muted-foreground">No FD-cleared requests available.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Executive HR Approval Queue</CardTitle>
              <CardDescription>Use the action button on each request to review, sign, and finalize the memo.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <Button variant={directorViewMode === "table" ? "default" : "outline"} size="sm" onClick={() => setDirectorViewMode("table")} className="gap-1"><LayoutList className="h-4 w-4" /> Table</Button>
                  <Button variant={directorViewMode === "card" ? "default" : "outline"} size="sm" onClick={() => setDirectorViewMode("card")} className="gap-1"><LayoutGrid className="h-4 w-4" /> Cards</Button>
                </div>
                <Button variant="outline" size="sm" onClick={() => downloadCsv(filteredDirector, "director-queue-filtered.csv")}>Export Filtered CSV</Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 items-end">
                <Input value={directorSearch} onChange={(e) => setDirectorSearch(e.target.value)} placeholder="Search requests" />
                <Select value={directorStatus} onValueChange={setDirectorStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {Object.keys(STATUS_LABELS).map((status) => (
                      <SelectItem key={`director-${status}`} value={status}>{statusText(status)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={directorSort} onValueChange={(v: "newest" | "oldest") => setDirectorSort(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest first</SelectItem>
                    <SelectItem value="oldest">Oldest first</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={directorLocation} onValueChange={setDirectorLocation}>
                  <SelectTrigger><SelectValue placeholder="All locations" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All locations</SelectItem>
                    {allLoanLocations.map((loc) => <SelectItem key={loc} value={loc}>{loc}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={directorDept} onValueChange={setDirectorDept}>
                  <SelectTrigger><SelectValue placeholder="All departments" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All departments</SelectItem>
                    {allLoanDepts.map((dept) => <SelectItem key={dept} value={dept}>{dept}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="text-xs text-muted-foreground flex items-center md:justify-end">Showing {pagedDirector.length} of {filteredDirector.length}</div>
              </div>
            </CardContent>
          </Card>

          {filteredDirector.length === 0 && <p className="text-sm text-muted-foreground">No requests currently awaiting Executive HR decision.</p>}

          {directorViewMode === "table" && filteredDirector.length > 0 && (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-purple-950/10">
                      <TableHead className="whitespace-nowrap">Request No.</TableHead>
                      <TableHead className="whitespace-nowrap">Staff Name</TableHead>
                      <TableHead className="whitespace-nowrap">Staff No.</TableHead>
                      <TableHead className="whitespace-nowrap">Rank</TableHead>
                      <TableHead className="whitespace-nowrap">Loan Type</TableHead>
                      <TableHead className="whitespace-nowrap">Amount (GHc)</TableHead>
                      <TableHead className="whitespace-nowrap">FD Score</TableHead>
                      <TableHead className="whitespace-nowrap">FD Reviewer</TableHead>
                      <TableHead className="whitespace-nowrap">Status</TableHead>
                      <TableHead className="whitespace-nowrap">Submitted</TableHead>
                      {p?.directorHr && <TableHead className="whitespace-nowrap">Action</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedDirector.map((row) => (
                      <TableRow key={row.id} className="align-top">
                        <TableCell className="font-mono text-xs whitespace-nowrap">{row.request_number || row.id.slice(0, 8)}</TableCell>
                        <TableCell className="whitespace-nowrap font-medium">{row.staff_full_name || "—"}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{row.staff_number || "—"}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{row.staff_rank || "—"}</TableCell>
                        <TableCell className="text-xs">{row.loan_type_label || row.loan_type_key}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{row.requested_amount != null ? Number(row.requested_amount).toLocaleString("en-GH", { minimumFractionDigits: 2 }) : row.fixed_amount != null ? Number(row.fixed_amount).toLocaleString("en-GH", { minimumFractionDigits: 2 }) : "—"}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{row.fd_score ?? "—"}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{row.accounts_reviewer_name || "—"}</TableCell>
                        <TableCell><Badge className={statusBadgeClass(row.status, "solid")}>{statusText(row.status)}</Badge></TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{row.submitted_at ? new Date(row.submitted_at).toLocaleDateString("en-GB") : "—"}</TableCell>
                        {p?.directorHr && (
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <Button size="sm" className="text-xs whitespace-nowrap bg-green-700 hover:bg-green-800 text-white" onClick={() => openActionModal(row, "director")}>Review &amp; Sign Memo</Button>
                              {["approved_director", "director_rejected"].includes(row.status) && <Button variant="outline" size="sm" className="text-xs whitespace-nowrap" onClick={() => openSecureMemo(row.id)}>Download PDF</Button>}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {directorViewMode === "card" && pagedDirector.map((row) => (
            <StageCard key={row.id} row={row}>
              {p?.directorHr && (
                <Button size="sm" className="bg-green-700 hover:bg-green-800 text-white" onClick={() => openActionModal(row, "director")}>Review &amp; Sign Memo</Button>
              )}
              {["approved_director", "director_rejected"].includes(row.status) && (
                <Button variant="outline" size="sm" onClick={() => openSecureMemo(row.id)}>Download PDF</Button>
              )}
            </StageCard>
          ))}

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setDirectorPage((n) => Math.max(1, n - 1))} disabled={directorPage <= 1}>Prev</Button>
            <span className="text-xs text-muted-foreground">Page {directorPage} of {totalDirectorPages}</span>
            <Button variant="outline" size="sm" onClick={() => setDirectorPage((n) => Math.min(totalDirectorPages, n + 1))} disabled={directorPage >= totalDirectorPages}>Next</Button>
          </div>
        </TabsContent>

        <TabsContent value="my-tasks" className="space-y-3">
          {hodMemoCopyRows.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/70">
              <CardHeader>
                <CardTitle>Rejection Memo Copies for Staff You Approved</CardTitle>
                <CardDescription>Downstream rejection memos remain available here for HOD follow-up and record keeping.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                {hodMemoCopyRows.map((row) => (
                  <div key={`hod-memo-${row.id}`} className="rounded border bg-white p-3 text-sm shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{row.request_number} - {row.loan_type_label}</div>
                      <Badge className={statusBadgeClass(row.status, "solid")}>{statusText(row.status)}</Badge>
                    </div>
                    <div className="mt-2 font-semibold text-purple-900">{row.staff_full_name || "Staff member"}</div>
                    <div className="mt-1 text-xs text-muted-foreground">Updated: {fmtDate(row.updated_at || row.created_at)}</div>
                    <div className="mt-3 flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => openSecureMemo(row.id)}>
                        <FileText className="mr-1 h-4 w-4" /> Open Rejection Memo
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>My Loan Tasks & Decisions</CardTitle>
              <CardDescription>All requests where you acted or are assigned as an approver.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-1 pb-1">
                <Button variant={tasksViewMode === "table" ? "default" : "outline"} size="sm" onClick={() => setTasksViewMode("table")} className="gap-1"><LayoutList className="h-4 w-4" /> Table</Button>
                <Button variant={tasksViewMode === "card" ? "default" : "outline"} size="sm" onClick={() => setTasksViewMode("card")} className="gap-1"><LayoutGrid className="h-4 w-4" /> Cards</Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <Input
                  value={tasksSearch}
                  onChange={(e) => setTasksSearch(e.target.value)}
                  placeholder="Search by request/staff/rank/type"
                />
                <Select value={tasksStatus} onValueChange={setTasksStatus}>
                  <SelectTrigger><SelectValue placeholder="Filter status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {Object.keys(STATUS_LABELS).map((status) => (
                      <SelectItem key={`tasks-${status}`} value={status}>{statusText(status)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={tasksSort} onValueChange={(v: "newest" | "oldest") => setTasksSort(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest first</SelectItem>
                    <SelectItem value="oldest">Oldest first</SelectItem>
                  </SelectContent>
                </Select>
                <div className="text-xs text-muted-foreground flex items-center md:justify-end">
                  Showing {pagedMyTasks.length} of {filteredMyTasks.length}
                </div>
              </div>

              {filteredMyTasks.length === 0 && <p className="text-sm text-muted-foreground">No assigned/processed tasks found.</p>}

              {tasksViewMode === "table" && filteredMyTasks.length > 0 && (
                <div className="overflow-x-auto rounded border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-purple-950/10">
                        <TableHead className="whitespace-nowrap">Request No.</TableHead>
                        <TableHead className="whitespace-nowrap">Staff Name</TableHead>
                        <TableHead className="whitespace-nowrap">Staff No.</TableHead>
                        <TableHead className="whitespace-nowrap">Rank</TableHead>
                        <TableHead className="whitespace-nowrap">Loan Type</TableHead>
                        <TableHead className="whitespace-nowrap">Amount (GHc)</TableHead>
                        <TableHead className="whitespace-nowrap">Status</TableHead>
                        <TableHead className="whitespace-nowrap">Action</TableHead>
                        <TableHead className="whitespace-nowrap">Location</TableHead>
                        <TableHead className="whitespace-nowrap">Attachment</TableHead>
                        <TableHead className="whitespace-nowrap">Updated</TableHead>
                        <TableHead className="whitespace-nowrap">Memo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedMyTasks.map((row) => (
                        <TableRow 
                          key={`my-task-${row.id}`}
                          onDoubleClick={() => row.status === "pending_hod" && openActionModal(row, "hod")}
                          title={row.status === "pending_hod" ? "Double-click or use buttons to Review / Endorse" : ""}
                          className={row.status === "pending_hod" ? "cursor-pointer hover:bg-emerald-50 transition-colors" : ""}
                        >
                          <TableCell className="font-mono text-xs whitespace-nowrap">{row.request_number || row.id.slice(0, 8)}</TableCell>
                          <TableCell className="whitespace-nowrap font-medium">{row.staff_full_name || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{row.staff_number || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{row.staff_rank || "—"}</TableCell>
                          <TableCell className="text-xs">{row.loan_type_label || row.loan_type_key}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{row.requested_amount != null ? Number(row.requested_amount).toLocaleString("en-GH", { minimumFractionDigits: 2 }) : row.fixed_amount != null ? Number(row.fixed_amount).toLocaleString("en-GH", { minimumFractionDigits: 2 }) : "—"}</TableCell>
                          <TableCell><Badge className={statusBadgeClass(row.status, "solid")}>{statusText(row.status)}</Badge></TableCell>
                          <TableCell className="whitespace-nowrap">
                            {row.status === "pending_hod" ? (
                              <div className="flex gap-1">
                                <Button 
                                  size="sm" 
                                  className="h-7 bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-2 font-semibold"
                                  onClick={(e) => { e.stopPropagation(); openActionModal(row, "hod") }}
                                  title="Click to open Review & Decision modal"
                                >
                                  Review
                                </Button>
                                <Button 
                                  size="sm" 
                                  className="h-7 bg-blue-600 hover:bg-blue-700 text-white text-xs px-2"
                                  onClick={(e) => { e.stopPropagation(); openActionModal(row, "hod") }}
                                >
                                  Endorse
                                </Button>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs whitespace-nowrap">{row.staff_location_name || "—"}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">
                            {row.supporting_document_url ? (
                              <a href={row.supporting_document_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-800 hover:underline">Download</a>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs whitespace-nowrap">{fmtDate(row.updated_at || row.created_at)}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">
                            {(row.director_hr_name || row.director_signature_text) && (
                              <div className="text-xs text-muted-foreground mb-1">
                                Signed: <span className="font-medium text-slate-700">{row.director_hr_name || row.director_signature_text}</span>
                              </div>
                            )}
                            {["rejected_fd", "director_rejected", "approved_director", "awaiting_director_hr"].includes(row.status)
                              ? <Button variant="outline" size="sm" onClick={() => openSecureMemo(row.id)}>Open Memo</Button>
                              : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {tasksViewMode === "card" && pagedMyTasks.map((row) => (
                <div key={`my-task-${row.id}`} className="rounded border p-3 text-sm space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{row.request_number} - {row.loan_type_label}</div>
                    <Badge className={statusBadgeClass(row.status, "soft")}>{statusText(row.status)}</Badge>
                  </div>
                  {row.staff_full_name && <div className="font-semibold text-purple-900">Staff: {row.staff_full_name}</div>}
                  <div>Staff No: {row.staff_number || "N/A"} | Rank: {row.staff_rank || "N/A"}</div>
                  <div>Location: {row.staff_location_name || "N/A"} | District: {row.staff_district_name || "N/A"}</div>
                  <div>Amount: GHc {fmtAmount(row.fixed_amount || row.requested_amount)}</div>
                  {row.supporting_document_url && (
                    <div className="text-xs pt-1">
                      Attachment: <a href={row.supporting_document_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-800 hover:underline">Download</a>
                    </div>
                  )}
                  {row.fd_document_url && (
                    <div className="text-xs pt-1">
                      FD Proof: <a href={row.fd_document_url} target="_blank" rel="noreferrer" className="text-emerald-700 hover:text-emerald-900 hover:underline font-medium">View FD Document</a>
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">Updated: {fmtDate(row.updated_at || row.created_at)}</div>
                  {(row.director_hr_name || row.director_signature_text) && (
                    <div className="text-xs text-slate-600">Signed by: <span className="font-semibold">Director</span></div>
                  )}
                  {["rejected_fd", "director_rejected", "approved_director", "awaiting_director_hr"].includes(row.status) && (
                    <div className="pt-2">
                      <Button variant="outline" size="sm" onClick={() => openSecureMemo(row.id)}>Open Memo</Button>
                    </div>
                  )}
                  {row.status === "pending_hod" && (
                    <div className="pt-2 flex gap-2">
                      <Button 
                        size="sm" 
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => openActionModal(row, "hod")}
                      >
                        Review
                      </Button>
                      <Button 
                        size="sm" 
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                        onClick={() => openActionModal(row, "hod")}
                      >
                        Endorse
                      </Button>
                    </div>
                  )}
                </div>
              ))}

              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setTasksPage((n) => Math.max(1, n - 1))} disabled={tasksPage <= 1}>Prev</Button>
                <span className="text-xs text-muted-foreground">Page {tasksPage} of {totalMyTaskPages}</span>
                <Button variant="outline" size="sm" onClick={() => setTasksPage((n) => Math.min(totalMyTaskPages, n + 1))} disabled={tasksPage >= totalMyTaskPages}>Next</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="overview" className="space-y-3">
          {isAdmin && (
            <Card className="border-red-200">
              <CardHeader>
                <CardTitle>Admin Controls</CardTitle>
                <CardDescription>Use with caution: clears all loan requests and related timeline entries.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  <Button variant="destructive" onClick={deleteAllLoanRequests}>Delete All Loan Requests</Button>
                  <Button variant="destructive" onClick={deleteSelectedLoanRequests} disabled={selectedLoanIds.length === 0}>
                    Delete Selected ({selectedLoanIds.length})
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-xl font-bold text-slate-900">All Loan Requests</CardTitle>
                  <CardDescription className="text-slate-500">Full cross-organization visibility for admin, HR loan office, and Director HR.</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => downloadCsv(filteredAllLoans, "all-loan-requests.csv")} className="shrink-0">
                  <Download className="h-4 w-4 mr-1" /> Export
                </Button>
              </div>

              {/* Summary stats bar */}
              {(() => {
                const allRows = data?.inbox?.allLoans || []
                const totalAmt = allRows.reduce((s: number, r: any) => s + Number(r.fixed_amount || r.requested_amount || 0), 0)
                const approved = allRows.filter((r: any) => r.status === "approved_director").length
                const pending = allRows.filter((r: any) => !["approved_director","director_rejected","rejected_fd"].includes(r.status)).length
                const rejected = allRows.filter((r: any) => ["director_rejected","rejected_fd"].includes(r.status)).length
                const signed = allRows.filter((r: any) => r.status === "approved_director" && (r.director_hr_name || r.director_signature_text)).length
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                    <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total Value</div>
                      <div className="text-lg font-bold text-slate-900 mt-0.5">GHc {fmtAmount(totalAmt)}</div>
                      <div className="text-xs text-slate-500">{allRows.length} request{allRows.length !== 1 ? "s" : ""}</div>
                    </div>
                    <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
                      <div className="text-xs font-medium text-emerald-600 uppercase tracking-wide">Approved</div>
                      <div className="text-lg font-bold text-emerald-700 mt-0.5">{approved}</div>
                      <div className="text-xs text-emerald-600">{signed} with signed memo</div>
                    </div>
                    <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
                      <div className="text-xs font-medium text-amber-600 uppercase tracking-wide">In Progress</div>
                      <div className="text-lg font-bold text-amber-700 mt-0.5">{pending}</div>
                      <div className="text-xs text-amber-600">awaiting action</div>
                    </div>
                    <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                      <div className="text-xs font-medium text-red-500 uppercase tracking-wide">Rejected</div>
                      <div className="text-lg font-bold text-red-600 mt-0.5">{rejected}</div>
                      <div className="text-xs text-red-500">not approved</div>
                    </div>
                  </div>
                )
              })()}
            </CardHeader>
            <CardContent className="space-y-3 pt-2">
              {/* FD Status Filter Tabs */}
              <div className="flex gap-2 flex-wrap">
                <Badge 
                  variant={allFdFilter === "all" ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setAllFdFilter("all")}
                >
                  All Loans
                </Badge>
                <Badge 
                  variant={allFdFilter === "good" ? "default" : "outline"}
                  className="bg-green-600 hover:bg-green-700 cursor-pointer"
                  onClick={() => setAllFdFilter("good")}
                >
                  Good FD
                </Badge>
                <Badge 
                  variant={allFdFilter === "poor" ? "default" : "outline"}
                  className="bg-amber-600 hover:bg-amber-700 cursor-pointer"
                  onClick={() => setAllFdFilter("poor")}
                >
                  Poor FD
                </Badge>
                <Badge 
                  variant={allFdFilter === "archive" ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setAllFdFilter("archive")}
                >
                  Archive
                </Badge>
              </div>

              {/* Filters row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 items-center bg-slate-50 rounded-lg p-3 border">
                <Input
                  value={allSearch}
                  onChange={(e) => setAllSearch(e.target.value)}
                  placeholder="Search by request / staff / rank..."
                  className="bg-white"
                />
                <Select value={allStatus} onValueChange={setAllStatus}>
                  <SelectTrigger className="bg-white"><SelectValue placeholder="All statuses" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {Object.keys(STATUS_LABELS).map((status) => (
                      <SelectItem key={`overview-${status}`} value={status}>{statusText(status)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={allSort} onValueChange={(v: "newest" | "oldest") => setAllSort(v)}>
                  <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest first</SelectItem>
                    <SelectItem value="oldest">Oldest first</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={allLocation} onValueChange={setAllLocation}>
                  <SelectTrigger className="bg-white"><SelectValue placeholder="All locations" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All locations</SelectItem>
                    {allLoanLocations.map((loc) => <SelectItem key={loc} value={loc}>{loc}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={allDept} onValueChange={setAllDept}>
                  <SelectTrigger className="bg-white"><SelectValue placeholder="All departments" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All departments</SelectItem>
                    {allLoanDepts.map((dept) => <SelectItem key={dept} value={dept}>{dept}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="text-xs text-muted-foreground text-right">
                Showing {pagedAllLoans.length} of {filteredAllLoans.length} results
              </div>

              {pagedAllLoans.map((row) => {
                const isExpanded = expandedLoanIds.has(row.id)
                return (
                <div key={row.id} className="rounded border text-sm">
                  {isAdmin && isExpanded && (
                    <div className="flex items-center justify-between p-3 pb-2 border-b">
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <input type="checkbox" checked={selectedLoanIds.includes(row.id)} onChange={() => toggleSelectedLoanId(row.id)} />
                        Select
                      </label>
                      <Button variant="destructive" size="sm" onClick={() => void deleteLoanRequestById(row.id)}>Delete</Button>
                    </div>
                  )}

                  {/* Card Header - Click to Expand/Collapse */}
                  <button
                    onClick={() => toggleLoanExpanded(row.id)}
                    className="w-full p-3 flex items-start justify-between gap-3 hover:bg-white/10 transition-colors border-b border-white/20"
                  >
                    <div className="flex-1 text-left">
                      <div className="text-sm font-bold text-white">{row.request_number}</div>
                      <div className="text-xs text-purple-200 font-medium">{row.staff_full_name}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                        row.status === "approved_director" ? "bg-emerald-100 text-emerald-700" :
                        ["director_rejected","rejected_fd"].includes(row.status) ? "bg-red-100 text-red-700" :
                        "bg-amber-100 text-amber-700"
                      }`}>
                        {statusText(row.status)}
                      </div>
                      <ChevronDown className={`h-4 w-4 text-white/70 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                  </button>

                  {/* Expanded Card Content */}
                  {isExpanded && (
                  <div className="p-3 space-y-3">

                  {/* Approval pipeline progress */}
                  {(() => {
                    const steps = [
                      { label: "HOD", statuses: ["submitted","hod_review","hod_approved","sent_to_loan_office","loan_office_review","loan_approved","sent_to_accounts","accounts_review","accounts_approved","sent_to_committee","committee_approved","sent_to_hr","hr_office_review","hr_office_approved","awaiting_director_hr","approved_director","director_rejected"] },
                      { label: "Loan Office", statuses: ["sent_to_loan_office","loan_office_review","loan_approved","sent_to_accounts","accounts_review","accounts_approved","sent_to_committee","committee_approved","sent_to_hr","hr_office_review","hr_office_approved","awaiting_director_hr","approved_director","director_rejected"] },
                      { label: "FD", statuses: ["sent_to_accounts","accounts_review","accounts_approved","sent_to_committee","committee_approved","sent_to_hr","hr_office_review","hr_office_approved","awaiting_director_hr","approved_director","director_rejected"] },
                      { label: "HR Office", statuses: ["sent_to_hr","hr_office_review","hr_office_approved","awaiting_director_hr","approved_director"] },
                      { label: "Director", statuses: ["awaiting_director_hr","approved_director"] },
                    ]
                    const isRejected = ["director_rejected","rejected_fd","hod_rejected","loan_office_rejected","committee_rejected"].includes(row.status)
                    return (
                      <div className="flex items-center gap-1 mb-3">
                        {steps.map((step, i) => {
                          const done = step.statuses.includes(row.status)
                          const isFinal = row.status === "approved_director" && i === steps.length - 1
                          return (
                            <div key={step.label} className="flex items-center flex-1">
                              <div className={`h-1.5 flex-1 rounded-full transition-colors ${
                                isRejected && i === 0 ? "bg-red-400" :
                                isFinal ? "bg-emerald-500" :
                                done ? "bg-violet-500" : "bg-slate-200"
                              }`} />
                              <div className={`text-[10px] whitespace-nowrap px-1 font-medium ${
                                done && !isRejected ? "text-violet-700" : isRejected ? "text-red-400" : "text-slate-400"
                              }`}>{step.label}</div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}

                  {/* Staff Information */}
                  <div className="space-y-2 mb-3 pb-3 border-b">
                    {row.staff_full_name && <div className="font-semibold text-slate-900">{row.staff_full_name}</div>}
                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                      <div><span className="text-slate-500">Position:</span> {row.staff_rank || "—"}</div>
                      <div><span className="text-slate-500">Staff No:</span> {row.staff_number || "—"}</div>
                      <div><span className="text-slate-500">Location:</span> {row.staff_location_name || "—"}</div>
                      <div><span className="text-slate-500">District:</span> {row.staff_district_name || "—"}</div>
                    </div>
                  </div>

                  {/* Amount & Reviewers */}
                  <div className="space-y-2 mb-3 pb-3 border-b">
                    <div className="text-lg font-bold text-slate-900">GHc {fmtAmount(row.fixed_amount || row.requested_amount)}</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-500 block">FD Score</span>
                        <span className="font-semibold text-slate-900">{row.fd_score ?? "—"}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">FD Reviewed By</span>
                        <span className="font-semibold text-slate-900">{row.accounts_reviewer_name || "—"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Professional Approval Certificate - Hidden from All Loan Requests view for professional appearance */}
                  {/* Approval certificate is only shown in detail/staff loan records views, not in all loans list */}

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      {["rejected_fd", "director_rejected", "approved_director", "awaiting_director_hr"].includes(row.status) && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => openSecureMemo(row.id)}
                          className="flex-1"
                        >
                          View Memo
                        </Button>
                      )}
                      {row.status === "approved_director" && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => void openSecureMemo(row.id)}
                          className="flex-1"
                        >
                          Download Signed Memo
                        </Button>
                      )}
                    </div>
                  </div>
                  )}
                </div>
                )
              })}
              {filteredAllLoans.length === 0 && <p className="text-sm text-muted-foreground">No loans found.</p>}

              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setAllPage((n) => Math.max(1, n - 1))} disabled={allPage <= 1}>Prev</Button>
                <span className="text-xs text-muted-foreground">Page {allPage} of {totalAllLoanPages}</span>
                <Button variant="outline" size="sm" onClick={() => setAllPage((n) => Math.min(totalAllLoanPages, n + 1))} disabled={allPage >= totalAllLoanPages}>Next</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="archive" className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-xl font-bold text-slate-900">Archived Loan Requests</CardTitle>
                  <CardDescription className="text-slate-500">View previously approved or rejected loans that have been archived.</CardDescription>
                </div>
                <div className="flex gap-2 shrink-0">
                  {selectedArchivedLoans.size > 0 && (
                    <Button 
                      variant="default" 
                      size="sm" 
                      onClick={restoreSelectedLoans}
                      disabled={isRestoringAll}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      Restore Selected ({selectedArchivedLoans.size})
                    </Button>
                  )}
                  <Button 
                    variant="default" 
                    size="sm" 
                    onClick={restoreAllLoans}
                    disabled={isRestoringAll || filteredArchivedLoans.length === 0}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    {isRestoringAll ? "Restoring All..." : "Restore All"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => downloadCsv(filteredArchivedLoans, "archived-loan-requests.csv")}>
                    <Download className="h-4 w-4 mr-1" /> Export
                  </Button>
                </div>
              </div>

              {/* Summary stats bar */}
              {(() => {
                const archivedRows = (data?.inbox?.allLoans || []).filter((r: any) => r.status === "archived")
                const totalAmt = archivedRows.reduce((s: number, r: any) => s + Number(r.fixed_amount || r.requested_amount || 0), 0)
                const approved = archivedRows.filter((r: any) => r.director_hr_name).length
                const rejected = archivedRows.filter((r: any) => !r.director_hr_name).length
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
                    <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
                      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total Archived</div>
                      <div className="text-lg font-bold text-slate-900 mt-0.5">GHc {fmtAmount(totalAmt)}</div>
                      <div className="text-xs text-slate-500">{archivedRows.length} request{archivedRows.length !== 1 ? "s" : ""}</div>
                    </div>
                    <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
                      <div className="text-xs font-medium text-emerald-600 uppercase tracking-wide">Approved</div>
                      <div className="text-lg font-bold text-emerald-700 mt-0.5">{approved}</div>
                    </div>
                    <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                      <div className="text-xs font-medium text-red-500 uppercase tracking-wide">Rejected</div>
                      <div className="text-lg font-bold text-red-600 mt-0.5">{rejected}</div>
                    </div>
                  </div>
                )
              })()}
            </CardHeader>
            <CardContent className="space-y-3 pt-2">
              {/* Filters row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 items-center bg-slate-50 rounded-lg p-3 border">
                <Input
                  value={allSearch}
                  onChange={(e) => setAllSearch(e.target.value)}
                  placeholder="Search by request / staff / rank..."
                  className="bg-white"
                />
                <Select value={allLocation} onValueChange={setAllLocation}>
                  <SelectTrigger className="bg-white"><SelectValue placeholder="All locations" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All locations</SelectItem>
                    {allLoanLocations.map((loc) => <SelectItem key={loc} value={loc}>{loc}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={allDept} onValueChange={setAllDept}>
                  <SelectTrigger className="bg-white"><SelectValue placeholder="All departments" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All departments</SelectItem>
                    {allLoanDepts.map((dept) => <SelectItem key={dept} value={dept}>{dept}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="text-xs text-muted-foreground text-right">
                Showing {filteredArchivedLoans.length} archived loans
              </div>

              {filteredArchivedLoans.length > 0 && (
                <div className="mb-4 flex items-center gap-3 py-3 px-4 bg-slate-100 rounded border border-slate-200">
                  <input
                    type="checkbox"
                    checked={selectedArchivedLoans.size > 0 && selectedArchivedLoans.size === filteredArchivedLoans.length}
                    onChange={toggleSelectAllArchived}
                    className="w-4 h-4 cursor-pointer"
                  />
                  <label className="text-sm font-medium text-slate-700 cursor-pointer flex-1">
                    Select All ({selectedArchivedLoans.size} selected)
                  </label>
                </div>
              )}

              {filteredArchivedLoans.map((row) => (
                <div 
                  key={row.id} 
                  className={`rounded border p-4 text-sm transition-colors cursor-pointer ${
                    selectedArchivedLoans.has(row.id) 
                      ? "bg-blue-50 border-blue-300" 
                      : "bg-slate-50 hover:bg-slate-100"
                  }`}
                  onClick={() => toggleLoanSelection(row.id)}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-start gap-3 flex-1">
                      <input
                        type="checkbox"
                        checked={selectedArchivedLoans.has(row.id)}
                        onChange={() => toggleLoanSelection(row.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-bold text-slate-900">{row.request_number}</div>
                        <div className="text-xs text-slate-600">{row.staff_full_name}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-xs font-semibold text-slate-700">Archived</div>
                      <div className="px-2 py-1 rounded bg-slate-200 text-slate-700 text-xs font-semibold">
                        {row.director_hr_name ? "✓ Approved" : "✗ Rejected"}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-bold text-slate-900">GHc {fmtAmount(row.fixed_amount || row.requested_amount)}</div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation()
                        restoreLoan(row.id)
                      }}
                      disabled={restoringLoanId === row.id}
                      className="whitespace-nowrap"
                    >
                      {restoringLoanId === row.id ? "Restoring..." : "Restore"}
                    </Button>
                  </div>
                </div>
              ))}
              {filteredArchivedLoans.length === 0 && <p className="text-sm text-muted-foreground">No archived loans found.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="setup" className="space-y-4">
          {/* Executive HR Signature Setup Section - Show if no signature OR user is editing */}
          {p?.directorHr && (isSignatureMissing || isEditingSignature) && (
            <Card className="border-amber-200 bg-amber-50 shadow-sm">
              <CardHeader>
                <CardTitle className="text-amber-900">Your Signature for Loan Approvals</CardTitle>
                <CardDescription className="text-amber-800">
                  Save your signature here to approve and send loan memos. You can use typed signature, draw, or upload an image.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-3 rounded-lg bg-white p-3">
                  <button
                    onClick={() => setSignatureMode("typed")}
                    className={`flex-1 rounded px-3 py-2 text-sm font-medium transition-colors ${signatureMode === "typed" ? "bg-amber-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                  >
                    Type
                  </button>
                  <button
                    onClick={() => setSignatureMode("draw")}
                    className={`flex-1 rounded px-3 py-2 text-sm font-medium transition-colors ${signatureMode === "draw" ? "bg-amber-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                  >
                    Draw
                  </button>
                  <button
                    onClick={() => setSignatureMode("upload")}
                    className={`flex-1 rounded px-3 py-2 text-sm font-medium transition-colors ${signatureMode === "upload" ? "bg-amber-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                  >
                    Upload
                  </button>
                </div>

                {signatureMode === "typed" && (
                  <div className="space-y-2">
                    <Label>Enter your full name as signature</Label>
                    <Input
                      value={signatureText}
                      onChange={(e) => setSignatureText(e.target.value)}
                      placeholder="e.g. Frank Fredua"
                      className="text-lg"
                    />
                  </div>
                )}

                {signatureMode === "draw" && (
                  <div className="space-y-2">
                    <Label>Draw your signature below</Label>
                    <SignaturePad value={signatureDataUrl} onChange={setSignatureDataUrl} />
                  </div>
                )}

                {signatureMode === "upload" && (
                  <div className="space-y-2">
                    <Label>Upload signature image</Label>
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          const reader = new FileReader()
                          reader.onload = (event) => {
                            setSignatureDataUrl(event.target?.result as string)
                          }
                          reader.readAsDataURL(file)
                        }
                      }}
                      className="cursor-pointer"
                    />
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    onClick={saveSignatureRegistry}
                    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                    disabled={(!signatureText.trim() && !signatureDataUrl) || isSignatureMissing === false}
                  >
                    Save Signature
                  </Button>
                  {isEditingSignature && (
                    <Button
                      onClick={() => {
                        setIsEditingSignature(false)
                        setSignatureText("")
                        setSignatureDataUrl(null)
                      }}
                      variant="outline"
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Saved Signature Display - Show when signature exists and not editing */}
          {p?.directorHr && !isSignatureMissing && !isEditingSignature && (
            <Card className="border-green-200 bg-green-50 shadow-sm">
              <CardHeader>
                <CardTitle className="text-green-900 flex items-center justify-between">
                  <span>✓ Your Signature is Saved</span>
                </CardTitle>
                <CardDescription className="text-green-800">
                  Your signature is ready to use for loan approvals and document signing.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() => setIsEditingSignature(true)}
                  variant="outline"
                  className="border-green-600 text-green-700 hover:bg-green-100"
                >
                  Change Signature
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Setup & Linkage Studio */}
          <Card className="border-0 bg-gradient-to-br from-slate-950 via-emerald-950 to-slate-900 text-white shadow-lg">
            <CardHeader>
              <CardTitle className="text-2xl">Setup & Linkage Studio</CardTitle>
              <CardDescription className="text-emerald-100">
                Manage loan type rules, staff-to-HOD linkage, bulk mapping, and grade updates in one dedicated workspace.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-200">Loan Types</p>
                  <p className="mt-2 text-2xl font-semibold">{lookupData?.loanTypes?.length || 0}</p>
                  <p className="mt-1 text-sm text-emerald-50/80">Configured welfare products</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-200">HOD Linkages</p>
                  <p className="mt-2 text-2xl font-semibold">{lookupData?.linkages?.length || 0}</p>
                  <p className="mt-1 text-sm text-emerald-50/80">Active staff-to-HOD relationships</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-200">Available Staff</p>
                  <p className="mt-2 text-2xl font-semibold">{lookupData?.staff?.length || 0}</p>
                  <p className="mt-1 text-sm text-emerald-50/80">Ready for linkage and rank updates</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              variant="outline"
              className="border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
              onClick={() => runLookupAction({ action: "auto_link_by_location" }, "Auto-link by location completed")}
              disabled={lookupLoading || !canDirectLinkageUpdate}
            >
              Auto-link Staff to HOD by Location
            </Button>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Loan Type Setup</CardTitle>
                <CardDescription>Maintain fixed amount, cap, and qualification note for each loan type.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <Label>Loan Type</Label>
                    <SearchableSelect
                      value={selectedLoanType}
                      onChange={(v) => {
                        setSelectedLoanType(v)
                        const found = (lookupData?.loanTypes || []).find((t) => t.loan_key === v)
                        setSetupLoanLabel(found?.loan_label || "")
                        setSetupIsActive(found?.is_active ?? true)
                        setSetupFixedAmount(String(found?.fixed_amount || ""))
                        setSetupMaxAmount(String(found?.max_amount || found?.fixed_amount || ""))
                        setSetupQualification(String(found?.min_qualification_note || ""))
                        setSetupLoanTerms(String(found?.loan_terms || ""))
                        setSetupDefaultRecoveryMonths(String(found?.default_recovery_months || ""))
                      }}
                      placeholder="Choose loan type"
                      searchPlaceholder="Search loan type..."
                      options={(lookupData?.loanTypes || []).map((lt) => ({ value: lt.loan_key, label: normalizeLoanTypeLabel(lt, lookupData?.loanTypes || []) }))}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Loan Label</Label>
                    <Input
                      value={setupLoanLabel}
                      onChange={(e) => setSetupLoanLabel(e.target.value)}
                      placeholder="Update loan label"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Active</Label>
                    <div className="flex items-center gap-3">
                      <input
                        id="setup-is-active"
                        type="checkbox"
                        checked={setupIsActive}
                        onChange={(e) => setSetupIsActive(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <label htmlFor="setup-is-active" className="text-sm text-slate-700">
                        Enable this product for new requests
                      </label>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Fixed Amount (GHc)</Label>
                    <Input value={setupFixedAmount} onChange={(e) => setSetupFixedAmount(e.target.value)} type="number" />
                  </div>
                  <div className="space-y-2">
                    <Label>Limit Amount (GHc)</Label>
                    <Input value={setupMaxAmount} onChange={(e) => setSetupMaxAmount(e.target.value)} type="number" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Qualification Note</Label>
                    <Input value={setupQualification} onChange={(e) => setSetupQualification(e.target.value)} placeholder="e.g. Senior and above" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Loan Terms (Default HR Note)</Label>
                    <Textarea
                      value={setupLoanTerms}
                      onChange={(e) => setSetupLoanTerms(e.target.value)}
                      placeholder="e.g. Recovery in equal monthly instalments from salary"
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Default Recovery Months</Label>
                    <Input
                      value={setupDefaultRecoveryMonths}
                      onChange={(e) => setSetupDefaultRecoveryMonths(e.target.value)}
                      type="number"
                      min={1}
                    />
                  </div>
                </div>
                <Button
                  onClick={() => runLookupAction({
                    action: "update_loan_type",
                    loan_key: selectedLoanType,
                    loan_label: setupLoanLabel,
                    is_active: setupIsActive,
                    fixed_amount: Number(setupFixedAmount || 0),
                    max_amount: Number(setupMaxAmount || 0),
                    min_qualification_note: setupQualification,
                    loan_terms: setupLoanTerms,
                    default_recovery_months: Number(setupDefaultRecoveryMonths || 0),
                  }, "Loan type setup saved")}
                  disabled={!selectedLoanType}
                >
                  Save Loan Type Setup
                </Button>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Single Staff HOD Linkage</CardTitle>
                <CardDescription>
                  {canDirectLinkageUpdate
                    ? "Attach one staff member to one or more HOD or regional manager profiles."
                    : "Select a staff member and preferred HOD; your request will be sent to Admin for approval."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Staff for HOD Linkage</Label>
                  <SearchableSelect
                    value={selectedStaffForLink}
                    onChange={setSelectedStaffForLink}
                    placeholder="Select staff"
                    searchPlaceholder="Search staff..."
                    options={filteredStaffCandidates.map((s) => ({
                      value: s.id,
                      label: `${s.first_name} ${s.last_name} (${s.employee_id || "N/A"})`,
                      keywords: `${s.position || ""} ${(s as any)?.departments?.name || ""}`,
                    }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Select One or More HOD / Regional Managers</Label>
                  <div className="max-h-56 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                    {(lookupData?.hods || []).map((h) => {
                      const checked = selectedHodsForLink.includes(h.id)
                      return (
                        <label key={h.id} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm text-slate-800 shadow-sm">
                          <span>{`${h.first_name} ${h.last_name} (${h.role})`}</span>
                          <input type="checkbox" checked={checked} onChange={() => toggleHodSelection(h.id)} />
                        </label>
                      )
                    })}
                  </div>
                </div>
                {!canDirectLinkageUpdate && (
                  <div className="space-y-2">
                    <Label>Reason / Note for Admin (optional)</Label>
                    <Textarea
                      value={linkageRequestNote}
                      onChange={(e) => setLinkageRequestNote(e.target.value)}
                      rows={3}
                      placeholder="Tell Admin why this linkage is needed"
                    />
                  </div>
                )}
                {canDirectLinkageUpdate ? (
                  <Button
                    onClick={() => runLookupAction({ action: "upsert_hod_linkage_batch", staff_user_id: selectedStaffForLink, hod_user_ids: selectedHodsForLink }, "Staff-to-HOD linkages updated")}
                    disabled={!selectedStaffForLink || selectedHodsForLink.length === 0}
                  >
                    Save Staff-HOD Linkages
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={requestLinkageApproval}
                    disabled={!selectedStaffForLink || selectedHodsForLink.length === 0}
                  >
                    Request Linkage Approval
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>

          {isAdmin && (
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Linkage Request Approval Queue</CardTitle>
                <CardDescription>Approve or reject requested staff-to-HOD linkages and keep the full decision history in one queue.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <Select value={linkageRequestStatusFilter} onValueChange={(value: "all" | "pending" | "approved" | "rejected") => setLinkageRequestStatusFilter(value)}>
                    <SelectTrigger className="md:w-[220px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending only</SelectItem>
                      <SelectItem value="approved">Approved only</SelectItem>
                      <SelectItem value="rejected">Rejected only</SelectItem>
                      <SelectItem value="all">All requests</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="text-xs text-muted-foreground">Showing {filteredLinkageRequests.length} linkage request(s)</div>
                </div>

                {filteredLinkageRequests.length === 0 && (
                  <p className="text-sm text-muted-foreground">No linkage requests match the selected status.</p>
                )}

                <div className="grid gap-3 xl:grid-cols-2">
                  {filteredLinkageRequests.map((request) => (
                    <div key={request.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-semibold text-slate-900">{`${request.staff?.full_name || "Staff"} -> ${request.requested_hod?.full_name || "HOD"}`}</div>
                          <div className="text-xs text-muted-foreground">Requested by {request.requester?.full_name || "Unknown requester"} on {fmtDate(request.created_at)}</div>
                        </div>
                        <Badge className={request.request_status === "pending" ? "bg-amber-600 text-white" : request.request_status === "approved" ? "bg-emerald-700 text-white" : "bg-red-700 text-white"}>
                          {request.request_status === "pending" ? "Pending Review" : request.request_status === "approved" ? "Approved" : "Rejected"}
                        </Badge>
                      </div>

                      <div className="mt-3 space-y-1 text-sm">
                        <div><strong>Staff ID:</strong> {request.staff?.employee_id || "N/A"}</div>
                        <div><strong>Requested HOD Role:</strong> {request.requested_hod?.role || request.requested_hod?.position || "N/A"}</div>
                        <div><strong>Requester Note:</strong> {request.request_note || "No note added."}</div>
                        <div><strong>System Message:</strong> {request.message}</div>
                        {request.resolved_at && (
                          <div><strong>Audit Trail:</strong> {request.request_status} by {request.resolved_by?.full_name || "Admin"} on {fmtDate(request.resolved_at)}{request.resolution_note ? ` | Note: ${request.resolution_note}` : ""}</div>
                        )}
                      </div>

                      <div className="mt-3 space-y-2">
                        <Textarea
                          value={linkageResolutionNotes[request.id] || ""}
                          onChange={(e) => setLinkageResolutionNotes((prev) => ({ ...prev, [request.id]: e.target.value }))}
                          rows={2}
                          placeholder={request.request_status === "pending" ? "Optional admin note for approval or rejection" : "Existing resolution note"}
                          disabled={request.request_status !== "pending"}
                        />

                        {request.request_status === "pending" ? (
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" onClick={() => resolveLinkageRequest(request.id, "approve")}>Approve Linkage</Button>
                            <Button size="sm" variant="destructive" onClick={() => resolveLinkageRequest(request.id, "reject")}>Reject Linkage</Button>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">This request is closed and retained here as audit history.</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle>Bulk Staff to HOD Linkage</CardTitle>
                <CardDescription>Filter staff, select many, and assign them to one HOD in a single action.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  <Select value={staffLocationFilter} onValueChange={setStaffLocationFilter}>
                    <SelectTrigger><SelectValue placeholder="Filter by location" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All locations</SelectItem>
                      {staffLocationOptions.map((loc) => (
                        <SelectItem key={`filter-loc-${loc.id}`} value={loc.id}>{loc.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={staffDepartmentFilter} onValueChange={setStaffDepartmentFilter}>
                    <SelectTrigger><SelectValue placeholder="Filter by department" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All departments</SelectItem>
                      {staffDepartmentOptions.map((dept) => (
                        <SelectItem key={`filter-dept-${dept.id}`} value={dept.id}>{dept.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input value={staffSearchFilter} onChange={(e) => setStaffSearchFilter(e.target.value)} placeholder="Search staff" />
                </div>

                <div className="max-h-72 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                  {filteredStaffCandidates.map((staff) => (
                    <label key={`batch-staff-${staff.id}`} className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm text-slate-800 shadow-sm">
                      <span>{`${staff.first_name} ${staff.last_name} (${staff.employee_id || "N/A"})`}</span>
                      <input
                        type="checkbox"
                        checked={selectedStaffsForBatchLink.includes(staff.id)}
                        onChange={() => toggleStaffBatchSelection(staff.id)}
                      />
                    </label>
                  ))}
                  {filteredStaffCandidates.length === 0 && <p className="text-xs text-muted-foreground">No staff match the selected filters.</p>}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedStaffsForBatchLink(filteredStaffCandidates.map((staff) => staff.id))}
                    disabled={filteredStaffCandidates.length === 0}
                  >
                    Select All Filtered Staff
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedStaffsForBatchLink([])}
                    disabled={selectedStaffsForBatchLink.length === 0}
                  >
                    Clear All Selected Staff
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle>Assign One HOD</CardTitle>
                  <CardDescription>Apply one HOD to all selected staff in the filtered list.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Select HOD</Label>
                    <SearchableSelect
                      value={selectedHodForBatchLink}
                      onChange={setSelectedHodForBatchLink}
                      placeholder="Select HOD"
                      searchPlaceholder="Search HOD..."
                      options={(lookupData?.hods || []).map((h) => ({
                        value: h.id,
                        label: `${h.first_name} ${h.last_name} (${h.role})`,
                        keywords: `${h.position || ""}`,
                      }))}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">Selected staff: {selectedStaffsForBatchLink.length}</p>
                  <Button
                    onClick={() => runLookupAction({ action: "upsert_hod_linkage_staff_batch", staff_user_ids: selectedStaffsForBatchLink, hod_user_id: selectedHodForBatchLink }, "Bulk staff-to-HOD linkage updated")}
                    disabled={selectedStaffsForBatchLink.length === 0 || !selectedHodForBatchLink || !canDirectLinkageUpdate}
                  >
                    Link Selected Staff to HOD
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle>Staff Grade Update</CardTitle>
                  <CardDescription>Keep the staff grade levels aligned with loan qualification rules.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Staff Member</Label>
                    <SearchableSelect
                      value={selectedStaffForRank}
                      onChange={setSelectedStaffForRank}
                      placeholder="Select staff"
                      searchPlaceholder="Search staff..."
                      options={(lookupData?.staff || []).map((s) => ({
                        value: s.id,
                        label: `${s.first_name} ${s.last_name} (${s.position || "N/A"})`,
                        keywords: `${s.employee_id || ""}`,
                      }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Rank Level</Label>
                    <Select value={selectedRankLevel} onValueChange={(v: "junior" | "senior" | "manager") => setSelectedRankLevel(v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="junior">Junior</SelectItem>
                        <SelectItem value="senior">Senior</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={() => runLookupAction({ action: "update_staff_rank", staff_user_id: selectedStaffForRank, rank_level: selectedRankLevel }, "Staff rank updated")}
                    disabled={!selectedStaffForRank || !canDirectLinkageUpdate}
                  >
                    Update Staff Rank
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle>Current Linkage Data</CardTitle>
              <CardDescription>Review the active staff-to-HOD mapping records currently available in the system. {filteredLinkageRows.length > 0 && <span className="ml-1 font-medium text-slate-600">({filteredLinkageRows.length} record{filteredLinkageRows.length !== 1 ? "s" : ""})</span>}</CardDescription>
            </CardHeader>
            <CardContent>
              {/* Search + Filters */}
              <div className="mb-4 space-y-3">
                <Input
                  value={linkageSearch}
                  onChange={(e) => { setLinkageSearch(e.target.value); setLinkagePage(1) }}
                  placeholder="Search by staff name, employee ID, HOD, rank, location, or district"
                />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Select value={linkageLocationFilter} onValueChange={(v) => { setLinkageLocationFilter(v); setLinkagePage(1) }}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="All Locations" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Locations</SelectItem>
                      {linkageLocationOptions.map((loc) => (
                        <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={linkageDepartmentFilter} onValueChange={(v) => { setLinkageDepartmentFilter(v); setLinkagePage(1) }}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="All Departments" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Departments</SelectItem>
                      {linkageDeptOptions.map((dept) => (
                        <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={linkageRankFilter} onValueChange={(v) => { setLinkageRankFilter(v); setLinkagePage(1) }}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="All Ranks" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Ranks</SelectItem>
                      {linkageRankOptions.map((rank) => (
                        <SelectItem key={rank} value={rank}>{rank}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {(linkageSearch || linkageLocationFilter !== "all" || linkageDepartmentFilter !== "all" || linkageRankFilter !== "all") && (
                  <button
                    className="text-xs text-blue-600 hover:underline"
                    onClick={() => { setLinkageSearch(""); setLinkageLocationFilter("all"); setLinkageDepartmentFilter("all"); setLinkageRankFilter("all"); setLinkagePage(1) }}
                  >
                    Clear all filters
                  </button>
                )}
              </div>

              {/* Cards Grid */}
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {paginatedLinkageRows.map((link) => {
                  const staff = (lookupData?.staff || []).find((s) => s.id === link.staff_user_id)
                  const hod = (lookupData?.hods || []).find((h) => h.id === link.hod_user_id)
                  return (
                    <div key={link.id} className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-900 shadow-sm hover:border-slate-300 transition-colors">
                      <div className="flex items-start justify-between gap-1 mb-2">
                        <div>
                          <p className="font-semibold text-sm text-slate-900">{staff ? `${staff.first_name} ${staff.last_name}` : link.staff_user_id}</p>
                          <p className="text-slate-500">{staff?.employee_id || "No ID"} · <span className="capitalize">{staff?.position || "N/A"}</span></p>
                        </div>
                        {staff?.position && (
                          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 capitalize">{staff.position}</span>
                        )}
                      </div>
                      <div className="mt-1 space-y-0.5 border-t border-slate-100 pt-2">
                        <div><strong>HOD:</strong> {hod ? `${hod.first_name} ${hod.last_name}` : link.hod_user_id} <span className="text-slate-400">({hod?.position || "N/A"})</span></div>
                        <div><strong>Location:</strong> {staff?.geofence_locations?.name || "N/A"}</div>
                        <div><strong>District:</strong> {staff?.geofence_locations?.districts?.name || "N/A"}</div>
                        <div><strong>Address:</strong> {staff?.geofence_locations?.address || "N/A"}</div>
                        {(staff as any)?.departments?.name && <div><strong>Dept:</strong> {(staff as any).departments.name}</div>}
                      </div>
                      {canDirectLinkageUpdate && (
                        <div className="mt-3">
                          <Button size="sm" variant="outline" onClick={() => editLinkageFromCard(link.staff_user_id, link.hod_user_id)}>
                            Edit This Linkage
                          </Button>
                        </div>
                      )}
                    </div>
                  )
                })}
                {filteredLinkageRows.length === 0 && (
                  <p className="col-span-3 text-sm text-muted-foreground py-8 text-center">No staff-to-HOD linkages match your filters.</p>
                )}
              </div>

              {/* Pagination */}
              {linkageTotalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-xs text-slate-500">
                    Showing {((linkagePage - 1) * LINKAGE_PAGE_SIZE) + 1}–{Math.min(linkagePage * LINKAGE_PAGE_SIZE, filteredLinkageRows.length)} of {filteredLinkageRows.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" disabled={linkagePage <= 1} onClick={() => setLinkagePage((p) => p - 1)} className="h-7 text-xs px-3">Prev</Button>
                    <span className="text-xs text-slate-600">Page {linkagePage} of {linkageTotalPages}</span>
                    <Button size="sm" variant="outline" disabled={linkagePage >= linkageTotalPages} onClick={() => setLinkagePage((p) => p + 1)} className="h-7 text-xs px-3">Next</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      {/* ── Action Modal ──────────────────────��─────────────────────── */}
      <Dialog open={actionModal.open} onOpenChange={(o) => setActionModal((s) => ({ ...s, open: o }))}>
        <DialogContent className={actionModal.actionType === "accounts" ? "max-w-2xl" : "max-w-lg"}>
          <DialogHeader>
            <DialogTitle>
              {actionModal.actionType === "hod" && "HOD Review & Decision"}
              {actionModal.actionType === "loan_office" && "Loan Office Review & Forward"}
              {actionModal.actionType === "accounts" && "Set FD Score"}
              {actionModal.actionType === "committee" && "Employee Further Information"}
              {actionModal.actionType === "hr_terms" && "Set HR Terms & Forward to Executive HR"}
              {actionModal.actionType === "payment_completed" && "Mark Loan Payment Completed"}
              {actionModal.actionType === "push_to_hr_executive" && "Push Approved FD to HR Executive for Signing"}
            </DialogTitle>
            {actionModal.row && (
              <DialogDescription>
                <span className="font-semibold">{actionModal.row.request_number}</span> — {actionModal.row.loan_type_label} | {actionModal.row.staff_full_name || actionModal.row.staff_number || "Staff"}
                {actionModal.row.staff_rank ? ` | ${actionModal.row.staff_rank}` : ""}
                {" | GHc "}{fmtAmount(actionModal.row.fixed_amount || actionModal.row.requested_amount)}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="space-y-2 py-1 max-h-[70vh] overflow-y-auto">
            {/* HOD */}
            {actionModal.actionType === "hod" && (
              <>
                <Label className="text-sm">Decision</Label>
                <Select value={modalDecision} onValueChange={(v: "approve" | "reject") => setModalDecision(v)}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approve">Endorse</SelectItem>
                    <SelectItem value="reject">Reject</SelectItem>
                  </SelectContent>
                </Select>
                <Label className="text-sm">Note (optional)</Label>
                <Textarea value={modalNote} onChange={(e) => setModalNote(e.target.value)} placeholder="Share your thoughts (what you think about this request)" rows={2} className="text-xs" />
              </>
            )}
            {/* Loan Office */}
            {actionModal.actionType === "loan_office" && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Staff Name</Label>
                    <Input value={modalStaffFullName} onChange={(e) => setModalStaffFullName(e.target.value)} placeholder="Enter staff's full name" className="h-7 text-xs" />
                  </div>
                  <div>
                    <Label className="text-xs">Staff Number</Label>
                    <Input value={modalStaffNumber} onChange={(e) => setModalStaffNumber(e.target.value)} placeholder="e.g. QCC/HR/001" className="h-7 text-xs" />
                  </div>
                  <div>
                    <Label className="text-xs">Staff Rank</Label>
                    <Input value={modalStaffRank} onChange={(e) => setModalStaffRank(e.target.value)} placeholder="e.g. Manager or Officer" className="h-7 text-xs" />
                  </div>
                  <div>
                    <Label className="text-xs">Corporate Email</Label>
                    <Input value={modalCorporateEmail} onChange={(e) => setModalCorporateEmail(e.target.value)} placeholder="staff@company.com" className="h-7 text-xs" />
                  </div>
                </div>
                <Label className="text-xs">Reference Number</Label>
                <Input value={modalReferenceNumber} onChange={(e) => setModalReferenceNumber(e.target.value)} placeholder="e.g. QCC/HR/SWL/V2/001" className="h-7 text-xs" />
                <Label className="text-xs">THRO (Your Boss / Manager)</Label>
                <Select value={modalHodReviewerId} onValueChange={setModalHodReviewerId}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Choose your boss" /></SelectTrigger>
                  <SelectContent>
                    {(lookupData?.hods || []).map((h) => (
                      <SelectItem key={h.id} value={h.id}>{[h.first_name, h.last_name].filter(Boolean).join(" ") || h.email} {h.position ? `(${h.position})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">THRO Rank</Label>
                    <Input value={modalHodRank} onChange={(e) => setModalHodRank(e.target.value)} placeholder="e.g. Manager or Director" className="h-7 text-xs" />
                  </div>
                  <div>
                    <Label className="text-xs">THRO Location</Label>
                    <Input value={modalHodLocation} onChange={(e) => setModalHodLocation(e.target.value)} placeholder="e.g. Accra or Head Office" className="h-7 text-xs" />
                  </div>
                </div>
                <Label className="text-xs">Assigned Director /Manager HR Approver</Label>
                <Select value={modalDirectorApproverId} onValueChange={setModalDirectorApproverId}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select assigned approver" /></SelectTrigger>
                  <SelectContent>
                    {(data?.directorApprovers || []).map((approver) => (
                      <SelectItem key={approver.id} value={approver.id}>{approver.full_name} {approver.position ? `(${approver.position})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Label className="text-xs">Note (optional)</Label>
                <Textarea value={modalNote} onChange={(e) => setModalNote(e.target.value)} placeholder="Any comments you have (keep it short and simple)" rows={2} className="text-xs" />
                <Label className="text-xs">Memo CC Recipients (one per line)</Label>
                <Textarea value={modalMemoCC} onChange={(e) => setModalMemoCC(e.target.value)} placeholder="Managing Director&#10;Deputy Director Finance" rows={2} className="text-xs" />
              </>
            )}
            {/* Accounts FD — simple form, full calculation done in Accounts Loan Office */}
            {actionModal.actionType === "accounts" && actionModal.row && (
              <>
                <div className="rounded-md border bg-blue-50 p-3">
                  <p className="text-xs text-blue-800">
                    <strong>Note:</strong> FD calculations with outstanding loans are handled by the Accounts Loan Office. 
                    This form is for reference only if already calculated.
                  </p>
                </div>

                <Label className="text-xs">FD Score (Mark out of 100)</Label>
                <Input type="number" min={0} max={100} value={modalFdScore} onChange={(e) => setModalFdScore(e.target.value)} placeholder="e.g. 75" className="h-7 text-xs" />

                <Label className="text-xs">HR Loan Office Remarks (optional)</Label>
                <Textarea value={modalFdNote} onChange={(e) => setModalFdNote(e.target.value)} placeholder="Any observations or remarks..." rows={2} className="text-xs" />
              </>
            )}
            {/* Committee - Further Information */}
            {actionModal.actionType === "committee" && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Employee Name</Label>
                    <div className="flex items-center gap-2 p-1 bg-muted rounded text-xs">{actionModal.row?.staff_full_name || "—"}</div>
                  </div>
                  <div>
                    <Label className="text-xs">Staff Number</Label>
                    <div className="flex items-center gap-2 p-1 bg-muted rounded text-xs">{actionModal.row?.staff_number || "—"}</div>
                  </div>
                  <div>
                    <Label className="text-xs">Length of Service (Years)</Label>
                    <Input type="number" value={modalLengthOfService} onChange={(e) => setModalLengthOfService(e.target.value)} placeholder="e.g. 5" min="0" step="0.5" className="h-7 text-xs" />
                  </div>
                  <div>
                    <Label className="text-xs">Last Car Loan Date</Label>
                    <Input type="date" value={modalLastCarLoanDate} onChange={(e) => setModalLastCarLoanDate(e.target.value)} className="h-7 text-xs" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="never_car_loan" checked={modalNeverHadCarLoan} onCheckedChange={(checked) => setModalNeverHadCarLoan(checked === true)} />
                  <Label htmlFor="never_car_loan" className="font-normal cursor-pointer text-xs">Never had a car loan</Label>
                </div>
                <Label className="text-xs">Additional Employee Information</Label>
                <Textarea value={modalAdditionalInfo} onChange={(e) => setModalAdditionalInfo(e.target.value)} placeholder="Add any relevant employment history, loan history, or service information..." rows={2} className="text-xs" />
              </>
            )}
            {/* HR Terms */}
            {actionModal.actionType === "hr_terms" && (
              <>
                {/* FD approval summary from the Account Executive (read-only) */}
                {actionModal.row && actionModal.row.fd_score != null && (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-emerald-900">FD Approval — from Account Executive</span>
                      <Badge className={actionModal.row.fd_good ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}>
                        {actionModal.row.fd_good ? "Good Standing" : "Below Threshold"}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-700">
                      <div>FD Score: <strong className="text-slate-900">{actionModal.row.fd_score}</strong> / 100</div>
                      <div>Reviewed by: <strong className="text-slate-900">{actionModal.row.accounts_reviewer_name || "—"}</strong></div>
                      {actionModal.row.fd_checked_at && (
                        <div className="col-span-2">Reviewed on: <strong className="text-slate-900">{new Date(actionModal.row.fd_checked_at).toLocaleDateString()}</strong></div>
                      )}
                    </div>
                    {actionModal.row.fd_note && (
                      <div className="text-xs text-slate-700 pt-1 border-t border-emerald-200">
                        <span className="font-medium">Account Executive&apos;s comments:</span>
                        <p className="mt-0.5 whitespace-pre-wrap text-slate-800">{actionModal.row.fd_note}</p>
                      </div>
                    )}
                    {actionModal.row.fd_document_url && (
                      <a
                        href={actionModal.row.fd_document_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-900 underline pt-1"
                      >
                        View FD supporting document
                      </a>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Disbursement Date</Label>
                    <Input type="month" value={modalDisbursement} onChange={(e) => setModalDisbursement(e.target.value)} className="h-7 text-xs" />
                  </div>
                  <div>
                    <Label className="text-xs">Recovery Start Date</Label>
                    <Input type="month" value={modalRecovery} onChange={(e) => setModalRecovery(e.target.value)} className="h-7 text-xs" />
                  </div>
                  <div>
                    <Label className="text-xs">Recovery Months</Label>
                    <Input type="number" value={modalMonths} onChange={(e) => setModalMonths(e.target.value)} placeholder="e.g. 24" className="h-7 text-xs" />
                  </div>
                  <div>
                    <Label className="text-xs">Memo Reference</Label>
                    <Input value={modalMemoRef} onChange={(e) => setModalMemoRef(e.target.value)} placeholder="e.g. QCC/HR/001/2024" className="h-7 text-xs" />
                  </div>
                </div>
                <Label className="text-xs">Memo CC Recipients (one per line)</Label>
                <Textarea value={modalMemoCC} onChange={(e) => setModalMemoCC(e.target.value)} placeholder="Managing Director&#10;Deputy Director Finance" rows={2} className="text-xs" />
                <Label className="text-xs">Your Boss's Rank / Title</Label>
                <Input value={modalHodRank} onChange={(e) => setModalHodRank(e.target.value)} placeholder="e.g. Manager or Regional Manager" className="h-7 text-xs" />
                <Label className="text-xs">Where Your Boss Works</Label>
                <Input value={modalHodLocation} onChange={(e) => setModalHodLocation(e.target.value)} placeholder="e.g. Accra Head Office or Tema Branch" className="h-7 text-xs" />
                <Label className="text-xs">Assigned Director /Manager HR Approver</Label>
                <Select value={modalDirectorApproverId} onValueChange={setModalDirectorApproverId}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Choose who will approve this" /></SelectTrigger>
                  <SelectContent>
                    {(data?.directorApprovers || []).map((approver) => (
                      <SelectItem key={approver.id} value={approver.id}>{approver.full_name} {approver.position ? `(${approver.position})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Label>Payment Officer (Who will give the money)</Label>
                <Select value={modalMemoRecipient} onValueChange={setModalMemoRecipient}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Deputy Director, Finance">Deputy Director, Finance (Head of Finance)</SelectItem>
                    <SelectItem value="Accounts Manager">Accounts Manager (Finance Team)</SelectItem>
                  </SelectContent>
                </Select>
                <Label>Any Comments from HR? (optional)</Label>
                <Textarea value={modalNote} onChange={(e) => setModalNote(e.target.value)} placeholder="Add any notes here (be brief)" rows={2} />
              </>
            )}
          </div>

          <DialogFooter className="gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setActionModal((s) => ({ ...s, open: false }))}>Cancel</Button>
            {actionModal.actionType === "hod" && actionModal.row && (
              <>
                <Button variant={modalDecision === "reject" ? "destructive" : "default"} onClick={() => {
                  runAction({ action: "hod_decision", id: actionModal.row!.id, decision: modalDecision, note: modalNote || null })
                  setActionModal((s) => ({ ...s, open: false }))
                }}>
                  {modalDecision === "approve" ? "Endorse" : "Reject"}
                </Button>
              </>
            )}
            {actionModal.actionType === "loan_office" && actionModal.row && (
              <>
                <Button variant="outline" onClick={() => {
                  const noteForSave = buildHrNoteWithThroTelephone(modalNote, modalHodTelephone, modalHodName, modalHodRank, modalHodLocation)
                  runAction({
                    action: "loan_office_update_request",
                    id: actionModal.row!.id,
                    note: noteForSave || null,
                    staff_full_name: modalStaffFullName || null,
                    staff_number: modalStaffNumber || null,
                    staff_rank: modalStaffRank || null,
                    corporate_email: modalCorporateEmail || null,
                    reference_number: modalReferenceNumber || null,
                    hod_name: modalHodName || null,
                    hod_rank: modalHodRank || null,
                    hod_location: modalHodLocation || null,
                    hod_reviewer_id: modalHodReviewerId || null,
                    director_approver_id: modalDirectorApproverId || null,
                  })
                  setActionModal((s) => ({ ...s, open: false }))
                }}>Save Edits</Button>
                <Button onClick={() => {
                  const noteForSave = buildHrNoteWithThroTelephone(modalNote, modalHodTelephone, modalHodName, modalHodRank, modalHodLocation)
                  runAction({
                    action: "loan_office_forward",
                    id: actionModal.row!.id,
                    note: noteForSave || null,
                    staff_full_name: modalStaffFullName || null,
                    staff_number: modalStaffNumber || null,
                    staff_rank: modalStaffRank || null,
                    corporate_email: modalCorporateEmail || null,
                    reference_number: modalReferenceNumber || null,
                    hod_name: modalHodName || null,
                    hod_rank: modalHodRank || null,
                    hod_location: modalHodLocation || null,
                    hod_reviewer_id: modalHodReviewerId || null,
                    director_approver_id: modalDirectorApproverId || null,
                    memo_cc: modalMemoCC || null,
                  })
                  setActionModal((s) => ({ ...s, open: false }))
                }}>Save &amp; Forward to Accounts</Button>
              </>
            )}
            {actionModal.actionType === "accounts" && actionModal.row && (
              <Button
                disabled={!modalFdScore}
                onClick={async () => {
                  if (!modalFdScore) {
                    toast({ title: "Enter FD Score", description: "Please enter an FD score before saving.", variant: "destructive" })
                    return
                  }
                  await runAction({
                    action: "accounts_fd_update",
                    id: actionModal.row!.id,
                    fd_score: Number(modalFdScore),
                    note: modalFdNote || null,
                    fd_document_url: null,
                  })
                  setActionModal((s) => ({ ...s, open: false }))
                }}>
                Save FD Score
              </Button>
            )}
            {actionModal.actionType === "committee" && actionModal.row && (
              <Button variant="outline" onClick={() => setActionModal((s) => ({ ...s, open: false }))}>Close</Button>
            )}
            {actionModal.actionType === "hr_terms" && actionModal.row && (
              <>
                <Button variant="outline" onClick={() => {
                  setMemoReviewModal({ open: true, row: { ...actionModal.row!, recovery_start_date: modalRecovery, disbursement_date: modalDisbursement, recovery_months: Number(modalMonths) || null, hod_name: modalHodName, hod_rank: modalHodRank, hod_location: modalHodLocation } })
                  const draft = buildDirectorAutoMemoDraft(
                    { ...actionModal.row!, recovery_start_date: modalRecovery, disbursement_date: modalDisbursement, recovery_months: Number(modalMonths) || null },
                    { hodName: modalHodName, hodRank: modalHodRank, hodLocation: modalHodLocation, hodTelephone: modalHodTelephone, memoRef: modalMemoRef, memoRecipient: modalMemoRecipient },
                    data?.profile.currentHodProfile,
                  )
                  setModalMemoText(draft)
                }}>Preview Memo</Button>
                <Button onClick={() => {
                  const noteForSave = buildHrNoteWithThroTelephone(modalNote, modalHodTelephone, modalHodName, modalHodRank, modalHodLocation, modalMemoRecipient)
                  setHrInputs((s) => ({
                    ...s,
                    [actionModal.row!.id]: {
                      disbursement: modalDisbursement,
                      recovery: modalRecovery,
                      months: modalMonths,
                      note: noteForSave,
                      hodName: modalHodName,
                      hodRank: modalHodRank,
                      hodLocation: modalHodLocation,
                      hodTelephone: modalHodTelephone,
                      memoRef: modalMemoRef,
                      memoRecipient: modalMemoRecipient,
                    },
                  }))
                  runAction({
                    action: "hr_set_terms",
                    id: actionModal.row!.id,
                    disbursement_date: convertMonthToDate(modalDisbursement),
                    recovery_start_date: convertMonthToDate(modalRecovery),
                    recovery_months: Number(modalMonths || 0),
                    reference_number: modalMemoRef || null,
                    hod_name: modalHodName || null,
                    hod_rank: modalHodRank || null,
                    hod_location: modalHodLocation || null,
                    director_approver_id: modalDirectorApproverId || null,
                    note: noteForSave || null,
                    memo_cc: modalMemoCC || null,
                  })
                  setActionModal((s) => ({ ...s, open: false }))
                }}>Set Terms &amp; Forward to Executive HR</Button>
              </>
            )}
            {actionModal.actionType === "payment_completed" && actionModal.row && (
              <Button 
                className="bg-blue-600 hover:bg-blue-700" 
                onClick={() => {
                  setPaymentEvidenceModal((s) => ({ ...s, open: true }))
                  setActionModal((s) => ({ ...s, open: false }))
                }}
              >
                Submit Payment Evidence
              </Button>
            )}
            {actionModal.actionType === "push_to_hr_executive" && actionModal.row && (
              <Button 
                className="bg-blue-600 hover:bg-blue-700"
                disabled={!modalNote || !modalDisbursement || !modalRecovery || !modalMemoRef}
                onClick={async () => {
                  if (!modalNote || !modalDisbursement || !modalRecovery || !modalMemoRef || !modalAccountSignatory || !modalHrSignatory) {
                    toast({ title: "Missing Required Fields", description: "Please fill in all required fields including signatories before pushing to HR Executive.", variant: "destructive" })
                    return
                  }
                  await runAction({
                    action: "push_to_hr_executive",
                    id: actionModal.row!.id,
                    hr_loan_office_memo: modalNote,
                    disbursement_date: modalDisbursement,
                    recovery_start_date: modalRecovery,
                    reference_number: modalMemoRef,
                    memo_recipient: modalAccountSignatory,
                    memo_cc: modalCcRecipients,
                    accounts_signatory: modalAccountSignatory,
                    hr_executive_signatory: modalHrSignatory,
                  })
                  setActionModal((s) => ({ ...s, open: false }))
                }}
              >
                Push to HR Executive
              </Button>
            )}
            {/* Push to HR Executive */}
            {actionModal.actionType === "push_to_hr_executive" && (
              <>
                <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-3">
                  <p className="text-xs text-blue-900">
                    This approved FD loan will be forwarded to HR Executive for review, signing, and approval. After HR Executive signs, it will appear on the MD's dashboard for final authorization.
                  </p>
                </div>

                {/* FD approval summary from the Account Executive (read-only) */}
                {actionModal.row && actionModal.row.fd_score != null && (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 mb-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-emerald-900">FD Approval — from Account Executive</span>
                      <Badge className={actionModal.row.fd_good ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}>
                        {actionModal.row.fd_good ? "Good Standing" : "Below Threshold"}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs text-slate-700 mt-2">
                      <div>FD Score: <strong>{actionModal.row.fd_score}/100</strong></div>
                      <div>Reviewed: <strong>{actionModal.row.accounts_reviewer_name || "—"}</strong></div>
                      {actionModal.row.fd_checked_at && (
                        <div><strong>{new Date(actionModal.row.fd_checked_at).toLocaleDateString()}</strong></div>
                      )}
                    </div>
                    {actionModal.row.fd_note && (
                      <details className="mt-2 text-xs">
                        <summary className="font-medium text-emerald-700 cursor-pointer hover:text-emerald-900">View comments & details</summary>
                        <div className="mt-1 whitespace-pre-wrap text-slate-800 text-xs bg-white p-2 rounded border border-emerald-100 max-h-40 overflow-y-auto">{actionModal.row.fd_note}</div>
                      </details>
                    )}
                    {actionModal.row.fd_document_url && (
                      <a
                        href={actionModal.row.fd_document_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-900 underline mt-2"
                      >
                        📎 FD Document
                      </a>
                    )}
                  </div>
                )}

                <Label className="text-sm font-semibold">Processing Memo *</Label>
                <Textarea 
                  value={modalNote} 
                  onChange={(e) => setModalNote(e.target.value)} 
                  placeholder="Add any processing notes or requirements for HR Executive review (e.g., special conditions, disbursement instructions)..." 
                  rows={3} 
                  className="text-xs"
                />
                <Label className="text-sm font-semibold">Disbursement Date *</Label>
                <Input 
                  type="date"
                  value={modalDisbursement} 
                  onChange={(e) => setModalDisbursement(e.target.value)} 
                  className="h-8 text-xs"
                />
                <Label className="text-sm font-semibold">Recovery Start Date *</Label>
                <Input 
                  type="date"
                  value={modalRecovery} 
                  onChange={(e) => setModalRecovery(e.target.value)} 
                  className="h-8 text-xs"
                />
                <Label className="text-sm font-semibold">Reference Number *</Label>
                <Input 
                  value={modalMemoRef} 
                  onChange={(e) => setModalMemoRef(e.target.value)} 
                  placeholder="e.g. QCC/HR/LOAN/2024/001" 
                  className="h-8 text-xs"
                />

                <div className="border-t border-slate-200 pt-4 mt-4">
                  <Label className="text-sm font-semibold mb-3 block">Memo CC Recipients</Label>
                  <Textarea 
                    value={modalCcRecipients} 
                    onChange={(e) => setModalCcRecipients(e.target.value)} 
                    placeholder="Names and titles of CC recipients (one per line)" 
                    rows={3} 
                    className="text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-semibold">Account Executive Signatory *</Label>
                    <Select value={modalAccountSignatory} onValueChange={setModalAccountSignatory}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select signatory" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Accounts Manager">Accounts Manager</SelectItem>
                        <SelectItem value="Deputy Director Finance">Deputy Director Finance</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm font-semibold">HR Executive Signatory *</Label>
                    <Select value={modalHrSignatory} onValueChange={setModalHrSignatory}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select HR Executive" />
                      </SelectTrigger>
                      <SelectContent>
                        {data?.hrExecutives?.map((exec: any) => (
                          <SelectItem key={exec.id} value={`${exec.position || "HR Executive"} — ${exec.full_name}`}>
                            {exec.position || "HR Executive"} — {exec.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Memo Review Modal (Director HR + HR Terms Preview) ──────── */}
      <Dialog open={memoReviewModal.open} onOpenChange={(o) => setMemoReviewModal((s) => ({ ...s, open: o }))}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Memo Review — Executive HR Final Approval</DialogTitle>
            <DialogDescription>
              Review and edit the memo below before signing and approving. This letter will be sent to the staff member, Accounts, and Loan Office upon approval.
            </DialogDescription>
          </DialogHeader>

          {/* Warning banner for missing signature */}
          {isSignatureMissing && p?.directorHr && (
            <div className="mb-4 rounded-lg border-l-4 border-amber-500 bg-amber-50 p-4">
              <div className="flex gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-amber-900">Signature Setup Required</h4>
                  <p className="text-sm text-amber-800 mt-1">You haven&apos;t saved your signature yet. You&apos;ll need to save your signature before you can approve loan requests.</p>
                  <Button size="sm" variant="outline" className="mt-3 text-amber-700 border-amber-300 hover:bg-amber-100" onClick={() => {
                    setMemoReviewModal((s) => ({ ...s, open: false }))
                    setActiveTab("setup")
                  }}>
                    Go to Setup & Linkage
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Styled letterhead preview */}
          <div className="mx-auto w-full max-w-[794px] border border-slate-200 bg-white px-10 py-8 shadow-sm print:border-0 print:shadow-none" id="memo-preview-content">
            <div className="relative min-h-[88px] border-b border-slate-300 pb-4">
              <img src="/images/qcc-logo.png" alt="QCC logo" className="absolute left-0 top-3 h-14 w-14 object-contain" draggable={false} />
              <div className="text-center font-serif">
                <div className="text-[18px] font-bold uppercase tracking-[0.02em] text-green-800">QUALITY CONTROL COMPANY LTD.</div>
                <div className="text-[18px] font-bold uppercase tracking-[0.02em] text-green-800">(COCOBOD)</div>
              </div>
              <div className="absolute right-0 top-4 text-right font-serif text-[10px] italic text-slate-700">
                <div>P.O Box M14</div>
                <div>Accra Ghana</div>
              </div>
            </div>
            <Textarea
              value={modalMemoText}
              onChange={(e) => setModalMemoText(e.target.value)}
              rows={28}
              className="mt-6 min-h-[720px] w-full resize-y border-0 p-0 font-serif text-[13px] leading-7 shadow-none focus-visible:ring-0"
              placeholder="Memo text will appear here..."
            />
            {(modalSignatureMode === "typed" && modalSignatureText) && (
              <div className="mt-4 font-serif">
                <div className="w-52 border-b border-slate-400 pb-1 text-lg font-bold italic">{modalSignatureText}</div>
                <div className="mt-2 text-[13px] font-semibold">DEPUTY DIRECTOR HUMAN RESOURCE</div>
                <div className="text-[13px] font-semibold">FOR: MANAGING DIRECTOR</div>
              </div>
            )}
            {(modalSignatureMode !== "typed" && modalSignatureDataUrl) && (
              <div className="mt-4 font-serif">
                <img src={modalSignatureDataUrl} alt="Director signature" className="max-h-20 border-b border-slate-400 pb-1" draggable={false} />
                <div className="mt-2 text-[13px] font-semibold">DEPUTY DIRECTOR HUMAN RESOURCE</div>
                <div className="text-[13px] font-semibold">FOR: MANAGING DIRECTOR</div>
              </div>
            )}
          </div>

          {/* Signature & Decision Setup — Modern Card Layout */}
          {memoReviewModal.row && (
            <div className="space-y-6 border-t border-slate-200 pt-6">
              {/* Signature Section */}
              <div className="rounded-lg border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white text-sm font-bold">1</div>
                  <Label className="text-base font-semibold text-slate-900">Your Signature</Label>
                </div>
                <p className="text-sm text-slate-600 mb-4">Select how you'd like to sign this approval</p>
                <Select value={modalSignatureMode} onValueChange={(v: "typed" | "draw" | "upload") => setModalSignatureMode(v)}>
                  <SelectTrigger className="border-slate-300 bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="typed">Type your name</SelectItem>
                    <SelectItem value="draw">Draw your signature</SelectItem>
                    <SelectItem value="upload">Upload signature image</SelectItem>
                  </SelectContent>
                </Select>
                <div className="mt-4 space-y-3">
                  {modalSignatureMode === "typed" && (
                    <Input 
                      value={modalSignatureText} 
                      onChange={(e) => setModalSignatureText(e.target.value)} 
                      placeholder="Your full name (e.g. OHENEBA BOAMAH)"
                      className="border-slate-300"
                    />
                  )}
                  {modalSignatureMode === "upload" && (
                    <div className="rounded-lg border-2 border-dashed border-slate-300 p-4 hover:border-slate-400 transition-colors">
                      <Input 
                        type="file" 
                        accept="image/png,image/jpeg,image/webp" 
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          const reader = new FileReader()
                          reader.onload = (ev) => setModalSignatureDataUrl(ev.target?.result as string)
                          reader.readAsDataURL(file)
                        }}
                        className="cursor-pointer"
                      />
                      <p className="text-xs text-slate-500 mt-2">PNG, JPEG, or WebP (max 5MB)</p>
                    </div>
                  )}
                  {modalSignatureMode === "draw" && (
                    <div className="rounded-lg border border-slate-300 overflow-hidden bg-white">
                      <SignaturePad value={modalSignatureDataUrl} onChange={setModalSignatureDataUrl} />
                    </div>
                  )}
                </div>
              </div>

              {/* Decision Section */}
              <div className="rounded-lg border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white text-sm font-bold">2</div>
                  <Label className="text-base font-semibold text-slate-900">Final Decision</Label>
                </div>
                <p className="text-sm text-slate-600 mb-4">Choose to approve or reject this loan request</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setModalDecision("approve")}
                    className={`relative p-4 rounded-lg border-2 transition-all ${
                      modalDecision === "approve"
                        ? "border-green-500 bg-green-50 shadow-lg"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <CheckCircle2 className={`h-5 w-5 ${modalDecision === "approve" ? "text-green-600" : "text-slate-400"}`} />
                      <span className={`font-semibold ${modalDecision === "approve" ? "text-green-700" : "text-slate-700"}`}>Approve</span>
                    </div>
                    <p className={`text-xs ${modalDecision === "approve" ? "text-green-600" : "text-slate-500"}`}>Grant the loan request</p>
                  </button>
                  <button
                    onClick={() => setModalDecision("reject")}
                    className={`relative p-4 rounded-lg border-2 transition-all ${
                      modalDecision === "reject"
                        ? "border-red-500 bg-red-50 shadow-lg"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <XCircle className={`h-5 w-5 ${modalDecision === "reject" ? "text-red-600" : "text-slate-400"}`} />
                      <span className={`font-semibold ${modalDecision === "reject" ? "text-red-700" : "text-slate-700"}`}>Reject</span>
                    </div>
                    <p className={`text-xs ${modalDecision === "reject" ? "text-red-600" : "text-slate-500"}`}>Deny the request</p>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modern Footer with Clear Action Hierarchy */}
          <DialogFooter className="gap-2 flex-wrap border-t border-slate-200 pt-6">
            <div className="flex gap-2 flex-1 flex-wrap">
              <Button 
                variant="outline" 
                onClick={() => setMemoReviewModal((s) => ({ ...s, open: false }))}
                className="border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </Button>
              {memoReviewModal.row && (
                <Button 
                  variant="outline"
                  onClick={() => {
                    if (memoReviewModal.row) void generateMemoPdf(memoReviewModal.row, modalMemoText, modalSignatureText)
                  }}
                  className="border-slate-300 text-slate-700 hover:bg-slate-50 gap-2"
                >
                  <Download className="h-4 w-4" /> Download PDF
                </Button>
              )}
              {memoReviewModal.row && (
                <Button 
                  variant="outline"
                  onClick={() => saveMemoChanges()}
                  disabled={isSavingMemo}
                  className="border-slate-300 text-slate-700 hover:bg-slate-50 gap-2 flex-1 min-w-fit"
                >
                  {isSavingMemo ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {isSavingMemo ? "Saving..." : "Save Memo Changes"}
                </Button>
              )}
            </div>
            {memoReviewModal.row && (memoReviewModal.row.status === "awaiting_hr_executives" || memoReviewModal.row.status === "awaiting_director_hr") && (
              <Button
                className={`gap-2 font-semibold text-base py-5 px-6 flex-1 min-w-fit ${
                  modalDecision === "approve"
                    ? "bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-lg"
                    : "bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white shadow-lg"
                }`}
                disabled={isSignatureMissing && modalDecision === "approve"}
                title={isSignatureMissing && modalDecision === "approve" ? "Please save your signature in Setup & Linkage before approving" : ""}
                onClick={() => {
                  const sigText = modalSignatureMode === "typed" ? modalSignatureText : null
                  const sigUrl = modalSignatureMode !== "typed" ? modalSignatureDataUrl : null
                  runAction({
                    action: "director_finalize",
                    id: memoReviewModal.row!.id,
                    decision: modalDecision,
                    signature_mode: modalSignatureMode,
                    signature_text: sigText,
                    signature_data_url: sigUrl,
                    director_letter: modalMemoText,
                    note: memoReviewModal.row?.status === "awaiting_hr_executives" ? "HR Executive decision via memo review" : "Director HR final decision via memo review",
                  })
                  setMemoReviewModal((s) => ({ ...s, open: false }))
                }}
              >
                {modalDecision === "approve" ? (
                  <>
                    <CheckCircle2 className="h-5 w-5" />
                    Approve & Send Letter
                  </>
                ) : (
                  <>
                    <XCircle className="h-5 w-5" />
                    Reject Request
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Payment Evidence Upload Modal ────────────────────────────── */}
      <Dialog open={paymentEvidenceModal.open} onOpenChange={(o) => setPaymentEvidenceModal((s) => ({ ...s, open: o }))}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-green-600" />
              Submit Payment Evidence
            </DialogTitle>
            <DialogDescription>
              Upload supporting evidence of payment (receipt, bank transfer confirmation, etc.) for HR Executive approval.
              Once approved, the loan will be marked as fully repaid.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Loan Summary */}
            {actionModal.row && (
              <div className="rounded-lg bg-slate-50 p-4 border border-slate-200">
                <div className="text-sm font-semibold text-slate-700 mb-3">Loan Details</div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-slate-600">Reference:</span>
                    <div className="font-semibold text-slate-900">{actionModal.row.request_number}</div>
                  </div>
                  <div>
                    <span className="text-slate-600">Type:</span>
                    <div className="font-semibold text-slate-900">{actionModal.row.loan_type_label}</div>
                  </div>
                  <div>
                    <span className="text-slate-600">Staff:</span>
                    <div className="font-semibold text-slate-900">{actionModal.row.staff_full_name || actionModal.row.staff_number}</div>
                  </div>
                  <div>
                    <span className="text-slate-600">Loan Amount:</span>
                    <div className="font-semibold text-green-700">GHc {fmtAmount(actionModal.row.fixed_amount || actionModal.row.requested_amount)}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Payment Details Form */}
            <div className="space-y-4 border-t pt-4">
              <div>
                <Label htmlFor="paymentDate" className="text-sm font-semibold">Payment Date *</Label>
                <Input
                  id="paymentDate"
                  type="date"
                  value={paymentEvidenceModal.paymentDate}
                  onChange={(e) => setPaymentEvidenceModal((s) => ({ ...s, paymentDate: e.target.value }))}
                  className="mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="paymentAmount" className="text-sm font-semibold">Payment Amount (GHc) *</Label>
                  <Input
                    id="paymentAmount"
                    type="number"
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    value={paymentEvidenceModal.paymentAmount}
                    onChange={(e) => setPaymentEvidenceModal((s) => ({ ...s, paymentAmount: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="paymentMethod" className="text-sm font-semibold">Payment Method *</Label>
                  <Select 
                    value={paymentEvidenceModal.paymentMethod}
                    onValueChange={(value) => setPaymentEvidenceModal((s) => ({ ...s, paymentMethod: value }))}
                  >
                    <SelectTrigger id="paymentMethod" className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="mobile_money">Mobile Money</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="referenceNumber" className="text-sm font-semibold">Reference Number *</Label>
                <Input
                  id="referenceNumber"
                  placeholder="e.g., Bank ref, cheque no, transaction ID"
                  value={paymentEvidenceModal.referenceNumber}
                  onChange={(e) => setPaymentEvidenceModal((s) => ({ ...s, referenceNumber: e.target.value }))}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="description" className="text-sm font-semibold">Additional Details (optional)</Label>
                <Textarea
                  id="description"
                  placeholder="Add any additional notes or context about this payment..."
                  value={paymentEvidenceModal.description}
                  onChange={(e) => setPaymentEvidenceModal((s) => ({ ...s, description: e.target.value }))}
                  rows={3}
                  className="mt-1"
                />
              </div>

              <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center">
                <div className="flex justify-center mb-3">
                  <Upload className="h-8 w-8 text-slate-400" />
                </div>
                <p className="text-sm font-semibold text-slate-700 mb-2">Upload Payment Evidence</p>
                <p className="text-xs text-slate-600 mb-3">Receipt, bank transfer confirmation, screenshot, etc.</p>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file && file.size <= 5 * 1024 * 1024) { // 5MB limit
                      setPaymentEvidenceModal((s) => ({ ...s, evidenceFile: file }))
                    } else {
                      toast({ title: "File too large", description: "Maximum file size is 5MB" })
                    }
                  }}
                  className="hidden"
                  id="evidenceFile"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => document.getElementById("evidenceFile")?.click()}
                >
                  Choose File
                </Button>
                {paymentEvidenceModal.evidenceFile && (
                  <div className="mt-3 text-sm text-green-700 font-semibold">
                    ✓ {paymentEvidenceModal.evidenceFile.name}
                  </div>
                )}
              </div>

              <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
                <p className="text-xs text-blue-900">
                  <strong>Note:</strong> After submission, the HR Executive will review your payment evidence. 
                  Once approved, your loan will be marked as fully repaid and you'll be able to request the same loan type again in the future.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setPaymentEvidenceModal((s) => ({ ...s, open: false }))}
              disabled={paymentEvidenceModal.isSubmitting}
            >
              Cancel
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              disabled={
                !paymentEvidenceModal.paymentDate ||
                !paymentEvidenceModal.paymentAmount ||
                !paymentEvidenceModal.referenceNumber ||
                !paymentEvidenceModal.evidenceFile ||
                paymentEvidenceModal.isSubmitting
              }
              onClick={async () => {
                if (!actionModal.row || !paymentEvidenceModal.paymentAmount) return

                setPaymentEvidenceModal((s) => ({ ...s, isSubmitting: true }))
                try {
                  setPaymentEvidenceModal((prev) => ({ ...prev, isSubmitting: true }))
                  
                  // Validate required fields before submission
                  if (!actionModal.row?.id) {
                    throw new Error("Loan request ID is missing")
                  }
                  if (!paymentEvidenceModal.paymentDate) {
                    throw new Error("Payment date is required")
                  }
                  if (!paymentEvidenceModal.paymentAmount || parseFloat(paymentEvidenceModal.paymentAmount) <= 0) {
                    throw new Error("Payment amount must be greater than 0")
                  }

                  const response = await fetch("/api/loan/payment-evidence", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      loanRequestId: actionModal.row.id,
                      paymentDate: paymentEvidenceModal.paymentDate,
                      paymentAmount: parseFloat(paymentEvidenceModal.paymentAmount),
                      paymentMethod: paymentEvidenceModal.paymentMethod,
                      referenceNumber: paymentEvidenceModal.referenceNumber,
                      description: paymentEvidenceModal.description || null,
                      evidenceFileUrl: null,
                    }),
                  })

                  if (!response.ok) {
                    let errorMessage = "Failed to submit payment evidence"
                    try {
                      const errorData = await response.json()
                      errorMessage = errorData.error || errorMessage
                    } catch (e) {
                      errorMessage = `Server error (${response.status}): ${response.statusText}`
                    }
                    throw new Error(errorMessage)
                  }

                  const result = await response.json()

                  toast({
                    title: "Payment Evidence Submitted",
                    description: "Your payment evidence has been submitted and is awaiting HR Executive approval.",
                  })

                  // Reset modal
                  setPaymentEvidenceModal({
                    open: false,
                    paymentDate: new Date().toISOString().split("T")[0],
                    paymentAmount: "",
                    paymentMethod: "bank_transfer",
                    referenceNumber: "",
                    description: "",
                    evidenceFile: null,
                    isSubmitting: false,
                  })
                } catch (err) {
                  console.error("[v0] Payment evidence submission error:", err)
                  const errorMessage = err instanceof Error ? err.message : "Failed to submit payment evidence"
                  toast({
                    title: "Submission Failed",
                    description: errorMessage,
                    variant: "destructive",
                  })
                  setPaymentEvidenceModal((prev) => ({ ...prev, isSubmitting: false }))
                } finally {
                  setPaymentEvidenceModal((s) => ({ ...s, isSubmitting: false }))
                  // Fire off data reload without awaiting (silent reload in background)
                  void (async () => {
                    try {
                      await loadData({ silent: true })
                    } catch {
                      // Silently ignore reload errors to not affect submission status
                    }
                  })()
                }
              }}
            >
              {paymentEvidenceModal.isSubmitting ? "Submitting..." : "Submit for Approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Approval Modal */}
      <Dialog open={approvalModalOpen} onOpenChange={setApprovalModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {approvingPaymentId?.startsWith("approve") ? "Approve Payment" : "Reject Payment"}
            </DialogTitle>
            <DialogDescription>
              {approvingPaymentId?.startsWith("approve")
                ? `Approve payment of GHc ${Number(selectedPaymentForApproval?.amount_paid || 0).toLocaleString("en-GH", { minimumFractionDigits: 2 })}`
                : `Reject payment of GHc ${Number(selectedPaymentForApproval?.amount_paid || 0).toLocaleString("en-GH", { minimumFractionDigits: 2 })}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-semibold text-slate-600">
                {approvingPaymentId?.startsWith("approve") ? "Approval Notes" : "Rejection Reason"}
              </Label>
              <Textarea
                placeholder={approvingPaymentId?.startsWith("approve") ? "Enter approval notes..." : "Explain why this payment is being rejected..."}
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                className="mt-1.5 text-sm"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setApprovalModalOpen(false)}
              disabled={approvingPaymentId !== null}
            >
              Cancel
            </Button>
            <Button
              className={approvingPaymentId?.startsWith("approve") ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}
              onClick={async () => {
                if (!selectedPaymentForApproval || !approvingPaymentId) return
                
                const isApprove = approvingPaymentId.startsWith("approve")
                const userRole = data?.profile?.role || ""
                const isHrApprover = ["hr_executive", "admin"].includes(userRole)
                const isAccountsApprover = ["accounts_executive", "admin"].includes(userRole)
                const approvalType = isHrApprover && selectedPaymentForApproval.hr_approval_status === "pending" ? "hr" : "accounts"

                try {
                  const response = await fetch("/api/loan/payment-evidence/approval", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      paymentRecordId: selectedPaymentForApproval.id,
                      approvalType,
                      approvalStatus: isApprove ? "approved" : "rejected",
                      approvalNotes: approvalNotes || null,
                    }),
                  })

                  if (response.ok) {
                    toast({
                      title: isApprove ? "Payment Approved" : "Payment Rejected",
                      description: `Payment has been ${isApprove ? "approved" : "rejected"} successfully`,
                    })
                    setApprovalModalOpen(false)
                    setSelectedPaymentForApproval(null)
                    setApprovalNotes("")
                    setApprovingPaymentId(null)
                    // Refresh payment records
                    const refetchResponse = await fetch(`/api/loan/payment-evidence`)
                    if (refetchResponse.ok) {
                      const result = await refetchResponse.json()
                      setPaymentRecords(result.data || [])
                    }
                  } else {
                    const error = await response.json()
                    toast({
                      title: "Error",
                      description: error.error || "Failed to process payment",
                      variant: "destructive",
                    })
                  }
                } catch (err) {
                  console.error("[v0] Payment approval error:", err)
                  toast({
                    title: "Error",
                    description: "Failed to process payment approval",
                    variant: "destructive",
                  })
                } finally {
                  setApprovingPaymentId(null)
                }
              }}
              disabled={approvingPaymentId === null || !approvalNotes.trim()}
            >
              {approvingPaymentId ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : approvingPaymentId?.startsWith("approve") ? (
                "Approve"
              ) : (
                "Reject"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      </Tabs>
      </div>
    </>
  )
}

function ReadOnlyHint({ canAct, roleLabel }: { canAct: boolean; roleLabel: string }) {
  if (canAct) return null
  return (
    <Card className="border-amber-300 bg-amber-50">
      <CardContent className="pt-4 text-sm text-amber-800">
        <Clock className="inline h-4 w-4 mr-1" />
        View-only mode: you can monitor {roleLabel} tab details, but action buttons are restricted for your role.
      </CardContent>
    </Card>
  )
}

function StageCard({ row, children }: { row: LoanRequest; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4" />
          {row.request_number} - {row.loan_type_label}
        </CardTitle>
        <CardDescription className="flex items-center gap-2 flex-wrap">
          <Wallet className="h-4 w-4" /> GHc {fmtAmount(row.fixed_amount || row.requested_amount)}
          <Badge className={statusBadgeClass(row.status, "soft")}>{statusText(row.status)}</Badge>
          {String(row.hod_review_note || "").toLowerCase().includes("auto-approved") && (
            <Badge variant="outline" className="text-[10px] whitespace-nowrap border-amber-300 text-amber-700">
              Auto-forwarded: HOD did not act in 3 days
            </Badge>
          )}
          {row.fd_score !== null && (
            <span className="inline-flex items-center gap-1 text-xs">
              FD: <strong>{row.fd_score}</strong>
              {row.fd_good ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : null}
            </span>
          )}
        </CardDescription>
        {row.staff_full_name && (
          <div className="mt-1 text-sm font-semibold text-purple-900 flex items-center gap-1">
            <span className="text-purple-500">👤</span> {row.staff_full_name}
            {row.staff_number ? <span className="font-normal text-muted-foreground ml-1">({row.staff_number})</span> : null}
            {row.staff_rank ? <span className="font-normal text-muted-foreground ml-1">— {row.staff_rank}</span> : null}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {row.reason ? <p className="text-sm">{row.reason}</p> : <p className="text-sm text-muted-foreground">No reason added by staff.</p>}
        {row.supporting_document_url && (
          <p className="text-sm">
            Attachment: <a href={row.supporting_document_url} className="underline" target="_blank" rel="noreferrer">Open document</a>
          </p>
        )}
        {row.fd_document_url && (
          <p className="text-sm">
            FD Proof Document: <a href={row.fd_document_url} className="text-emerald-700 underline font-medium" target="_blank" rel="noreferrer">View FD document</a>
          </p>
        )}
        <div className="flex gap-2 flex-wrap">{children}</div>
      </CardContent>
    </Card>
  )
}
