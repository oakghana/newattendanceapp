"use client"

// ============================================================
// Leave Planning Client — V2 Redesign (4-stage workflow)
// Staff → HOD Review → HR Leave Office → HR Approval + Memo
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react"
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
} from "lucide-react"

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
  const canSelfApply = isStaff || isHod || isAdmin ||
    ["hr_officer", "hr_director", "director_hr", "manager_hr", "hr_leave_office"].includes(normalizedRole)

  // ── Data ────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<any>(null)
  const [activeTab, setActiveTab] = useState("my-leaves")

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
  const [officeSubmitting, setOfficeSubmitting] = useState<string | null>(null)

  // ── HR Approver ─────────────────────────────────────────────────────
  const [hrNote, setHrNote] = useState<Record<string, string>>({})
  const [hrSigMode, setHrSigMode] = useState<SignatureMode>("typed")
  const [hrSigTyped, setHrSigTyped] = useState("")
  const [hrSigDataUrl, setHrSigDataUrl] = useState<string | null>(null)
  const [hrSubmitting, setHrSubmitting] = useState<string | null>(null)
  const [hrExpandedId, setHrExpandedId] = useState<string | null>(null)

  // ── Computed ────────────────────────────────────────────────────────
  const activeSig = useMemo(() => {
    if (signatureMode === "typed") return { text: typedSignature || null, dataUrl: null }
    if (signatureMode === "upload") return { text: null, dataUrl: uploadedSigUrl }
    return { text: null, dataUrl: drawnSigUrl }
  }, [signatureMode, typedSignature, uploadedSigUrl, drawnSigUrl])

  const computedDays = useMemo(() => {
    if (!startDate || !endDate) return 0
    return computeLeaveDays(startDate, endDate)
  }, [startDate, endDate])

  const selectedLeaveType = useMemo(
    () => leaveTypes.find((t) => t.leaveTypeKey === leaveType),
    [leaveTypes, leaveType],
  )

  // ── Loaders ─────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/leave/planning", { cache: "no-store" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to load data")
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data")
    } finally {
      setLoading(false)
    }
  }, [])

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

  useEffect(() => {
    void loadData()
    void loadPolicy()
  }, [loadData, loadPolicy])

  // ── Derived lists ────────────────────────────────────────────────────
  const myRequests: any[] = useMemo(() => data ? (data.myRequests || data.requests || []) : [], [data])

  const hodAssignedReviews: any[] = useMemo(() => {
    if (!data) return []
    return data.reviews || []
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

  const hrApproverQueue: any[] = useMemo(() => {
    if (!data) return []
    return (data.requests || []).filter((r: any) =>
      ["hod_approved", "manager_confirmed", ...(HR_APPROVER_PENDING_STATUSES as string[])].includes(String(r?.status || "")),
    )
  }, [data])

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
      if (!res.ok) throw new Error(json.error || "Submission failed")
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
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
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
          <TabsList className="flex flex-wrap h-auto gap-1.5 rounded-xl mb-2 border border-blue-100 bg-blue-50/60 p-1.5">
            {tabs.map(({ value, label, Icon, count }) => (
              <TabsTrigger key={value} value={value}
                className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-blue-800 transition-colors hover:bg-blue-50 data-[state=active]:border-emerald-600 data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:font-semibold">
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
                  <div className="flex gap-2 flex-wrap mb-2">
                    {(["typed", "draw", "upload"] as SignatureMode[]).map((m) => (
                      <Button key={m} size="sm"
                        variant={signatureMode === m ? "default" : "outline"}
                        onClick={() => setSignatureMode(m)}
                        className={`h-7 text-xs capitalize ${signatureMode === m ? "bg-green-700 hover:bg-green-800" : ""}`}>
                        {m === "typed" ? "Type" : m === "draw" ? "Draw" : "Upload"}
                      </Button>
                    ))}
                  </div>
                  {signatureMode === "typed" && (
                    <Input
                      placeholder="Type your full name as signature"
                      value={typedSignature}
                      onChange={(e) => setTypedSignature(e.target.value)}
                      className="italic font-serif text-base h-12"
                    />
                  )}
                  {signatureMode === "draw" && (
                    <SignaturePad onSave={(d) => setDrawnSigUrl(d)} savedDataUrl={drawnSigUrl} />
                  )}
                  {signatureMode === "upload" && (
                    <Input type="file" accept="image/*"
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (file) setUploadedSigUrl(await readAsDataUrl(file))
                      }}
                    />
                  )}
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
            <div className="mb-4">
              <Alert className="border-blue-200 bg-blue-50">
                <ClipboardList className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-xs text-blue-800 ml-1">
                  Review HOD-approved leave requests. You may adjust days — add travelling days, deduct public holidays or
                  prior partial leave enjoyed. All adjustments and reasons will appear in the staff&apos;s official leave memo.
                </AlertDescription>
              </Alert>
            </div>
            {hrOfficeQueue.length === 0 ? (
              <div className="text-center py-16 text-slate-500 bg-white rounded-xl border border-slate-200">
                <ClipboardList className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                <p className="font-medium">No requests awaiting HR Leave Office review</p>
              </div>
            ) : (
              <div className="space-y-4">
                {hrOfficeQueue.map((req: any) => {
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
                  return (
                    <Card key={req.id} className="border shadow-sm">
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
                        <Button size="sm" variant="outline"
                          onClick={() => {
                            setOfficeExpanded(isExpanded ? null : req.id)
                            if (!isExpanded) {
                              setOfficeAdjStart((p) => ({ ...p, [req.id]: req.preferred_start_date || "" }))
                              setOfficeAdjEnd((p) => ({ ...p, [req.id]: req.preferred_end_date || "" }))
                            }
                          }}
                          className="text-xs h-8 border-blue-300 text-blue-700 hover:bg-blue-50">
                          {isExpanded ? "▲ Collapse" : "▼ Adjust & Forward"}
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
                              <Textarea
                                placeholder="e.g. Leave days reduced by 2 to account for 2 public holidays falling within leave period. 1 travelling day added."
                                value={officeReason[req.id] || ""}
                                onChange={(e) => setOfficeReason((p) => ({ ...p, [req.id]: e.target.value }))}
                                rows={3} className="resize-none text-sm"
                              />
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
              </div>
            )}
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
                        <Button size="sm" variant="outline"
                          onClick={() => setHrExpandedId(isExpanded ? null : req.id)}
                          className="text-xs h-8">
                          {isExpanded ? "▲ Collapse" : "▼ Review & Decide"}
                        </Button>
                        {isExpanded && (
                          <div className="mt-4 space-y-3 border-t pt-4">
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
