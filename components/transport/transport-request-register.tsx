"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, CalendarDays, Download, ExternalLink, MapPin, Search, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { toast } from "@/hooks/use-toast"

export type TransportRequestRow = {
  id: string
  request_type?: "regional_transport" | "nonregional_transport" | string | null
  purpose: string
  origin: string
  destination: string
  event_date: string | null
  passenger_count: number
  status: string | null
  workflow_stage: string | null
  reference_number: string | null
  supporting_documents: { name?: string; url?: string }[] | null
  assigned_region_id?: string | null
  assigned_region?: { name?: string | null; districts?: { region_id?: string | null; regions?: { name?: string | null } | { name?: string | null }[] | null } | { region_id?: string | null; regions?: { name?: string | null } | { name?: string | null }[] | null }[] | null }[] | { name?: string | null; districts?: { region_id?: string | null; regions?: { name?: string | null } | { name?: string | null }[] | null } | { region_id?: string | null; regions?: { name?: string | null } | { name?: string | null }[] | null }[] | null } | null
  linked_district_id?: string | null
  origin_location_id?: string | null
  memo_reference?: string | null
  memo_date?: string | null
  memo_subject?: string | null
  memo_body?: string | null
  memo_amendments?: string | null
  regional_manager_signer_id?: string | null
regional_manager_signed_at?: string | null
  regional_manager_signature_data_url?: string | null
  regional_hr_signer_id?: string | null
  regional_hr_signed_at?: string | null
  regional_hr_signature_data_url?: string | null
  department_head_signer_id?: string | null
  department_head_signed_at?: string | null
  department_head_signature_data_url?: string | null
  transport_manager_signer_id?: string | null
  transport_manager_signed_at?: string | null
  transport_manager_signature_data_url?: string | null
  managing_director_signer_id?: string | null
  managing_director_signed_at?: string | null
  managing_director_signature_data_url?: string | null
  managing_director_decision?: string | null
  hr_executive_signer_id?: string | null
  hr_executive_signed_at?: string | null
  hr_executive_signature_data_url?: string | null
  hr_executive_signer_name?: string | null
  hr_executive_signer_position?: string | null
  hr_executive_signature_preview_url?: string | null
  hr_executive_signer_display_name?: string | null
  hr_executive_signer_display_position?: string | null
  }

const label = (value: string | null) => (value ?? "submitted").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
const displayStage = (row: TransportRequestRow) => row.request_type === "regional_transport" && row.workflow_stage === "transport_manager_assignment" ? "HR Records reference" : label(row.workflow_stage)
const requestTypeLabel = (value: string | null | undefined) => value === "regional_transport" ? "Regional transport" : "Non-regional transport"
const terminalStatuses = ["approved", "rejected", "completed", "closed"]

