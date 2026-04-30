"use client"

import { useEffect, useMemo, useRef, useState } from "react"
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
import { SignaturePad } from "@/components/leave/signature-pad"
import { useToast } from "@/hooks/use-toast"
import { validateMeaningfulText } from "@/lib/meaningful-text"
import { CheckCircle2, Clock, Download, FileText, LayoutGrid, LayoutList, Loader2, Wallet } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type LoanType = {
  loan_key: string
  loan_label: string
  category: string
  requires_committee: boolean
  requires_fd_check: boolean
  min_fd_score: number
  min_qualification_note?: string | null
  fixed_amount: number
  max_amount?: number | null
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
  hod_reviewer_id?: string | null
  director_hr_id?: string | null
  hod_review_note?: string | null
  hod_name?: string | null
  hod_rank?: string | null
  hod_location?: string | null
  created_at: string
  submitted_at: string
  updated_at?: string
}

type WorkflowResponse = {
  degraded: boolean
  warning?: string
  profile: {
    id: string
    firstName: string
    lastName: string
    employeeId: string
    email: string
    role: string
    position: string
    departmentName: string | null
    assignedLocationId?: string | null
    assignedLocationName?: string | null
    assignedLocationAddress?: string | null
    assignedDistrictName?: string | null
    linkedHodName?: string | null
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
  hods: Array<{ id: string; first_name: string; last_name: string; employee_id: string | null; position: string | null; role: string }>
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
  awaiting_director_hr: "Awaiting Director HR",
  approved_director: "Approved by Director HR",
  director_rejected: "Director HR Rejected",
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
    awaiting_director_hr: "Director HR",
    approved_director: "Completed",
    hod_rejected: "Closed at HOD",
    rejected_fd: "Closed at Accounts",
    committee_rejected: "Closed at Committee",
    director_rejected: "Closed at Director HR",
  }
  return map[status] || "In progress"
}

