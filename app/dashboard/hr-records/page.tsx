"use client"

import { useEffect, useMemo, useState } from "react"
import { useToast } from "@/hooks/use-toast"

// "referenced" is the loan pipeline's terminal status — HR Records assigning
// the official reference to an already Director HR / MD approved loan is the
// final stage of the loan request, exactly like "hr_approved" is for leave.
const FINAL_APPROVED_STATUSES = new Set([
  "hr_approved",
  "pending_hr_records_reference",
  "approved_director",
  "approved",
  "referenced",
  "staff_receiving_funds",
  "partially_recovered",
  "fully_recovered",
])
const REGIONAL_LEAVE_STATUSES = new Set(["pending_regional_hr_office_review", "pending_regional_hr_review", "regional_hr_office_review", "regional_hr_approved", "regional_manager_approved", "completed"])

function isRegionalLeave(row: any) {
  return row.entity === "leave" && (String(row.workflow_route || "").toLowerCase() === "regional" || REGIONAL_LEAVE_STATUSES.has(String(row.status || "").toLowerCase()))
}

function canEditReference(row: any) {
  if (row.entity === "transport") return ["hr_records_review", "transport_manager_assignment", "referenced"].includes(String(row.workflow_stage || "")) && (row.request_type === "regional_transport" || row.workflow_stage !== "transport_manager_assignment")
  return !isRegionalLeave(row) && FINAL_APPROVED_STATUSES.has(String(row.status || "").toLowerCase())
}

function isReferenceLocked(row: any) {
  return row.entity === "transport" ? row.workflow_stage === "referenced" : Boolean(row.memo_reference_locked)
}

