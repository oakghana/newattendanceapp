"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { SignaturePad } from "@/components/leave/signature-pad"
import { isHrDepartment, isManagerRole, isStaffRole } from "@/lib/leave-planning"
import { computeLeaveDays, computeReturnToWorkDate } from "@/lib/leave-policy"
import { useToast } from "@/hooks/use-toast"

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

type ReviewAction = "approve" | "recommend_change" | "reject"

interface ReviewDraft {
  action: ReviewAction
  recommendation: string
  adjustedStartDate: string
  adjustedEndDate: string
}

async function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function LeavePlanningClient({ profile }: LeavePlanningClientProps) {
  const { toast } = useToast()
  const normalizedRole = String(profile.role || "").toLowerCase().trim().replace(/[-\s]+/g, "_")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [data, setData] = useState<any>(null)

  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [reason, setReason] = useState("")

  const [signatureMode, setSignatureMode] = useState<SignatureMode>("typed")
  const [typedSignature, setTypedSignature] = useState("")
  const [uploadedSignatureDataUrl, setUploadedSignatureDataUrl] = useState<string | null>(null)
  const [drawnSignatureDataUrl, setDrawnSignatureDataUrl] = useState<string | null>(null)

  const [staggerRequestId, setStaggerRequestId] = useState("")
  const [staggerStart, setStaggerStart] = useState("")
  const [staggerEnd, setStaggerEnd] = useState("")
  const [staggerReason, setStaggerReason] = useState("")
  const [yearPeriod, setYearPeriod] = useState("2026/2027")
  const [periods, setPeriods] = useState<{ value: string; label: string; active: boolean }[]>([])
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeOption[]>([])
  const [leaveType, setLeaveType] = useState("annual")

  const [policyLeaveTypeKey, setPolicyLeaveTypeKey] = useState("")
  const [policyLeaveTypeLabel, setPolicyLeaveTypeLabel] = useState("")
  const [policyEntitlementDays, setPolicyEntitlementDays] = useState(0)

  const [reviewDrafts, setReviewDrafts] = useState<Record<string, ReviewDraft>>({})
  const [staggerReviewDrafts, setStaggerReviewDrafts] = useState<Record<string, ReviewDraft>>({})

  const [hrAction, setHrAction] = useState<"approve" | "reject">("approve")
  const [hrLetter, setHrLetter] = useState("")
  const [selectedHrRequestId, setSelectedHrRequestId] = useState<string | null>(null)
  const [selectedHrStaggerRequestId, setSelectedHrStaggerRequestId] = useState<string | null>(null)
  const [hrSignatureMode, setHrSignatureMode] = useState<SignatureMode>("typed")
  const [hrTypedSignature, setHrTypedSignature] = useState("")
  const [hrUploadedSignatureDataUrl, setHrUploadedSignatureDataUrl] = useState<string | null>(null)
  const [hrDrawnSignatureDataUrl, setHrDrawnSignatureDataUrl] = useState<string | null>(null)

  const staff = isStaffRole(normalizedRole)
  const manager = isManagerRole(normalizedRole) && !isHrDepartment(profile.departmentName, profile.departmentCode)
  const hr =
    normalizedRole === "admin" ||
    normalizedRole === "hr" ||
    (normalizedRole === "department_head" && isHrDepartment(profile.departmentName, profile.departmentCode))
  const hasModuleAccess = staff || manager || hr

  const showUnderReviewToast = () => {
    toast({
      title: "Under Review",
      description:
        "This leave module is still under review and will be commissioned by management soon. Thanks for your patience.",
    })
  }

  const activeSignaturePayload = useMemo(() => {
    if (signatureMode === "typed") return { text: typedSignature || null, dataUrl: null }
    if (signatureMode === "upload") return { text: null, dataUrl: uploadedSignatureDataUrl }
    return { text: null, dataUrl: drawnSignatureDataUrl }
  }, [signatureMode, typedSignature, uploadedSignatureDataUrl, drawnSignatureDataUrl])

  const hrSignaturePayload = useMemo(() => {
    if (hrSignatureMode === "typed") return { text: hrTypedSignature || null, dataUrl: null }
    if (hrSignatureMode === "upload") return { text: null, dataUrl: hrUploadedSignatureDataUrl }
    return { text: null, dataUrl: hrDrawnSignatureDataUrl }
  }, [hrSignatureMode, hrTypedSignature, hrUploadedSignatureDataUrl, hrDrawnSignatureDataUrl])

  const loadPlanningData = async () => {
    setLoading(true)
    setError(null)
    setWarning(null)
    try {
      const response = await fetch("/api/leave/planning", { cache: "no-store" })
      const result = await response.json()
      if (!response.ok) {
        const normalizedError =
          typeof result?.error === "string"
            ? result.error
            : result?.error?.message || JSON.stringify(result?.error || result)
        throw new Error(normalizedError || "Failed to load leave planning data")
      }
      setData(result)
      if (result?.degraded && result?.warning) {
        setWarning(String(result.warning))
      }
    } catch (err) {
      const fallback =
        err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err)
      setError(fallback || "Failed to load leave planning data")
    } finally {
      setLoading(false)
    }
  }

  const loadPolicy = async () => {
    try {
      const response = await fetch("/api/leave/policy", { cache: "no-store" })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || "Failed to load leave policy")
      }

      setYearPeriod(result.activePeriod || "2026/2027")
      setPeriods(result.periods || [])
      setLeaveTypes(result.leaveTypes || [])
      if ((result.leaveTypes || []).length > 0) {
        setLeaveType(result.leaveTypes[0].leaveTypeKey)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load leave policy")
    }
  }

  useEffect(() => {
    void loadPlanningData()
    void loadPolicy()
  }, [])

  const submitPlan = async () => {
    if (profile.role !== "admin") {
      showUnderReviewToast()
      return
    }

    if (yearPeriod !== "2026/2027") {
      setError("Only 2026/2027 leave period is active for submissions right now.")
      return
    }

    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/leave/planning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leave_year_period: yearPeriod,
          preferred_start_date: startDate,
          preferred_end_date: endDate,
          leave_type: leaveType,
          reason,
          user_signature_mode: signatureMode,
          user_signature_text: activeSignaturePayload.text,
          user_signature_data_url: activeSignaturePayload.dataUrl,
        }),
      })

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || "Failed to submit leave planning request")
      }

      setStartDate("")
      setEndDate("")
      setReason("")
      setTypedSignature("")
      setUploadedSignatureDataUrl(null)
      setDrawnSignatureDataUrl(null)
      await loadPlanningData()
      alert(`Request submitted. Expected return-to-work date: ${computeReturnToWorkDate(endDate)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit leave planning request")
    } finally {
      setLoading(false)
    }
  }

  const submitManagerReview = async (requestId: string, draft: ReviewDraft) => {
    if (profile.role !== "admin") {
      showUnderReviewToast()
      return
    }

    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/leave/planning/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leave_plan_request_id: requestId,
          action: draft.action,
          recommendation: draft.recommendation || null,
          adjusted_preferred_start_date: draft.adjustedStartDate || null,
          adjusted_preferred_end_date: draft.adjustedEndDate || null,
        }),
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || "Failed to process manager review")
      }
      setReviewDrafts((prev) => {
        const next = { ...prev }
        delete next[requestId]
        return next
      })
      await loadPlanningData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process manager review")
    } finally {
      setLoading(false)
    }
  }

  const submitHrDecision = async (requestId: string) => {
    if (profile.role !== "admin") {
      showUnderReviewToast()
      return
    }

    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/leave/planning/hr-finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leave_plan_request_id: requestId,
          action: hrAction,
          hr_response_letter: hrLetter,
          hr_signature_mode: hrSignatureMode,
          hr_signature_text: hrSignaturePayload.text,
          hr_signature_data_url: hrSignaturePayload.dataUrl,
        }),
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || "Failed to finalize leave plan")
      }
      setHrLetter("")
      setSelectedHrRequestId(null)
      await loadPlanningData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to finalize leave plan")
    } finally {
      setLoading(false)
    }
  }

  const submitStagger = async () => {
    if (profile.role !== "admin") {
      showUnderReviewToast()
      return
    }

    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/leave/planning/stagger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leave_plan_request_id: staggerRequestId,
          requested_start_date: staggerStart,
          requested_end_date: staggerEnd,
          reason: staggerReason,
          user_signature_mode: signatureMode,
          user_signature_text: activeSignaturePayload.text,
          user_signature_data_url: activeSignaturePayload.dataUrl,
        }),
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || "Failed to submit stagger request")
      }

      setStaggerRequestId("")
      setStaggerStart("")
      setStaggerEnd("")
      setStaggerReason("")
      await loadPlanningData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit stagger request")
    } finally {
      setLoading(false)
    }
  }

  const upsertLeaveTypePolicy = async () => {
    if (profile.role !== "admin") {
      showUnderReviewToast()
      return
    }

    if (!policyLeaveTypeKey || !policyLeaveTypeLabel || policyEntitlementDays <= 0) {
      setError("Provide leave type key, label, and entitlement days.")
      return
    }

    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/leave/policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert_leave_type",
          leaveYearPeriod: yearPeriod,
          leaveTypeKey: policyLeaveTypeKey,
          leaveTypeLabel: policyLeaveTypeLabel,
          entitlementDays: Number(policyEntitlementDays),
          isEnabled: true,
        }),
      })

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || "Failed to update leave policy")
      }

      setPolicyLeaveTypeKey("")
      setPolicyLeaveTypeLabel("")
      setPolicyEntitlementDays(0)
      await loadPolicy()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update leave policy")
    } finally {
      setLoading(false)
    }
  }

  const submitStaggerManagerReview = async (requestId: string, draft: ReviewDraft) => {
    if (profile.role !== "admin") {
      showUnderReviewToast()
      return
    }

    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/leave/planning/stagger/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leave_plan_stagger_request_id: requestId,
          action: draft.action,
          recommendation: draft.recommendation || null,
          adjusted_requested_start_date: draft.adjustedStartDate || null,
          adjusted_requested_end_date: draft.adjustedEndDate || null,
        }),
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || "Failed to process manager stagger review")
      }
      setStaggerReviewDrafts((prev) => {
        const next = { ...prev }
        delete next[requestId]
        return next
      })
      await loadPlanningData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process manager stagger review")
    } finally {
      setLoading(false)
    }
  }

  const submitStaggerHrDecision = async (requestId: string) => {
    if (profile.role !== "admin") {
      showUnderReviewToast()
      return
    }

    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/leave/planning/stagger/hr-finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leave_plan_stagger_request_id: requestId,
          action: hrAction,
          hr_response_letter: hrLetter,
          hr_signature_mode: hrSignatureMode,
          hr_signature_text: hrSignaturePayload.text,
          hr_signature_data_url: hrSignaturePayload.dataUrl,
        }),
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || "Failed to finalize stagger leave plan")
      }
      setHrLetter("")
      setSelectedHrStaggerRequestId(null)
      await loadPlanningData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to finalize stagger leave plan")
    } finally {
      setLoading(false)
    }
  }

  const renderSignatureInput = (
    mode: SignatureMode,
    setMode: (mode: SignatureMode) => void,
    typed: string,
    setTyped: (value: string) => void,
    setUploadDataUrl: (value: string | null) => void,
    drawDataUrl: string | null,
    setDrawDataUrl: (value: string | null) => void,
  ) => (
    <div className="space-y-3">
      <Label>Signature (secured with hologram)</Label>
      <Select value={mode} onValueChange={(value: SignatureMode) => setMode(value)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="typed">Type Signature</SelectItem>
          <SelectItem value="upload">Upload Signature</SelectItem>
          <SelectItem value="draw">Sign On Screen</SelectItem>
        </SelectContent>
      </Select>

      {mode === "typed" && (
        <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Enter full name as signature" />
      )}

      {mode === "upload" && (
        <Input
          type="file"
          accept="image/*"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file) {
              setUploadDataUrl(null)
              return
            }
            const dataUrl = await readAsDataUrl(file)
            setUploadDataUrl(dataUrl)
          }}
        />
      )}

      {mode === "draw" && <SignaturePad value={drawDataUrl} onChange={setDrawDataUrl} />}
    </div>
  )

  const requestRows = data?.requests || []
  const reviewRows = data?.reviews || []
  const hrRows = data?.requests || []
  const staggerRows = data?.staggerRequests || []
  const staggerReviewRows = data?.staggerReviews || []
  const selectedType = leaveTypes.find((t) => t.leaveTypeKey === leaveType)
  const requestedDays = computeLeaveDays(startDate, endDate)
  const periodLocked = yearPeriod !== "2026/2027"

  const getReviewDraft = (row: any): ReviewDraft => {
    const request = row?.leave_plan_request
    const requestId = request?.id
    if (requestId && reviewDrafts[requestId]) return reviewDrafts[requestId]
    return {
      action: "approve",
      recommendation: "",
      adjustedStartDate: request?.preferred_start_date || "",
      adjustedEndDate: request?.preferred_end_date || "",
    }
  }

  const getStaggerReviewDraft = (row: any): ReviewDraft => {
    const request = row?.stagger_request
    const requestId = request?.id
    if (requestId && staggerReviewDrafts[requestId]) return staggerReviewDrafts[requestId]
    return {
      action: "approve",
      recommendation: "",
      adjustedStartDate: request?.requested_start_date || "",
      adjustedEndDate: request?.requested_end_date || "",
    }
  }

  const updateReviewDraft = (requestId: string, patch: Partial<ReviewDraft>, row: any) => {
    setReviewDrafts((prev) => {
      const current = prev[requestId] || getReviewDraft(row)
      return {
        ...prev,
        [requestId]: {
          ...current,
          ...patch,
        },
      }
    })
  }

  const updateStaggerReviewDraft = (requestId: string, patch: Partial<ReviewDraft>, row: any) => {
    setStaggerReviewDrafts((prev) => {
      const current = prev[requestId] || getStaggerReviewDraft(row)
      return {
        ...prev,
        [requestId]: {
          ...current,
          ...patch,
        },
      }
    })
  }

  const buildFormalResponse = (
    staffName: string,
    startDate: string,
    endDate: string,
    isApproval: boolean,
    isStagger: boolean,
  ) => {
    const header = isStagger ? "OFFICIAL RESPONSE TO STAGGER LEAVE REQUEST" : "OFFICIAL RESPONSE TO LEAVE REQUEST"
    const decisionLabel = isApproval ? "APPROVED" : "NOT APPROVED"
    return [
      `${header}`,
      "",
      `To: ${staffName}`,
      `Subject: Leave Schedule Decision (${startDate} to ${endDate})`,
      "",
      `After review by management and HR, your request has been ${decisionLabel}.`,
      isApproval
        ? `You are expected to resume work on ${computeReturnToWorkDate(endDate)}.`
        : "Please review recommendations and submit a revised request where required.",
      "",
      "Regards,",
      "Head of Department (HR)",
      "QCC Electronic Attendance System",
    ].join("\n")
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Leave Planning 2026/2027 🇬🇭</h1>
          <p className="text-sm text-muted-foreground">
            Akwaaba! Plan your leave here. Your request goes to your manager first, then HR issues your official letter. Easy steps, no stress!
          </p>
        </div>
        <Button onClick={loadPlanningData} disabled={loading}>
          {loading ? "Please wait..." : "Refresh"}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {warning && profile.role === "admin" && (
        <Alert>
          <AlertDescription>{warning}</AlertDescription>
        </Alert>
      )}

      {!hasModuleAccess && (
        <Alert>
          <AlertDescription>
            Your account role is not mapped to a leave planning view yet. Please contact IT/Admin to assign a supported role.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue={staff ? "staff" : manager ? "manager" : "hr"} className="space-y-4">
        <TabsList>
          {staff && <TabsTrigger value="staff">My Leave</TabsTrigger>}
          {manager && <TabsTrigger value="manager">Review Requests</TabsTrigger>}
          {hr && <TabsTrigger value="hr">HR Approval</TabsTrigger>}
        </TabsList>

        {staff && (
          <TabsContent value="staff" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Apply for Your Leave (2026/2027)</CardTitle>
                <CardDescription>
                  Fill in your preferred dates and sign below. Your manager will review first — once confirmed, HR will issue your official leave letter. Simple!
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Leave Year</Label>
                    <Select value={yearPeriod} onValueChange={setYearPeriod}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {periods.length === 0 && <SelectItem value="2026/2027">2026/2027 (Active)</SelectItem>}
                        {periods.map((period) => (
                          <SelectItem key={period.value} value={period.value}>
                            {period.label} {period.active ? "(Active)" : "(Future - Locked)"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Leave Type</Label>
                    <Select value={leaveType} onValueChange={setLeaveType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {leaveTypes.length === 0 && <SelectItem value="annual">Annual Leave (30 days)</SelectItem>}
                        {leaveTypes.map((type) => (
                          <SelectItem key={type.leaveTypeKey} value={type.leaveTypeKey}>
                            {type.leaveTypeLabel} ({type.entitlementDays} days)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>When do you want to start?</Label>
                    <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>When do you want to return?</Label>
                    <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Why do you need this leave?</Label>
                  <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Briefly tell us the reason for your leave" />
                </div>

                {selectedType && (
                  <p className="text-sm text-muted-foreground">
                    You are entitled to {selectedType.entitlementDays} days. You are requesting {requestedDays || 0} days. Expected return to work:{" "}
                    {endDate ? computeReturnToWorkDate(endDate) : "N/A"}
                  </p>
                )}

                {renderSignatureInput(
                  signatureMode,
                  setSignatureMode,
                  typedSignature,
                  setTypedSignature,
                  setUploadedSignatureDataUrl,
                  drawnSignatureDataUrl,
                  setDrawnSignatureDataUrl,
                )}

                <Button onClick={submitPlan} disabled={loading}>
                  {loading ? "Submitting..." : "Submit My Leave Request"}
                </Button>

                {periodLocked && (
                  <p className="text-xs text-amber-600">
                    ⚠️ Only the 2026/2027 period is open for new requests. Future years are for record keeping only.
                  </p>
                )}
              </CardContent>
            </Card>

            {requestRows.some((r: any) => r.status === "hr_approved" && r.hr_response_letter) && (
              <Card>
                <CardHeader>
                  <CardTitle>Need to Adjust Your Leave Dates?</CardTitle>
                  <CardDescription>
                    Your leave has been approved and your letter issued. If you need to change your dates, submit a stagger request here. Your manager and HR will review it again.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Your Approved Leave Request ID</Label>
                    <Input value={staggerRequestId} onChange={(e) => setStaggerRequestId(e.target.value)} placeholder="Paste the ID from your approved leave request below" />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>New Leave Start Date</Label>
                      <Input type="date" value={staggerStart} onChange={(e) => setStaggerStart(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>New Leave End Date</Label>
                      <Input type="date" value={staggerEnd} onChange={(e) => setStaggerEnd(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Stagger Request Reason</Label>
                    <Textarea value={staggerReason} onChange={(e) => setStaggerReason(e.target.value)} />
                  </div>
                  <Button onClick={submitStagger} disabled={loading}>
                    {loading ? "Submitting..." : "Submit Date Change Request"}
                  </Button>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>My Leave Requests</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {requestRows.length === 0 && <p className="text-sm text-muted-foreground">You haven't applied for any leave yet. Go ahead and apply above! 👆</p>}
                {requestRows.map((row: any) => (
                  <div key={row.id} className="rounded border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">
                        {row.preferred_start_date} to {row.preferred_end_date}
                      </p>
                      <Badge>{row.status}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{row.reason || "No reason given"}</p>
                    {row.manager_recommendation && (
                      <p className="mt-2 text-sm">
                        <span className="font-medium">Manager's Note:</span> {row.manager_recommendation}
                      </p>
                    )}
                    {row.hr_response_letter && (
                      <p className="mt-2 text-sm">
                        <span className="font-medium">HR Letter:</span> {row.hr_response_letter}
                      </p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>My Date Change Requests</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {staggerRows.length === 0 && <p className="text-sm text-muted-foreground">No date change requests yet. If your leave is approved and you need to shift dates, you can do that above.</p>}
                {staggerRows.map((row: any) => (
                  <div key={row.id} className="rounded border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">
                        {row.requested_start_date} to {row.requested_end_date}
                      </p>
                      <Badge>{row.status}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{row.reason || "No reason given"}</p>
                    {row.manager_recommendation && (
                      <p className="mt-2 text-sm">
                        <span className="font-medium">Manager's Note:</span> {row.manager_recommendation}
                      </p>
                    )}
                    {row.hr_response_letter && (
                      <p className="mt-2 text-sm">
                        <span className="font-medium">HR Letter:</span> {row.hr_response_letter}
                      </p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {manager && (
          <TabsContent value="manager" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Staff Leave Requests — Awaiting Your Review</CardTitle>
                <CardDescription>
                  Review each staff member's request below. You can approve, suggest a date change, or reject. Please add a note where necessary so the staff knows what to do next.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {reviewRows.length === 0 && <p className="text-sm text-muted-foreground">All clear! No pending leave requests to review right now. 👍</p>}
                {reviewRows.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Requested Dates</TableHead>
                        <TableHead>Your Decision</TableHead>
                        <TableHead>Suggested New Dates</TableHead>
                        <TableHead>Note to Staff</TableHead>
                        <TableHead>Submit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reviewRows.map((row: any) => {
                        const requestId = row.leave_plan_request?.id
                        const draft = getReviewDraft(row)
                        const requiresReason = draft.action !== "approve"
                        const disableSubmit = loading || !requestId || (requiresReason && !draft.recommendation.trim())

                        return (
                          <TableRow key={row.id}>
                            <TableCell className="align-top whitespace-normal">
                              <div className="font-medium">
                                {row.leave_plan_request?.user?.first_name} {row.leave_plan_request?.user?.last_name}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {row.leave_plan_request?.user?.employee_id || "N/A"}
                              </div>
                              <Badge className="mt-2" variant="secondary">
                                {row.decision}
                              </Badge>
                            </TableCell>
                            <TableCell className="align-top whitespace-normal">
                              <div>{row.leave_plan_request?.preferred_start_date} to {row.leave_plan_request?.preferred_end_date}</div>
                              <div className="text-xs text-muted-foreground mt-1">{row.leave_plan_request?.reason || "No reason given"}</div>
                            </TableCell>
                            <TableCell className="align-top whitespace-normal">
                              <Select
                                value={draft.action}
                                onValueChange={(value: ReviewAction) => updateReviewDraft(requestId, { action: value }, row)}
                                disabled={!requestId}
                              >
                                <SelectTrigger className="w-[190px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="approve">Approve User Request</SelectItem>
                                  <SelectItem value="recommend_change">Request User Correction</SelectItem>
                                  <SelectItem value="reject">Reject User Request</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="align-top whitespace-normal">
                              <div className="grid gap-2 min-w-[220px]">
                                <Input
                                  type="date"
                                  value={draft.adjustedStartDate}
                                  onChange={(e) => updateReviewDraft(requestId, { adjustedStartDate: e.target.value }, row)}
                                  disabled={!requestId || draft.action !== "recommend_change"}
                                />
                                <Input
                                  type="date"
                                  value={draft.adjustedEndDate}
                                  onChange={(e) => updateReviewDraft(requestId, { adjustedEndDate: e.target.value }, row)}
                                  disabled={!requestId || draft.action !== "recommend_change"}
                                />
                              </div>
                            </TableCell>
                            <TableCell className="align-top whitespace-normal">
                              <Textarea
                                value={draft.recommendation}
                                onChange={(e) => updateReviewDraft(requestId, { recommendation: e.target.value }, row)}
                                placeholder="Enter reason and what the user should correct"
                                className="min-w-[260px]"
                              />
                            </TableCell>
                            <TableCell className="align-top whitespace-normal">
                              <Button onClick={() => submitManagerReview(requestId, draft)} disabled={disableSubmit} size="sm">
                                Submit Decision
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                )}

                <h3 className="font-semibold">Date Change Requests — Awaiting Review</h3>
                {staggerReviewRows.length === 0 && <p className="text-sm text-muted-foreground">No date change requests to review right now. 👍</p>}
                {staggerReviewRows.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Requested New Dates</TableHead>
                        <TableHead>Your Decision</TableHead>
                        <TableHead>Suggested New Dates</TableHead>
                        <TableHead>Note to Staff</TableHead>
                        <TableHead>Submit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {staggerReviewRows.map((row: any) => {
                        const requestId = row.stagger_request?.id
                        const draft = getStaggerReviewDraft(row)
                        const requiresReason = draft.action !== "approve"
                        const disableSubmit = loading || !requestId || (requiresReason && !draft.recommendation.trim())

                        return (
                          <TableRow key={row.id}>
                            <TableCell className="align-top whitespace-normal">
                              <div className="font-medium">
                                {row.stagger_request?.user?.first_name} {row.stagger_request?.user?.last_name}
                              </div>
                              <Badge className="mt-2" variant="secondary">
                                {row.decision}
                              </Badge>
                            </TableCell>
                            <TableCell className="align-top whitespace-normal">
                              <div>{row.stagger_request?.requested_start_date} to {row.stagger_request?.requested_end_date}</div>
                              <div className="text-xs text-muted-foreground mt-1">{row.stagger_request?.reason || "No reason given"}</div>
                            </TableCell>
                            <TableCell className="align-top whitespace-normal">
                              <Select
                                value={draft.action}
                                onValueChange={(value: ReviewAction) => updateStaggerReviewDraft(requestId, { action: value }, row)}
                                disabled={!requestId}
                              >
                                <SelectTrigger className="w-[190px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="approve">Approve User Request</SelectItem>
                                  <SelectItem value="recommend_change">Request User Correction</SelectItem>
                                  <SelectItem value="reject">Reject User Request</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="align-top whitespace-normal">
                              <div className="grid gap-2 min-w-[220px]">
                                <Input
                                  type="date"
                                  value={draft.adjustedStartDate}
                                  onChange={(e) => updateStaggerReviewDraft(requestId, { adjustedStartDate: e.target.value }, row)}
                                  disabled={!requestId || draft.action !== "recommend_change"}
                                />
                                <Input
                                  type="date"
                                  value={draft.adjustedEndDate}
                                  onChange={(e) => updateStaggerReviewDraft(requestId, { adjustedEndDate: e.target.value }, row)}
                                  disabled={!requestId || draft.action !== "recommend_change"}
                                />
                              </div>
                            </TableCell>
                            <TableCell className="align-top whitespace-normal">
                              <Textarea
                                value={draft.recommendation}
                                onChange={(e) => updateStaggerReviewDraft(requestId, { recommendation: e.target.value }, row)}
                                placeholder="Add a note for the staff member — what should they correct or know?"
                                className="min-w-[260px]"
                              />
                            </TableCell>
                            <TableCell className="align-top whitespace-normal">
                              <Button onClick={() => submitStaggerManagerReview(requestId, draft)} disabled={disableSubmit} size="sm">
                                Submit Decision
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {hr && (
          <TabsContent value="hr" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>HR — Final Approval & Leave Letter</CardTitle>
                <CardDescription>
                  Only requests confirmed by the manager appear here. Write the official response letter, sign it, and give your final decision. Staff will be notified once done.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Card className="border-dashed">
                  <CardHeader>
                    <CardTitle className="text-base">Manage Leave Types (Admin/HR)</CardTitle>
                    <CardDescription>
                      Add or update leave types and how many days staff are entitled to. Changes take effect immediately for all staff.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label>Leave Type Key</Label>
                        <Input value={policyLeaveTypeKey} onChange={(e) => setPolicyLeaveTypeKey(e.target.value)} placeholder="e.g. study" />
                      </div>
                      <div className="space-y-2">
                        <Label>Display Name</Label>
                        <Input value={policyLeaveTypeLabel} onChange={(e) => setPolicyLeaveTypeLabel(e.target.value)} placeholder="e.g. Study Leave" />
                      </div>
                      <div className="space-y-2">
                        <Label>Entitlement Days</Label>
                        <Input
                          type="number"
                          value={policyEntitlementDays || ""}
                          onChange={(e) => setPolicyEntitlementDays(Number(e.target.value || 0))}
                          min={0}
                        />
                      </div>
                    </div>
                    <Button onClick={upsertLeaveTypePolicy} disabled={loading} size="sm">
                      {loading ? "Saving..." : "Save Leave Type"}
                    </Button>
                  </CardContent>
                </Card>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Decision</Label>
                    <Select value={hrAction} onValueChange={(value: any) => setHrAction(value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="approve">Approve</SelectItem>
                        <SelectItem value="reject">Reject</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Official Response Letter</Label>
                    <Textarea value={hrLetter} onChange={(e) => setHrLetter(e.target.value)} placeholder="Write your official response here, or use the template button below per request" />
                    <p className="text-xs text-muted-foreground">
                      Click "Use Template" on any request below to auto-fill a formal letter. You can edit it before finalizing.
                    </p>
                  </div>
                </div>

                {renderSignatureInput(
                  hrSignatureMode,
                  setHrSignatureMode,
                  hrTypedSignature,
                  setHrTypedSignature,
                  setHrUploadedSignatureDataUrl,
                  hrDrawnSignatureDataUrl,
                  setHrDrawnSignatureDataUrl,
                )}

                {hrRows.length === 0 && <p className="text-sm text-muted-foreground">No requests waiting for HR approval right now. All done! 🎉</p>}
                {hrRows.map((row: any) => (
                  <div key={row.id} className="rounded border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">
                        {row.user?.first_name} {row.user?.last_name} ({row.user?.employee_id || "N/A"})
                      </p>
                      <Badge>{row.status}</Badge>
                    </div>
                    <p className="text-sm">
                      Leave Dates: {row.preferred_start_date} to {row.preferred_end_date}
                    </p>
                    <p className="text-sm text-muted-foreground">{row.reason || "No reason given"}</p>
                    {row.manager_recommendation && (
                      <p className="text-sm">
                        <span className="font-medium">Manager's Note:</span> {row.manager_recommendation}
                      </p>
                    )}
                    {row.status === "manager_confirmed" && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedHrRequestId(row.id)
                            setSelectedHrStaggerRequestId(null)
                            setHrLetter(
                              buildFormalResponse(
                                `${row.user?.first_name || ""} ${row.user?.last_name || ""}`.trim(),
                                row.preferred_start_date,
                                row.preferred_end_date,
                                hrAction === "approve",
                                false,
                              ),
                            )
                          }}
                        >
                          Use Template
                        </Button>
                        <Button onClick={() => submitHrDecision(row.id)} disabled={loading} size="sm">
                          {loading ? "Processing..." : "Issue Decision & Letter"}
                        </Button>
                      </div>
                    )}
                    {selectedHrRequestId === row.id && (
                      <p className="text-xs text-emerald-600">✅ Template loaded! Edit the letter above if needed, then issue your decision.</p>
                    )}
                  </div>
                ))}

                <h3 className="font-semibold">Date Change Requests — HR Review</h3>
                {staggerRows.length === 0 && <p className="text-sm text-muted-foreground">No date change requests waiting for HR review. 👍</p>}
                {staggerRows.map((row: any) => (
                  <div key={row.id} className="rounded border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">
                        {row.user?.first_name} {row.user?.last_name}
                      </p>
                      <Badge>{row.status}</Badge>
                    </div>
                    <p className="text-sm">
                      New Requested Dates: {row.requested_start_date} to {row.requested_end_date}
                    </p>
                    <p className="text-sm text-muted-foreground">{row.reason || "No reason given"}</p>
                    {row.manager_recommendation && (
                      <p className="text-sm">
                        <span className="font-medium">Manager's Note:</span> {row.manager_recommendation}
                      </p>
                    )}
                    {row.status === "manager_confirmed" && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedHrStaggerRequestId(row.id)
                            setSelectedHrRequestId(null)
                            setHrLetter(
                              buildFormalResponse(
                                `${row.user?.first_name || ""} ${row.user?.last_name || ""}`.trim(),
                                row.requested_start_date,
                                row.requested_end_date,
                                hrAction === "approve",
                                true,
                              ),
                            )
                          }}
                        >
                          Use Formal Template
                        </Button>
                        <Button onClick={() => submitStaggerHrDecision(row.id)} disabled={loading} size="sm">
                          Finalize Stagger Request
                        </Button>
                      </div>
                    )}
                    {selectedHrStaggerRequestId === row.id && (
                      <p className="text-xs text-emerald-600">Template loaded for this stagger request. You can edit before finalizing.</p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