function requiresProofAttachment(loanTypeKey: string): boolean {
  const key = String(loanTypeKey || "").toLowerCase()
  return key.includes("funeral") || key.includes("insurance")
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
  return d.toLocaleDateString("en-GH", { month: "long", year: "numeric" })
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

function buildDirectorAutoMemoDraft(
  row: LoanRequest,
  entry?: { hodName?: string; hodLocation?: string; memoRef?: string },
) {
  const amount = row.fixed_amount || row.requested_amount || 0
  const amtNum = Number(amount)
  const amtFormatted = amtNum.toLocaleString("en-GH", { minimumFractionDigits: 2 })
  const amtWords = amountToWords(amtNum)
  const loanLabel = row.loan_type_label || row.loan_type_key || "Loan"
  const staffName = (row.staff_full_name || "REQUESTING STAFF").toUpperCase()
  const staffNo = row.staff_number || "—"
  const staffRank = (row.staff_rank || "").toUpperCase()
  const hodName = (entry?.hodName || row.hod_name || "THE REGIONAL MANAGER").toUpperCase()
  const hodLocation = entry?.hodLocation || row.hod_location || row.staff_location_name || "—"
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
    `THRO'   ${hodName}`,
    `        QUALITY CONTROL COMPANY LIMITED`,
    `        ${hodLocation}`,
    "",
    `RE: APPLICATION FOR ${loanLabel.toUpperCase()}`,
    "",
    `We refer to your loan application dated ${submittedDate} on the above subject and wish to inform you that, Management has given approval for you to be granted a ${loanLabel} of ${amtWords} Ghana Cedis (GHc${amtFormatted}).`,
    "",
    `The loan would be recovered in ${months} Equal Monthly Instalment from your salary effective, ${recoveryMonth}.`,
    "",
    `By a copy of this letter, the Accounts Manager is been advised to release the said amount to you effective, ${disbursementMonth}.`,
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
  next.sort((a, b) => {
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

export default function LoanAppPage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<WorkflowResponse | null>(null)
  const [warning, setWarning] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [loanTypeKey, setLoanTypeKey] = useState("")
  const [reason, setReason] = useState("")
  const [supportingDocumentUrl, setSupportingDocumentUrl] = useState<string | null>(null)
  const [supportingDocumentName, setSupportingDocumentName] = useState<string>("")
  const [uploadingDocument, setUploadingDocument] = useState(false)

  const [hodNotes, setHodNotes] = useState<Record<string, string>>({})
  const [loanOfficeNotes, setLoanOfficeNotes] = useState<Record<string, string>>({})
  const [fdInputs, setFdInputs] = useState<Record<string, { score: string; note: string }>>({})
  const [committeeNotes, setCommitteeNotes] = useState<Record<string, string>>({})
  const [hrInputs, setHrInputs] = useState<Record<string, { disbursement: string; recovery: string; months: string; note: string; hodName: string; hodLocation: string; memoRef: string }>>({})

  const [directorDecision, setDirectorDecision] = useState<"approve" | "reject">("approve")
  const [directorLetter, setDirectorLetter] = useState("")
  const [memoPreviewLoanId, setMemoPreviewLoanId] = useState<string | null>(null)

  // ── Action modal state ──────────────────────────────────────────────
  type ActionType = "hod" | "loan_office" | "accounts" | "committee" | "hr_terms" | "director"
  const [actionModal, setActionModal] = useState<{ open: boolean; row: LoanRequest | null; actionType: ActionType | null }>({ open: false, row: null, actionType: null })
  const [memoReviewModal, setMemoReviewModal] = useState<{ open: boolean; row: LoanRequest | null }>({ open: false, row: null })
  const [modalNote, setModalNote] = useState("")
  const [modalDecision, setModalDecision] = useState<"approve" | "reject">("approve")
  const [modalFdScore, setModalFdScore] = useState("")
  const [modalFdNote, setModalFdNote] = useState("")
  const [modalDisbursement, setModalDisbursement] = useState("")
  const [modalRecovery, setModalRecovery] = useState("")
  const [modalMonths, setModalMonths] = useState("")
  const [modalHodName, setModalHodName] = useState("")
  const [modalHodLocation, setModalHodLocation] = useState("")
  const [modalMemoRef, setModalMemoRef] = useState("")
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

  const [lookupData, setLookupData] = useState<LookupPayload | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [registryData, setRegistryData] = useState<RegistryPayload | null>(null)
  const [registryLoading, setRegistryLoading] = useState(false)
  const [selectedLoanType, setSelectedLoanType] = useState("")
  const [setupFixedAmount, setSetupFixedAmount] = useState("")
  const [setupMaxAmount, setSetupMaxAmount] = useState("")
  const [setupQualification, setSetupQualification] = useState("")
  const [selectedTemplateDomain, setSelectedTemplateDomain] = useState<"loan" | "leave">("loan")
  const [selectedTemplateKey, setSelectedTemplateKey] = useState("loan_approval")
  const [templateTitle, setTemplateTitle] = useState("")
  const [templateSubject, setTemplateSubject] = useState("")
  const [templateBody, setTemplateBody] = useState("")
  const [selectedStaffForLink, setSelectedStaffForLink] = useState("")
  const [selectedHodsForLink, setSelectedHodsForLink] = useState<string[]>([])
  const [linkageRequestNote, setLinkageRequestNote] = useState("")
  const [linkageSearch, setLinkageSearch] = useState("")
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

  const [loanOfficeSearch, setLoanOfficeSearch] = useState("")
  const [loanOfficeStatus, setLoanOfficeStatus] = useState("all")
  const [loanOfficeSort, setLoanOfficeSort] = useState<"newest" | "oldest">("newest")
  const [loanOfficePage, setLoanOfficePage] = useState(1)
  const [loanOfficeTypeTab, setLoanOfficeTypeTab] = useState("all")
  const [loanOfficeStageTab, setLoanOfficeStageTab] = useState("pending")
  const [loanOfficeViewMode, setLoanOfficeViewMode] = useState<"table" | "card">("table")

  const [accountsSearch, setAccountsSearch] = useState("")
  const [accountsStatus, setAccountsStatus] = useState("all")
  const [accountsSort, setAccountsSort] = useState<"newest" | "oldest">("newest")
  const [accountsPage, setAccountsPage] = useState(1)
  const [accountsViewMode, setAccountsViewMode] = useState<"table" | "card">("table")

  const [committeeSearch, setCommitteeSearch] = useState("")
  const [committeeStatus, setCommitteeStatus] = useState("all")
  const [committeeSort, setCommitteeSort] = useState<"newest" | "oldest">("newest")
  const [committeePage, setCommitteePage] = useState(1)
  const [committeeViewMode, setCommitteeViewMode] = useState<"table" | "card">("table")

  const [hrSearch, setHrSearch] = useState("")
  const [hrStatus, setHrStatus] = useState("all")
  const [hrSort, setHrSort] = useState<"newest" | "oldest">("newest")
  const [hrPage, setHrPage] = useState(1)
  const [hrViewMode, setHrViewMode] = useState<"table" | "card">("table")

  const [directorSearch, setDirectorSearch] = useState("")
  const [directorStatus, setDirectorStatus] = useState("all")
  const [directorSort, setDirectorSort] = useState<"newest" | "oldest">("newest")
  const [directorPage, setDirectorPage] = useState(1)
  const [directorViewMode, setDirectorViewMode] = useState<"table" | "card">("table")

  const [hodViewMode, setHodViewMode] = useState<"table" | "card">("table")

  const [tasksSearch, setTasksSearch] = useState("")
  const [tasksStatus, setTasksStatus] = useState("all")
  const [tasksSort, setTasksSort] = useState<"newest" | "oldest">("newest")
  const [tasksPage, setTasksPage] = useState(1)
  const [tasksViewMode, setTasksViewMode] = useState<"table" | "card">("table")
  const [allSearch, setAllSearch] = useState("")
  const [allStatus, setAllStatus] = useState("all")
  const [allSort, setAllSort] = useState<"newest" | "oldest">("newest")
  const [allPage, setAllPage] = useState(1)
  const pageSize = 10
  const previousHodQueueCountRef = useRef<number | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)

  const filteredLoanTypes = useMemo(() => {
    return data?.loanTypes || []
  }, [data])

  const selectedType = useMemo(() => filteredLoanTypes.find((t) => t.loan_key === loanTypeKey), [filteredLoanTypes, loanTypeKey])
  const needsAttachment = useMemo(() => requiresProofAttachment(loanTypeKey), [loanTypeKey])
  const p = data?.permissions
  const normalizedRole = normalizeRoleValue(data?.profile?.role)
  const isAdmin = normalizedRole === "admin" || normalizedRole === "it_admin"
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
    const c = {
      hod: data?.inbox?.hod?.length || 0,
      loanOffice: data?.inbox?.loanOffice?.length || 0,
      accounts: data?.inbox?.accounts?.length || 0,
      committee: data?.inbox?.committee?.length || 0,
      hr: data?.inbox?.hrOffice?.length || 0,
      director: data?.inbox?.directorHr?.length || 0,
      all: data?.inbox?.allLoans?.length || 0,
      mine: data?.myTasks?.length || 0,
    }
    const tabs = [{ key: "staff", label: "My Loans" }, { key: "tracking", label: "Tracking" }]
    if (p?.hod || p?.viewAllTabs) tabs.push({ key: "hod", label: `HOD (${c.hod})` })
    if (p?.loanOffice || p?.hrOffice || p?.viewAllTabs) tabs.push({ key: "loan-office", label: `Loan Office (${c.loanOffice + c.hr})` })
    if (p?.accounts || p?.viewAllTabs) tabs.push({ key: "accounts", label: `Accounts (${c.accounts})` })
    if (p?.committee || p?.viewAllTabs) tabs.push({ key: "committee", label: `Committee (${c.committee})` })
    if (p?.directorHr || p?.viewAllTabs) tabs.push({ key: "director", label: `Director HR (${c.director})` })
    if (p?.hod || p?.hrOffice || p?.loanOffice || p?.viewAllTabs) tabs.push({ key: "setup", label: "Setup & Linkage" })
    if (p?.hod || p?.loanOffice || p?.accounts || p?.committee || p?.hrOffice || p?.directorHr || p?.viewAllTabs || p?.allLoans) {
      tabs.push({ key: "my-tasks", label: `My Tasks (${c.mine})` })
    }
    if (p?.allLoans || p?.viewAllTabs) {
      tabs.push({ key: "overview", label: `All Loans (${c.all})` })
    }
    return tabs
  }, [data, normalizedRole])

  const defaultTab = visibleTabs[0]?.key || "staff"

  const filteredHod = useMemo(
    () => filterAndSortRows(data?.inbox?.hod || [], hodSearch, hodStatus, hodSort),
    [data?.inbox?.hod, hodSearch, hodStatus, hodSort],
  )
  const filteredLoanOffice = useMemo(
    () => filterAndSortRows(data?.inbox?.loanOffice || [], loanOfficeSearch, loanOfficeStatus, loanOfficeSort),
    [data?.inbox?.loanOffice, loanOfficeSearch, loanOfficeStatus, loanOfficeSort],
  )

  const loanOfficeWorkspaceRows = useMemo(() => {
    const allLoans = data?.inbox?.allLoans || []
    if (allLoans.length > 0) return allLoans

    const merged = [
      ...(data?.inbox?.loanOffice || []),
      ...(data?.inbox?.accounts || []),
      ...(data?.inbox?.committee || []),
      ...(data?.inbox?.hrOffice || []),
      ...(data?.inbox?.directorHr || []),
      ...(data?.inbox?.accountsSigned || []),
    ]
    return Array.from(new Map(merged.map((r) => [r.id, r])).values())
  }, [
    data?.inbox?.allLoans,
    data?.inbox?.loanOffice,
    data?.inbox?.accounts,
    data?.inbox?.committee,
    data?.inbox?.hrOffice,
    data?.inbox?.directorHr,
    data?.inbox?.accountsSigned,
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
    const isGoodFd = (row: LoanRequest) => row.fd_good === true
    const isPoorFd = (row: LoanRequest) => row.fd_good === false || row.status === "rejected_fd" || (typeof row.fd_score === "number" && row.fd_score < 39)
    const isGoodFdNotPushed = (row: LoanRequest) =>
      isGoodFd(row) && !["awaiting_director_hr", "approved_director", "director_rejected"].includes(row.status)
    const isPending = (row: LoanRequest) =>
      row.fd_good === null && row.fd_score === null && !isArchivableStatus(row.status)

    return {
      pending: loanOfficeRowsForSelectedType.filter((row) => isPending(row)),
      "good-fd": loanOfficeRowsForSelectedType.filter((row) => isGoodFd(row)),
      "poor-fd": loanOfficeRowsForSelectedType.filter((row) => isPoorFd(row)),
      "good-fd-not-pushed": loanOfficeRowsForSelectedType.filter((row) => isGoodFdNotPushed(row)),
      "sent-for-approval": loanOfficeRowsForSelectedType.filter((row) => row.status === "awaiting_director_hr"),
      archivable: loanOfficeRowsForSelectedType.filter((row) => isArchivableStatus(row.status)),
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
    return filterAndSortRows(bucketRows, loanOfficeSearch, loanOfficeStatus, loanOfficeSort)
  }, [loanOfficeStageBuckets, loanOfficeStageTab, loanOfficeSearch, loanOfficeStatus, loanOfficeSort])
  const filteredAccounts = useMemo(
    () => filterAndSortRows(data?.inbox?.accounts || [], accountsSearch, accountsStatus, accountsSort),
    [data?.inbox?.accounts, accountsSearch, accountsStatus, accountsSort],
  )
  const filteredCommittee = useMemo(
    () => filterAndSortRows(data?.inbox?.committee || [], committeeSearch, committeeStatus, committeeSort),
    [data?.inbox?.committee, committeeSearch, committeeStatus, committeeSort],
  )
  const filteredHr = useMemo(
    () => filterAndSortRows(data?.inbox?.hrOffice || [], hrSearch, hrStatus, hrSort),
    [data?.inbox?.hrOffice, hrSearch, hrStatus, hrSort],
  )
  const filteredDirector = useMemo(
    () => filterAndSortRows(data?.inbox?.directorHr || [], directorSearch, directorStatus, directorSort),
    [data?.inbox?.directorHr, directorSearch, directorStatus, directorSort],
  )

  const filteredMyTasks = useMemo(() => {
    return filterAndSortRows(data?.myTasks || [], tasksSearch, tasksStatus, tasksSort)
  }, [data?.myTasks, tasksSearch, tasksStatus, tasksSort])

  const filteredAllLoans = useMemo(() => {
    return filterAndSortRows(data?.inbox?.allLoans || [], allSearch, allStatus, allSort)
  }, [data?.inbox?.allLoans, allSearch, allStatus, allSort])

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
      if (!res.ok) throw new Error(result.error || "Failed to load loan workflow")

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

      const allowedLoanTypes = result.loanTypes || []
      if (allowedLoanTypes.length > 0 && !loanTypeKey) {
        setLoanTypeKey(allowedLoanTypes[0].loan_key)
      }
    } catch (e: any) {
      toast({ title: "Loan Module Error", description: e?.message || "Failed to load", variant: "destructive" })
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
    if (filteredLoanTypes.length) setLoanTypeKey(filteredLoanTypes[0].loan_key)
  }

  useEffect(() => {
    if (!loanTypeKey && filteredLoanTypes.length > 0) {
      setLoanTypeKey(filteredLoanTypes[0].loan_key)
      return
    }
    if (loanTypeKey && filteredLoanTypes.length > 0 && !filteredLoanTypes.find((l) => l.loan_key === loanTypeKey)) {
      setLoanTypeKey(filteredLoanTypes[0].loan_key)
    }
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

    const payload = {
      id: editingId,
      loan_type_key: loanTypeKey,
      requested_amount: selectedType?.fixed_amount || 0,
      reason: trimmedReason,
      supporting_document_url: supportingDocumentUrl,
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

    toast({ title: "Signature saved", description: "Director HR signature registry updated." })
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

  const filteredLinkageRows = useMemo(() => {
    const q = linkageSearch.trim().toLowerCase()
    if (!q) return lookupData?.linkages || []

    return (lookupData?.linkages || []).filter((link) => {
      const staff = (lookupData?.staff || []).find((row) => row.id === link.staff_user_id)
      const hod = (lookupData?.hods || []).find((row) => row.id === link.hod_user_id)
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
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()

      return searchText.includes(q)
    })
  }, [lookupData?.linkages, lookupData?.staff, lookupData?.hods, linkageSearch])

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
        setModalDisbursement("")
        setModalRecovery("")
        setModalMonths("")
        setModalHodName("")
        setModalHodLocation("")
        setModalMemoRef("")
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
          setModalNote(loanOfficeNotes[row.id] || "")
          setModalStaffFullName(row.staff_full_name || "")
          setModalStaffNumber(row.staff_number || "")
          setModalStaffRank(row.staff_rank || "")
          setModalCorporateEmail(row.corporate_email || "")
          setModalReferenceNumber(formatReferenceNumber(row.reference_number, row.request_number))
          setModalHodReviewerId(row.hod_reviewer_id || "")
          setModalDirectorApproverId(row.director_hr_id || "")
        }
        if (actionType === "accounts") {
          const fd = fdInputs[row.id]
          setModalFdScore(fd?.score || "")
          setModalFdNote(fd?.note || "")
        }
        if (actionType === "hr_terms") {
          const entry = hrInputs[row.id]
          setModalDisbursement(entry?.disbursement || "")
          setModalRecovery(entry?.recovery || "")
          setModalMonths(entry?.months || "")
          setModalNote(entry?.note || "")
          setModalHodName(entry?.hodName || row.hod_name || "")
          setModalHodLocation(entry?.hodLocation || row.hod_location || row.staff_location_name || "")
          setModalMemoRef(entry?.memoRef || formatReferenceNumber(row.reference_number, row.request_number))
          setModalDirectorApproverId(row.director_hr_id || "")
        }
        if (actionType === "director") {
          const entry = hrInputs[row.id]
          const draft = buildDirectorAutoMemoDraft(row, entry)
          setModalMemoText(draft)
          setModalSignatureText(signatureText)
          setModalSignatureDataUrl(signatureDataUrl)
          setModalSignatureMode(signatureMode)
          setModalDecision(directorDecision)
          setMemoReviewModal({ open: true, row })
          return
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
        const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
        const pageWidth = doc.internal.pageSize.getWidth()
        const pageHeight = doc.internal.pageSize.getHeight()
        const marginLeft = 28
        const marginRight = 25
        const topMargin = 18
        const usableWidth = pageWidth - marginLeft - marginRight
        const logoDataUrl = await loadImageAsDataUrl(`${window.location.origin}/images/qcc-logo.png`)

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

        doc.setFont("times", "bold")
        doc.setFontSize(28)
        doc.setTextColor(235, 235, 235)
        doc.text("Loan App", pageWidth / 2 - 25, pageHeight / 2 + 10, { angle: -28 })

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

  return (
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
                  <div><strong>Corporate Email:</strong> {data?.profile.email || "N/A"}</div>
                  <div><strong>Staff Number:</strong> {data?.profile.employeeId || "N/A"}</div>
                  <div><strong>Station / Department:</strong> {data?.profile.departmentName || "N/A"}</div>
                  <div><strong>Rank:</strong> {data?.profile.position || "N/A"}</div>
                  <div><strong>Assigned Location:</strong> {data?.profile.assignedLocationName || "N/A"}</div>
                  <div><strong>Assigned District:</strong> {data?.profile.assignedDistrictName || "N/A"}</div>
                  <div><strong>Linked HOD:</strong> {data?.profile.linkedHodName || "Not yet assigned"}</div>
                  <div className="md:col-span-2"><strong>Location Address:</strong> {data?.profile.assignedLocationAddress || "N/A"}</div>
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          {warning && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{warning}</p>}
        </CardContent>
      </Card>

      <Tabs defaultValue={defaultTab} className="space-y-4">
        <TabsList className="flex h-auto w-full flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white/80 p-2 shadow-sm backdrop-blur">
          {visibleTabs.map((tab) => (
            <TabsTrigger key={tab.key} value={tab.key} className="rounded-xl border border-transparent px-4 py-2 text-sm font-medium text-slate-600 data-[state=active]:border-emerald-200 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
              {tab.label}
            </TabsTrigger>
          ))}
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

              <div>
                <Label>Reason (Optional)</Label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} placeholder="You can add reason if needed" />
                <p className="mt-2 text-xs text-amber-700">
                  Kindly keep your Attendance check-in and check-out up to date. Missing attendance activity or pending checkout can block new loan and leave requests.
                </p>
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
                  {row.director_letter && (
                    <div className="text-sm bg-muted p-2 rounded"><strong>Director Letter:</strong><br />{row.director_letter}</div>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    {["pending_hod", "hod_rejected"].includes(row.status) && (
                      <Button variant="outline" size="sm" onClick={() => beginEdit(row)}>
                        View / Edit
                      </Button>
                    )}
                    {row.status === "approved_director" && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => downloadApprovalLetter(row, data!.profile)}>
                          <Download className="h-4 w-4 mr-1" /> Download Final Approval
                        </Button>
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

        <TabsContent value="tracking" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Loan Flow Tracking</CardTitle>
              <CardDescription>See every step your loan has passed through from submission to final decision.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(data?.myRequests || []).map((req) => {
                const timeline = data?.myTimelines.find((x) => x.loan_request_id === req.id)?.entries || []
                return (
                  <div key={req.id} className="border rounded-md p-3 space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="font-medium">{req.request_number} - {req.loan_type_label}</div>
                      <Badge className={statusBadgeClass(req.status, "soft")}>{statusText(req.status)}</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">Amount: GHc {fmtAmount(req.fixed_amount || req.requested_amount)}</div>
                    {timeline.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No timeline events yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {timeline.map((entry) => (
                          <div key={entry.id} className="text-sm rounded border p-2 bg-slate-50">
                            <div className="font-medium">{ACTION_LABELS[entry.action_key] || entry.action_key}</div>
                            <div className="text-muted-foreground">{fmtDate(entry.created_at)} | {entry.actor_role || "system"}</div>
                            <div>From: {entry.from_status ? statusText(entry.from_status) : "N/A"} {" -> "} To: {entry.to_status ? statusText(entry.to_status) : "N/A"}</div>
                            {entry.note && <div>Note: {entry.note}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
              {(data?.myRequests || []).length === 0 && <p className="text-sm text-muted-foreground">No loans available for tracking.</p>}
            </CardContent>
          </Card>
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
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
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

        <TabsContent value="loan-office" className="space-y-3">
          <ReadOnlyHint canAct={Boolean(p?.loanOffice || p?.hrOffice)} roleLabel="Loan Office / HR Office" />
          <Card>
            <CardHeader>
              <CardTitle>Loan Office Processing Queue</CardTitle>
              <CardDescription>
                Organized workspace with loan-type tabs and stage tabs for good FD, poor FD, pending push, sent approval, and archivable requests.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <Button
                    variant={loanOfficeViewMode === "table" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setLoanOfficeViewMode("table")}
                    className="gap-1"
                  >
                    <LayoutList className="h-4 w-4" /> Table
                  </Button>
                  <Button
                    variant={loanOfficeViewMode === "card" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setLoanOfficeViewMode("card")}
                    className="gap-1"
                  >
                    <LayoutGrid className="h-4 w-4" /> Cards
                  </Button>
                </div>
                <Button variant="outline" size="sm" onClick={() => downloadCsv(filteredLoanOfficeStageRows, "loan-office-queue-filtered.csv")}>Export Filtered CSV</Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <Input value={loanOfficeSearch} onChange={(e) => setLoanOfficeSearch(e.target.value)} placeholder="Search requests" />
                <Select value={loanOfficeStatus} onValueChange={setLoanOfficeStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {Object.keys(STATUS_LABELS).map((status) => (
                      <SelectItem key={`loan-office-${status}`} value={status}>{statusText(status)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={loanOfficeSort} onValueChange={(v: "newest" | "oldest") => setLoanOfficeSort(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest first</SelectItem>
                    <SelectItem value="oldest">Oldest first</SelectItem>
                  </SelectContent>
                </Select>
                <div className="text-xs text-muted-foreground flex items-center md:justify-end">Showing {pagedLoanOfficeStage.length} of {filteredLoanOfficeStageRows.length}</div>
              </div>

              <div className="rounded-md border border-pink-200 bg-pink-50/70 p-2">
                <div className="text-xs font-medium text-fuchsia-800 mb-2">Loan Type Counter Summary (across 5 stage tabs)</div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                  {loanOfficeTypeSummary.map((item) => (
                    <div key={`loan-summary-${item.loanKey}`} className="rounded border border-pink-100 bg-white/90 p-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold truncate" title={item.loanLabel}>{item.loanLabel}</span>
                        <Badge className="bg-fuchsia-700 text-white">{item.totalUnique}</Badge>
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        G:{item.goodFd} | P:{item.poorFd} | NP:{item.goodFdNotPushed} | S:{item.sentForApproval} | A:{item.archivable}
                      </div>
                    </div>
                  ))}
                  {loanOfficeTypeSummary.length === 0 && (
                    <p className="text-xs text-muted-foreground">No loan type counters available yet.</p>
                  )}
                </div>
              </div>

              <Tabs value={loanOfficeTypeTab} onValueChange={setLoanOfficeTypeTab} className="space-y-2">
                <TabsList className="flex w-full flex-wrap gap-2 h-auto bg-transparent p-0">
                  <TabsTrigger value="all" className="data-[state=active]:bg-fuchsia-700 data-[state=active]:text-white">All Loan Types</TabsTrigger>
                  {loanOfficeTypeOptions.map((opt) => (
                    <TabsTrigger
                      key={`loan-office-type-${opt.loanKey}`}
                      value={opt.loanKey}
                      className="data-[state=active]:bg-fuchsia-700 data-[state=active]:text-white"
                    >
                      {opt.loanLabel}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

              <Tabs value={loanOfficeStageTab} onValueChange={setLoanOfficeStageTab} className="space-y-2">
                <TabsList className="flex w-full flex-wrap gap-2 h-auto bg-transparent p-0">
                  <TabsTrigger value="pending" className="data-[state=active]:bg-fuchsia-700 data-[state=active]:text-white">
                    Pending FD ({loanOfficeStageBuckets["pending"].length})
                  </TabsTrigger>
                  <TabsTrigger value="good-fd" className="data-[state=active]:bg-fuchsia-700 data-[state=active]:text-white">
                    Good FD ({loanOfficeStageBuckets["good-fd"].length})
                  </TabsTrigger>
                  <TabsTrigger value="poor-fd" className="data-[state=active]:bg-fuchsia-700 data-[state=active]:text-white">
                    Poor FD ({loanOfficeStageBuckets["poor-fd"].length})
                  </TabsTrigger>
                  <TabsTrigger value="good-fd-not-pushed" className="data-[state=active]:bg-fuchsia-700 data-[state=active]:text-white">
                    Good FD Not Pushed ({loanOfficeStageBuckets["good-fd-not-pushed"].length})
                  </TabsTrigger>
                  <TabsTrigger value="sent-for-approval" className="data-[state=active]:bg-fuchsia-700 data-[state=active]:text-white">
                    Sent for Approval ({loanOfficeStageBuckets["sent-for-approval"].length})
                  </TabsTrigger>
                  <TabsTrigger value="archivable" className="data-[state=active]:bg-fuchsia-700 data-[state=active]:text-white">
                    Archivable ({loanOfficeStageBuckets.archivable.length})
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </CardContent>
          </Card>
          {filteredLoanOfficeStageRows.length === 0 && (
            <Card>
              <CardContent className="pt-4 text-sm text-muted-foreground">
                No requests match this loan-type tab and stage tab.
              </CardContent>
            </Card>
          )}

          {loanOfficeViewMode === "table" && filteredLoanOfficeStageRows.length > 0 && (
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
                      <TableHead className="whitespace-nowrap">Status</TableHead>
                      <TableHead className="whitespace-nowrap">Submitted</TableHead>
                      <TableHead className="whitespace-nowrap">Reason</TableHead>
                      {p?.loanOffice && <TableHead className="whitespace-nowrap">Action</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedLoanOfficeStage.map((row) => (
                      <TableRow key={row.id} className="align-top">
                        <TableCell className="font-mono text-xs whitespace-nowrap">{row.request_number || row.id.slice(0, 8)}</TableCell>
                        <TableCell className="whitespace-nowrap font-medium">{row.staff_full_name || "—"}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{row.staff_number || "—"}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{row.staff_rank || "—"}</TableCell>
                        <TableCell className="text-xs">{row.loan_type_label || row.loan_type_key}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{row.requested_amount != null ? Number(row.requested_amount).toLocaleString("en-GH", { minimumFractionDigits: 2 }) : row.fixed_amount != null ? Number(row.fixed_amount).toLocaleString("en-GH", { minimumFractionDigits: 2 }) : "—"}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge className={`text-[10px] whitespace-nowrap ${row.status === "hod_approved" ? "bg-green-700" : "bg-purple-700"} text-white`}>
                              {statusText(row.status)}
                            </Badge>
                            {String(row.hod_review_note || "").toLowerCase().includes("auto-approved") && (
                              <Badge variant="outline" className="text-[10px] whitespace-nowrap border-amber-300 text-amber-700">
                                Auto-forwarded: HOD did not act in 3 days
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{row.submitted_at ? new Date(row.submitted_at).toLocaleDateString("en-GB") : "—"}</TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate" title={row.reason || ""}>{row.reason || "—"}</TableCell>
                        {p?.loanOffice && (
                          <TableCell className="whitespace-nowrap">
                            {row.status === "hod_approved" ? (
                              <div className="flex flex-col gap-1 min-w-[160px]">
                                <Textarea
                                  placeholder="Note"
                                  value={loanOfficeNotes[row.id] || ""}
                                  onChange={(e) => setLoanOfficeNotes((s) => ({ ...s, [row.id]: e.target.value }))}
                                  rows={1}
                                  className="text-xs"
                                />
                                <Button
                                  size="sm"
                                  className="text-xs"
                                  onClick={() => openActionModal(row, "loan_office")}
                                >
                                  Review &amp; Forward
                                </Button>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">{statusText(row.status)}</span>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {loanOfficeViewMode === "card" && pagedLoanOfficeStage.map((row) => (
            <StageCard key={row.id} row={row}>
              {row.status === "hod_approved" && p?.loanOffice
                ? <Button size="sm" onClick={() => openActionModal(row, "loan_office")}>Review &amp; Forward</Button>
                : <div className="text-xs text-muted-foreground">Status: <strong>{statusText(row.status)}</strong></div>
              }
            </StageCard>
          ))}

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setLoanOfficePage((n) => Math.max(1, n - 1))} disabled={loanOfficePage <= 1}>Prev</Button>
            <span className="text-xs text-muted-foreground">Page {loanOfficePage} of {totalLoanOfficeStagePages}</span>
            <Button variant="outline" size="sm" onClick={() => setLoanOfficePage((n) => Math.min(totalLoanOfficeStagePages, n + 1))} disabled={loanOfficePage >= totalLoanOfficeStagePages}>Next</Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>HR Terms Queue</CardTitle>
              <CardDescription>Set disbursement and recovery terms here before forwarding each memo to Director HR.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-1 pb-1">
                <Button variant={hrViewMode === "table" ? "default" : "outline"} size="sm" onClick={() => setHrViewMode("table")} className="gap-1"><LayoutList className="h-4 w-4" /> Table</Button>
                <Button variant={hrViewMode === "card" ? "default" : "outline"} size="sm" onClick={() => setHrViewMode("card")} className="gap-1"><LayoutGrid className="h-4 w-4" /> Cards</Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <Input value={hrSearch} onChange={(e) => setHrSearch(e.target.value)} placeholder="Search requests" />
                <Select value={hrStatus} onValueChange={setHrStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {Object.keys(STATUS_LABELS).map((status) => (
                      <SelectItem key={`hr-${status}`} value={status}>{statusText(status)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={hrSort} onValueChange={(v: "newest" | "oldest") => setHrSort(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest first</SelectItem>
                    <SelectItem value="oldest">Oldest first</SelectItem>
                  </SelectContent>
                </Select>
                <div className="text-xs text-muted-foreground flex items-center md:justify-end">Showing {pagedHr.length} of {filteredHr.length}</div>
              </div>
            </CardContent>
          </Card>

          {filteredHr.length === 0 && (
            <Card>
              <CardContent className="pt-4 text-sm text-muted-foreground">No requests are currently awaiting HR terms setup.</CardContent>
            </Card>
          )}

          {hrViewMode === "table" && filteredHr.length > 0 && (
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
                      <TableHead className="whitespace-nowrap">Status</TableHead>
                      {p?.hrOffice && <TableHead className="whitespace-nowrap">Terms &amp; Action</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedHr.map((row) => {
                      const entry = hrInputs[row.id] || { disbursement: "", recovery: "", months: "", note: "" }
                      return (
                        <TableRow key={row.id} className="align-top">
                          <TableCell className="font-mono text-xs whitespace-nowrap">{row.request_number || row.id.slice(0, 8)}</TableCell>
                          <TableCell className="whitespace-nowrap font-medium">{row.staff_full_name || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{row.staff_number || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{row.staff_rank || "—"}</TableCell>
                          <TableCell className="text-xs">{row.loan_type_label || row.loan_type_key}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{row.requested_amount != null ? Number(row.requested_amount).toLocaleString("en-GH", { minimumFractionDigits: 2 }) : row.fixed_amount != null ? Number(row.fixed_amount).toLocaleString("en-GH", { minimumFractionDigits: 2 }) : "—"}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">{row.fd_score ?? "—"}</TableCell>
                          <TableCell><Badge className={statusBadgeClass(row.status, "solid")}>{statusText(row.status)}</Badge></TableCell>
                          {p?.hrOffice && (
                            <TableCell>
                              <Button size="sm" className="text-xs whitespace-nowrap" onClick={() => openActionModal(row, "hr_terms")}>Set Terms</Button>
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

          {hrViewMode === "card" && pagedHr.map((row) => (
            <StageCard key={row.id} row={row}>
              {p?.hrOffice && <Button size="sm" onClick={() => openActionModal(row, "hr_terms")}>Set Terms</Button>}
            </StageCard>
          ))}

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setHrPage((n) => Math.max(1, n - 1))} disabled={hrPage <= 1}>Prev</Button>
            <span className="text-xs text-muted-foreground">Page {hrPage} of {totalHrPages}</span>
            <Button variant="outline" size="sm" onClick={() => setHrPage((n) => Math.min(totalHrPages, n + 1))} disabled={hrPage >= totalHrPages}>Next</Button>
          </div>
        </TabsContent>

        <TabsContent value="accounts" className="space-y-3">
          <ReadOnlyHint canAct={Boolean(p?.accounts)} roleLabel="Accounts" />
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
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
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
                      <TableHead className="whitespace-nowrap">Status</TableHead>
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
                          <TableCell className="whitespace-nowrap text-xs">{row.staff_rank || "—"}</TableCell>
                          <TableCell className="text-xs">{row.loan_type_label || row.loan_type_key}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{row.requested_amount != null ? Number(row.requested_amount).toLocaleString("en-GH", { minimumFractionDigits: 2 }) : row.fixed_amount != null ? Number(row.fixed_amount).toLocaleString("en-GH", { minimumFractionDigits: 2 }) : "—"}</TableCell>
                          <TableCell><Badge className={statusBadgeClass(row.status, "solid")}>{statusText(row.status)}</Badge></TableCell>
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
                    <Button variant="outline" size="sm" onClick={() => void generateMemoPdf(row, row.director_letter || buildDirectorAutoMemoDraft(row, hrInputs[row.id]), row.director_signature_text || "")}>
                      <Download className="h-4 w-4 mr-1" /> Download Approval Letter
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openSecureMemo(row.id)}>
                      <FileText className="h-4 w-4 mr-1" /> Secure Memo PDF
                    </Button>
                  </div>
                </div>
              ))}
              {(data?.inbox.accountsSigned || []).length === 0 && <p className="text-sm text-muted-foreground">No approved records yet.</p>}
            </CardContent>
          </Card>
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
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
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
                      <TableHead className="whitespace-nowrap">Status</TableHead>
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
                        <TableCell><Badge className={statusBadgeClass(row.status, "solid")}>{statusText(row.status)}</Badge></TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{row.submitted_at ? new Date(row.submitted_at).toLocaleDateString("en-GB") : "—"}</TableCell>
                        {p?.committee && (
                          <TableCell>
                            <Button size="sm" className="text-xs whitespace-nowrap" onClick={() => openActionModal(row, "committee")}>Review &amp; Vote</Button>
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
              {p?.committee && <Button size="sm" onClick={() => openActionModal(row, "committee")}>Review &amp; Vote</Button>}
            </StageCard>
          ))}
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setCommitteePage((n) => Math.max(1, n - 1))} disabled={committeePage <= 1}>Prev</Button>
            <span className="text-xs text-muted-foreground">Page {committeePage} of {totalCommitteePages}</span>
            <Button variant="outline" size="sm" onClick={() => setCommitteePage((n) => Math.min(totalCommitteePages, n + 1))} disabled={committeePage >= totalCommitteePages}>Next</Button>
          </div>
        </TabsContent>

        <TabsContent value="director" className="space-y-3">
          <ReadOnlyHint canAct={Boolean(p?.directorHr)} roleLabel="Director HR" />
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
                  <div>FD: {row.fd_score ?? "N/A"} | Status: {statusText(row.status)}</div>
                  <div>Staff No: {row.staff_number || "N/A"} | Rank: {row.staff_rank || "N/A"}</div>
                </div>
              ))}
              {(data?.inbox?.directorGoodFd || []).length === 0 && <p className="text-sm text-muted-foreground">No FD-cleared requests available.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Director HR Approval Queue</CardTitle>
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

              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
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
                <div className="text-xs text-muted-foreground flex items-center md:justify-end">Showing {pagedDirector.length} of {filteredDirector.length}</div>
              </div>
            </CardContent>
          </Card>

          {filteredDirector.length === 0 && <p className="text-sm text-muted-foreground">No requests currently awaiting Director HR decision.</p>}

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
                        <TableHead className="whitespace-nowrap">Location</TableHead>
                        <TableHead className="whitespace-nowrap">Updated</TableHead>
                        <TableHead className="whitespace-nowrap">Memo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedMyTasks.map((row) => (
                        <TableRow key={`my-task-${row.id}`}>
                          <TableCell className="font-mono text-xs whitespace-nowrap">{row.request_number || row.id.slice(0, 8)}</TableCell>
                          <TableCell className="whitespace-nowrap font-medium">{row.staff_full_name || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{row.staff_number || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{row.staff_rank || "—"}</TableCell>
                          <TableCell className="text-xs">{row.loan_type_label || row.loan_type_key}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{row.requested_amount != null ? Number(row.requested_amount).toLocaleString("en-GH", { minimumFractionDigits: 2 }) : row.fixed_amount != null ? Number(row.fixed_amount).toLocaleString("en-GH", { minimumFractionDigits: 2 }) : "—"}</TableCell>
                          <TableCell><Badge className={statusBadgeClass(row.status, "solid")}>{statusText(row.status)}</Badge></TableCell>
                          <TableCell className="text-xs whitespace-nowrap">{row.staff_location_name || "—"}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">{fmtDate(row.updated_at || row.created_at)}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">
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
                  <div className="text-xs text-muted-foreground">Updated: {fmtDate(row.updated_at || row.created_at)}</div>
                  {["rejected_fd", "director_rejected", "approved_director", "awaiting_director_hr"].includes(row.status) && (
                    <div className="pt-2">
                      <Button variant="outline" size="sm" onClick={() => openSecureMemo(row.id)}>Open Memo</Button>
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
            <CardHeader>
              <CardTitle>All Loan Requests</CardTitle>
              <CardDescription>Full cross-organization visibility for admin, HR loan office, and Director HR.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <Input
                  value={allSearch}
                  onChange={(e) => setAllSearch(e.target.value)}
                  placeholder="Search by request/staff/rank/location"
                />
                <Select value={allStatus} onValueChange={setAllStatus}>
                  <SelectTrigger><SelectValue placeholder="Filter status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {Object.keys(STATUS_LABELS).map((status) => (
                      <SelectItem key={`overview-${status}`} value={status}>{statusText(status)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={allSort} onValueChange={(v: "newest" | "oldest") => setAllSort(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest first</SelectItem>
                    <SelectItem value="oldest">Oldest first</SelectItem>
                  </SelectContent>
                </Select>
                <div className="text-xs text-muted-foreground flex items-center md:justify-end">
                  Showing {pagedAllLoans.length} of {filteredAllLoans.length}
                </div>
              </div>

              <div className="flex justify-end">
                <Button variant="outline" onClick={() => downloadCsv(filteredAllLoans, "all-loan-requests.csv")}>
                  <Download className="h-4 w-4 mr-1" /> Export All Loans
                </Button>
              </div>

              {pagedAllLoans.map((row) => (
                <div key={row.id} className="rounded border p-3 text-sm">
                  {isAdmin && (
                    <div className="flex items-center justify-between mb-2">
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <input type="checkbox" checked={selectedLoanIds.includes(row.id)} onChange={() => toggleSelectedLoanId(row.id)} />
                        Select for delete
                      </label>
                      <Button variant="destructive" size="sm" onClick={() => void deleteLoanRequestById(row.id)}>Delete This Loan</Button>
                    </div>
                  )}
                  <div className="font-medium">{row.request_number} - {row.loan_type_label}</div>
                  {row.staff_full_name && <div className="font-semibold text-purple-900">Staff: {row.staff_full_name}</div>}
                  <div>{row.staff_rank || "N/A"} | Staff No: {row.staff_number || "N/A"}</div>
                  <div>Location: {row.staff_location_name || "N/A"} | District: {row.staff_district_name || "N/A"}</div>
                  <div className="text-muted-foreground">Address: {row.staff_location_address || "N/A"}</div>
                  <div>Amount: GHc {fmtAmount(row.fixed_amount || row.requested_amount)} | Status: {statusText(row.status)}</div>
                  {["approved_director", "director_rejected", "rejected_fd"].includes(row.status) && (
                    <div className="mt-2">
                      <Button variant="outline" size="sm" onClick={() => openSecureMemo(row.id)}>Open Secure Memo PDF</Button>
                    </div>
                  )}
                </div>
              ))}
              {filteredAllLoans.length === 0 && <p className="text-sm text-muted-foreground">No loans found.</p>}

              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setAllPage((n) => Math.max(1, n - 1))} disabled={allPage <= 1}>Prev</Button>
                <span className="text-xs text-muted-foreground">Page {allPage} of {totalAllLoanPages}</span>
                <Button variant="outline" size="sm" onClick={() => setAllPage((n) => Math.min(totalAllLoanPages, n + 1))} disabled={allPage >= totalAllLoanPages}>Next</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="setup" className="space-y-4">
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
                        setSetupFixedAmount(String(found?.fixed_amount || ""))
                        setSetupMaxAmount(String(found?.max_amount || found?.fixed_amount || ""))
                        setSetupQualification(String(found?.min_qualification_note || ""))
                      }}
                      placeholder="Choose loan type"
                      searchPlaceholder="Search loan type..."
                      options={(lookupData?.loanTypes || []).map((lt) => ({ value: lt.loan_key, label: lt.loan_label }))}
                    />
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
                </div>
                <Button
                  onClick={() => runLookupAction({
                    action: "update_loan_type",
                    loan_key: selectedLoanType,
                    fixed_amount: Number(setupFixedAmount || 0),
                    max_amount: Number(setupMaxAmount || 0),
                    min_qualification_note: setupQualification,
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
                        <label key={h.id} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm shadow-sm">
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
                    <label key={`batch-staff-${staff.id}`} className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm shadow-sm">
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
              <CardDescription>Review the active staff-to-HOD mapping records currently available in the system.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-3">
                <Input
                  value={linkageSearch}
                  onChange={(e) => setLinkageSearch(e.target.value)}
                  placeholder="Search by staff name, employee ID, HOD, rank, location, or district"
                />
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {filteredLinkageRows.map((link) => {
                  const staff = (lookupData?.staff || []).find((s) => s.id === link.staff_user_id)
                  const hod = (lookupData?.hods || []).find((h) => h.id === link.hod_user_id)
                  return (
                    <div key={link.id} className="rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-sm">
                      <div><strong>Staff:</strong> {staff ? `${staff.first_name} ${staff.last_name}` : link.staff_user_id} ({staff?.position || "N/A"})</div>
                      <div className="mt-1"><strong>HOD:</strong> {hod ? `${hod.first_name} ${hod.last_name}` : link.hod_user_id} ({hod?.position || "N/A"})</div>
                      <div className="mt-1"><strong>Location:</strong> {staff?.geofence_locations?.name || "N/A"}</div>
                      <div className="mt-1"><strong>District:</strong> {staff?.geofence_locations?.districts?.name || "N/A"}</div>
                      <div className="mt-1"><strong>Address:</strong> {staff?.geofence_locations?.address || "N/A"}</div>
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
                  <p className="text-sm text-muted-foreground">No staff-to-HOD linkages match your search.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

      {/* ── Action Modal ────────────────────────────────────────────── */}
      <Dialog open={actionModal.open} onOpenChange={(o) => setActionModal((s) => ({ ...s, open: o }))}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {actionModal.actionType === "hod" && "HOD Review & Decision"}
              {actionModal.actionType === "loan_office" && "Loan Office Review & Forward"}
              {actionModal.actionType === "accounts" && "Set FD Score"}
              {actionModal.actionType === "committee" && "Committee Decision"}
              {actionModal.actionType === "hr_terms" && "Set HR Terms & Forward to Director HR"}
            </DialogTitle>
            {actionModal.row && (
              <DialogDescription>
                <span className="font-semibold">{actionModal.row.request_number}</span> — {actionModal.row.loan_type_label} | {actionModal.row.staff_full_name || actionModal.row.staff_number || "Staff"}
                {actionModal.row.staff_rank ? ` | ${actionModal.row.staff_rank}` : ""}
                {" | GHc "}{fmtAmount(actionModal.row.fixed_amount || actionModal.row.requested_amount)}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="space-y-3 py-2">
            {/* HOD */}
            {actionModal.actionType === "hod" && (
              <>
                <Label>Decision</Label>
                <Select value={modalDecision} onValueChange={(v: "approve" | "reject") => setModalDecision(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approve">Approve</SelectItem>
                    <SelectItem value="reject">Reject</SelectItem>
                  </SelectContent>
                </Select>
                <Label>Note (optional)</Label>
                <Textarea value={modalNote} onChange={(e) => setModalNote(e.target.value)} placeholder="HOD review note" rows={3} />
              </>
            )}
            {/* Loan Office */}
            {actionModal.actionType === "loan_office" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Staff Name</Label>
                    <Input value={modalStaffFullName} onChange={(e) => setModalStaffFullName(e.target.value)} placeholder="Requesting staff full name" />
                  </div>
                  <div>
                    <Label>Staff Number</Label>
                    <Input value={modalStaffNumber} onChange={(e) => setModalStaffNumber(e.target.value)} placeholder="Staff number" />
                  </div>
                  <div>
                    <Label>Staff Rank</Label>
                    <Input value={modalStaffRank} onChange={(e) => setModalStaffRank(e.target.value)} placeholder="Rank" />
                  </div>
                  <div>
                    <Label>Corporate Email</Label>
                    <Input value={modalCorporateEmail} onChange={(e) => setModalCorporateEmail(e.target.value)} placeholder="staff@qcc.com" />
                  </div>
                </div>
                <Label>Reference Number</Label>
                <Input value={modalReferenceNumber} onChange={(e) => setModalReferenceNumber(e.target.value)} placeholder="QCC/HRD/SWL/V.2/0001" />
                <Label>THRO (HOD / Regional Manager / Department Head)</Label>
                <Select value={modalHodReviewerId} onValueChange={setModalHodReviewerId}>
                  <SelectTrigger><SelectValue placeholder="Select reviewer" /></SelectTrigger>
                  <SelectContent>
                    {(lookupData?.hods || []).map((h) => (
                      <SelectItem key={h.id} value={h.id}>{[h.first_name, h.last_name].filter(Boolean).join(" ") || h.email} {h.position ? `(${h.position})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Label>Assigned Director HR Approver</Label>
                <Select value={modalDirectorApproverId} onValueChange={setModalDirectorApproverId}>
                  <SelectTrigger><SelectValue placeholder="Select assigned approver" /></SelectTrigger>
                  <SelectContent>
                    {(data?.directorApprovers || []).map((approver) => (
                      <SelectItem key={approver.id} value={approver.id}>{approver.full_name} {approver.position ? `(${approver.position})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Label>Note (optional)</Label>
                <Textarea value={modalNote} onChange={(e) => setModalNote(e.target.value)} placeholder="Loan office note before forwarding" rows={3} />
              </>
            )}
            {/* Accounts FD */}
            {actionModal.actionType === "accounts" && (
              <>
                <Label>FD Score</Label>
                <Input type="number" value={modalFdScore} onChange={(e) => setModalFdScore(e.target.value)} placeholder="e.g. 75" />
                <Label>Accounts Note (optional)</Label>
                <Textarea value={modalFdNote} onChange={(e) => setModalFdNote(e.target.value)} placeholder="Accounts note" rows={2} />
              </>
            )}
            {/* Committee */}
            {actionModal.actionType === "committee" && (
              <>
                <Label>Decision</Label>
                <Select value={modalDecision} onValueChange={(v: "approve" | "reject") => setModalDecision(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approve">Approve</SelectItem>
                    <SelectItem value="reject">Reject</SelectItem>
                  </SelectContent>
                </Select>
                <Label>Note (optional)</Label>
                <Textarea value={modalNote} onChange={(e) => setModalNote(e.target.value)} placeholder="Committee decision note" rows={3} />
              </>
            )}
            {/* HR Terms */}
            {actionModal.actionType === "hr_terms" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Disbursement Date</Label>
                    <Input value={modalDisbursement} onChange={(e) => setModalDisbursement(e.target.value)} placeholder="YYYY-MM-DD" />
                  </div>
                  <div>
                    <Label>Recovery Start Date</Label>
                    <Input value={modalRecovery} onChange={(e) => setModalRecovery(e.target.value)} placeholder="YYYY-MM-DD" />
                  </div>
                  <div>
                    <Label>Recovery Months</Label>
                    <Input type="number" value={modalMonths} onChange={(e) => setModalMonths(e.target.value)} placeholder="e.g. 24" />
                  </div>
                  <div>
                    <Label>Memo Ref No.</Label>
                    <Input value={modalMemoRef} onChange={(e) => setModalMemoRef(e.target.value)} placeholder="QCC/HRD/SWL/V.2/..." />
                  </div>
                </div>
                <Label>HOD / Regional Manager Name</Label>
                <Input value={modalHodName} onChange={(e) => setModalHodName(e.target.value)} placeholder="e.g. THE REGIONAL MANAGER" />
                <Label>HOD Location (Station)</Label>
                <Input value={modalHodLocation} onChange={(e) => setModalHodLocation(e.target.value)} placeholder="e.g. Breman Asikuma" />
                <Label>Assigned Director HR Approver</Label>
                <Select value={modalDirectorApproverId} onValueChange={setModalDirectorApproverId}>
                  <SelectTrigger><SelectValue placeholder="Select assigned approver" /></SelectTrigger>
                  <SelectContent>
                    {(data?.directorApprovers || []).map((approver) => (
                      <SelectItem key={approver.id} value={approver.id}>{approver.full_name} {approver.position ? `(${approver.position})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Label>HR Note (optional)</Label>
                <Textarea value={modalNote} onChange={(e) => setModalNote(e.target.value)} placeholder="HR note" rows={2} />
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
                  {modalDecision === "approve" ? "Approve" : "Reject"}
                </Button>
              </>
            )}
            {actionModal.actionType === "loan_office" && actionModal.row && (
              <>
                <Button variant="outline" onClick={() => {
                  runAction({
                    action: "loan_office_update_request",
                    id: actionModal.row!.id,
                    note: modalNote || null,
                    staff_full_name: modalStaffFullName || null,
                    staff_number: modalStaffNumber || null,
                    staff_rank: modalStaffRank || null,
                    corporate_email: modalCorporateEmail || null,
                    reference_number: modalReferenceNumber || null,
                    hod_reviewer_id: modalHodReviewerId || null,
                    director_approver_id: modalDirectorApproverId || null,
                  })
                  setActionModal((s) => ({ ...s, open: false }))
                }}>Save Edits</Button>
                <Button onClick={() => {
                  runAction({
                    action: "loan_office_forward",
                    id: actionModal.row!.id,
                    note: modalNote || null,
                    staff_full_name: modalStaffFullName || null,
                    staff_number: modalStaffNumber || null,
                    staff_rank: modalStaffRank || null,
                    corporate_email: modalCorporateEmail || null,
                    reference_number: modalReferenceNumber || null,
                    hod_reviewer_id: modalHodReviewerId || null,
                    director_approver_id: modalDirectorApproverId || null,
                  })
                  setActionModal((s) => ({ ...s, open: false }))
                }}>Save &amp; Forward to Accounts</Button>
              </>
            )}
            {actionModal.actionType === "accounts" && actionModal.row && (
              <Button onClick={() => {
                runAction({ action: "accounts_fd_update", id: actionModal.row!.id, fd_score: Number(modalFdScore), note: modalFdNote || null })
                setActionModal((s) => ({ ...s, open: false }))
              }}>Save FD Score</Button>
            )}
            {actionModal.actionType === "committee" && actionModal.row && (
              <Button variant={modalDecision === "reject" ? "destructive" : "default"} onClick={() => {
                runAction({ action: "committee_decision", id: actionModal.row!.id, decision: modalDecision, note: modalNote || null })
                setActionModal((s) => ({ ...s, open: false }))
              }}>
                {modalDecision === "approve" ? "Approve" : "Reject"}
              </Button>
            )}
            {actionModal.actionType === "hr_terms" && actionModal.row && (
              <>
                <Button variant="outline" onClick={() => {
                  setMemoReviewModal({ open: true, row: { ...actionModal.row!, recovery_start_date: modalRecovery, disbursement_date: modalDisbursement, recovery_months: Number(modalMonths) || null, hod_name: modalHodName, hod_location: modalHodLocation } })
                  const draft = buildDirectorAutoMemoDraft({ ...actionModal.row!, recovery_start_date: modalRecovery, disbursement_date: modalDisbursement, recovery_months: Number(modalMonths) || null }, { hodName: modalHodName, hodLocation: modalHodLocation, memoRef: modalMemoRef })
                  setModalMemoText(draft)
                }}>Preview Memo</Button>
                <Button onClick={() => {
                  setHrInputs((s) => ({ ...s, [actionModal.row!.id]: { disbursement: modalDisbursement, recovery: modalRecovery, months: modalMonths, note: modalNote, hodName: modalHodName, hodLocation: modalHodLocation, memoRef: modalMemoRef } }))
                  runAction({
                    action: "hr_set_terms",
                    id: actionModal.row!.id,
                    disbursement_date: modalDisbursement,
                    recovery_start_date: modalRecovery,
                    recovery_months: Number(modalMonths || 0),
                    reference_number: modalMemoRef || null,
                    hod_name: modalHodName || null,
                    hod_location: modalHodLocation || null,
                    director_approver_id: modalDirectorApproverId || null,
                    note: modalNote || null,
                  })
                  setActionModal((s) => ({ ...s, open: false }))
                }}>Set Terms &amp; Forward to Director HR</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Memo Review Modal (Director HR + HR Terms Preview) ──────── */}
      <Dialog open={memoReviewModal.open} onOpenChange={(o) => setMemoReviewModal((s) => ({ ...s, open: o }))}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Memo Review — Director HR Final Approval</DialogTitle>
            <DialogDescription>
              Review and edit the memo below before signing and approving. This letter will be sent to the staff member, Accounts, and Loan Office upon approval.
            </DialogDescription>
          </DialogHeader>

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

          {/* Signature setup inside memo review modal */}
          {memoReviewModal.row && (
            <div className="space-y-2 border rounded p-4">
              <Label className="font-semibold">Director Signature</Label>
              <Select value={modalSignatureMode} onValueChange={(v: "typed" | "draw" | "upload") => setModalSignatureMode(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="typed">Type name</SelectItem>
                  <SelectItem value="draw">Draw signature</SelectItem>
                  <SelectItem value="upload">Upload image</SelectItem>
                </SelectContent>
              </Select>
              {modalSignatureMode === "typed" && (
                <Input value={modalSignatureText} onChange={(e) => setModalSignatureText(e.target.value)} placeholder="Director full name (e.g. OHENEBA BOAMAH)" />
              )}
              {modalSignatureMode === "upload" && (
                <Input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  const reader = new FileReader()
                  reader.onload = (ev) => setModalSignatureDataUrl(ev.target?.result as string)
                  reader.readAsDataURL(file)
                }} />
              )}
              {modalSignatureMode === "draw" && (
                <SignaturePad value={modalSignatureDataUrl} onChange={setModalSignatureDataUrl} />
              )}
              <div className="pt-2">
                <Label className="font-semibold">Final Decision</Label>
                <Select value={modalDecision} onValueChange={(v: "approve" | "reject") => setModalDecision(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approve">Approve</SelectItem>
                    <SelectItem value="reject">Reject</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setMemoReviewModal((s) => ({ ...s, open: false }))}>Close</Button>
            {memoReviewModal.row && (
              <Button variant="outline" onClick={() => {
                if (memoReviewModal.row) void generateMemoPdf(memoReviewModal.row, modalMemoText, modalSignatureText)
              }}>
                <Download className="h-4 w-4 mr-1" /> Download PDF
              </Button>
            )}
            {memoReviewModal.row && memoReviewModal.row.status === "awaiting_director_hr" && (
              <Button
                variant={modalDecision === "reject" ? "destructive" : "default"}
                className="bg-green-700 hover:bg-green-800 text-white"
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
                    note: "Director HR final decision via memo review",
                  })
                  setMemoReviewModal((s) => ({ ...s, open: false }))
                }}
              >
                {modalDecision === "approve" ? "✓ Approve & Send Letter" : "✗ Reject Request"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      </Tabs>
    </div>
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
        <div className="flex gap-2 flex-wrap">{children}</div>
      </CardContent>
    </Card>
  )
}
