"use client"

import { useEffect, useMemo, useState } from "react"
import { useToast } from "@/hooks/use-toast"

export default function HrRecordsPage() {
  const [data, setData] = useState<{ leave: any[]; loans: any[] }>({ leave: [], loans: [] })
  const [error, setError] = useState("")
  const [saving, setSaving] = useState<string | null>(null)
  const [view, setView] = useState<"pending" | "referenced" | "approved">("pending")
  const { toast } = useToast()
  const [agingWarningShown, setAgingWarningShown] = useState(false)

  async function loadQueue() {
    const response = await fetch("/api/hr-records/queue")
    const json = await response.json()
    if (!response.ok) throw new Error(json.error || "Unable to load queue")
    setData(json)
  }

  useEffect(() => {
    loadQueue().catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load queue"))
  }, [])

  async function saveReference(entity: "leave" | "loan", id: string, input: HTMLInputElement) {
    const reference = input.value.trim()
    setSaving(id)
    setError("")
    try {
      const response = await fetch("/api/hr-records/save-reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity, id, reference }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error || "Unable to save reference")
      await loadQueue()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save reference")
    } finally {
      setSaving(null)
    }
  }

  const rows = useMemo(() => [
    ...data.leave.map((row) => ({ ...row, entity: "leave" as const, label: row.leave_type_key || "Leave request", reference: row.memo_reference })),
    ...data.loans.map((row) => ({ ...row, entity: "loan" as const, label: row.request_number || "Loan request", reference: row.reference_number })),
  ].filter((row) => view === "pending" ? !row.memo_reference_locked : view === "referenced" ? Boolean(row.memo_reference_locked) && !["hr_approved", "approved"].includes(row.status) : ["hr_approved", "approved"].includes(row.status)), [data, view])

  const overdueRows = useMemo(() => [...data.leave, ...data.loans].filter((row) => {
    if (row.memo_reference_locked) return false
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
          <button type="button" onClick={() => loadQueue().catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to refresh queue"))} className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">Refresh</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Request</th><th className="px-5 py-3 font-medium">Type</th><th className="px-5 py-3 font-medium">Stage</th><th className="px-5 py-3 font-medium">Official reference</th><th className="px-5 py-3 font-medium">Reference recorded</th><th className="px-5 py-3 font-medium">Action</th></tr></thead>
            <tbody className="divide-y">
                            {rows.map((row) => { const locked = Boolean(row.memo_reference_locked); const ageDate = new Date(row.updated_at || row.submitted_at || row.created_at || 0); const overdue = !locked && ageDate.getTime() > 0 && Date.now() - ageDate.getTime() > 3 * 24 * 60 * 60 * 1000; return <tr key={`${row.entity}-${row.id}`} className={overdue ? "bg-red-50 text-red-950" : undefined}>
<td className="px-5 py-4 font-medium">{row.label}</td><td className="px-5 py-4 capitalize">{row.entity}</td><td className="px-5 py-4 text-muted-foreground">{overdue ? <span className="mr-2 inline-flex rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white">Over 3 days</span> : null}{row.status === "pending_hr_records_reference" || row.workflow_stage === "pending_hr_records_reference" ? "Awaiting HR Records memo reference" : row.status === "pending_hr_leave_processing" || row.workflow_stage === "pending_hr_leave_processing" ? "Awaiting HR Leave Office adjustment" : row.workflow_stage || row.status || "Pending"}</td><td className="px-5 py-4"><input aria-label={`Official reference for ${row.label}`} defaultValue={row.reference || ""} disabled={saving === row.id} className="w-full rounded-md border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:bg-muted" /></td><td className="px-5 py-4 text-muted-foreground">{row.memo_reference_locked_at ? new Date(row.memo_reference_locked_at).toLocaleString() : "Not recorded"}</td><td className="px-5 py-4"><button type="button" disabled={saving === row.id} onClick={(event) => { const input = event.currentTarget.parentElement?.previousElementSibling?.querySelector("input"); if (input) void saveReference(row.entity, row.id, input) }} className="rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">{saving === row.id ? "Saving…" : locked ? "Update reference" : "Save & forward"}</button></td></tr> })}
              {rows.length === 0 ? <tr><td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">No approved requests are waiting for an official reference.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
