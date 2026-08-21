"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, CalendarDays, ExternalLink, MapPin, Search, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

export type TransportRequestRow = {
  id: string
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
  linked_district_id?: string | null
  origin_location_id?: string | null
  memo_reference?: string | null
  memo_date?: string | null
  memo_subject?: string | null
  memo_body?: string | null
  memo_amendments?: string | null
  regional_manager_signer_id?: string | null
  regional_manager_signed_at?: string | null
}

const label = (value: string | null) => (value ?? "submitted").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
const terminalStatuses = ["approved", "rejected", "completed", "closed"]

export function TransportRequestRegister({ rows, canCreate, canAct, canHrRecords, canManagingDirector, canHrExecutive }: { rows: TransportRequestRow[]; canCreate: boolean; canAct: boolean; canHrRecords: boolean; canManagingDirector: boolean; canHrExecutive: boolean }) {
  const [query, setQuery] = React.useState("")
  const [status, setStatus] = React.useState("all")
  const [busy, setBusy] = React.useState<string | null>(null)
  const [message, setMessage] = React.useState<string | null>(null)
  const [editing, setEditing] = React.useState<TransportRequestRow | null>(null)
  const [memoPreview, setMemoPreview] = React.useState<TransportRequestRow | null>(null)
  const visibleRows = rows.filter((row) => `${row.reference_number ?? ""} ${row.purpose} ${row.origin} ${row.destination}`.toLowerCase().includes(query.toLowerCase()) && (status === "all" || (row.status ?? "submitted") === status))

  async function decide(id: string, decision: "endorse" | "deny" | "return_for_correction" | "forward_to_md" | "approve" | "reject" | "send_to_hr_executive") {
    const comment = window.prompt(decision === "reject" || decision === "return_for_correction" ? "Reason or correction note:" : "Optional comment:", "")
    if (comment === null) return
    setBusy(id); setMessage(null)
    const response = await fetch("/api/transport/requests", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, decision, comment }) })
    const result = await response.json().catch(() => ({}))
    setBusy(null)
    if (!response.ok) { setMessage(result.error ?? "Unable to update request."); return }
    window.location.reload()
  }

  async function saveCorrection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing) return
    const form = new FormData(event.currentTarget)
    setBusy(editing.id); setMessage(null)
    const response = await fetch("/api/transport/requests", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editing.id, decision: "correct", purpose: form.get("purpose"), origin: form.get("origin"), destination: form.get("destination"), eventDate: form.get("eventDate"), passengerCount: form.get("passengerCount"), comment: form.get("comment") }) })
    const result = await response.json().catch(() => ({}))
    setBusy(null)
    if (!response.ok) { setMessage(result.error ?? "Unable to save correction."); return }
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
    if (!response.ok) { setMessage(result.error ?? "Unable to save memo."); return }
    window.location.reload()
  }

  return <>
  {canHrRecords && visibleRows.some((row) => row.workflow_stage === "hr_records_review") && <Card className="border-primary/30 bg-primary/[0.03]"><CardHeader><CardTitle>Vehicle request memo</CardTitle><p className="text-sm text-muted-foreground">Preview and amend the Regional Manager-signed memo before sending it to the Managing Director.</p></CardHeader><CardContent className="flex flex-wrap gap-2">{visibleRows.filter((row) => row.workflow_stage === "hr_records_review").map((row) => <React.Fragment key={`memo-${row.id}`}><Button variant="outline" onClick={() => setMemoPreview(row)}>Preview / amend memo</Button><Button onClick={() => decide(row.id, "forward_to_md")} disabled={busy === row.id}>Forward approved memo to MD</Button></React.Fragment>)}</CardContent></Card>}
  {canHrExecutive && visibleRows.filter((row) => row.workflow_stage === "hr_executive_signing").map((row) => <Card key={`exec-${row.id}`} className="border-primary/30 bg-primary/[0.03]"><CardHeader><CardTitle>HR Executive signing queue</CardTitle><p className="text-sm text-muted-foreground">The Managing Director has approved this memo. Push it to HR Executive for signing.</p></CardHeader><CardContent><Button onClick={() => decide(row.id, "send_to_hr_executive")} disabled={busy === row.id}>Sign and finalize approved memo</Button></CardContent></Card>)}
    <div className="grid gap-3 sm:grid-cols-3"><Card className="border-primary/20 bg-primary/[0.03]"><CardContent className="p-5"><p className="text-sm text-muted-foreground">All requests</p><p className="mt-1 text-3xl font-semibold tracking-tight">{rows.length}</p><p className="mt-1 text-xs text-muted-foreground">Across the transport workflow</p></CardContent></Card><Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Awaiting review</p><p className="mt-1 text-3xl font-semibold tracking-tight">{rows.filter((row) => !terminalStatuses.includes(row.status ?? "")).length}</p><p className="mt-1 text-xs text-muted-foreground">Need an action from the approval chain</p></CardContent></Card><Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Approved</p><p className="mt-1 text-3xl font-semibold tracking-tight">{rows.filter((row) => row.status === "approved").length}</p><p className="mt-1 text-xs text-muted-foreground">Ready for fulfilment</p></CardContent></Card></div>
    <Card className="overflow-hidden"><CardHeader className="gap-4 border-b bg-muted/20 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle>Submitted requests</CardTitle><p className="mt-1 text-sm text-muted-foreground">Review requests within your assigned workflow scope.</p></div>{canCreate && <Button asChild><Link href="/dashboard/transport"><span className="text-base">+</span> New transport request</Link></Button>}</CardHeader><CardContent className="p-4"><div className="mb-4 flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by reference, purpose, or route" className="pl-9" /></div><select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status" className="h-10 rounded-md border bg-background px-3 text-sm"><option value="all">All statuses</option><option value="submitted">Submitted</option><option value="endorsed">Endorsed</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="completed">Completed</option></select></div>{message && <p role="alert" className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{message}</p>}<div className="overflow-x-auto rounded-lg border"><table className="w-full text-sm"><thead className="border-b bg-muted/30 text-left text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Request</th><th className="px-4 py-3 font-medium">Journey</th><th className="px-4 py-3 font-medium">Event date</th><th className="px-4 py-3 font-medium">Passengers</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Stage</th><th className="px-4 py-3 font-medium">Evidence</th>{(canAct || canHrRecords || canManagingDirector) && <th className="px-4 py-3 font-medium">Action</th>}</tr></thead><tbody>{visibleRows.map((row) => { const stage = row.workflow_stage ?? ""; const managerActions = canAct && stage === "regional_manager_endorsement"; const hrActions = canHrRecords && stage === "hr_records_review"; const mdActions = canManagingDirector && stage === "managing_director_approval"; return <tr key={row.id} className="border-b last:border-0"><td className="px-4 py-4"><p className="font-medium">Request {row.reference_number ?? row.id.slice(0, 8)}</p><p className="mt-1 max-w-[260px] text-muted-foreground">{row.purpose}</p></td><td className="px-4 py-4"><span className="inline-flex items-center gap-2"><MapPin className="size-4 text-muted-foreground" />{row.origin}<ArrowRight className="size-4" />{row.destination}</span></td><td className="px-4 py-4"><span className="inline-flex items-center gap-2"><CalendarDays className="size-4 text-muted-foreground" />{row.event_date ?? "—"}</span></td><td className="px-4 py-4"><span className="inline-flex items-center gap-2"><Users className="size-4 text-muted-foreground" />{row.passenger_count}</span></td><td className="px-4 py-4"><Badge variant="secondary">{label(row.status)}</Badge></td><td className="px-4 py-4">{label(row.workflow_stage)}</td><td className="px-4 py-4">{row.supporting_documents?.[0]?.url ? <a className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline" href={row.supporting_documents[0].url} target="_blank" rel="noreferrer">{row.supporting_documents[0].name ?? "Open evidence"}<ExternalLink className="size-3" /></a> : "—"}</td>{(canAct || canHrRecords || canManagingDirector) && <td className="min-w-[230px] px-4 py-4"><div className="flex flex-wrap gap-2">{managerActions && <><Button size="sm" disabled={busy === row.id} onClick={() => decide(row.id, "endorse")}>Endorse</Button><Button size="sm" variant="outline" disabled={busy === row.id} onClick={() => decide(row.id, "deny")}>Deny</Button></>}{hrActions && <><Button size="sm" variant="outline" disabled={busy === row.id} onClick={() => setEditing(row)}>Edit / correct</Button><Button size="sm" variant="outline" disabled={busy === row.id} onClick={() => decide(row.id, "return_for_correction")}>Return to Regional HR</Button><Button size="sm" disabled={busy === row.id} onClick={() => decide(row.id, "forward_to_md")}>Forward to MD</Button></>}{mdActions && <><Button size="sm" disabled={busy === row.id} onClick={() => decide(row.id, "approve")}>Approve</Button><Button size="sm" variant="outline" disabled={busy === row.id} onClick={() => decide(row.id, "reject")}>Reject</Button></>}</div></td>}</tr> })}</tbody></table>{visibleRows.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">No transport requests match this view.</p>}</div><p className="mt-3 text-xs text-muted-foreground">Showing {visibleRows.length} of {rows.length} requests</p></CardContent></Card>
    {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4" role="dialog" aria-modal="true" aria-label="Correct transport request"><Card className="w-full max-w-2xl"><CardHeader><CardTitle>Correct endorsed transport request</CardTitle><p className="text-sm text-muted-foreground">Save corrections before forwarding to the Managing Director.</p></CardHeader><CardContent><form onSubmit={saveCorrection} className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm sm:col-span-2">Purpose<Input name="purpose" defaultValue={editing.purpose} required /></label><label className="grid gap-2 text-sm">Origin<Input name="origin" defaultValue={editing.origin} required /></label><label className="grid gap-2 text-sm">Destination<Input name="destination" defaultValue={editing.destination} required /></label><label className="grid gap-2 text-sm">Event date<Input name="eventDate" type="date" defaultValue={editing.event_date ?? ""} required /></label><label className="grid gap-2 text-sm">Passengers<Input name="passengerCount" type="number" min="1" defaultValue={editing.passenger_count} required /></label><label className="grid gap-2 text-sm sm:col-span-2">Correction note<Input name="comment" placeholder="Describe the correction" /></label><div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" disabled={busy === editing.id}>Save correction</Button></div></form></CardContent></Card></div>}
  {memoPreview && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-foreground/30 p-4" role="dialog" aria-modal="true" aria-label="Vehicle request memo preview"><Card className="w-full max-w-3xl"><CardHeader><CardTitle>Regional vehicle request memo</CardTitle><p className="text-sm text-muted-foreground">Regional Manager-signed request for vehicle support. HR Records may amend the memo body, but cannot change the originating signer.</p></CardHeader><CardContent><form onSubmit={saveMemo} className="grid gap-4"><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm">Memo reference<Input name="memoReference" defaultValue={memoPreview.memo_reference ?? `TRANSPORT/${memoPreview.id.slice(0, 8).toUpperCase()}`} required /></label><label className="grid gap-2 text-sm">Memo date<Input name="memoDate" type="date" defaultValue={memoPreview.memo_date ?? new Date().toISOString().slice(0, 10)} required /></label></div><label className="grid gap-2 text-sm">Subject<Input name="memoSubject" defaultValue={memoPreview.memo_subject ?? `Request for vehicle support: ${memoPreview.purpose}`} required /></label><div className="rounded-md border bg-muted/20 p-4 text-sm leading-6"><p className="font-semibold">REQUEST FOR VEHICLE SUPPORT</p><p className="mt-2">The Regional Manager respectfully requests vehicle support for the regional assignment below.</p><p className="mt-2"><strong>Purpose:</strong> {memoPreview.purpose}<br /><strong>Journey:</strong> {memoPreview.origin} to {memoPreview.destination}<br /><strong>Date:</strong> {memoPreview.event_date ?? "Not specified"}<br /><strong>Passengers:</strong> {memoPreview.passenger_count}</p><p className="mt-3 font-medium">Signed by: Regional Manager</p></div><label className="grid gap-2 text-sm">Memo body<textarea name="memoBody" defaultValue={memoPreview.memo_body ?? `I respectfully request approval for vehicle support for ${memoPreview.purpose}, travelling from ${memoPreview.origin} to ${memoPreview.destination} on ${memoPreview.event_date ?? "the stated date"} for ${memoPreview.passenger_count} passenger(s).`} className="min-h-36 rounded-md border bg-background p-3" required /></label><label className="grid gap-2 text-sm">HR Records amendments<textarea name="memoAmendments" defaultValue={memoPreview.memo_amendments ?? ""} placeholder="Record corrections or amendments made before MD approval" className="min-h-24 rounded-md border bg-background p-3" /></label><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setMemoPreview(null)}>Close preview</Button><Button type="submit" disabled={busy === memoPreview.id}>Save amended memo</Button></div></form></CardContent></Card></div>}
  </>
  }