export function TransportRequestRegister({ rows, canCreate, canAct, canHrRecords, canManagingDirector, canHrExecutive, regionalOfficeName, currentUserId }: { rows: TransportRequestRow[]; canCreate: boolean; canAct: boolean; canHrRecords: boolean; canManagingDirector: boolean; canHrExecutive: boolean; regionalOfficeName: string; currentUserId?: string }) {
  const [query, setQuery] = React.useState("")
  const [status, setStatus] = React.useState("all")
  const [busy, setBusy] = React.useState<string | null>(null)
  const [message, setMessage] = React.useState<string | null>(null)
  const [editing, setEditing] = React.useState<TransportRequestRow | null>(null)
  const [memoPreview, setMemoPreview] = React.useState<TransportRequestRow | null>(null)
  const [memoView, setMemoView] = React.useState<"original" | "rejoinder">("rejoinder")
  const [previewedIds, setPreviewedIds] = React.useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = React.useState(false)
  const [commentRequest, setCommentRequest] = React.useState<{ id: string; decision: "endorse" | "deny" | "return_for_correction" | "forward_to_md" | "approve" | "reject" | "send_to_hr_executive" | "approve_hr_memo" } | null>(null)
  const [commentText, setCommentText] = React.useState("")
  const toggleSelected = (id: string) => setSelectedIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const bulkApprove = async (decision: "approve" | "approve_hr_memo" | "reject") => {
    if (!selectedIds.size || !window.confirm(`Process ${selectedIds.size} selected request${selectedIds.size === 1 ? "" : "s"}?`)) return
    setBulkBusy(true); setMessage(null)
    const response = await fetch("/api/transport/requests", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [...selectedIds], decision }) })
    const result = await response.json().catch(() => ({})); setBulkBusy(false)
    if (!response.ok) { const errorMessage = result.error ?? "Unable to process selected requests."; setMessage(errorMessage); toast({ title: "Bulk action failed", description: errorMessage, variant: "destructive", duration: 6000 }); return }
    toast({ title: decision === "approve_hr_memo" ? "Rejoinders signed" : "Requests processed", description: "The selected transport requests were updated successfully." })
    window.setTimeout(() => window.location.reload(), 900)
  }
  const visibleRows = rows.filter((row) => `${row.reference_number ?? ""} ${row.purpose} ${row.origin} ${row.destination}`.toLowerCase().includes(query.toLowerCase()) && (status === "all" || (row.status ?? "submitted") === status))
  const mdQueue = visibleRows.filter((row) => row.workflow_stage === "managing_director_approval")
  const execQueue = visibleRows.filter((row) => row.workflow_stage === "hr_executive_signing")
  const activeQueue = canManagingDirector ? mdQueue : canHrExecutive ? execQueue : []
  const selectedQueueCount = activeQueue.filter((row) => selectedIds.has(row.id)).length
  const selectAllQueue = () => setSelectedIds((current) => { const next = new Set(current); if (selectedQueueCount === activeQueue.length) activeQueue.forEach((row) => next.delete(row.id)); else activeQueue.forEach((row) => next.add(row.id)); return next })
  const openMemoPreview = (row: TransportRequestRow, view: "original" | "rejoinder" = "rejoinder") => {
    setMemoView(view)
    // Signatures are resolved server-side (same principle as leave administration: user_profiles.signature_data_url
    // first, approval_signature_registry as fallback) and are already attached to the row — no client fetch needed.
    let signerName: string | null = row.hr_executive_signer_name ?? row.hr_executive_signer_display_name ?? null
    let signerPosition: string | null = row.hr_executive_signer_position ?? row.hr_executive_signer_display_position ?? null
    let regionalManagerComment: string | null = null
    let hrAmendments = ""
    let amendmentSignature: string | null = null
    try {
      const amendments = row.memo_amendments ? (JSON.parse(row.memo_amendments) as Record<string, unknown>) : {}
      signerName = signerName ?? (typeof amendments.hr_executive_signer_name === "string" ? amendments.hr_executive_signer_name : null)
      signerPosition = signerPosition ?? (typeof amendments.hr_executive_signer_position === "string" ? amendments.hr_executive_signer_position : null)
      regionalManagerComment = typeof amendments.regional_manager_comment === "string" ? amendments.regional_manager_comment : null
      hrAmendments = typeof amendments.text === "string" ? amendments.text : ""
      amendmentSignature = typeof amendments.hr_executive_signature_data_url === "string" ? amendments.hr_executive_signature_data_url : null
    } catch {}
    if (!signerPosition) signerPosition = "HUMAN RESOURCES MANAGER"
    const signature = row.hr_executive_signature_data_url ?? amendmentSignature ?? row.hr_executive_signature_preview_url ?? null
    const eventDate = row.event_date ? new Date(`${row.event_date}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "the approved date"
    const body = [`Management has approved transportation support for the ${row.purpose.toLowerCase()} in the ${row.destination} District Office.`, `The approved vehicle support is for the transportation of ${row.passenger_count} passengers from ${row.origin} to ${row.destination} on ${eventDate}.`, hrAmendments ? `Regional HR Office remarks: ${hrAmendments}` : "", regionalManagerComment ? `Regional Manager's approval comment: ${regionalManagerComment}` : "", "Kindly make the necessary arrangements to facilitate the approved transportation.", "You can count on our usual cooperation."].filter(Boolean).join("\n\n")
    setMemoPreview({ ...row, hr_executive_signature_data_url: signature, hr_executive_signer_name: signerName, hr_executive_signer_position: signerPosition, memo_subject: `RE: ${(row.memo_subject || row.purpose).replace(/^\s*RE:\s*/i, "")}`, memo_body: body })
  }
  const isResponseMemo = memoView === "rejoinder"
  const memoRecipient = isResponseMemo ? "THE REGIONAL MANAGER" : "THE MANAGING DIRECTOR"
  const originRegionAliases: Record<string, string> = { kumasi: "Ashanti", accra: "Greater Accra", takoradi: "Western", cape: "Central", sunyani: "Bono", tamale: "Northern", bolgatanga: "Upper East", wa: "Upper West", koforidua: "Eastern", ho: "Volta" }
  const resolveRegionFromPlaceName = (value: string) => {
    const key = value.toLowerCase().replace(/\s+/g, " ").trim()
    return Object.entries(originRegionAliases).find(([alias]) => key.includes(alias))?.[1] ?? ""
  }
  const originRegionName = resolveRegionFromPlaceName(memoPreview?.origin ?? "")
  const assignedRegion = memoPreview?.assigned_region
  const assignedRegionLocation = Array.isArray(assignedRegion) ? assignedRegion[0] : assignedRegion
  const assignedDistrict = assignedRegionLocation?.districts
  const assignedDistrictRegion = Array.isArray(assignedDistrict) ? assignedDistrict[0] : assignedDistrict
  const linkedRegion = assignedDistrictRegion?.regions
  const linkedRegionName = (Array.isArray(linkedRegion) ? linkedRegion[0]?.name : linkedRegion?.name)?.trim() ?? ""
  const assignedRegionName = assignedRegionLocation?.name?.trim() ?? ""
  const requestRegionName = originRegionName || linkedRegionName || resolveRegionFromPlaceName(assignedRegionName)
  const formatRecipientRegion = (value: string) => {
    const normalized = value
      .replace(/\s+Regional\s+Office$/i, "")
      .replace(/\s+Office$/i, "")
      .replace(/\s+Region$/i, "")
      .trim()
    if (!normalized || /^(regional|head)$/i.test(normalized)) return ""
    return `${normalized} Region`
  }
  const memoRegionalLocation = formatRecipientRegion(requestRegionName) || formatRecipientRegion(regionalOfficeName) || "Regional Office"
  const memoIntro = isResponseMemo ? "Management has approved transportation support for the official wedding ceremony of a staff member in the Konongo District Office. The approved vehicle support is for the transportation of 100 passengers from Kumasi to Konongo on 22 August 2026. Kindly make the necessary arrangements to facilitate the approved transportation. You can count on our usual cooperation." : "We respectfully submit this request for your consideration and approval. The details of the request are as follows:"
  const memoPreviewLabel = memoPreview?.workflow_stage === "hr_records_review" ? "HR Records review and reference" : memoPreview?.workflow_stage === "hr_executive_signing" ? "HR Executive signing response" : memoPreview?.workflow_stage === "managing_director_approval" ? "Managing Director approval" : "Transport request memo"
  const cleanSubject = (memoPreview?.memo_subject ?? memoPreview?.purpose ?? "").replace(/^\s*(re:\s*)+/i, "").trim()
  const renderedSubject = isResponseMemo ? `RE: ${cleanSubject}` : cleanSubject
  const responseMemoBody = memoPreview?.memo_body?.trim() ?? ""

  const requestDecision = (id: string, decision: "endorse" | "deny" | "return_for_correction" | "forward_to_md" | "approve" | "reject" | "send_to_hr_executive" | "approve_hr_memo") => { setCommentText(""); setCommentRequest({ id, decision }) }

  async function decide(id: string, decision: "endorse" | "deny" | "return_for_correction" | "forward_to_md" | "approve" | "reject" | "send_to_hr_executive" | "approve_hr_memo", comment = "") {
    setBusy(id); setMessage(null)
    const response = await fetch("/api/transport/requests", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, decision, comment }) })
    const result = await response.json().catch(() => ({}))
    setBusy(null)
    if (!response.ok) { const errorMessage = result.error ?? "Unable to update request."; setMessage(errorMessage); toast({ title: "Action failed", description: errorMessage, variant: "destructive", duration: 6000 }); return }
    toast({ title: decision === "approve" || decision === "approve_hr_memo" ? "Approval completed" : "Request updated", description: decision === "approve_hr_memo" ? "The memo was signed and released to the correct handoff queue." : "The transport workflow has been updated successfully.", duration: 5000 })
    window.setTimeout(() => window.location.reload(), 900)
  }

  async function saveCorrection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing) return
    const form = new FormData(event.currentTarget)
    setBusy(editing.id); setMessage(null)
    const response = await fetch("/api/transport/requests", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editing.id, decision: "correct", purpose: form.get("purpose"), origin: form.get("origin"), destination: form.get("destination"), eventDate: form.get("eventDate"), passengerCount: form.get("passengerCount"), comment: form.get("comment") }) })
    const result = await response.json().catch(() => ({}))
    setBusy(null)
    if (!response.ok) { const errorMessage = result.error ?? "Unable to save correction."; setMessage(errorMessage); toast({ title: "Correction failed", description: errorMessage, variant: "destructive", duration: 6000 }); return }
    window.location.reload()
  }

  async function saveMemo(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!memoPreview) return
    const form = new FormData(event.currentTarget)
    setBusy(memoPreview.id); setMessage(null)
    const response = await fetch("/api/transport/requests", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: memoPreview.id, decision: "save_memo", memoReference: form.get("memoReference"), memoDate: form.get("memoDate"), memoSubject: form.get("memoSubject"), memoBody: form.get("memoBody"), memoAmendments: form.get("memoAmendments") }) })
    const result = await response.json().catch(() => ({}))
    setBusy(null)
    if (!response.ok) { const errorMessage = result.error ?? "Unable to save memo."; setMessage(errorMessage); toast({ title: "Memo save failed", description: errorMessage, variant: "destructive", duration: 6000 }); return }
    window.location.reload()
  }

  return <>
  
  {canManagingDirector && visibleRows.filter((row) => row.workflow_stage === "managing_director_approval").map((row) => <Card key={`md-${row.id}`} className="border-primary/30 bg-primary/[0.03]"><CardHeader><CardTitle>Managing Director approval queue</CardTitle><p className="text-sm text-muted-foreground">Preview the endorsed transport request before approving or rejecting it.</p></CardHeader><CardContent className="flex flex-wrap items-center gap-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selectedIds.has(row.id)} onChange={() => toggleSelected(row.id)} aria-label={`Select ${row.reference_number ?? row.id}`} /> Select</label><Button variant="outline" onClick={() => openMemoPreview(row, "original")}>Preview memo</Button><Button onClick={() => requestDecision(row.id, "approve")} disabled={busy === row.id || !previewedIds.has(row.id)} title={!previewedIds.has(row.id) ? "Preview the request before approving" : undefined}>Approve for HR Executive</Button><Button variant="destructive" onClick={() => requestDecision(row.id, "reject")} disabled={busy === row.id}>Reject</Button></CardContent></Card>)}{canHrExecutive && visibleRows.filter((row) => row.workflow_stage === "hr_executive_signing").map((row) => <Card key={`exec-${row.id}`} className="border-accent/30 bg-accent/[0.04]"><CardHeader><CardTitle>HR Executive signing queue</CardTitle><p className="text-sm text-muted-foreground">View both memos: the Regional Manager’s original request to the Managing Director and the editable HR Executive rejoinder back to the Regional Manager.</p></CardHeader><CardContent className="flex flex-wrap items-center gap-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selectedIds.has(row.id)} onChange={() => toggleSelected(row.id)} aria-label={`Select ${row.reference_number ?? row.id}`} /> Select</label><Button variant="outline" onClick={() => openMemoPreview(row, "rejoinder")}>Rejoinder to Regional Manager</Button><Button variant="secondary" onClick={() => openMemoPreview(row, "original")}>Original request to MD</Button><Button onClick={() => requestDecision(row.id, "approve_hr_memo")} disabled={busy === row.id || !previewedIds.has(row.id)} title={!previewedIds.has(row.id) ? "Preview and save the memo before signing" : undefined}>Sign rejoinder and release to region</Button></CardContent></Card>)}
    {activeQueue.length > 0 && <Card className="border-primary/20 bg-primary/[0.03]"><CardContent className="flex flex-wrap items-center gap-3 p-4"><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={activeQueue.length > 0 && selectedQueueCount === activeQueue.length} onChange={selectAllQueue} aria-label="Select all requests in approval queue" /> Select all in queue</label><span className="text-sm text-muted-foreground">{selectedQueueCount} selected</span>{activeQueue.map((row) => <Button key={`preview-${row.id}`} size="sm" variant="outline" onClick={() => openMemoPreview(row, "original")}>View memo</Button>)}{visibleRows.filter((row) => row.workflow_stage === "referenced").map((row) => <Button key={`download-${row.id}`} size="sm" variant="outline" onClick={() => openMemoPreview(row, "rejoinder")}><Download className="mr-1 size-4" /> Download memo</Button>)}<Button onClick={() => bulkApprove(canManagingDirector ? "approve" : "approve_hr_memo")} disabled={bulkBusy || selectedQueueCount === 0}>{bulkBusy ? "Processing…" : canManagingDirector ? "Approve selected" : "Sign selected memos and release"}</Button>{canManagingDirector && <Button variant="destructive" onClick={() => bulkApprove("reject")} disabled={bulkBusy || selectedQueueCount === 0}>Reject selected</Button>}</CardContent></Card>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Card className="border-primary/20 bg-primary/[0.03]"><CardContent className="p-5"><p className="text-sm text-muted-foreground">Memo previews</p><p className="mt-1 text-3xl font-semibold tracking-tight">{previewedIds.size}</p><p className="mt-1 text-xs text-muted-foreground">Reviewed in this session</p></CardContent></Card><Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Memos recorded</p><p className="mt-1 text-3xl font-semibold tracking-tight">{rows.filter((row) => Boolean(row.memo_reference || row.memo_body)).length}</p><p className="mt-1 text-xs text-muted-foreground">Saved memo details</p></CardContent></Card><Card className="border-primary/20 bg-primary/[0.03]"><CardContent className="p-5"><p className="text-sm text-muted-foreground">All requests</p><p className="mt-1 text-3xl font-semibold tracking-tight">{rows.length}</p><p className="mt-1 text-xs text-muted-foreground">Across the transport workflow</p></CardContent></Card><Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Awaiting review</p><p className="mt-1 text-3xl font-semibold tracking-tight">{rows.filter((row) => !terminalStatuses.includes(row.status ?? "")).length}</p><p className="mt-1 text-xs text-muted-foreground">Need an action from the approval chain</p></CardContent></Card><Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Approved</p><p className="mt-1 text-3xl font-semibold tracking-tight">{rows.filter((row) => row.status === "approved").length}</p><p className="mt-1 text-xs text-muted-foreground">Ready for fulfilment</p></CardContent></Card></div>
    <Card className="overflow-hidden"><CardHeader className="gap-4 border-b bg-muted/20 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle>Submitted requests</CardTitle><p className="mt-1 text-sm text-muted-foreground">Review requests within your assigned workflow scope.</p></div>{canCreate && <Button asChild><Link href="/dashboard/transport"><span className="text-base">+</span> New transport request</Link></Button>}</CardHeader><CardContent className="p-4"><div className="mb-4 flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by reference, purpose, or route" className="pl-9" /></div><select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status" className="h-10 rounded-md border bg-background px-3 text-sm"><option value="all">All statuses</option><option value="submitted">Submitted</option><option value="endorsed">Endorsed</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="completed">Completed</option></select></div>{message && <p role="alert" className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{message}</p>}<div className="overflow-x-auto rounded-lg border"><table className="w-full text-sm"><thead className="border-b bg-muted/30 text-left text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Request type</th><th className="px-4 py-3 font-medium">Request</th><th className="px-4 py-3 font-medium">Journey</th><th className="px-4 py-3 font-medium">Event date</th><th className="px-4 py-3 font-medium">Passengers</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Stage</th><th className="px-4 py-3 font-medium">Evidence</th><th className="px-4 py-3 font-medium">Action</th></tr></thead><tbody>{visibleRows.map((row) => { const stage = row.workflow_stage ?? ""; const managerActions = canAct && stage === "regional_manager_endorsement"; const hrActions = (canHrRecords || canHrExecutive) && stage === "hr_records_review"; const mdActions = canManagingDirector && stage === "managing_director_approval"; return <tr key={row.id} className="border-b last:border-0"><td className="px-4 py-4"><p className="font-medium">Request {row.reference_number ?? row.id.slice(0, 8)}</p><p className="mt-1 max-w-[260px] text-muted-foreground">{row.purpose}</p></td><td className="px-4 py-4"><span className="inline-flex items-center gap-2"><MapPin className="size-4 text-muted-foreground" />{row.origin}<ArrowRight className="size-4" />{row.destination}</span></td><td className="px-4 py-4"><span className="inline-flex items-center gap-2"><CalendarDays className="size-4 text-muted-foreground" />{row.event_date ?? "—"}</span></td><td className="px-4 py-4"><span className="inline-flex items-center gap-2"><Users className="size-4 text-muted-foreground" />{row.passenger_count}</span></td><td className="px-4 py-4"><Badge variant="secondary">{label(row.status)}</Badge></td><td className="px-4 py-4"><div className="flex flex-col gap-1"><Badge variant={row.request_type === "regional_transport" ? "default" : "secondary"}>{requestTypeLabel(row.request_type)}</Badge><span>{displayStage(row)}</span></div></td><td className="px-4 py-4">{row.supporting_documents?.[0]?.url ? <a className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline" href={row.supporting_documents[0].url} target="_blank" rel="noreferrer">{row.supporting_documents[0].name ?? "Open evidence"}<ExternalLink className="size-3" /></a> : "—"}</td><td className="min-w-[230px] px-4 py-4"><div className="flex flex-wrap gap-2">{managerActions && <><Button size="sm" disabled={busy === row.id} onClick={() => requestDecision(row.id, "endorse")}>Endorse</Button><Button size="sm" variant="outline" disabled={busy === row.id} onClick={() => requestDecision(row.id, "deny")}>Deny</Button></>}{hrActions && <><Button size="sm" variant="outline" disabled={busy === row.id} onClick={() => openMemoPreview(row)}>View / preview memo</Button><Button size="sm" variant="outline" disabled={busy === row.id} onClick={() => openMemoPreview(row)}>View request</Button><Button size="sm" variant="outline" disabled={busy === row.id} onClick={() => openMemoPreview(row)}>View request</Button><Button size="sm" variant="outline" disabled={busy === row.id} onClick={() => openMemoPreview(row)}>View / edit memo</Button><Button size="sm" variant="outline" disabled={busy === row.id} onClick={() => requestDecision(row.id, "return_for_correction")}>Return to Regional HR</Button><Button size="sm" disabled={busy === row.id} onClick={() => requestDecision(row.id, "forward_to_md")}>Forward to MD</Button></>}{mdActions && <><Button size="sm" disabled={busy === row.id} onClick={() => requestDecision(row.id, "approve")}>Approve</Button><Button size="sm" variant="outline" disabled={busy === row.id} onClick={() => requestDecision(row.id, "reject")}>Reject</Button></>}{row.workflow_stage === "referenced" && <Button size="sm" onClick={() => openMemoPreview(row, "rejoinder")}><Download className="mr-1 size-4" /> Print / Save PDF</Button>}</div></td></tr> })}</tbody></table>{visibleRows.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">No transport requests match this view.</p>}</div><p className="mt-3 text-xs text-muted-foreground">Showing {visibleRows.length} of {rows.length} requests</p></CardContent></Card>
    {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4" role="dialog" aria-modal="true" aria-label="Correct transport request"><Card className="w-full max-w-2xl"><CardHeader><CardTitle>Correct endorsed transport request</CardTitle><p className="text-sm text-muted-foreground">Save corrections before forwarding to the Managing Director.</p></CardHeader><CardContent><form onSubmit={saveCorrection} className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm sm:col-span-2">Purpose<Input name="purpose" defaultValue={editing.purpose} required /></label><label className="grid gap-2 text-sm">Origin<Input name="origin" defaultValue={editing.origin} required /></label><label className="grid gap-2 text-sm">Destination<Input name="destination" defaultValue={editing.destination} required /></label><label className="grid gap-2 text-sm">Event date<Input name="eventDate" type="date" defaultValue={editing.event_date ?? ""} required /></label><label className="grid gap-2 text-sm">Passengers<Input name="passengerCount" type="number" min="1" defaultValue={editing.passenger_count} required /></label><label className="grid gap-2 text-sm sm:col-span-2">Correction note<Input name="comment" placeholder="Describe the correction" /></label><div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" disabled={busy === editing.id}>Save correction</Button></div></form></CardContent></Card></div>}
  {commentRequest && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/40 p-4" role="dialog" aria-modal="true" aria-label="Approval comment"><Card className="w-full max-w-lg"><CardHeader><CardTitle>{commentRequest.decision === "reject" || commentRequest.decision === "return_for_correction" ? "Reason or correction note" : "Optional comment"}</CardTitle><p className="text-sm text-muted-foreground">Add a note before processing this transport request.</p></CardHeader><CardContent className="grid gap-4"><textarea value={commentText} onChange={(event) => setCommentText(event.target.value)} className="min-h-28 rounded-md border bg-background p-3 text-sm" placeholder="Enter a note" aria-label="Approval comment" /><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setCommentRequest(null)}>Cancel</Button><Button type="button" onClick={() => { const pending = commentRequest; setCommentRequest(null); void decide(pending.id, pending.decision, commentText) }}>Continue</Button></div></CardContent></Card></div>}
  {memoPreview && <div className="fixed inset-0 z-50 overflow-y-auto bg-foreground/40 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Vehicle request memo preview"><div className="mx-auto flex w-full max-w-5xl flex-col gap-4"><Card className="overflow-hidden border-border bg-muted/30 shadow-2xl"><CardHeader className="print-hide border-b bg-background"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle>Memo preview</CardTitle><p className="text-sm text-muted-foreground">{isResponseMemo ? memoPreviewLabel : "Original request as it will appear to the Managing Director."}</p></div><div className="flex gap-2"><Button type="button" onClick={() => window.print()}><Download className="mr-1 size-4" /> Print / Save PDF</Button><Button type="button" variant="outline" onClick={() => setMemoPreview(null)}>Close preview</Button></div></div></CardHeader><CardContent className="overflow-x-auto p-3 sm:p-8"><article className="print-container mx-auto min-h-[880px] w-full max-w-3xl bg-background px-6 py-8 text-foreground shadow-lg ring-1 ring-border sm:px-14 sm:py-12" aria-label="Formal regional vehicle request memo"><header className="border-b-2 border-primary pb-5"><div className="flex items-start gap-4"><img src="/images/qcc-logo.png" alt="Quality Control Company logo" className="size-20 object-contain" /><div className="flex-1 text-center"><h2 className="font-serif text-xl font-bold tracking-wide sm:text-2xl">QUALITY CONTROL COMPANY LTD.</h2><p className="mt-1 text-sm font-medium tracking-[0.2em] text-muted-foreground">(COCOBOD)</p><p className="mt-2 text-xs text-muted-foreground">Official Transport Request Memorandum</p></div></div></header><div className="flex justify-between gap-6 py-6 text-xs sm:text-sm"><div><p><span className="font-semibold">Our Ref:</span> {memoPreview.memo_reference ?? `TRANSPORT/${memoPreview.id.slice(0, 8).toUpperCase()}`}</p><p className="mt-2"><span className="font-semibold">Your Ref:</span> —</p></div><p><span className="font-semibold">Date:</span> {memoPreview.memo_date ?? new Date().toISOString().slice(0, 10)}</p></div><section className="text-sm leading-6 sm:text-base"><p className="font-semibold">{memoRecipient}</p><p>QUALITY CONTROL COMPANY LTD.</p><p>{memoRegionalLocation.toUpperCase()}</p><h3 className="mt-8 border-b border-foreground pb-1 font-bold uppercase">{renderedSubject || `REQUEST FOR VEHICLE SUPPORT — ${memoPreview.purpose}`}</h3><p className="mt-6 whitespace-pre-wrap">{isResponseMemo ? responseMemoBody : memoIntro}</p><div className="mt-10 grid gap-0.5">{memoPreview.hr_executive_signature_data_url ? <img src={memoPreview.hr_executive_signature_data_url} alt={`Signature of ${memoPreview.hr_executive_signer_name ?? "the signing HR Executive"}`} className="mb-1 h-20 w-64 object-contain object-left" crossOrigin="anonymous" /> : <div className="mt-5 mb-1 h-10 w-56 border-b border-foreground" />}{memoPreview.hr_executive_signer_name ? <p className="font-bold uppercase tracking-wide">{memoPreview.hr_executive_signer_name}</p> : null}<p className="font-semibold uppercase">{memoPreview.hr_executive_signer_position || "HUMAN RESOURCES MANAGER"}</p><p className="font-semibold">FOR: MANAGING DIRECTOR</p></div><div className="mt-10 border-t border-border pt-4 text-sm"><p className="font-semibold">CC:</p><ul className="mt-1 list-none"><li>Deputy Director HR</li><li>Audit Manager</li><li>Deputy Transport Manager</li></ul></div></section></article></CardContent></Card>{canHrExecutive && <Card className="border-primary/30"><CardHeader><CardTitle>HR Executive rejoinder editing</CardTitle><p className="text-sm text-muted-foreground">Edit the memo fields below. The Regional Manager endorsement remains read-only.</p></CardHeader><CardContent><form onSubmit={saveMemo} className="grid gap-4"><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm">Memo reference<Input name="memoReference" defaultValue={memoPreview.memo_reference ?? `TRANSPORT/${memoPreview.id.slice(0, 8).toUpperCase()}`} required /></label><label className="grid gap-2 text-sm">Memo date<Input name="memoDate" type="date" defaultValue={memoPreview.memo_date ?? new Date().toISOString().slice(0, 10)} required /></label></div><label className="grid gap-2 text-sm">Subject<Input name="memoSubject" defaultValue={renderedSubject ?? `Request for vehicle support: ${memoPreview.purpose}`} required /></label><label className="grid gap-2 text-sm">Memo body<textarea name="memoBody" defaultValue={memoPreview.memo_body ?? `I respectfully request approval for vehicle support for ${memoPreview.purpose}, travelling from ${memoPreview.origin} to ${memoPreview.destination} on ${memoPreview.event_date ?? "the stated date"} for ${memoPreview.passenger_count} passenger(s).`} className="min-h-32 rounded-md border bg-background p-3" required /></label><label className="grid gap-2 text-sm">Amendment note<textarea name="memoAmendments" defaultValue={memoPreview.memo_amendments ?? ""} placeholder="Record corrections made by HR Records" className="min-h-20 rounded-md border bg-background p-3" /></label><div className="flex justify-end"><Button type="submit" disabled={busy === memoPreview.id}>Save amended memo</Button></div></form></CardContent></Card>}{/* HR Executive-only editing ends here */}</div></div>}
  </>
  }
