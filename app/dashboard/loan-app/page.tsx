"use client"

import { useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { SignaturePad } from "@/components/leave/signature-pad"
import { useToast } from "@/hooks/use-toast"
import { CheckCircle2, Clock, Download, FileText, Loader2, Wallet } from "lucide-react"

type LoanType = {
  loan_key: string
  loan_label: string
  category: string
  requires_committee: boolean
  requires_fd_check: boolean
  min_fd_score: number
  min_qualification_note?: string | null
  fixed_amount: number
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
  user_id: string
  corporate_email: string | null
  staff_number: string | null
  staff_rank: string | null
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
  created_at: string
  submitted_at: string
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
  }
  permissions: {
    hod: boolean
    loanOffice: boolean
    accounts: boolean
    committee: boolean
    hrOffice: boolean
    directorHr: boolean
    viewAllTabs: boolean
  }
  loanTypes: LoanType[]
  myRequests: LoanRequest[]
  myTimelines: { loan_request_id: string; entries: TimelineEntry[] }[]
  inbox: {
    hod: LoanRequest[]
    loanOffice: LoanRequest[]
    accounts: LoanRequest[]
    accountsSigned: LoanRequest[]
    committee: LoanRequest[]
    hrOffice: LoanRequest[]
    directorHr: LoanRequest[]
    allLoans: LoanRequest[]
  }
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
  loan_office_forward: "Loan Office Forward",
  accounts_fd_update: "Accounts FD Update",
  committee_decision: "Committee Decision",
  hr_set_terms: "HR Terms Set",
  director_finalize: "Director HR Final Decision",
}

