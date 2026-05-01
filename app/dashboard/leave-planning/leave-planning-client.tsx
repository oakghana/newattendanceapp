"use client"

// ============================================================
// Leave Planning Client — V2 Redesign (4-stage workflow)
// Staff → HOD Review → HR Leave Office → HR Approval + Memo
// ============================================================

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { SignaturePad } from "@/components/leave/signature-pad"
import {
  isHrApproverRole,
  isHrLeaveOfficeRole,
  isManagerRole,
  isStaffRole,
  getStatusLabel,
  getStatusColor,
  HOD_PENDING_STATUSES,
  HR_OFFICE_PENDING_STATUSES,
  HR_APPROVER_PENDING_STATUSES,
  STAFF_EDITABLE_STATUSES,
} from "@/lib/leave-planning"
import { computeLeaveDays, computeReturnToWorkDate } from "@/lib/leave-policy"
import { useToast } from "@/hooks/use-toast"
import {
  CheckCircle2,
  ClipboardList,
  Send,
  UserCheck,
  ShieldCheck,
  ChevronRight,
  Download,
  AlertCircle,
  RefreshCw,
  CalendarDays,
  Plus,
  Minus,
  XCircle,
  Pencil,
  Trash2,
  Search,
  Clock3,
  ArrowUpDown,
  BarChart3,
  Activity,
  MapPin,
  Users,
} from "lucide-react"

interface LeaveAnalyticsRecord {
  id: string
  user_id: string
  staff_name: string
  employee_id?: string | null
  rank?: string | null
  leave_type_key: string
  start_date: string
  end_date: string
  days: number
  submitted_at?: string | null
  location_name?: string | null
  location_address?: string | null
  department_name?: string | null
}

interface LeaveAnalyticsPayload {
  rangeStart: string
  rangeEnd: string
  analytics: typeof EMPTY_HR_ANALYTICS
}

interface HrTemplateOption {
  id: string
  template_key: string
  template_name: string
  description?: string | null
  subject_template: string
  body_template: string
  cc_recipients?: string | null
  is_active: boolean
  category?: string | null
}

// ─── Helpers ────────────────────────────────────────────────────────────────

type SignatureMode = "typed" | "upload" | "draw"

interface LeaveTypeOption {
  leaveTypeKey: string
  leaveTypeLabel: string
  entitlementDays: number
  leaveYearPeriod: string
}

interface LeavePlanningClientProps {
  profile: {
    role: string
    firstName?: string
    lastName?: string
    departmentName: string | null
    departmentCode: string | null
  }
}

async function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function fmtDate(val?: string | null) {
  if (!val) return "—"
  try {
    return new Date(val).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" })
  } catch { return val }
}

function fmtName(user?: any) {
  if (!user) return "—"
  return [user.first_name, user.last_name].filter(Boolean).join(" ") || user.employee_id || "—"
}

function leaveTypeLabelShort(key: string) {
  const map: Record<string, string> = {
    annual: "Annual", sick: "Sick", maternity: "Maternity", paternity: "Paternity",
    study: "Study", compassionate: "Compassionate", part_leave: "Part Leave",
    no_pay: "No Pay", casual: "Casual",
  }
  return map[key] || key
}

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10)
}

// ─── Corporate Memo Template Builder ────────────────────────────────────────
function buildMemoTemplate(req: any): { subject: string; body: string } {
  const leaveType = String(req.leave_type_key || "annual")
  const labelMap: Record<string, string> = {
    annual: "Annual Leave",
    sick: "Sick Leave",
    maternity: "Maternity Leave",
    paternity: "Paternity Leave",
    study: "Study Leave",
    compassionate: "Compassionate Leave",
    part_leave: "Part Leave",
    no_pay: "Leave Without Pay",
    casual: "Casual Leave",
  }
  const leaveLabel = labelMap[leaveType] || leaveTypeLabelShort(leaveType)
  const yearPeriod = String(req.leave_year_period || "2026/2027")
  const staffName = String(req.staff_name || "")
  const employeeId = String(req.employee_id || "")
  const rank = String(req.rank || "")
  const deptName = String(req.department_name || "")
  const effectiveStart = req.adjusted_start_date || req.preferred_start_date
  const effectiveEnd = req.adjusted_end_date || req.preferred_end_date
  const effectiveDays = Number(req.adjusted_days || req.requested_days || 0)

  const fmtLong = (val?: string | null) => {
    if (!val) return "—"
    try {
      return new Date(val).toLocaleDateString("en-GH", { day: "2-digit", month: "long", year: "numeric" })
    } catch { return val }
  }

  const startStr = fmtLong(effectiveStart)
  const endStr = fmtLong(effectiveEnd)

  // Return-to-work: next business day after leave end
  let returnStr = "—"
  if (effectiveEnd) {
    const ret = new Date(effectiveEnd)
    ret.setDate(ret.getDate() + 1)
    if (ret.getDay() === 6) ret.setDate(ret.getDate() + 2)
    if (ret.getDay() === 0) ret.setDate(ret.getDate() + 1)
    returnStr = fmtLong(ret.toISOString().slice(0, 10))
  }

  const submittedStr = fmtLong(req.submitted_at || req.created_at)

  const refCodeMap: Record<string, string> = {
    annual: "AL",
    sick: "SL",
    maternity: "MAT",
    paternity: "PAT",
    study: "STL",
    compassionate: "CL",
    part_leave: "PL",
    no_pay: "LWP",
    casual: "CSL",
  }
  const refCode = refCodeMap[leaveType] || "LV"
  const yearShort = yearPeriod.slice(-4)

  const subject = `APPLICATION FOR ${leaveLabel.toUpperCase()} — ${yearPeriod}`

  const header = [
    `TO: ${staffName}${employeeId ? ` (${employeeId})` : ""}`,
    rank ? `POSITION: ${rank}` : "",
    deptName ? `DEPARTMENT: ${deptName}` : "",
    `REF: QCC/HRD/LV/${refCode}/${yearShort}`,
    `DATE: ${new Date().toLocaleDateString("en-GH", { day: "2-digit", month: "long", year: "numeric" })}`,
  ].filter(Boolean).join("\n")

  const opening = `We refer to your application for ${leaveLabel} dated ${submittedStr} on the above subject and wish to inform you that Management has approved your leave request as follows:`

  const details = [
    `Leave Type:          ${leaveLabel}`,
    `Leave Period:        ${startStr} to ${endStr}`,
    `Approved Days:       ${effectiveDays} day(s)`,
    `Return to Work Date: ${returnStr}`,
  ].join("\n")

  const specificParagraphMap: Record<string, string> = {
    annual: `You are requested to ensure that all official duties are properly handed over before proceeding on leave. You are expected to resume duty on ${returnStr}.`,
    sick: `Management wishes you a speedy recovery. Please ensure that you submit your medical certificate / sick sheet to the Human Resource Department upon your return to duty on ${returnStr}.`,
    maternity: `Management extends its congratulations to you on this occasion. You are expected to resume duty on ${returnStr}. Please ensure that all relevant documentation is submitted to the Human Resource Department upon your return.`,
    paternity: `Management extends its congratulations to you on the occasion of the birth of your child. You are expected to resume duty on ${returnStr}.`,
    study: `You are to ensure that all your official duties are properly handed over before proceeding on leave. You are required to submit your academic results or progress report to the Human Resource Department upon your return on ${returnStr}.`,
    compassionate: `Management extends its sympathies during this difficult period. You are expected to resume duty on ${returnStr}.`,
    part_leave: `You are requested to ensure that all official duties are properly handed over before proceeding on leave. You are expected to resume duty on ${returnStr}.`,
    no_pay: `Please note that this leave is approved without pay for the entire approved period. You are expected to resume duty on ${returnStr}.`,
    casual: `Please note that casual leave is granted at the discretion of Management. You are expected to resume duty on ${returnStr}.`,
  }
  const specificPara = specificParagraphMap[leaveType] || `You are expected to resume duty on ${returnStr}.`

  const closing = `By a copy of this letter, the relevant departments are notified of your approved leave period.\n\nYou can count on our co-operation.`

  const body = [header, "", subject, "", opening, "", details, "", specificPara, "", closing].join("\n")

  return { subject, body }
}
// ────────────────────────────────────────────────────────────────────────────

function getCurrentMonthRange() {
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0))
  return { start: toIsoDate(start), end: toIsoDate(end) }
}

