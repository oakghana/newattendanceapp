"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowRight, CalendarDays, ExternalLink, MapPin, Search, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

export type TransportRequestRow = {
  id: string; purpose: string; origin: string; destination: string; event_date: string | null
  passenger_count: number; status: string | null; workflow_stage: string | null
  reference_number: string | null; supporting_documents: { name?: string; url?: string }[] | null
  assigned_region_id?: string | null; assigned_district_id?: string | null
}

const label = (value: string | null) => (value ?? "submitted").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
const terminalStatuses = ["approved", "rejected", "completed", "closed"]

export function TransportRequestRegister({ rows, canCreate, canAct }: { rows: TransportRequestRow[]; canCreate: boolean; canAct: boolean }) {
  const [query, setQuery] = React.useState("")
  const [status, setStatus] = React.useState("all")
  const [busy, setBusy] = React.useState<string | null>(null)
  const [message, setMessage] = React.useState<string | null>(null)
  const visibleRows = rows.filter((row) => `${row.reference_number ?? ""} ${row.purpose} ${row.origin} ${row.destination}`.toLowerCase().includes(query.toLowerCase()) && (status === "all" || (row.status ?? "submitted") === status))

  async function decide(id: string, decision: "endorse" | "deny") {
    const comment = window.prompt(decision === "deny" ? "Reason for denying this request:" : "Optional endorsement comment:", "")
    if (comment === null) return
    setBusy(id); setMessage(null)
    const response = await fetch("/api/transport/requests", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, decision, comment }) })
    const result = await response.json().catch(() => ({}))
    setBusy(null)
    if (!response.ok) { setMessage(result.error ?? "Unable to update request."); return }
    window.location.reload()
  }

  return <>
    <div className="grid gap-3 sm:grid-cols-3"><Card className="border-primary/20 bg-primary/[0.03]"><CardContent className="p-5"><p className="text-sm text-muted-foreground">All requests</p><p className="mt-1 text-3xl font-semibold tracking-tight">{rows.length}</p><p className="mt-1 text-xs text-muted-foreground">Across the transport workflow</p></CardContent></Card><Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Awaiting review</p><p className="mt-1 text-3xl font-semibold tracking-tight">{rows.filter((row) => !terminalStatuses.includes(row.status ?? "")).length}</p><p className="mt-1 text-xs text-muted-foreground">Need an action from the approval chain</p></CardContent></Card><Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Approved</p><p className="mt-1 text-3xl font-semibold tracking-tight">{rows.filter((row) => row.status === "approved").length}</p><p className="mt-1 text-xs text-muted-foreground">Ready for fulfilment</p></CardContent></Card></div>
    <Card className="overflow-hidden"><CardHeader className="gap-4 border-b bg-muted/20 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle>Submitted requests</CardTitle><p className="mt-1 text-sm text-muted-foreground">Review requests within your assigned regional scope.</p></div>{canCreate && <Button asChild><Link href="/dashboard/transport"><span className="text-base">+</span> New transport request</Link></Button>}</CardHeader><CardContent className="p-4"><div className="mb-4 flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by reference, purpose, or route" className="pl-9" /></div><select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status" className="h-10 rounded-md border bg-background px-3 text-sm"><option value="all">All statuses</option><option value="submitted">Submitted</option><option value="endorsed">Endorsed</option><option value="rejected">Rejected</option><option value="completed">Completed</option></select></div>{message && <p role="alert" className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{message}</p>}<div className="overflow-x-auto rounded-lg border"><table className="w-full text-sm"><thead className="border-b bg-muted/30 text-left text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Request</th><th className="px-4 py-3 font-medium">Journey</th><th className="px-4 py-3 font-medium">Event date</th><th className="px-4 py-3 font-medium">Passengers</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Stage</th><th className="px-4 py-3 font-medium">Evidence</th>{canAct && <th className="px-4 py-3 font-medium">Action</th>}</tr></thead><tbody>{visibleRows.map((row) => <tr key={row.id} className="border-b last:border-0 hover:bg-muted/20"><td className="px-4 py-4"><p className="font-medium">{row.reference_number ?? `Request ${row.id.slice(0, 8)}`}</p><p className="max-w-xs text-muted-foreground">{row.purpose}</p></td><td className="px-4 py-4"><div className="flex items-center gap-2"><MapPin className="size-4 text-muted-foreground" />{row.origin} <ArrowRight className="size-4" /> {row.destination}</div></td><td className="px-4 py-4"><div className="flex items-center gap-2"><CalendarDays className="size-4 text-muted-foreground" />{row.event_date ? new Date(row.event_date).toLocaleDateString() : "—"}</div></td><td className="px-4 py-4"><div className="flex items-center gap-2"><Users className="size-4 text-muted-foreground" />{row.passenger_count}</div></td><td className="px-4 py-4"><Badge variant={row.status === "rejected" ? "destructive" : "secondary"}>{label(row.status)}</Badge></td><td className="px-4 py-4">{label(row.workflow_stage)}</td><td className="px-4 py-4">{row.supporting_documents?.map((document, index) => document.url && <a key={`${document.url}-${index}`} href={document.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline"><ExternalLink className="size-4" />{document.name ?? "Evidence"}</a>) ?? "—"}</td>{canAct && <td className="px-4 py-4">{row.workflow_stage === "regional_manager_endorsement" ? <div className="flex gap-2"><Button size="sm" disabled={busy === row.id} onClick={() => decide(row.id, "endorse")}>Endorse</Button><Button size="sm" variant="destructive" disabled={busy === row.id} onClick={() => decide(row.id, "deny")}>Deny</Button></div> : <span className="text-muted-foreground">No action</span>}</td>}</tr>)}{visibleRows.length === 0 && <tr><td colSpan={canAct ? 8 : 7} className="px-4 py-12 text-center text-muted-foreground">No transport requests found.</td></tr>}</tbody></table></div><p className="mt-3 text-xs text-muted-foreground">Showing {visibleRows.length} of {rows.length} requests</p></CardContent></Card>
  </>
}