const LOAN_SUBMISSION_LOCKED = true

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
  const [hrInputs, setHrInputs] = useState<Record<string, { disbursement: string; recovery: string; months: string; note: string }>>({})

  const [directorDecision, setDirectorDecision] = useState<"approve" | "reject">("approve")
  const [directorLetter, setDirectorLetter] = useState("")
  const [signatureMode, setSignatureMode] = useState<"typed" | "draw">("typed")
  const [signatureText, setSignatureText] = useState("")
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null)

  const filteredLoanTypes = useMemo(() => {
    if (data?.permissions?.viewAllTabs) return data.loanTypes || []
    const rank = data?.profile.position || ""
    return (data?.loanTypes || []).filter((loan) => isQualifiedForLoan(loan.loan_key, rank))
  }, [data])

  const selectedType = useMemo(() => filteredLoanTypes.find((t) => t.loan_key === loanTypeKey), [filteredLoanTypes, loanTypeKey])
  const needsAttachment = useMemo(() => requiresProofAttachment(loanTypeKey), [loanTypeKey])

  const visibleTabs = useMemo(() => {
    const p = data?.permissions
    const tabs = [{ key: "staff", label: "My Loans" }, { key: "tracking", label: "Tracking" }]
    if (p?.hod || p?.viewAllTabs) tabs.push({ key: "hod", label: "HOD" })
    if (p?.loanOffice || p?.viewAllTabs) tabs.push({ key: "loan-office", label: "Loan Office" })
    if (p?.accounts || p?.viewAllTabs) tabs.push({ key: "accounts", label: "Accounts" })
    if (p?.committee || p?.viewAllTabs) tabs.push({ key: "committee", label: "Committee" })
    if (p?.hrOffice || p?.viewAllTabs) tabs.push({ key: "hr", label: "HR Office" })
    if (p?.directorHr || p?.viewAllTabs) tabs.push({ key: "director", label: "Director HR" })
    if (p?.viewAllTabs) tabs.push({ key: "overview", label: "All Loans" })
    return tabs
  }, [data?.permissions])

  const defaultTab = visibleTabs[0]?.key || "staff"

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/loan/workflow", { cache: "no-store" })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || "Failed to load loan workflow")

      setData(result)
      setWarning(result.degraded ? result.warning || "Loan module is in degraded mode." : null)

      const allowedLoanTypes = result?.permissions?.viewAllTabs
        ? (result.loanTypes || [])
        : (result.loanTypes || []).filter((loan: LoanType) =>
            isQualifiedForLoan(loan.loan_key, result?.profile?.position),
          )
      if (allowedLoanTypes.length > 0 && !loanTypeKey) {
        setLoanTypeKey(allowedLoanTypes[0].loan_key)
      }
    } catch (e: any) {
      toast({ title: "Loan Module Error", description: e?.message || "Failed to load", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

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

  const submitRequest = async () => {
    if (LOAN_SUBMISSION_LOCKED) {
      toast({
        title: "Under Management Review",
        description: "Chale small patience. Loan application submissions will open when management gives the green light.",
      })
      return
    }

    if (!loanTypeKey) {
      toast({ title: "Missing loan type", description: "Please choose a loan type." })
      return
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
      reason,
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
    toast({ title: "Action completed", description: "Workflow updated successfully." })
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
        <Loader2 className="h-8 w-8 animate-spin text-emerald-700" />
        <span className="ml-3 text-muted-foreground">Loading loan module...</span>
      </div>
    )
  }

  const p = data?.permissions

  return (
    <div className="space-y-6 p-2">
      <Card className="border-0 shadow-lg overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-emerald-700 via-emerald-600 to-lime-500 text-white">
          <CardTitle className="text-3xl tracking-tight">QCC Loan Application Hub</CardTitle>
          <CardDescription className="text-emerald-50 text-base">
            Currency-smart workflow for staff welfare loans. Chale, your loan moves stage by stage with full visibility.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4 bg-gradient-to-br from-lime-50 to-white">
          {warning && <p className="text-sm text-amber-700 mb-3">{warning}</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div><strong>Corporate Email:</strong> {data?.profile.email || "N/A"}</div>
            <div><strong>Staff Number:</strong> {data?.profile.employeeId || "N/A"}</div>
            <div><strong>Station / Department:</strong> {data?.profile.departmentName || "N/A"}</div>
            <div><strong>Rank:</strong> {data?.profile.position || "N/A"}</div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue={defaultTab} className="space-y-4">
        <TabsList className="flex w-full flex-wrap gap-2 h-auto bg-transparent p-0">
          {visibleTabs.map((tab) => (
            <TabsTrigger key={tab.key} value={tab.key} className="data-[state=active]:bg-emerald-700 data-[state=active]:text-white">
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
                  <Select value={loanTypeKey} onValueChange={setLoanTypeKey}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {filteredLoanTypes.map((type) => (
                        <SelectItem key={type.loan_key} value={type.loan_key}>{type.loan_label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                <Button onClick={submitRequest} disabled>
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
                    <Badge className={STATUS_COLORS[row.status] || ""}>{statusText(row.status)}</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">Amount: GHc {fmtAmount(row.fixed_amount || row.requested_amount)}</div>
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
                      <Button variant="outline" size="sm" onClick={() => beginEdit(row)} disabled>
                        View / Edit
                      </Button>
                    )}
                    {row.status === "approved_director" && (
                      <Button variant="outline" size="sm" onClick={() => downloadApprovalLetter(row, data!.profile)}>
                        <Download className="h-4 w-4 mr-1" /> Download Final Approval
                      </Button>
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
                      <Badge className={STATUS_COLORS[req.status] || ""}>{statusText(req.status)}</Badge>
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
          {(data?.inbox.hod || []).map((row) => (
            <StageCard key={row.id} row={row}>
              <Textarea placeholder="HOD note" value={hodNotes[row.id] || ""} onChange={(e) => setHodNotes((s) => ({ ...s, [row.id]: e.target.value }))} rows={2} />
              {p?.hod && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => runAction({ action: "hod_decision", id: row.id, decision: "approve", note: hodNotes[row.id] || null })}>Approve</Button>
                  <Button size="sm" variant="destructive" onClick={() => runAction({ action: "hod_decision", id: row.id, decision: "reject", note: hodNotes[row.id] || null })}>Reject</Button>
                </div>
              )}
            </StageCard>
          ))}
        </TabsContent>

        <TabsContent value="loan-office" className="space-y-3">
          <ReadOnlyHint canAct={Boolean(p?.loanOffice)} roleLabel="Loan Office" />
          {(data?.inbox.loanOffice || []).map((row) => (
            <StageCard key={row.id} row={row}>
              <Textarea placeholder="Loan office note" value={loanOfficeNotes[row.id] || ""} onChange={(e) => setLoanOfficeNotes((s) => ({ ...s, [row.id]: e.target.value }))} rows={2} />
              {p?.loanOffice && (
                <Button size="sm" onClick={() => runAction({ action: "loan_office_forward", id: row.id, note: loanOfficeNotes[row.id] || null })}>
                  Forward Based on Workflow
                </Button>
              )}
            </StageCard>
          ))}
        </TabsContent>

        <TabsContent value="accounts" className="space-y-3">
          <ReadOnlyHint canAct={Boolean(p?.accounts)} roleLabel="Accounts" />
          {(data?.inbox.accounts || []).map((row) => {
            const fd = fdInputs[row.id] || { score: "", note: "" }
            return (
              <StageCard key={row.id} row={row}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <Input placeholder="FD score" type="number" value={fd.score} onChange={(e) => setFdInputs((s) => ({ ...s, [row.id]: { ...fd, score: e.target.value } }))} />
                  <Input placeholder="Accounts note" value={fd.note} onChange={(e) => setFdInputs((s) => ({ ...s, [row.id]: { ...fd, note: e.target.value } }))} />
                </div>
                {p?.accounts && (
                  <Button size="sm" onClick={() => runAction({ action: "accounts_fd_update", id: row.id, fd_score: Number(fd.score || 0), note: fd.note || null })}>
                    Update FD and Continue
                  </Button>
                )}
              </StageCard>
            )
          })}

          <Card>
            <CardHeader>
              <CardTitle>Approved Loans for Accounts Records</CardTitle>
              <CardDescription>Download all approved loans in CSV format.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => downloadCsv(data?.inbox.accountsSigned || [], "approved-loans-accounts.csv")}>
                  <Download className="h-4 w-4 mr-1" /> Download Approved Loans
                </Button>
              </div>
              {(data?.inbox.accountsSigned || []).map((row) => (
                <div key={row.id} className="border rounded p-3 text-sm">
                  <div className="font-medium">{row.request_number} - {row.loan_type_label}</div>
                  <div>Amount: GHc {fmtAmount(row.fixed_amount || row.requested_amount)}</div>
                  <div>Status: {statusText(row.status)}</div>
                </div>
              ))}
              {(data?.inbox.accountsSigned || []).length === 0 && <p className="text-sm text-muted-foreground">No approved records yet.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="committee" className="space-y-3">
          <ReadOnlyHint canAct={Boolean(p?.committee)} roleLabel="Loan Committee" />
          {(data?.inbox.committee || []).map((row) => (
            <StageCard key={row.id} row={row}>
              <Textarea placeholder="Committee note" value={committeeNotes[row.id] || ""} onChange={(e) => setCommitteeNotes((s) => ({ ...s, [row.id]: e.target.value }))} rows={2} />
              {p?.committee && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => runAction({ action: "committee_decision", id: row.id, decision: "approve", note: committeeNotes[row.id] || null })}>Approve</Button>
                  <Button size="sm" variant="destructive" onClick={() => runAction({ action: "committee_decision", id: row.id, decision: "reject", note: committeeNotes[row.id] || null })}>Reject</Button>
                </div>
              )}
            </StageCard>
          ))}
        </TabsContent>

        <TabsContent value="hr" className="space-y-3">
          <ReadOnlyHint canAct={Boolean(p?.hrOffice)} roleLabel="HR Office" />
          {(data?.inbox.hrOffice || []).map((row) => {
            const entry = hrInputs[row.id] || { disbursement: "", recovery: "", months: "", note: "" }
            return (
              <StageCard key={row.id} row={row}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <Input placeholder="Disbursement date (YYYY-MM-DD)" value={entry.disbursement} onChange={(e) => setHrInputs((s) => ({ ...s, [row.id]: { ...entry, disbursement: e.target.value } }))} />
                  <Input placeholder="Recovery start (YYYY-MM-DD)" value={entry.recovery} onChange={(e) => setHrInputs((s) => ({ ...s, [row.id]: { ...entry, recovery: e.target.value } }))} />
                  <Input placeholder="Recovery months" type="number" value={entry.months} onChange={(e) => setHrInputs((s) => ({ ...s, [row.id]: { ...entry, months: e.target.value } }))} />
                  <Input placeholder="HR note" value={entry.note} onChange={(e) => setHrInputs((s) => ({ ...s, [row.id]: { ...entry, note: e.target.value } }))} />
                </div>
                {p?.hrOffice && (
                  <Button size="sm" onClick={() => runAction({ action: "hr_set_terms", id: row.id, disbursement_date: entry.disbursement, recovery_start_date: entry.recovery, recovery_months: Number(entry.months || 0), note: entry.note || null })}>
                    Set Terms and Forward to Director HR
                  </Button>
                )}
              </StageCard>
            )
          })}
        </TabsContent>

        <TabsContent value="director" className="space-y-3">
          <ReadOnlyHint canAct={Boolean(p?.directorHr)} roleLabel="Director HR" />
          <Card>
            <CardHeader>
              <CardTitle>Director Signature & Decision Setup</CardTitle>
              <CardDescription>Apply these fields while finalizing each request below.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select value={signatureMode} onValueChange={(v: "typed" | "draw") => setSignatureMode(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="typed">Typed</SelectItem>
                  <SelectItem value="draw">Draw on screen</SelectItem>
                </SelectContent>
              </Select>
              {signatureMode === "typed" ? (
                <Input value={signatureText} onChange={(e) => setSignatureText(e.target.value)} placeholder="Director HR full name" />
              ) : (
                <SignaturePad value={signatureDataUrl} onChange={setSignatureDataUrl} />
              )}
              <Select value={directorDecision} onValueChange={(v: "approve" | "reject") => setDirectorDecision(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="approve">Approve</SelectItem>
                  <SelectItem value="reject">Reject</SelectItem>
                </SelectContent>
              </Select>
              <Textarea value={directorLetter} onChange={(e) => setDirectorLetter(e.target.value)} placeholder="Director HR letter" rows={4} />
            </CardContent>
          </Card>

          {(data?.inbox.directorHr || []).map((row) => (
            <StageCard key={row.id} row={row}>
              {p?.directorHr && (
                <Button size="sm" onClick={() => runAction({ action: "director_finalize", id: row.id, decision: directorDecision, signature_mode: signatureMode, signature_text: signatureMode === "typed" ? signatureText : null, signature_data_url: signatureMode === "draw" ? signatureDataUrl : null, director_letter: directorLetter, note: "Director HR final decision" })}>
                  Finalize Decision
                </Button>
              )}
            </StageCard>
          ))}
        </TabsContent>

        <TabsContent value="overview" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>All Loan Requests</CardTitle>
              <CardDescription>Full cross-organization visibility for admin, HR loan office, and Director HR.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => downloadCsv(data?.inbox.allLoans || [], "all-loan-requests.csv")}>
                  <Download className="h-4 w-4 mr-1" /> Export All Loans
                </Button>
              </div>
              {(data?.inbox.allLoans || []).map((row) => (
                <div key={row.id} className="rounded border p-3 text-sm">
                  <div className="font-medium">{row.request_number} - {row.loan_type_label}</div>
                  <div>{row.staff_rank || "N/A"} | Staff No: {row.staff_number || "N/A"}</div>
                  <div>Amount: GHc {fmtAmount(row.fixed_amount || row.requested_amount)} | Status: {statusText(row.status)}</div>
                </div>
              ))}
              {(data?.inbox.allLoans || []).length === 0 && <p className="text-sm text-muted-foreground">No loans found.</p>}
            </CardContent>
          </Card>
        </TabsContent>
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
          <Badge className={STATUS_COLORS[row.status] || ""}>{statusText(row.status)}</Badge>
          {row.fd_score !== null && (
            <span className="inline-flex items-center gap-1 text-xs">
              FD: <strong>{row.fd_score}</strong>
              {row.fd_good ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : null}
            </span>
          )}
        </CardDescription>
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