function downloadLeaveAnalyticsCsv(rows: LeaveAnalyticsRecord[], fileName: string) {
  const headers = [
    "Staff Name",
    "Employee ID",
    "Rank",
    "Leave Type",
    "Start Date",
    "End Date",
    "Days",
    "Location",
    "Department",
    "Submitted At",
  ]

  const body = rows.map((row) => [
    row.staff_name,
    row.employee_id || "",
    row.rank || "",
    leaveTypeLabelShort(row.leave_type_key),
    row.start_date,
    row.end_date,
    String(row.days || 0),
    row.location_name || "",
    row.department_name || "",
    row.submitted_at ? fmtDate(row.submitted_at) : "",
  ])

  const csv = [headers, ...body]
    .map((line) => line.map((cell) => `"${String(cell).replaceAll("\"", "\"\"")}"`).join(","))
    .join("\n")

  const blob = new Blob([csv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

async function downloadLeaveAnalyticsPdf(rows: LeaveAnalyticsRecord[], fileName: string, title: string) {
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
    head: [["Staff Name", "Employee ID", "Leave Type", "Start", "End", "Days", "Location"]],
    body: rows.map((row) => [
      row.staff_name,
      row.employee_id || "",
      leaveTypeLabelShort(row.leave_type_key),
      row.start_date,
      row.end_date,
      String(row.days || 0),
      row.location_name || row.department_name || "",
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [10, 122, 117] },
  })

  doc.save(fileName)
}

// ─── Stage Progress Indicator ────────────────────────────────────────────────
function WorkflowStages({ status }: { status: string }) {
  const stages = [
    { label: "Submitted", Icon: Send },
    { label: "HOD Review", Icon: UserCheck },
    { label: "HR Leave Office", Icon: ClipboardList },
    { label: "HR Approval", Icon: ShieldCheck },
  ]
  const rejected = status === "hod_rejected" || status === "manager_rejected"
  const hrRejected = status === "hr_rejected"
  const stageIndex =
    status === "hr_approved" || hrRejected ? 4
    : status === "hr_office_forwarded" ? 3
    : status === "hod_approved" || status === "manager_confirmed" ? 2
    : 1

  return (
    <div className="flex items-center w-full py-2">
      {stages.map(({ label, Icon }, i) => {
        const step = i + 1
        const done = step < stageIndex
        const active = step === stageIndex
        const stepRejected = (rejected && step === 2) || (hrRejected && step === 4)
        return (
          <div key={label} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center flex-shrink-0">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${
                stepRejected ? "bg-red-500 border-red-500 text-white"
                : done ? "bg-emerald-500 border-emerald-500 text-white"
                : active ? "bg-green-700 border-green-700 text-white ring-4 ring-green-200"
                : "bg-white border-slate-300 text-slate-400"
              }`}>
                {stepRejected ? <XCircle className="w-4 h-4" />
                : done ? <CheckCircle2 className="w-4 h-4" />
                : <Icon className="w-4 h-4" />}
              </div>
              <span className={`text-[10px] mt-1 font-medium whitespace-nowrap ${
                stepRejected ? "text-red-600"
                : done ? "text-emerald-600"
                : active ? "text-green-800 font-semibold"
                : "text-slate-400"
              }`}>{label}</span>
            </div>
            {i < stages.length - 1 && (
              <div className={`h-0.5 flex-1 mx-1 ${done ? "bg-emerald-400" : "bg-slate-200"}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── InfoPill ────────────────────────────────────────────────────────────────
function InfoPill({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-2 text-center border ${highlight ? "bg-green-50 border-green-200" : "bg-slate-50 border-slate-200"}`}>
      <p className="text-[10px] uppercase font-medium text-slate-500">{label}</p>
      <p className={`text-sm font-bold ${highlight ? "text-green-800" : "text-slate-800"}`}>{value}</p>
    </div>
  )
}

function StaffHistoryPanel({
  history,
  currentRequestId,
}: {
  history: any[]
  currentRequestId?: string
}) {
  const rows = (history || []).filter((item: any) => String(item?.id || "") !== String(currentRequestId || "")).slice(0, 5)
  if (rows.length === 0) return null

  return (
    <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50/60 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-900">Staff Leave History</p>
      <div className="mt-2 space-y-2">
        {rows.map((entry: any) => {
          const status = String(entry?.status || "")
          const start = String(entry?.adjusted_start_date || entry?.preferred_start_date || "")
          const end = String(entry?.adjusted_end_date || entry?.preferred_end_date || "")
          const days = Number(entry?.adjusted_days || entry?.requested_days || 0)
          const leaveType = leaveTypeLabelShort(String(entry?.leave_type_key || "annual"))
          return (
            <div key={String(entry?.id || `${start}-${end}-${status}`)} className="rounded border border-violet-100 bg-white px-2 py-1.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-slate-700">
                  {leaveType} · {fmtDate(start)} to {fmtDate(end)} · {days} day(s)
                </p>
                <Badge className={`text-[10px] border ${getStatusColor(status)}`}>{getStatusLabel(status)}</Badge>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ScientificMetricCard({
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
    <div className={`rounded-2xl border bg-white/95 p-4 shadow-sm ${accent}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{hint}</p>
        </div>
        <div className="rounded-2xl border border-white/70 bg-white p-3 text-slate-700 shadow-sm">
          {icon}
        </div>
      </div>
    </div>
  )
}

function ScientificBarChart({
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
                    <span className="font-medium text-slate-700">{formatter ? formatter(row) : String(row?.name || row?.status || row?.leave_type_key || "Item")}</span>
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

function CurrentLeaveRoster({ rows }: { rows: any[] }) {
  return (
    <Card className="border border-slate-200 bg-white shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm text-slate-900">Currently On Leave</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">No staff are currently on approved leave.</p>
        ) : (
          <div className="space-y-3">
            {rows.map((row: any) => (
              <div key={String(row?.id || row?.employee_id || row?.staff_name)} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{row?.staff_name || "Staff"}</p>
                    <p className="text-xs text-slate-500">{row?.employee_id || "No ID"} · {leaveTypeLabelShort(String(row?.leave_type_key || "annual"))}</p>
                  </div>
                  <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700">{row?.days || 0}d</Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                  <span>{fmtDate(row?.start_date)} to {fmtDate(row?.end_date)}</span>
                  <span>•</span>
                  <span>{row?.location_name || "Unassigned Location"}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

const EMPTY_HR_ANALYTICS = {
  totals: {
    outstanding_requests: 0,
    approved_total: 0,
    staff_on_leave_now: 0,
    staff_yet_to_enjoy: 0,
    staff_completed_leave: 0,
    completed_leave_requests: 0,
    unique_staff_in_range: 0,
  },
  outstanding_by_status: [],
  leave_type_breakdown: [],
  location_ranking: [],
  current_leave_roster: [],
  daily_leave_counts: [],
  monthly_leave_counts: [],
  records: [],
}
// ─── Leave Request Card ───────────────────────────────────────────────────────
function LeaveRequestCard({ req, onEdit, onDelete, onViewMemo, canEdit }: {
  req: any; onEdit?: () => void; onDelete?: () => void; onViewMemo?: () => void; canEdit: boolean
}) {
  const effectiveStart = req.adjusted_start_date || req.preferred_start_date
  const effectiveEnd = req.adjusted_end_date || req.preferred_end_date
  const effectiveDays = req.adjusted_days || req.requested_days
  return (
    <Card className="border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="font-semibold text-slate-800 text-sm">
              {leaveTypeLabelShort(req.leave_type_key)} — {req.leave_year_period}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {fmtDate(effectiveStart)} → {fmtDate(effectiveEnd)}
              <span className="ml-2 font-medium text-slate-700">{effectiveDays} day(s)</span>
            </p>
          </div>
          <Badge className={`text-xs border ${getStatusColor(req.status)} shrink-0`}>
            {getStatusLabel(req.status)}
          </Badge>
        </div>
        <WorkflowStages status={req.status} />
        {req.adjustment_reason && (
          <Alert className="mt-3 py-2 border-blue-200 bg-blue-50">
            <AlertCircle className="h-3 w-3 text-blue-600" />
            <AlertDescription className="text-xs text-blue-800 ml-1">
              <strong>HR Office adjustment:</strong> {req.adjustment_reason}
              {req.adjusted_days && req.original_requested_days && req.adjusted_days !== req.original_requested_days && (
                <span className="ml-1">({req.original_requested_days}d → {req.adjusted_days}d)</span>
              )}
            </AlertDescription>
          </Alert>
        )}
        {req.manager_recommendation && (
          <p className="text-xs text-slate-600 mt-2 bg-slate-50 p-2 rounded border border-slate-200">
            <strong>HOD note:</strong> {req.manager_recommendation}
          </p>
        )}
        {req.memo_subject && req.memo_body && req.status !== "hr_approved" && (
          <div className="mt-2 rounded border border-emerald-200 bg-emerald-50 p-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">Auto Memo Reference</p>
            <p className="mt-1 text-xs font-medium text-emerald-900">{String(req.memo_subject)}</p>
            <p className="mt-1 text-xs text-emerald-800 line-clamp-4">{String(req.memo_body)}</p>
          </div>
        )}
        {req.hr_approval_note && (
          <p className="text-xs text-slate-600 mt-2 bg-slate-50 p-2 rounded border border-slate-200">
            <strong>HR note:</strong> {req.hr_approval_note}
          </p>
        )}
        <div className="flex gap-2 mt-3 justify-end flex-wrap">
          {req.status === "hr_approved" && req.memo_token && onViewMemo && (
            <Button size="sm" variant="outline"
              className="h-7 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              onClick={onViewMemo}>
              <Download className="w-3 h-3 mr-1" /> Download Memo
            </Button>
          )}
          {canEdit && onEdit && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onEdit}>
              <Pencil className="w-3 h-3 mr-1" /> Edit
            </Button>
          )}
          {canEdit && onDelete && (
            <Button size="sm" variant="outline"
              className="h-7 text-xs border-red-200 text-red-600 hover:bg-red-50"
              onClick={onDelete}>
              <Trash2 className="w-3 h-3 mr-1" /> Withdraw
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function LeavePlanningClient({ profile }: LeavePlanningClientProps) {
  const { toast } = useToast()
  const normalizedRole = String(profile.role || "").toLowerCase().trim().replace(/[-\s]+/g, "_")

  const isStaff = isStaffRole(normalizedRole)
  const isHod = isManagerRole(normalizedRole) &&
    !isHrApproverRole(normalizedRole, profile.departmentName, profile.departmentCode) &&
    !isHrLeaveOfficeRole(normalizedRole)
  const isHrOffice = isHrLeaveOfficeRole(normalizedRole)
  const isHrApprover = isHrApproverRole(normalizedRole, profile.departmentName, profile.departmentCode) && !isHrOffice
  const isAdmin = normalizedRole === "admin"
  const canViewLeaveAnalytics = normalizedRole === "loan_office"
  const canSelfApply = isStaff || isHod || isAdmin ||
    ["hr_officer", "hr_director", "director_hr", "manager_hr", "hr_leave_office", "hr_office", "loan_office"].includes(normalizedRole)

  // ── Data ────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<any>(null)
  const [activeTab, setActiveTab] = useState("my-leaves")
  const [hrOfficeShowArchived, setHrOfficeShowArchived] = useState(false)
  const [hrOfficePageSize, setHrOfficePageSize] = useState(100)
  const [hrOfficePage, setHrOfficePage] = useState(1)
  const [hrOfficeSearch, setHrOfficeSearch] = useState("")
  const [hrOfficeStatusFilter, setHrOfficeStatusFilter] = useState("all")
  const [hrOfficeSortBy, setHrOfficeSortBy] = useState("priority")
  const [hrOfficeAutoRefresh, setHrOfficeAutoRefresh] = useState(true)
  const [hrOfficeLastRefresh, setHrOfficeLastRefresh] = useState<string | null>(null)
  const [analyticsRange, setAnalyticsRange] = useState(() => getCurrentMonthRange())
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsData, setAnalyticsData] = useState<LeaveAnalyticsPayload | null>(null)

  // ── Submit form ─────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null)
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [leaveType, setLeaveType] = useState("annual")
  const [reason, setReason] = useState("")
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeOption[]>([])
  const [signatureMode, setSignatureMode] = useState<SignatureMode>("typed")
  const [typedSignature, setTypedSignature] = useState("")
  const [uploadedSigUrl, setUploadedSigUrl] = useState<string | null>(null)
  const [drawnSigUrl, setDrawnSigUrl] = useState<string | null>(null)

  const defaultStaffSignature = useMemo(() => {
    const fullName = [String(profile.firstName || "").trim(), String(profile.lastName || "").trim()]
      .filter(Boolean)
      .join(" ")
      .trim()
    return fullName || "Staff Signature"
  }, [profile.firstName, profile.lastName])

  // ── HOD review ──────────────────────────────────────────────────────
  const [hodAction, setHodAction] = useState<Record<string, "approve" | "reject" | "recommend_change">>({})
  const [hodNote, setHodNote] = useState<Record<string, string>>({})
  const [hodAdjStart, setHodAdjStart] = useState<Record<string, string>>({})
  const [hodAdjEnd, setHodAdjEnd] = useState<Record<string, string>>({})
  const [hodSubmitting, setHodSubmitting] = useState<string | null>(null)

  // ── HR Leave Office ─────────────────────────────────────────────────
  const [officeExpanded, setOfficeExpanded] = useState<string | null>(null)
  const [officeAdjStart, setOfficeAdjStart] = useState<Record<string, string>>({})
  const [officeAdjEnd, setOfficeAdjEnd] = useState<Record<string, string>>({})
  const [officeHolidayDays, setOfficeHolidayDays] = useState<Record<string, string>>({})
  const [officeTravelDays, setOfficeTravelDays] = useState<Record<string, string>>({})
  const [officePriorDays, setOfficePriorDays] = useState<Record<string, string>>({})
  const [officeReason, setOfficeReason] = useState<Record<string, string>>({})
  const [officeMemoSubject, setOfficeMemoSubject] = useState<Record<string, string>>({})
  const [officeMemoBody, setOfficeMemoBody] = useState<Record<string, string>>({})
  const [officeMemoCc, setOfficeMemoCc] = useState<Record<string, string>>({})
  const [officeTemplateKey, setOfficeTemplateKey] = useState<Record<string, string>>({})
  const [officeSubmitting, setOfficeSubmitting] = useState<string | null>(null)

  // ── HR Approver ─────────────────────────────────────────────────────
  const [hrNote, setHrNote] = useState<Record<string, string>>({})
  const [hrSigMode, setHrSigMode] = useState<SignatureMode>("typed")
  const [hrSigTyped, setHrSigTyped] = useState("")
  const [hrSigDataUrl, setHrSigDataUrl] = useState<string | null>(null)
  const [hrMemoSubject, setHrMemoSubject] = useState<Record<string, string>>({})
  const [hrMemoBody, setHrMemoBody] = useState<Record<string, string>>({})
  const [hrMemoCc, setHrMemoCc] = useState<Record<string, string>>({})
  const [hrSubmitting, setHrSubmitting] = useState<string | null>(null)
  const [hrExpandedId, setHrExpandedId] = useState<string | null>(null)
  const [templateOptions, setTemplateOptions] = useState<HrTemplateOption[]>([])

  // ── Computed ────────────────────────────────────────────────────────
  const activeSig = useMemo(() => {
    if (signatureMode === "typed") return { text: (typedSignature || defaultStaffSignature) || null, dataUrl: null }
    if (signatureMode === "upload") return { text: null, dataUrl: uploadedSigUrl }
    return { text: null, dataUrl: drawnSigUrl }
  }, [signatureMode, typedSignature, uploadedSigUrl, drawnSigUrl, defaultStaffSignature])

  const computedDays = useMemo(() => {
    if (!startDate || !endDate) return 0
    return computeLeaveDays(startDate, endDate)
  }, [startDate, endDate])

  const selectedLeaveType = useMemo(
    () => leaveTypes.find((t) => t.leaveTypeKey === leaveType),
    [leaveTypes, leaveType],
  )

  // ── Real-time same-month conflict warning ────────────────────────────
  const sameMonthConflict = useMemo(() => {
    if (!startDate || !leaveType || !data?.myRequests) return null
    const newStart = new Date(startDate)
    if (Number.isNaN(newStart.getTime())) return null
    const newYear = newStart.getFullYear()
    const newMonth = newStart.getMonth()
    const BLOCKING = [
      "pending",
      "pending_hod",
      "pending_hr",
      "pending_manager_review",
      "pending_hod_review",
      "manager_changes_requested",
      "hod_changes_requested",
      "manager_confirmed",
      "hod_approved",
      "hr_office_forwarded",
      "approved",
      "hr_approved",
    ]

    return (data.myRequests as any[]).find((r: any) => {
      if (r.leave_type_key !== leaveType) return false
      if (r.is_archived) return false
      if (editingId && r.id === editingId) return false
      if (!BLOCKING.includes(String(r.status || ""))) return false

      const rStart = new Date(r.preferred_start_date)
      const rEnd = new Date(r.preferred_end_date)
      if (Number.isNaN(rStart.getTime()) || Number.isNaN(rEnd.getTime())) return false

      let cursor = new Date(rStart.getFullYear(), rStart.getMonth(), 1)
      const rEndMonth = new Date(rEnd.getFullYear(), rEnd.getMonth(), 1)
      while (cursor <= rEndMonth) {
        if (cursor.getFullYear() === newYear && cursor.getMonth() === newMonth) return true
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
      }
      return false
    }) || null
  }, [startDate, leaveType, data?.myRequests, editingId])

  // ── Loaders ─────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const query = hrOfficeShowArchived ? "?includeArchived=true" : ""
      const res = await fetch(`/api/leave/planning${query}`, { cache: "no-store" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to load data")
      setData(json)
      setHrOfficeLastRefresh(new Date().toISOString())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data")
    } finally {
      setLoading(false)
    }
  }, [hrOfficeShowArchived])

  const loadPolicy = useCallback(async () => {
    try {
      const res = await fetch("/api/leave/policy", { cache: "no-store" })
      const json = await res.json()
      if (!res.ok) return
      const types: LeaveTypeOption[] = Array.isArray(json.leaveTypes) ? json.leaveTypes : []
      const hasPartLeave = types.some((t) => t.leaveTypeKey === "part_leave")
      setLeaveTypes(hasPartLeave ? types : [
        ...types,
        { leaveTypeKey: "part_leave", leaveTypeLabel: "Part Leave", entitlementDays: 15, leaveYearPeriod: "2026/2027" },
      ])
    } catch { /* silent */ }
  }, [])

  const loadTemplateOptions = useCallback(async () => {
    try {
      const res = await fetch("/api/leave/templates", { cache: "no-store" })
      const json = await res.json()
      if (!res.ok) return
      setTemplateOptions(Array.isArray(json.templates) ? json.templates.filter((row: HrTemplateOption) => row.is_active !== false) : [])
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    // Staff requests should default to typed signature using their profile name.
    if (canSelfApply) {
      setSignatureMode("typed")
      if (!typedSignature.trim()) {
        setTypedSignature(defaultStaffSignature)
      }
    }
  }, [canSelfApply, defaultStaffSignature, typedSignature])

  useEffect(() => {
    void loadData()
    void loadPolicy()
    void loadTemplateOptions()
  }, [loadData, loadPolicy, loadTemplateOptions])

  useEffect(() => {
    setHrOfficePage(1)
  }, [hrOfficePageSize, hrOfficeShowArchived, hrOfficeSearch, hrOfficeStatusFilter, hrOfficeSortBy])

  useEffect(() => {
    if (activeTab !== "hr-office" || !hrOfficeAutoRefresh) return
    const timer = setInterval(() => {
      void loadData()
    }, 30000)
    return () => clearInterval(timer)
  }, [activeTab, hrOfficeAutoRefresh, loadData])

  useEffect(() => {
    if (!canViewLeaveAnalytics) return

    let cancelled = false
    const loadAnalytics = async () => {
      setAnalyticsLoading(true)
      try {
        const params = new URLSearchParams({
          start: analyticsRange.start,
          end: analyticsRange.end,
        })
        const res = await fetch(`/api/leave/analytics?${params.toString()}`, { cache: "no-store" })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || "Failed to load leave analytics")
        if (!cancelled) setAnalyticsData(json)
      } catch (e) {
        if (!cancelled) {
          toast({
            title: "Analytics load failed",
            description: e instanceof Error ? e.message : "Failed to load leave analytics",
            variant: "destructive",
          })
        }
      } finally {
        if (!cancelled) setAnalyticsLoading(false)
      }
    }

    void loadAnalytics()
    return () => {
      cancelled = true
    }
  }, [analyticsRange.end, analyticsRange.start, canViewLeaveAnalytics, toast])

  // ── Derived lists ────────────────────────────────────────────────────
  const myRequests: any[] = useMemo(() => data ? (data.myRequests || data.requests || []) : [], [data])

  const hodAssignedReviews: any[] = useMemo(() => {
    if (!data) return []
    return data.reviews || []
  }, [data])

  const staffHistoryByUser: Record<string, any[]> = useMemo(() => {
    if (!data) return {}
    return data.staffHistoryByUser || {}
  }, [data])

  const hodPendingReviews: any[] = useMemo(() => {
    if (!data) return []
    return (data.reviews || []).filter((r: any) => {
      const status = String(r?.leave_plan_request?.status || "")
      return (HOD_PENDING_STATUSES as string[]).includes(status) && r.decision === "pending"
    })
  }, [data])

  const hodWorkedOnReviews: any[] = useMemo(() => {
    return hodAssignedReviews.filter((r: any) => {
      const status = String(r?.leave_plan_request?.status || "")
      return r.decision !== "pending" || !(HOD_PENDING_STATUSES as string[]).includes(status)
    })
  }, [hodAssignedReviews])

  const hrOfficeQueue: any[] = useMemo(() => {
    if (!data) return []
    return (data.requests || []).filter((r: any) =>
      (HR_OFFICE_PENDING_STATUSES as string[]).includes(String(r?.status || "")),
    )
  }, [data])

  const hrOfficeFilteredQueue: any[] = useMemo(() => {
    let rows = [...hrOfficeQueue]

    if (hrOfficeStatusFilter !== "all") {
      rows = rows.filter((r: any) => String(r?.status || "") === hrOfficeStatusFilter)
    }

    const search = hrOfficeSearch.trim().toLowerCase()
    if (search) {
      rows = rows.filter((r: any) => {
        const fullName = fmtName(r.user).toLowerCase()
        const employeeId = String(r?.user?.employee_id || "").toLowerCase()
        const leaveType = leaveTypeLabelShort(String(r?.leave_type_key || "")).toLowerCase()
        const status = getStatusLabel(String(r?.status || "")).toLowerCase()
        return (
          fullName.includes(search) ||
          employeeId.includes(search) ||
          leaveType.includes(search) ||
          status.includes(search)
        )
      })
    }

    const statusRank: Record<string, number> = {
      hod_approved: 0,
      manager_confirmed: 1,
    }

    rows.sort((a: any, b: any) => {
      if (hrOfficeSortBy === "oldest") {
        return new Date(String(a?.created_at || 0)).getTime() - new Date(String(b?.created_at || 0)).getTime()
      }
      if (hrOfficeSortBy === "longest") {
        return Number(b?.requested_days || 0) - Number(a?.requested_days || 0)
      }
      if (hrOfficeSortBy === "priority") {
        const left = statusRank[String(a?.status || "")] ?? 9
        const right = statusRank[String(b?.status || "")] ?? 9
        if (left !== right) return left - right
      }
      return new Date(String(b?.created_at || 0)).getTime() - new Date(String(a?.created_at || 0)).getTime()
    })

    return rows
  }, [hrOfficeQueue, hrOfficeSearch, hrOfficeSortBy, hrOfficeStatusFilter])

  const hrOfficeVisibleRows = useMemo(() => {
    const start = (hrOfficePage - 1) * hrOfficePageSize
    return hrOfficeFilteredQueue.slice(start, start + hrOfficePageSize)
  }, [hrOfficeFilteredQueue, hrOfficePage, hrOfficePageSize])

  const hrOfficeTotalPages = useMemo(() => {
    return Math.max(1, Math.ceil(hrOfficeFilteredQueue.length / hrOfficePageSize))
  }, [hrOfficeFilteredQueue.length, hrOfficePageSize])

  const hrApproverQueue: any[] = useMemo(() => {
    if (!data) return []
    return (data.requests || []).filter((r: any) =>
      ["hod_approved", "manager_confirmed", ...(HR_APPROVER_PENDING_STATUSES as string[])].includes(String(r?.status || "")),
    )
  }, [data])

  const hrOfficeAnalytics = useMemo(() => {
    if (analyticsData?.analytics) return analyticsData.analytics
    if (!data?.analytics) return EMPTY_HR_ANALYTICS
    return data.analytics
  }, [analyticsData, data])

  // ── Actions ──────────────────────────────────────────────────────────

  const submitPlan = async () => {
    if (!startDate || !endDate) {
      toast({ title: "Missing dates", description: "Please select start and end dates.", variant: "destructive" })
      return
    }
    if (!activeSig.text && !activeSig.dataUrl) {
      toast({ title: "Signature required", description: "Please provide your signature.", variant: "destructive" })
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/leave/planning", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          leave_year_period: "2026/2027",
          preferred_start_date: startDate,
          preferred_end_date: endDate,
          leave_type: leaveType,
          reason,
          user_signature_mode: signatureMode,
          user_signature_text: activeSig.text,
          user_signature_data_url: activeSig.dataUrl,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        if (json?.code === "LEAVE_DATE_OVERLAP" && json?.suggested_start_date && json?.suggested_end_date) {
          const useSuggestion = window.confirm(
            `${json.error}\n\nExisting request: ${json.conflict?.start_date || ""} to ${json.conflict?.end_date || ""}.\nSuggested next available dates: ${json.suggested_start_date} to ${json.suggested_end_date}.\n\nClick OK to use the suggested dates.`,
          )
          if (useSuggestion) {
            setStartDate(json.suggested_start_date)
            setEndDate(json.suggested_end_date)
          }
          throw new Error(json.error || "Selected dates overlap with an existing leave request")
        }
        if (json?.code === "SAME_MONTH_LEAVE_REQUEST") {
          throw new Error(json.error || "You already have a leave request of this type in the selected month.")
        }
        throw new Error(json.error || "Submission failed")
      }
      toast({
        title: editingId ? "Leave request updated" : "Leave request submitted",
        description: `Return-to-work: ${computeReturnToWorkDate(endDate)}`,
      })
      setStartDate(""); setEndDate(""); setReason(""); setEditingId(null)
      setTypedSignature(""); setUploadedSigUrl(null); setDrawnSigUrl(null)
      setActiveTab("my-leaves")
      await loadData()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission failed")
    } finally {
      setSubmitting(false)
    }
  }

  const deletePlan = async (id: string) => {
    if (!confirm("Withdraw this leave request?")) return
    try {
      const res = await fetch("/api/leave/planning", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Delete failed")
      toast({ title: "Leave request withdrawn" })
      await loadData()
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Delete failed", variant: "destructive" })
    }
  }

  const submitHodReview = async (reviewId: string, requestId: string) => {
    const action = hodAction[reviewId]
    if (!action) { toast({ title: "Select an action", variant: "destructive" }); return }
    if (action !== "approve" && !hodNote[reviewId]) {
      toast({ title: "Note required", description: "Please provide a note.", variant: "destructive" }); return
    }
    if (action === "recommend_change" && (!hodAdjStart[reviewId] || !hodAdjEnd[reviewId])) {
      toast({ title: "Adjusted dates required", variant: "destructive" }); return
    }
    setHodSubmitting(reviewId)
    try {
      const res = await fetch("/api/leave/planning/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leave_plan_request_id: requestId,
          action,
          recommendation: hodNote[reviewId] || null,
          adjusted_preferred_start_date: hodAdjStart[reviewId] || null,
          adjusted_preferred_end_date: hodAdjEnd[reviewId] || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Review failed")
      toast({ title: "Review submitted" })
      await loadData()
    } catch (e) {
      toast({ title: "Review error", description: e instanceof Error ? e.message : "Review failed", variant: "destructive" })
    } finally {
      setHodSubmitting(null)
    }
  }

  const submitHrOfficeReview = async (requestId: string) => {
    const adjStart = officeAdjStart[requestId]
    const adjEnd = officeAdjEnd[requestId]
    const rsn = officeReason[requestId]
    if (!adjStart || !adjEnd) { toast({ title: "Adjusted dates required", variant: "destructive" }); return }
    if (!rsn || rsn.trim().length < 5) {
      toast({ title: "Reason required", description: "Provide a detailed reason — it will appear in the memo.", variant: "destructive" })
      return
    }

    const holidayDeducted = Number(officeHolidayDays[requestId] || 0)
    const priorDeducted = Number(officePriorDays[requestId] || 0)
    const travelAdded = Number(officeTravelDays[requestId] || 0)
    const baseDays = adjStart && adjEnd ? computeLeaveDays(adjStart, adjEnd) : 0
    const finalDays = Math.max(0, baseDays - holidayDeducted - priorDeducted + travelAdded)

    const confirmForward = window.confirm(
      `Please confirm the adjusted leave values before forwarding:\n\n` +
      `Adjusted Dates: ${adjStart} to ${adjEnd}\n` +
      `Base Days: ${baseDays}\n` +
      `- Public Holidays: ${holidayDeducted}\n` +
      `- Prior Leave Enjoyed: ${priorDeducted}\n` +
      `+ Travelling Days: ${travelAdded}\n` +
      `Final Days to Approvers: ${finalDays}\n\n` +
      `Reason: ${rsn.trim()}\n\n` +
      `Click OK to confirm accuracy and forward to HR Approvers.`,
    )

    if (!confirmForward) return

    setOfficeSubmitting(requestId)
    try {
      const res = await fetch("/api/leave/planning/hr-office", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leave_plan_request_id: requestId,
          adjusted_start_date: adjStart,
          adjusted_end_date: adjEnd,
          adjustment_reason: rsn,
          holiday_days_deducted: Number(officeHolidayDays[requestId] || 0),
          travelling_days_added: Number(officeTravelDays[requestId] || 0),
          prior_leave_days_deducted: Number(officePriorDays[requestId] || 0),
          adjusted_days: finalDays,
          memo_draft_subject: officeMemoSubject[requestId] || null,
          memo_draft_body: officeMemoBody[requestId] || null,
          memo_draft_cc: officeMemoCc[requestId] || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "HR office review failed")
      toast({ title: "Request forwarded to HR Approvers", description: `Adjusted to ${json.adjusted_days} day(s)` })
      setOfficeExpanded(null)
      await loadData()
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Review failed", variant: "destructive" })
    } finally {
      setOfficeSubmitting(null)
    }
  }

  const submitHrApproval = async (requestId: string, action: "approve" | "reject") => {
    setHrSubmitting(requestId)
    try {
      const res = await fetch("/api/leave/planning/hr-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leave_plan_request_id: requestId,
          action,
          note: hrNote[requestId] || null,
          memo_draft_subject: hrMemoSubject[requestId] || null,
          memo_draft_body: hrMemoBody[requestId] || null,
          memo_draft_cc: hrMemoCc[requestId] || null,
          hr_signature_mode: hrSigMode,
          hr_signature_text: hrSigMode === "typed" ? hrSigTyped : null,
          hr_signature_data_url: hrSigMode !== "typed" ? hrSigDataUrl : null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Approval failed")
      toast({
        title: action === "approve" ? "Leave approved — memo ready" : "Leave rejected",
        description: action === "approve" ? "Staff can now download their leave memo." : undefined,
      })
      setHrExpandedId(null)
      await loadData()
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Approval failed", variant: "destructive" })
    } finally {
      setHrSubmitting(null)
    }
  }

  const openMemo = (requestId: string, token: string) =>
    window.open(`/api/leave/planning/memo/${requestId}?token=${encodeURIComponent(token)}`, "_blank")

  const handleArchiveRequest = async (requestId: string, archive: boolean) => {
    const reason = archive ? (window.prompt("Optional archive reason for records:") || "") : ""
    try {
      const res = await fetch("/api/leave/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leaveRequestId: requestId,
          action: archive ? "archive" : "unarchive",
          reason: reason || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to update archive state")
      toast({
        title: archive ? "Request archived" : "Request restored",
        description: archive
          ? "Director HR and Manager HR views are now cleared for this request."
          : "Request moved back to active HR Office queue.",
      })
      await loadData()
    } catch (e) {
      toast({
        title: "Archive action failed",
        description: e instanceof Error ? e.message : "Unable to archive request",
        variant: "destructive",
      })
    }
  }

  // ── Tab config ────────────────────────────────────────────────────────
  const tabs = useMemo(() => {
    const t: { value: string; label: string; Icon: any; count?: number }[] = []
    if (canSelfApply) t.push({ value: "my-leaves", label: "My Leaves", Icon: CalendarDays, count: myRequests.length })
    if (canSelfApply) t.push({ value: "apply", label: editingId ? "Edit Request" : "Apply", Icon: Plus })
    if (isHod || isAdmin) t.push({ value: "hod-review", label: "HOD Review", Icon: UserCheck, count: hodAssignedReviews.length })
    if (isHrOffice || isAdmin) t.push({ value: "hr-office", label: "HR Leave Office", Icon: ClipboardList, count: hrOfficeQueue.length })
    if (isHrApprover || isAdmin) t.push({ value: "hr-approve", label: "HR Approvals", Icon: ShieldCheck, count: hrApproverQueue.length })
    return t
  }, [canSelfApply, isHod, isHrOffice, isHrApprover, isAdmin, editingId, myRequests.length, hodAssignedReviews.length, hrOfficeQueue.length, hrApproverQueue.length])

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-5xl px-3 py-5 sm:px-4 sm:py-6 space-y-6">
      {/* ── Header Banner ──────────────────────────────────────────── */}
      <div className="rounded-2xl bg-gradient-to-br from-green-800 via-green-700 to-emerald-600 text-white p-6 shadow-lg">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Leave Management</h1>
            <p className="text-green-200 text-sm mt-1">2026/2027 Leave Year · Quality Control Company Limited</p>
          </div>
          <Button
            variant="outline" size="sm"
            onClick={loadData} disabled={loading}
            className="border-white/30 text-white hover:bg-white/10 bg-transparent"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {[
            { label: "Staff Applies", step: 1 },
            { label: "HOD Reviews", step: 2 },
            { label: "HR Leave Office Adjusts", step: 3 },
            { label: "HR Issues Memo", step: 4 },
          ].map((s) => (
            <div key={s.step} className="flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1 text-xs font-medium">
              <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold">{s.step}</span>
              {s.label}
              {s.step < 4 && <ChevronRight className="w-3 h-3 opacity-60" />}
            </div>
          ))}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && !data && (
        <div className="text-center text-slate-500 py-12">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-green-700" />
          Loading leave data…
        </div>
      )}

      {data && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-2 flex h-auto w-full flex-nowrap gap-1.5 overflow-x-auto rounded-xl border border-blue-100 bg-blue-50/60 p-1.5">
            {tabs.map(({ value, label, Icon, count }) => (
              <TabsTrigger key={value} value={value}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-blue-800 transition-colors hover:bg-blue-50 data-[state=active]:border-emerald-600 data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:font-semibold">
                <Icon className="w-4 h-4" />
                {label}
                {count != null && count > 0 && (
                  <span className="ml-1 rounded-full bg-blue-700 px-1.5 py-0.5 text-[10px] font-bold text-white min-w-[18px] text-center data-[state=active]:bg-white/20">
                    {count}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ── My Leaves ─────────────────────────────────────────────── */}
          <TabsContent value="my-leaves">
            {myRequests.length === 0 ? (
              <div className="text-center py-16 text-slate-500 bg-white rounded-xl border border-slate-200">
                <CalendarDays className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                <p className="font-medium">No leave requests yet</p>
                <p className="text-sm mt-1">Use "Apply" to submit your first request.</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {myRequests.map((req: any) => (
                  <LeaveRequestCard key={req.id} req={req}
                    canEdit={(STAFF_EDITABLE_STATUSES as string[]).includes(req.status)}
                    onEdit={() => {
                      setEditingId(req.id)
                      setStartDate(req.preferred_start_date || "")
                      setEndDate(req.preferred_end_date || "")
                      setLeaveType(req.leave_type_key || "annual")
                      setReason(req.reason || "")
                      setActiveTab("apply")
                    }}
                    onDelete={() => deletePlan(req.id)}
                    onViewMemo={() => openMemo(req.id, req.memo_token || "")}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Apply for Leave ───────────────────────────────────────── */}
          <TabsContent value="apply">
            <Card className="border-0 shadow-md">
              <CardHeader className="bg-gradient-to-r from-slate-50 to-white border-b pb-4">
                <CardTitle className="text-base text-green-800">
                  {editingId ? "Edit Leave Request" : "New Leave Application"}
                </CardTitle>
                <p className="text-xs text-slate-500">Leave Year Period: 2026/2027</p>
              </CardHeader>
              <CardContent className="p-5 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Leave Type</Label>
                    <Select value={leaveType} onValueChange={setLeaveType}>
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Select leave type" />
                      </SelectTrigger>
                      <SelectContent>
                        {leaveTypes.map((t) => (
                          <SelectItem key={t.leaveTypeKey} value={t.leaveTypeKey}>
                            {t.leaveTypeLabel} ({t.entitlementDays}d)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedLeaveType && (
                      <p className="text-xs text-slate-500">
                        Entitlement: <strong>{selectedLeaveType.entitlementDays} day(s)</strong>
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Start Date</Label>
                    <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-10" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">End Date</Label>
                    <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-10" />
                  </div>
                </div>

                {sameMonthConflict && (
                  <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-700">
                    <div className="text-sm">
                      <p className="font-semibold">Duplicate leave request detected</p>
                      <p className="mt-0.5">You already have an active <strong>{leaveTypeLabelShort(sameMonthConflict.leave_type_key)}</strong> request for this month ({sameMonthConflict.preferred_start_date} to {sameMonthConflict.preferred_end_date}, status: <strong>{sameMonthConflict.status}</strong>). Only one request per leave type per month is allowed. Please choose a different month or leave type.</p>
                    </div>
                  </div>
                )}

                {startDate && endDate && (
                  <div className="flex flex-wrap gap-3">
                    <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-center">
                      <p className="text-xs text-green-700 font-medium">Days Requested</p>
                      <p className="text-2xl font-bold text-green-800">{computedDays}</p>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-center">
                      <p className="text-xs text-slate-600 font-medium">Return to Work</p>
                      <p className="text-base font-semibold text-slate-800">{computeReturnToWorkDate(endDate)}</p>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Reason / Purpose</Label>
                  <Textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Brief reason for leave (optional)"
                    rows={3} className="resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                    Staff Signature <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={typedSignature || defaultStaffSignature}
                    onChange={(e) => setTypedSignature(e.target.value)}
                    className="italic font-serif text-base h-12"
                    readOnly
                  />
                  <p className="text-xs text-slate-500">Signature is auto-populated from your staff profile name.</p>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button onClick={submitPlan} disabled={submitting}
                    className="bg-green-700 hover:bg-green-800 text-white">
                    {submitting ? "Submitting…" : editingId ? "Update Request" : "Submit Application"}
                  </Button>
                  {editingId && (
                    <Button variant="outline" onClick={() => {
                      setEditingId(null); setStartDate(""); setEndDate(""); setReason("")
                    }}>Cancel</Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── HOD Review ──────────────────────────────────────────────── */}
          <TabsContent value="hod-review">
            {hodAssignedReviews.length === 0 ? (
              <div className="text-center py-16 text-slate-500 bg-white rounded-xl border border-slate-200">
                <UserCheck className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                <p className="font-medium">No assigned reviews</p>
                <p className="text-sm mt-1">No leave requests are currently assigned to you.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {hodPendingReviews.length > 0 && hodPendingReviews.map((review: any) => {
                  const req = review.leave_plan_request
                  if (!req) return null
                  const rId = review.id
                  const action = hodAction[rId]
                  return (
                    <Card key={rId} className="border shadow-sm">
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <p className="font-semibold text-slate-800">{fmtName(req.user)}</p>
                            <p className="text-xs text-slate-500">
                              {String(req.user?.departments?.name || "—")} · {String(req.user?.employee_id || "")}
                            </p>
                          </div>
                          <Badge className={`text-xs border ${getStatusColor(req.status)}`}>
                            {getStatusLabel(req.status)}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                          <InfoPill label="Leave Type" value={leaveTypeLabelShort(req.leave_type_key)} />
                          <InfoPill label="Start" value={fmtDate(req.preferred_start_date)} />
                          <InfoPill label="End" value={fmtDate(req.preferred_end_date)} />
                          <InfoPill label="Days" value={String(req.requested_days)} highlight />
                        </div>
                        {req.reason && (
                          <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-200 mb-4">
                            <strong>Reason:</strong> {req.reason}
                          </p>
                        )}
                        <StaffHistoryPanel
                          history={staffHistoryByUser[String(req.user?.id || "")] || []}
                          currentRequestId={req.id}
                        />
                        <div className="space-y-3">
                          <div className="flex gap-2 flex-wrap">
                            {(["approve", "recommend_change", "reject"] as const).map((act) => (
                              <Button key={act} size="sm"
                                variant={action === act ? "default" : "outline"}
                                onClick={() => setHodAction((p) => ({ ...p, [rId]: act }))}
                                className={action === act
                                  ? act === "approve" ? "bg-emerald-600 hover:bg-emerald-700"
                                  : act === "reject" ? "bg-red-600 hover:bg-red-700"
                                  : "bg-blue-600 hover:bg-blue-700"
                                  : ""
                                }>
                                {act === "approve" ? "✓ Approve" : act === "reject" ? "✗ Reject" : "⟳ Changes"}
                              </Button>
                            ))}
                          </div>
                          {action && action !== "approve" && (
                            <Textarea
                              placeholder={action === "reject" ? "Reason for rejection (required)" : "Recommendation / changes needed"}
                              value={hodNote[rId] || ""}
                              onChange={(e) => setHodNote((p) => ({ ...p, [rId]: e.target.value }))}
                              rows={2} className="resize-none text-sm"
                            />
                          )}
                          {action === "recommend_change" && (
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <Label className="text-xs">Suggested Start Date</Label>
                                <Input type="date" value={hodAdjStart[rId] || ""}
                                  onChange={(e) => setHodAdjStart((p) => ({ ...p, [rId]: e.target.value }))} className="h-9" />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Suggested End Date</Label>
                                <Input type="date" value={hodAdjEnd[rId] || ""}
                                  onChange={(e) => setHodAdjEnd((p) => ({ ...p, [rId]: e.target.value }))} className="h-9" />
                              </div>
                            </div>
                          )}
                          {action && (
                            <Button size="sm"
                              onClick={() => submitHodReview(rId, req.id)}
                              disabled={hodSubmitting === rId}
                              className="bg-green-700 hover:bg-green-800">
                              {hodSubmitting === rId ? "Submitting…" : "Submit Review"}
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}

                {hodWorkedOnReviews.length > 0 && (
                  <Card className="border border-blue-200 bg-blue-50/40">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-blue-900">Worked On Requests</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {hodWorkedOnReviews.map((review: any) => {
                        const req = review.leave_plan_request
                        if (!req) return null
                        return (
                          <div key={review.id} className="rounded-lg border border-blue-100 bg-white p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-800">{fmtName(req.user)}</p>
                                <p className="text-xs text-slate-500">{leaveTypeLabelShort(req.leave_type_key)} · {fmtDate(req.preferred_start_date)} to {fmtDate(req.preferred_end_date)}</p>
                              </div>
                              <Badge className={`text-xs border ${getStatusColor(req.status)}`}>{getStatusLabel(req.status)}</Badge>
                            </div>
                            {review.recommendation && (
                              <p className="mt-2 text-xs text-slate-600"><strong>Your note:</strong> {review.recommendation}</p>
                            )}
                          </div>
                        )
                      })}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>

          {/* ── HR Leave Office ───────────────────────────────────────── */}
          <TabsContent value="hr-office">
            <div className="mb-4 space-y-3">
              <Alert className="border-blue-200 bg-blue-50">
                <ClipboardList className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-xs text-blue-800 ml-1">
                  Review HOD-approved leave requests. You may adjust days — add travelling days, deduct public holidays or
                  prior partial leave enjoyed. All adjustments and reasons will appear in the staff&apos;s official leave memo.
                </AlertDescription>
              </Alert>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-emerald-700">Queue Size</p>
                  <p className="text-xl font-bold text-emerald-900">{hrOfficeQueue.length}</p>
                </div>
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-blue-700">HOD Approved</p>
                  <p className="text-xl font-bold text-blue-900">
                    {hrOfficeQueue.filter((row: any) => String(row?.status || "") === "hod_approved").length}
                  </p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-amber-700">Manager Confirmed</p>
                  <p className="text-xl font-bold text-amber-900">
                    {hrOfficeQueue.filter((row: any) => String(row?.status || "") === "manager_confirmed").length}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-slate-600">Showing</p>
                  <p className="text-xl font-bold text-slate-900">{hrOfficeFilteredQueue.length}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={hrOfficeShowArchived ? "outline" : "default"}
                    className={!hrOfficeShowArchived ? "bg-emerald-600 hover:bg-emerald-700" : ""}
                    onClick={() => setHrOfficeShowArchived(false)}
                  >
                    Active Queue
                  </Button>
                  <Button
                    size="sm"
                    variant={hrOfficeShowArchived ? "default" : "outline"}
                    className={hrOfficeShowArchived ? "bg-blue-700 hover:bg-blue-800" : ""}
                    onClick={() => setHrOfficeShowArchived(true)}
                  >
                    Archived Queue
                  </Button>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Clock3 className="h-3.5 w-3.5" />
                  Last refresh: {hrOfficeLastRefresh ? fmtDate(hrOfficeLastRefresh) : "—"}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={hrOfficeAutoRefresh ? "default" : "outline"}
                    className={hrOfficeAutoRefresh ? "bg-emerald-700 hover:bg-emerald-800" : ""}
                    onClick={() => setHrOfficeAutoRefresh((prev) => !prev)}
                  >
                    {hrOfficeAutoRefresh ? "Auto Refresh ON" : "Auto Refresh OFF"}
                  </Button>
                  <Label className="text-xs text-slate-600">Page Size</Label>
                  <Select value={String(hrOfficePageSize)} onValueChange={(v) => setHrOfficePageSize(Number(v))}>
                    <SelectTrigger className="h-8 w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="100">100</SelectItem>
                      <SelectItem value="300">300</SelectItem>
                      <SelectItem value="600">600</SelectItem>
                      <SelectItem value="1000">1000</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-[1fr_auto_auto]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    value={hrOfficeSearch}
                    onChange={(e) => setHrOfficeSearch(e.target.value)}
                    className="pl-8"
                    placeholder="Search staff, employee ID, leave type, or status"
                  />
                </div>
                <Select value={hrOfficeStatusFilter} onValueChange={setHrOfficeStatusFilter}>
                  <SelectTrigger className="h-9 w-full md:w-[190px]">
                    <SelectValue placeholder="Filter status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="hod_approved">HOD Approved</SelectItem>
                    <SelectItem value="manager_confirmed">Manager Confirmed</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={hrOfficeSortBy} onValueChange={setHrOfficeSortBy}>
                  <SelectTrigger className="h-9 w-full md:w-[190px]">
                    <ArrowUpDown className="mr-2 h-3.5 w-3.5 text-slate-500" />
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="priority">Priority (recommended)</SelectItem>
                    <SelectItem value="newest">Newest first</SelectItem>
                    <SelectItem value="oldest">Oldest first</SelectItem>
                    <SelectItem value="longest">Longest leave days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Tabs defaultValue="operations" className="space-y-4">
              <TabsList className={`grid h-auto w-full ${canViewLeaveAnalytics ? "grid-cols-2" : "grid-cols-1"} rounded-xl border border-slate-200 bg-slate-50 p-1.5`}>
                <TabsTrigger value="operations" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">Operations</TabsTrigger>
                {canViewLeaveAnalytics && (
                  <TabsTrigger value="analytics" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">Analytics & Graphics</TabsTrigger>
                )}
              </TabsList>

              {canViewLeaveAnalytics && (
              <TabsContent value="analytics" className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Analytics Range</p>
                      <p className="mt-1 text-sm text-slate-600">Filter the HR Leave Office graphics board and export only the visible date window.</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[170px_170px_auto_auto_auto]">
                      <div className="space-y-1">
                        <Label className="text-xs">Start Date</Label>
                        <Input
                          type="date"
                          value={analyticsRange.start}
                          max={analyticsRange.end}
                          onChange={(e) => setAnalyticsRange((prev) => ({ ...prev, start: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">End Date</Label>
                        <Input
                          type="date"
                          value={analyticsRange.end}
                          min={analyticsRange.start}
                          onChange={(e) => setAnalyticsRange((prev) => ({ ...prev, end: e.target.value }))}
                        />
                      </div>
                      <Button
                        variant="outline"
                        className="xl:self-end"
                        onClick={() => setAnalyticsRange(getCurrentMonthRange())}
                      >
                        <CalendarDays className="mr-2 h-4 w-4" /> Current Month
                      </Button>
                      <Button
                        variant="outline"
                        className="xl:self-end"
                        onClick={() => downloadLeaveAnalyticsCsv(hrOfficeAnalytics.records as LeaveAnalyticsRecord[], `hr-leave-office-analytics-${analyticsRange.start}-to-${analyticsRange.end}.csv`)}
                        disabled={analyticsLoading || hrOfficeAnalytics.records.length === 0}
                      >
                        <Download className="mr-2 h-4 w-4" /> Export CSV
                      </Button>
                      <Button
                        className="bg-emerald-700 hover:bg-emerald-800 xl:self-end"
                        onClick={() => void downloadLeaveAnalyticsPdf(hrOfficeAnalytics.records as LeaveAnalyticsRecord[], `hr-leave-office-analytics-${analyticsRange.start}-to-${analyticsRange.end}.pdf`, `HR Leave Office Analytics ${analyticsRange.start} to ${analyticsRange.end}`)}
                        disabled={analyticsLoading || hrOfficeAnalytics.records.length === 0}
                      >
                        <Download className="mr-2 h-4 w-4" /> Export PDF
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span>Range: {analyticsData?.rangeStart || analyticsRange.start} to {analyticsData?.rangeEnd || analyticsRange.end}</span>
                    <span>Visible records: {hrOfficeAnalytics.records.length}</span>
                    <span>Unique staff: {Number(hrOfficeAnalytics.totals.unique_staff_in_range || 0)}</span>
                    {analyticsLoading && <span className="font-medium text-emerald-700">Refreshing analytics…</span>}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <ScientificMetricCard
                    label="Outstanding Requests"
                    value={hrOfficeAnalytics.totals.outstanding_requests}
                    hint="Waiting for HR Leave Office action"
                    accent="border-cyan-200"
                    icon={<ClipboardList className="h-5 w-5" />}
                  />
                  <ScientificMetricCard
                    label="Staff On Leave"
                    value={hrOfficeAnalytics.totals.staff_on_leave_now}
                    hint="Approved leave active today"
                    accent="border-emerald-200"
                    icon={<Activity className="h-5 w-5" />}
                  />
                  <ScientificMetricCard
                    label="Yet To Enjoy"
                    value={hrOfficeAnalytics.totals.staff_yet_to_enjoy}
                    hint="Approved leave scheduled ahead"
                    accent="border-amber-200"
                    icon={<Users className="h-5 w-5" />}
                  />
                  <ScientificMetricCard
                    label="Completed Leave"
                    value={hrOfficeAnalytics.totals.staff_completed_leave}
                    hint="Staff who have completed leave"
                    accent="border-violet-200"
                    icon={<CheckCircle2 className="h-5 w-5" />}
                  />
                </div>

                <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                  <Card className="overflow-hidden border border-slate-200 bg-[linear-gradient(135deg,_#071a2f_0%,_#123d67_52%,_#0b7a75_100%)] text-white shadow-lg">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-100">HR Leave Office Intelligence</p>
                          <h3 className="mt-2 text-2xl font-semibold tracking-tight">Operational Analytics Board</h3>
                          <p className="mt-2 max-w-2xl text-sm text-slate-200">
                            Monitor outstanding leave actions, approved leave utilization, geographic distribution, and staff leave consumption patterns in one scientific dashboard.
                          </p>
                        </div>
                        <div className="rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
                          <BarChart3 className="h-7 w-7 text-cyan-100" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <ScientificBarChart
                    title="Outstanding Flow"
                    rows={hrOfficeAnalytics.outstanding_by_status || []}
                    valueKey="total"
                    colorClass="bg-gradient-to-r from-cyan-500 to-blue-600"
                    emptyMessage="No outstanding leave requests in the HR Office queue."
                    formatter={(row) => getStatusLabel(String(row?.status || ""))}
                  />
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <ScientificBarChart
                    title="Leave Type Distribution"
                    rows={hrOfficeAnalytics.leave_type_breakdown || []}
                    valueKey="total"
                    colorClass="bg-gradient-to-r from-emerald-500 to-teal-500"
                    emptyMessage="No approved leave records available for type analysis."
                    formatter={(row) => `${leaveTypeLabelShort(String(row?.leave_type_key || "annual"))} · now ${Number(row?.on_leave_now || 0)} / upcoming ${Number(row?.upcoming || 0)}`}
                  />
                  <ScientificBarChart
                    title="Location / Rank Exposure"
                    rows={hrOfficeAnalytics.location_ranking || []}
                    valueKey="total"
                    colorClass="bg-gradient-to-r from-violet-500 to-fuchsia-500"
                    emptyMessage="No approved leave records available for location ranking."
                    formatter={(row) => `${String(row?.name || "Unassigned")} · active ${Number(row?.on_leave_now || 0)} / upcoming ${Number(row?.upcoming || 0)}`}
                  />
                </div>

                <CurrentLeaveRoster rows={hrOfficeAnalytics.current_leave_roster || []} />
              </TabsContent>
              )}

              <TabsContent value="operations">
                {hrOfficeFilteredQueue.length === 0 ? (
                  <div className="text-center py-16 text-slate-500 bg-white rounded-xl border border-slate-200">
                    <ClipboardList className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                    <p className="font-medium">No requests match your current HR Office filters</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {hrOfficeVisibleRows.map((req: any) => {
                  const isExpanded = officeExpanded === req.id
                  const adjStart = officeAdjStart[req.id] || req.preferred_start_date || ""
                  const adjEnd = officeAdjEnd[req.id] || req.preferred_end_date || ""
                  const holidayD = Number(officeHolidayDays[req.id] || 0)
                  const travelD = Number(officeTravelDays[req.id] || 0)
                  const priorD = Number(officePriorDays[req.id] || 0)
                  const baseDays = adjStart && adjEnd
                    ? Math.max(0, Math.floor((new Date(adjEnd).getTime() - new Date(adjStart).getTime()) / 86400000) + 1)
                    : req.requested_days
                  const finalDays = Math.max(0, baseDays - holidayD - priorD + travelD)
                  const generatedReason = [
                    holidayD > 0 ? `${holidayD} public holiday day(s) deducted` : "",
                    priorD > 0 ? `${priorD} prior leave day(s) deducted` : "",
                    travelD > 0 ? `${travelD} travelling day(s) added` : "",
                  ].filter(Boolean).join("; ")
                      return (
                    <Card key={req.id} className="group border border-slate-200 bg-gradient-to-br from-white via-white to-emerald-50/30 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg">
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="font-semibold text-slate-800">{fmtName(req.user)}</p>
                            <p className="text-xs text-slate-500">
                              {String(req.user?.departments?.name || "—")} ·{" "}
                              {leaveTypeLabelShort(req.leave_type_key)} · HOD approved {fmtDate(req.hod_reviewed_at)}
                            </p>
                          </div>
                          <Badge className={`text-xs border ${getStatusColor(req.status)}`}>
                            {getStatusLabel(req.status)}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                          <InfoPill label="Original Start" value={fmtDate(req.preferred_start_date)} />
                          <InfoPill label="Original End" value={fmtDate(req.preferred_end_date)} />
                          <InfoPill label="Requested Days" value={String(req.requested_days)} highlight />
                          <InfoPill label="Entitlement" value={req.entitlement_days ? `${req.entitlement_days}d` : "—"} />
                        </div>
                        {req.manager_recommendation && (
                          <p className="text-xs text-slate-600 bg-amber-50 p-2 rounded border border-amber-200 mb-3">
                            <strong>HOD Recommendation:</strong> {req.manager_recommendation}
                          </p>
                        )}
                        <div className="mb-3 flex flex-wrap gap-2">
                          <Badge className="border border-slate-200 bg-white text-slate-700">Requested: {req.requested_days} day(s)</Badge>
                          <Badge className="border border-slate-200 bg-white text-slate-700">Entitlement: {req.entitlement_days || "—"} day(s)</Badge>
                        </div>
                        <Button size="sm" variant="outline"
                          onClick={() => {
                            setOfficeExpanded(isExpanded ? null : req.id)
                            if (!isExpanded) {
                              const matchingTemplate = templateOptions.find((template) => {
                                const key = String(template.template_key || "")
                                const leaveType = String(req.leave_type_key || "")
                                return key.includes(leaveType) || key.includes("approval")
                              }) || templateOptions[0]
                              setOfficeAdjStart((p) => ({ ...p, [req.id]: req.preferred_start_date || "" }))
                              setOfficeAdjEnd((p) => ({ ...p, [req.id]: req.preferred_end_date || "" }))
                              setOfficeTemplateKey((p) => ({ ...p, [req.id]: matchingTemplate?.template_key || "" }))
                              const memoTpl = buildMemoTemplate(req)
                              setOfficeMemoSubject((p) => ({ ...p, [req.id]: req.memo_draft_subject || matchingTemplate?.subject_template || memoTpl.subject }))
                              setOfficeMemoBody((p) => ({ ...p, [req.id]: req.memo_draft_body || matchingTemplate?.body_template || memoTpl.body }))
                              setOfficeMemoCc((p) => ({ ...p, [req.id]: req.memo_draft_cc || matchingTemplate?.cc_recipients || "" }))
                            }
                          }}
                          className="text-xs h-8 border-blue-300 text-blue-700 hover:bg-blue-50">
                          {isExpanded ? "▲ Collapse" : "▼ Adjust & Forward"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="ml-2 h-8 text-xs border-slate-300"
                          onClick={() => handleArchiveRequest(req.id, !hrOfficeShowArchived)}
                        >
                          {hrOfficeShowArchived ? "Restore to Active" : "Archive Request"}
                        </Button>

                        {isExpanded && (
                          <div className="mt-4 space-y-4 border-t pt-4">
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <Label className="text-xs font-semibold">Adjusted Start Date</Label>
                                <Input type="date" value={adjStart}
                                  onChange={(e) => setOfficeAdjStart((p) => ({ ...p, [req.id]: e.target.value }))} className="h-9" />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs font-semibold">Adjusted End Date</Label>
                                <Input type="date" value={adjEnd}
                                  onChange={(e) => setOfficeAdjEnd((p) => ({ ...p, [req.id]: e.target.value }))} className="h-9" />
                              </div>
                            </div>

                            {/* Day adjustment breakdown */}
                            <div className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-200">
                              <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Day Adjustment Breakdown</p>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="space-y-1">
                                  <Label className="text-xs flex items-center gap-1 text-red-700">
                                    <Minus className="w-3 h-3" /> Deduct — Public Holidays
                                  </Label>
                                  <Input type="number" min="0"
                                    value={officeHolidayDays[req.id] || "0"}
                                    onChange={(e) => setOfficeHolidayDays((p) => ({ ...p, [req.id]: e.target.value }))}
                                    className="h-9 text-red-700 font-semibold" />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs flex items-center gap-1 text-red-700">
                                    <Minus className="w-3 h-3" /> Deduct — Prior Leave Enjoyed
                                  </Label>
                                  <Input type="number" min="0"
                                    value={officePriorDays[req.id] || "0"}
                                    onChange={(e) => setOfficePriorDays((p) => ({ ...p, [req.id]: e.target.value }))}
                                    className="h-9 text-red-700 font-semibold" />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs flex items-center gap-1 text-emerald-700">
                                    <Plus className="w-3 h-3" /> Add — Travelling Days
                                  </Label>
                                  <Input type="number" min="0"
                                    value={officeTravelDays[req.id] || "0"}
                                    onChange={(e) => setOfficeTravelDays((p) => ({ ...p, [req.id]: e.target.value }))}
                                    className="h-9 text-emerald-700 font-semibold" />
                                </div>
                              </div>
                              <div className="flex items-center justify-between bg-white rounded-lg p-3 border border-slate-200 mt-2">
                                <span className="text-sm text-slate-600">
                                  Base: {baseDays}d
                                  {holidayD > 0 && <span className="text-red-600"> − {holidayD}</span>}
                                  {priorD > 0 && <span className="text-red-600"> − {priorD}</span>}
                                  {travelD > 0 && <span className="text-emerald-600"> + {travelD}</span>}
                                </span>
                                <span className="text-lg font-bold text-green-800">= {finalDays} day(s)</span>
                              </div>
                            </div>

                            <div className="space-y-1">
                              <Label className="text-xs font-semibold text-slate-700">
                                Reason for Adjustment <span className="text-red-500">*</span>
                                <span className="text-slate-400 font-normal ml-1">(will appear in leave memo)</span>
                              </Label>
                              {generatedReason && (
                                <div className="flex justify-end">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-[11px]"
                                    onClick={() => setOfficeReason((p) => ({ ...p, [req.id]: generatedReason }))}
                                  >
                                    Auto-fill from breakdown
                                  </Button>
                                </div>
                              )}
                              <Textarea
                                placeholder="e.g. Leave days reduced by 2 to account for 2 public holidays falling within leave period. 1 travelling day added."
                                value={officeReason[req.id] || ""}
                                onChange={(e) => setOfficeReason((p) => ({ ...p, [req.id]: e.target.value }))}
                                rows={3} className="resize-none text-sm"
                              />
                            </div>

                            <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 space-y-2">
                              <p className="text-xs font-semibold text-blue-900 uppercase tracking-wide">Memo Draft (Editable)</p>
                              <div className="space-y-1">
                                <Label className="text-xs">Template Source</Label>
                                <Select
                                  value={officeTemplateKey[req.id] || ""}
                                  onValueChange={(value) => {
                                    setOfficeTemplateKey((p) => ({ ...p, [req.id]: value }))
                                    const selected = templateOptions.find((template) => template.template_key === value)
                                    if (selected) {
                                      setOfficeMemoSubject((p) => ({ ...p, [req.id]: selected.subject_template || "" }))
                                      setOfficeMemoBody((p) => ({ ...p, [req.id]: selected.body_template || "" }))
                                      setOfficeMemoCc((p) => ({ ...p, [req.id]: selected.cc_recipients || "" }))
                                    }
                                  }}
                                >
                                  <SelectTrigger className="h-9 bg-white">
                                    <SelectValue placeholder="Select template" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {templateOptions.map((template) => (
                                      <SelectItem key={template.id} value={template.template_key}>
                                        {template.template_name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Memo Subject</Label>
                                <Input
                                  value={officeMemoSubject[req.id] || ""}
                                  onChange={(e) => setOfficeMemoSubject((p) => ({ ...p, [req.id]: e.target.value }))}
                                  placeholder="RE: APPLICATION FOR ANNUAL LEAVE — 2026/2027"
                                  className="h-9 bg-white"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Memo Body</Label>
                                <Textarea
                                  value={officeMemoBody[req.id] || ""}
                                  onChange={(e) => setOfficeMemoBody((p) => ({ ...p, [req.id]: e.target.value }))}
                                  placeholder="Draft the memo body that HR approver can finalize before approval."
                                  rows={4}
                                  className="resize-none text-sm bg-white"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">CC List (one per line)</Label>
                                <Textarea
                                  value={officeMemoCc[req.id] || ""}
                                  onChange={(e) => setOfficeMemoCc((p) => ({ ...p, [req.id]: e.target.value }))}
                                  placeholder="HOD\nACCOUNTS MANAGER\nHR LEAVE OFFICE\nFILE"
                                  rows={3}
                                  className="resize-none text-sm bg-white"
                                />
                              </div>
                            </div>

                            <Button onClick={() => submitHrOfficeReview(req.id)}
                              disabled={officeSubmitting === req.id}
                              className="bg-blue-700 hover:bg-blue-800 text-white">
                              {officeSubmitting === req.id ? "Forwarding…" : "Forward to HR Approvers →"}
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                      )
                    })}

                    {hrOfficeFilteredQueue.length > hrOfficePageSize && (
                      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3">
                        <p className="text-xs text-slate-600">
                          Showing {(hrOfficePage - 1) * hrOfficePageSize + 1} to {Math.min(hrOfficePage * hrOfficePageSize, hrOfficeFilteredQueue.length)} of {hrOfficeFilteredQueue.length}
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={hrOfficePage <= 1}
                            onClick={() => setHrOfficePage((p) => Math.max(1, p - 1))}
                          >
                            Previous
                          </Button>
                          <span className="text-xs font-medium text-slate-700">Page {hrOfficePage} / {hrOfficeTotalPages}</span>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={hrOfficePage >= hrOfficeTotalPages}
                            onClick={() => setHrOfficePage((p) => Math.min(hrOfficeTotalPages, p + 1))}
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* ── HR Final Approval ─────────────────────────────────────── */}
          <TabsContent value="hr-approve">
            {hrApproverQueue.length === 0 ? (
              <div className="text-center py-16 text-slate-500 bg-white rounded-xl border border-slate-200">
                <ShieldCheck className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                <p className="font-medium">No requests awaiting HR Approval</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Shared signature block */}
                <Card className="border-green-200 bg-green-50">
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold text-green-800 uppercase tracking-wide mb-3">
                      Your HR Signature (applied to all approved memos)
                    </p>
                    <div className="flex gap-2 mb-2 flex-wrap">
                      {(["typed", "draw", "upload"] as SignatureMode[]).map((m) => (
                        <Button key={m} size="sm"
                          variant={hrSigMode === m ? "default" : "outline"}
                          onClick={() => setHrSigMode(m)}
                          className={`h-7 text-xs capitalize ${hrSigMode === m ? "bg-green-700" : "border-green-300"}`}>
                          {m === "typed" ? "Type" : m === "draw" ? "Draw" : "Upload"}
                        </Button>
                      ))}
                    </div>
                    {hrSigMode === "typed" && (
                      <Input
                        placeholder="Type your full name as signature"
                        value={hrSigTyped}
                        onChange={(e) => setHrSigTyped(e.target.value)}
                        className="italic font-serif text-base h-11 bg-white"
                      />
                    )}
                    {hrSigMode === "draw" && (
                      <SignaturePad onSave={(d) => setHrSigDataUrl(d)} savedDataUrl={hrSigDataUrl} />
                    )}
                    {hrSigMode === "upload" && (
                      <Input type="file" accept="image/*"
                        onChange={async (e) => {
                          const file = e.target.files?.[0]
                          if (file) setHrSigDataUrl(await readAsDataUrl(file))
                        }}
                        className="bg-white"
                      />
                    )}
                  </CardContent>
                </Card>

                {hrApproverQueue.map((req: any) => {
                  const isExpanded = hrExpandedId === req.id
                  const effectiveStart = req.adjusted_start_date || req.preferred_start_date
                  const effectiveEnd = req.adjusted_end_date || req.preferred_end_date
                  const effectiveDays = req.adjusted_days || req.requested_days
                  return (
                    <Card key={req.id} className="border shadow-sm">
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <p className="font-semibold text-slate-800">{fmtName(req.user)}</p>
                            <p className="text-xs text-slate-500">
                              {String(req.user?.departments?.name || "—")} · {leaveTypeLabelShort(req.leave_type_key)}
                            </p>
                          </div>
                          <Badge className={`text-xs border ${getStatusColor(req.status)}`}>
                            {getStatusLabel(req.status)}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                          <InfoPill label="Start" value={fmtDate(effectiveStart)} />
                          <InfoPill label="End" value={fmtDate(effectiveEnd)} />
                          <InfoPill label="Days" value={String(effectiveDays)} highlight />
                          <InfoPill label="Year" value={req.leave_year_period || "—"} />
                        </div>
                        {req.adjustment_reason && (
                          <Alert className="mb-3 py-2 border-blue-200 bg-blue-50">
                            <AlertCircle className="h-3 w-3 text-blue-600" />
                            <AlertDescription className="text-xs text-blue-800 ml-1">
                              <strong>HR Office adjustment:</strong> {req.adjustment_reason}
                              {req.original_requested_days && req.adjusted_days !== req.original_requested_days && (
                                <span className="ml-1">({req.original_requested_days}d → {req.adjusted_days}d)</span>
                              )}
                            </AlertDescription>
                          </Alert>
                        )}
                        <StaffHistoryPanel
                          history={staffHistoryByUser[String(req.user?.id || "")] || []}
                          currentRequestId={req.id}
                        />
                        <Button size="sm" variant="outline"
                          onClick={() => {
                            if (isExpanded) {
                              setHrExpandedId(null)
                              return
                            }
                            setHrExpandedId(req.id)
                            const hrMemoTpl = buildMemoTemplate(req)
                            setHrMemoSubject((p) => ({ ...p, [req.id]: req.memo_draft_subject || hrMemoTpl.subject }))
                            setHrMemoBody((p) => ({ ...p, [req.id]: req.memo_draft_body || hrMemoTpl.body }))
                            setHrMemoCc((p) => ({ ...p, [req.id]: req.memo_draft_cc || "" }))
                          }}
                          className="text-xs h-8">
                          {isExpanded ? "▲ Collapse" : "▼ Review & Decide"}
                        </Button>
                        {isExpanded && (
                          <div className="mt-4 space-y-3 border-t pt-4">
                            <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 space-y-2">
                              <p className="text-xs font-semibold text-blue-900 uppercase tracking-wide">Memo Draft (Final Edit Before Issue)</p>
                              <div className="space-y-1">
                                <Label className="text-xs">Memo Subject</Label>
                                <Input
                                  value={hrMemoSubject[req.id] || ""}
                                  onChange={(e) => setHrMemoSubject((p) => ({ ...p, [req.id]: e.target.value }))}
                                  placeholder="Memo subject"
                                  className="h-9 bg-white"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Memo Body</Label>
                                <Textarea
                                  value={hrMemoBody[req.id] || ""}
                                  onChange={(e) => setHrMemoBody((p) => ({ ...p, [req.id]: e.target.value }))}
                                  placeholder="Finalize memo body before issuing approval."
                                  rows={4}
                                  className="resize-none text-sm bg-white"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">CC List (one per line)</Label>
                                <Textarea
                                  value={hrMemoCc[req.id] || ""}
                                  onChange={(e) => setHrMemoCc((p) => ({ ...p, [req.id]: e.target.value }))}
                                  placeholder="CC recipients"
                                  rows={3}
                                  className="resize-none text-sm bg-white"
                                />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <Label className="text-xs font-semibold">HR Note (optional)</Label>
                              <Textarea
                                placeholder="Any additional notes to include in the memo"
                                value={hrNote[req.id] || ""}
                                onChange={(e) => setHrNote((p) => ({ ...p, [req.id]: e.target.value }))}
                                rows={2} className="resize-none text-sm"
                              />
                            </div>
                            <div className="flex gap-2 flex-wrap">
                              <Button
                                onClick={() => submitHrApproval(req.id, "approve")}
                                disabled={hrSubmitting === req.id}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white">
                                {hrSubmitting === req.id ? "Processing…" : "✓ Approve & Generate Memo"}
                              </Button>
                              <Button
                                onClick={() => submitHrApproval(req.id, "reject")}
                                disabled={hrSubmitting === req.id}
                                variant="outline"
                                className="border-red-300 text-red-700 hover:bg-red-50">
                                ✗ Reject
                              </Button>
                            </div>
                          </div>
                        )}
                        {req.status === "hr_approved" && req.memo_token && (
                          <Button size="sm"
                            className="mt-3 bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs"
                            onClick={() => openMemo(req.id, req.memo_token)}>
                            <Download className="w-3 h-3 mr-1" /> Download Memo
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