export default function HrRecordsPage() {
  const [data, setData] = useState<{ leave: any[]; loans: any[]; transport: any[] }>({ leave: [], loans: [], transport: [] })
  const [error, setError] = useState("")
  const [saving, setSaving] = useState<string | null>(null)
  const [references, setReferences] = useState<Record<string, string>>({})
  const [view, setView] = useState<"pending" | "referenced" | "approved">("pending")
  const { toast } = useToast()
  const [agingWarningShown, setAgingWarningShown] = useState(false)

  async function loadQueue() {
    const response = await fetch("/api/hr-records/queue")
    const json = await response.json()
    if (!response.ok) throw new Error(json.error || "Unable to load queue")
    setData(json)
    setReferences((current) => {
      const next = { ...current }
      for (const row of [...(json.leave || []), ...(json.loans || []), ...(json.transport || [])]) {
        const entity = (json.transport || []).some((item: any) => item.id === row.id) ? "transport" : (json.leave || []).some((item: any) => item.id === row.id) ? "leave" : "loan"
        const key = `${entity}-${row.id}`
        next[key] = row.memo_reference || row.reference_number || ""
      }
      return next
    })
  }

  useEffect(() => {
    loadQueue().catch((reason) => {
      const message = reason instanceof Error ? reason.message : "Unable to load queue"
      setError(message)
      toast({ title: "HR Records queue unavailable", description: message, variant: "destructive" })
    })
  }, [toast])

  async function saveReference(entity: "leave" | "loan" | "transport", id: string) {
    const key = `${entity}-${id}`
    const reference = (references[key] || "").trim()
    if (reference.length < 3) {
      const message = "Reference must contain at least 3 characters."
      setError(message)
      toast({ title: "Reference not saved", description: message, variant: "destructive" })
      return
    }
    setSaving(key)
    setError("")
    try {
      const response = await fetch("/api/hr-records/save-reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity, id, reference }),
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(json.error || `Unable to save reference (${response.status})`)
      await loadQueue()
      toast({ title: "Reference saved", description: `${entity === "loan" ? "Loan" : entity === "transport" ? "Transport memo" : "Leave"} reference ${reference} was recorded and forwarded.` })
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Unable to save reference"
      setError(message)
      toast({ title: "Reference save failed", description: message, variant: "destructive" })
    } finally {
      setSaving(null)
    }
  }

  const rows = useMemo(() => [
    ...data.leave.map((row) => ({ ...row, entity: "leave" as const, label: row.leave_type_key || "Leave request", reference: row.memo_reference })),
    ...data.loans.map((row) => ({ ...row, entity: "loan" as const, label: row.request_number || "Loan request", reference: row.reference_number })),
    ...data.transport.map((row) => ({ ...row, entity: "transport" as const, label: row.request_subject || row.purpose || "Transport request", reference: row.memo_reference })),
  ].filter((row) => {
    const editable = canEditReference(row)
    const status = String(row.status || "").toLowerCase()
    // Intentionally NOT the same broad check used for the row's display label
    // below: loan requests get an auto-generated `reference_number` (a
    // provisional QCC reference) at creation time, long before they ever reach
    // HR Records, so treating any non-empty reference/reference_number as
    // "locked" here would hide every loan from "Pending references" from the
    // moment it's created. The only thing that actually means HR Records has
    // finalized and forwarded a request is `memo_reference_locked`.
    const locked = isReferenceLocked(row)
    if (view === "pending") return editable && !locked
    if (view === "referenced") return locked && !FINAL_APPROVED_STATUSES.has(status)
    // "Approved memos" is the truly final stage: the reference must actually be
    // recorded (locked), not merely eligible for HR Records to act on.
    return (locked && (FINAL_APPROVED_STATUSES.has(status) || row.entity === "transport")) || (isRegionalLeave(row) && Boolean(row.memo_reference || row.reference_number))
  }), [data, view])

const overdueRows = useMemo(() => [...data.leave, ...data.loans, ...data.transport].filter((row) => {
  if (row.workflow_stage === "referenced" || row.memo_reference_locked || row.memo_reference || row.reference_number) return false
    const timestamp = new Date(row.updated_at || row.submitted_at || row.created_at || 0).getTime()
    return timestamp > 0 && Date.now() - timestamp > 3 * 24 * 60 * 60 * 1000
  }), [data])

  useEffect(() => {
    if (!agingWarningShown && overdueRows.length > 0) {
      toast({ title: "HR Records attention required", description: `${overdueRows.length} request${overdueRows.length === 1 ? " has" : "s have"} remained with HR Records for more than 3 days.`, variant: "destructive" })
      setAgingWarningShown(true)
    }
  }, [agingWarningShown, overdueRows.length, toast])

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-muted-foreground">Records control</p>
        <h1 className="text-3xl font-semibold tracking-tight">HR Records Management</h1>
        <p className="max-w-2xl text-muted-foreground">Assign official memo references, lock them permanently, and forward approved requests to the next processing office.</p>
      </header>
      {error ? <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-wrap gap-2 rounded-xl border bg-card p-2 shadow-sm" role="tablist" aria-label="HR Records views">
        {([["pending", "Pending references"], ["referenced", "Referenced / forwarded"], ["approved", "Approved memos"]] as const).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={view === key} onClick={() => setView(key)} className={`rounded-lg px-4 py-2 text-sm font-medium ${view === key ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{label}</button>)}
      </div>
      <section className="overflow-hidden rounded-xl border bg-card shadow-sm" aria-labelledby="queue-heading">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div><h2 id="queue-heading" className="font-semibold">{view === "pending" ? "Awaiting HR Records memo reference" : view === "referenced" ? "Referenced and forwarded" : "Approved leave and loan memos"}</h2><p className="text-sm text-muted-foreground">{rows.length} record{rows.length === 1 ? "" : "s"} visible for audit review</p></div>
          <button type="button" onClick={() => loadQueue().then(() => toast({ title: "HR Records queue refreshed", description: "Latest reference statuses are now shown." })).catch((reason) => { const message = reason instanceof Error ? reason.message : "Unable to refresh queue"; setError(message); toast({ title: "Refresh failed", description: message, variant: "destructive" }) })} className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">Refresh</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Staff requester</th><th className="px-5 py-3 font-medium">Subject</th><th className="px-5 py-3 font-medium">Type</th><th className="px-5 py-3 font-medium">Stage</th><th className="px-5 py-3 font-medium">Official reference</th><th className="px-5 py-3 font-medium">Reference recorded</th><th className="px-5 py-3 font-medium">Action</th></tr></thead>
            <tbody className="divide-y">
                            {rows.map((row) => { const locked = row.entity === "transport" ? row.workflow_stage === "referenced" : Boolean(row.memo_reference_locked || row.memo_reference || row.reference_number); const ageDate = new Date(row.updated_at || row.submitted_at || row.created_at || 0); const overdue = !locked && ageDate.getTime() > 0 && Date.now() - ageDate.getTime() > 3 * 24 * 60 * 60 * 1000; return <tr key={`${row.entity}-${row.id}`} className={overdue ? "bg-red-50 text-red-950" : undefined}>
<td className="px-5 py-4"><div className="font-medium">{row.requester_name || "Unknown staff"}</div><div className="text-xs text-muted-foreground">Staff ID: {row.staff_id || "Not assigned"}</div><div className="text-xs text-muted-foreground">{row.staff_category || "Staff"} · {row.department || "Department not assigned"}</div><div className="text-xs text-muted-foreground">{row.location_name || "Location not assigned"}</div></td><td className="px-5 py-4"><div className="max-w-xs font-medium">{row.request_subject || row.label}</div><div className="text-xs capitalize text-muted-foreground">{row.label}</div></td><td className="px-5 py-4 capitalize">{row.entity}</td><td className="px-5 py-4 text-muted-foreground">{overdue ? <span className="mr-2 inline-flex rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white">Over 3 days</span> : null}{row.status === "pending_hr_records_reference" || row.workflow_stage === "pending_hr_records_reference" ? "Awaiting HR Records memo reference" : row.status === "pending_hr_leave_processing" || row.workflow_stage === "pending_hr_leave_processing" ? "Awaiting HR Leave Office adjustment" : row.workflow_stage || row.status || "Pending"}</td><td className="px-5 py-4"><input aria-label={`Official reference for ${row.label}`} value={references[`${row.entity}-${row.id}`] ?? row.reference ?? ""} onChange={(event) => setReferences((current) => ({ ...current, [`${row.entity}-${row.id}`]: event.target.value }))} readOnly={!canEditReference(row)} disabled={!canEditReference(row) || saving === `${row.entity}-${row.id}`} className="w-full rounded-md border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:bg-muted" /></td><td className="px-5 py-4 text-muted-foreground">{row.memo_reference_locked_at ? new Date(row.memo_reference_locked_at).toLocaleString() : locked ? "Reference recorded" : "Not recorded"}</td><td className="px-5 py-4"><button type="button" disabled={!canEditReference(row) || saving === `${row.entity}-${row.id}`} onClick={() => void saveReference(row.entity, row.id)} className="rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">{saving === `${row.entity}-${row.id}` ? "Saving…" : locked ? "Update reference" : "Save & forward"}</button></td></tr> })}
              {rows.length === 0 ? <tr><td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">No approved requests are waiting for an official reference.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
