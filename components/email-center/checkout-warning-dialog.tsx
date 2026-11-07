"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertCircle, Loader2, Search, Send } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

export type CheckoutCandidate = {
  id: string
  user_id: string
  name: string
  employee_id: string
  email: string
  role: string
  department: string
  department_type: "overnight" | "standard"
  location: string
  check_in_time: string
  outcome: string
  will_checkout: boolean
  will_warn: boolean
  actionable: boolean
}

type CheckoutWarningDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  candidates: CheckoutCandidate[]
  standardMessages: Record<string, string>
  onCompleted: (summary: string) => void
}

// Small batches keep every request well inside the server time limit and let the
// dialog report real progress instead of one long silent wait.
const BATCH_SIZE = 25

function formatCheckIn(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-GH", { dateStyle: "medium", timeStyle: "short" })
}

function outcomeBadgeClass(candidate: CheckoutCandidate) {
  if (!candidate.actionable) return "border-slate-700 bg-slate-800 text-slate-300"
  if (candidate.will_checkout) return "border-amber-700/60 bg-amber-950/60 text-amber-200"
  return "border-sky-700/60 bg-sky-950/60 text-sky-200"
}

export function CheckoutWarningDialog({ open, onOpenChange, candidates, standardMessages, onCompleted }: CheckoutWarningDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState("")
  const [department, setDepartment] = useState("all")
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  const [sending, setSending] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setSelected(new Set(candidates.filter((candidate) => candidate.actionable).map((candidate) => candidate.id)))
    setSearch("")
    setDepartment("all")
    setSubject("")
    setMessage("")
    setError(null)
    setProgress(null)
  }, [open, candidates])

  const departments = useMemo(() => Array.from(new Set(candidates.map((candidate) => candidate.department))).sort(), [candidates])

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase()
    return candidates.filter((candidate) => {
      if (department !== "all" && candidate.department !== department) return false
      if (!query) return true
      return [candidate.name, candidate.employee_id, candidate.email, candidate.department, candidate.role].some((value) => String(value || "").toLowerCase().includes(query))
    })
  }, [candidates, department, search])

  const visibleActionable = visible.filter((candidate) => candidate.actionable)
  const allVisibleSelected = visibleActionable.length > 0 && visibleActionable.every((candidate) => selected.has(candidate.id))
  const chosen = candidates.filter((candidate) => candidate.actionable && selected.has(candidate.id))
  const checkoutCount = chosen.filter((candidate) => candidate.will_checkout).length
  const emailCount = chosen.filter((candidate) => candidate.will_warn).length
  const waitingCount = candidates.filter((candidate) => !candidate.actionable).length

  function toggleCandidate(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function toggleVisible(checked: boolean) {
    setSelected((current) => {
      const next = new Set(current)
      for (const candidate of visibleActionable) {
        if (checked) next.add(candidate.id)
        else next.delete(candidate.id)
      }
      return next
    })
  }

  async function sendWarnings() {
    const ids = chosen.map((candidate) => candidate.id)
    if (ids.length === 0 || sending) return
    setSending(true)
    setError(null)
    setProgress({ done: 0, total: ids.length })
    const totals = { checkedOut: 0, loggedOut: 0, emailed: 0 }
    let processed = 0
    try {
      for (let index = 0; index < ids.length; index += BATCH_SIZE) {
        const batch = ids.slice(index, index + BATCH_SIZE)
        const response = await fetch("/api/cron/force-failed-checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionIds: batch, subject: subject.trim() || undefined, message: message.trim() || undefined }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok || data.error) throw new Error(data.details || data.error || "The server could not process this batch.")
        totals.checkedOut += Number(data.office_11pm_auto_checked_out || 0) + Number(data.department_24_hour_auto_checked_out || 0)
        totals.loggedOut += Number(data.auto_logged_out || 0)
        totals.emailed += Number(data.warnings_sent || 0)
        processed = Math.min(index + BATCH_SIZE, ids.length)
        setProgress({ done: processed, total: ids.length })
      }
      onCompleted(`Processed ${ids.length} session${ids.length === 1 ? "" : "s"}: ${totals.checkedOut} checked out, ${totals.emailed} warning email${totals.emailed === 1 ? "" : "s"} sent, ${totals.loggedOut} signed out.`)
      onOpenChange(false)
    } catch (sendError) {
      const reason = sendError instanceof Error ? sendError.message : "Something went wrong."
      setError(`${reason} ${processed} of ${ids.length} were processed before it stopped. Close this window and reopen the review to see what is left.`)
    } finally {
      setSending(false)
    }
  }

  const progressPercent = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!sending) onOpenChange(next) }}>
      <DialogContent className="flex max-h-[92vh] w-[96vw] flex-col gap-0 overflow-hidden border-slate-800 bg-slate-900 p-0 text-slate-100 sm:max-w-5xl">
        <DialogHeader className="space-y-1 px-6 pb-3 pt-6 text-left">
          <DialogTitle className="text-xl">Review missed checkout warnings</DialogTitle>
          <DialogDescription className="text-slate-400">
            Choose who to process and adjust the email wording. Each warning is also copied to the staff member&apos;s HOD.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 pb-4">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Open sessions", value: candidates.length },
              { label: "Selected", value: chosen.length },
              { label: "Auto checkouts", value: checkoutCount },
              { label: "Warning emails", value: emailCount },
            ].map((tile) => (
              <div key={tile.label} className="rounded-lg border border-slate-800 bg-slate-950/60 px-4 py-3">
                <dt className="text-xs text-slate-400">{tile.label}</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums">{tile.value}</dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, staff ID, email or role"
                aria-label="Search staff"
                className="border-slate-700 bg-slate-950 pl-9 text-slate-100 placeholder:text-slate-500"
              />
            </div>
            <select
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              aria-label="Filter by department"
              className="h-9 rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
            >
              <option value="all">All departments</option>
              {departments.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          <div className="max-h-[36vh] overflow-auto rounded-lg border border-slate-800">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-slate-900 text-xs uppercase tracking-wide text-slate-400">
                <tr className="border-b border-slate-800">
                  <th scope="col" className="w-10 px-3 py-2">
                    <Checkbox
                      checked={allVisibleSelected}
                      onCheckedChange={(checked) => toggleVisible(checked === true)}
                      disabled={visibleActionable.length === 0 || sending}
                      aria-label="Select every listed staff member who needs action"
                      className="border-slate-500 data-[state=checked]:border-teal-500 data-[state=checked]:bg-teal-600 data-[state=checked]:text-white"
                    />
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">Staff</th>
                  <th scope="col" className="px-3 py-2 font-medium">Department</th>
                  <th scope="col" className="px-3 py-2 font-medium">Role</th>
                  <th scope="col" className="px-3 py-2 font-medium">Checked in</th>
                  <th scope="col" className="px-3 py-2 font-medium">Planned action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center text-slate-400">No staff match this search.</td>
                  </tr>
                ) : (
                  visible.map((candidate) => (
                    <tr key={candidate.id} className={candidate.actionable ? "hover:bg-slate-800/40" : "opacity-60"}>
                      <td className="px-3 py-2.5">
                        <Checkbox
                          checked={candidate.actionable && selected.has(candidate.id)}
                          onCheckedChange={(checked) => toggleCandidate(candidate.id, checked === true)}
                          disabled={!candidate.actionable || sending}
                          aria-label={`Select ${candidate.name}`}
                          className="border-slate-500 data-[state=checked]:border-teal-500 data-[state=checked]:bg-teal-600 data-[state=checked]:text-white"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium">{candidate.name}</div>
                        <div className="text-xs text-slate-400">ID {candidate.employee_id}{candidate.email ? ` · ${candidate.email}` : " · no email on file"}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div>{candidate.department}</div>
                        {candidate.department_type === "overnight" ? <div className="text-xs text-slate-400">Overnight department</div> : null}
                      </td>
                      <td className="px-3 py-2.5 capitalize text-slate-300">{candidate.role.replace(/_/g, " ")}</td>
                      <td className="px-3 py-2.5 text-slate-300">
                        <div>{formatCheckIn(candidate.check_in_time)}</div>
                        {candidate.location ? <div className="text-xs text-slate-400">{candidate.location}</div> : null}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant="outline" className={`whitespace-normal text-left font-normal ${outcomeBadgeClass(candidate)}`}>{candidate.outcome}</Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {waitingCount > 0 ? (
            <p className="text-xs text-slate-400">{waitingCount} open session{waitingCount === 1 ? "" : "s"} {waitingCount === 1 ? "has" : "have"} not reached a cut-off yet and cannot be selected.</p>
          ) : null}

          <section aria-labelledby="warning-wording-heading" className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/60 p-4">
            <div>
              <h3 id="warning-wording-heading" className="text-sm font-semibold">Email wording</h3>
              <p className="text-xs text-slate-400">Leave a field blank to use the standard wording. Anything you type is sent to every selected person.</p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="warning-subject" className="text-xs font-medium text-slate-300">Subject</label>
              <Input
                id="warning-subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Attendance checkout notice — action required"
                disabled={sending}
                className="border-slate-700 bg-slate-900 text-slate-100 placeholder:text-slate-500"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="warning-message" className="text-xs font-medium text-slate-300">Message</label>
              <Textarea
                id="warning-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={standardMessages["11pm"] || "Standard wording"}
                rows={3}
                disabled={sending}
                className="border-slate-700 bg-slate-900 text-slate-100 placeholder:text-slate-500"
              />
              <ul className="space-y-1 text-xs text-slate-400">
                {standardMessages["11pm"] ? <li><span className="font-medium text-slate-300">Standard departments:</span> {standardMessages["11pm"]}</li> : null}
                {standardMessages["20_hour"] ? <li><span className="font-medium text-slate-300">Security, Transport, Operations:</span> {standardMessages["20_hour"]}</li> : null}
              </ul>
            </div>
          </section>

          {error ? (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-800 bg-red-950/60 px-4 py-3 text-sm text-red-100">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}
        </div>

        <DialogFooter className="flex-col gap-3 border-t border-slate-800 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:space-x-0">
          <div className="min-w-0 flex-1">
            {progress ? (
              <div>
                <div className="mb-1 flex justify-between text-xs text-slate-400">
                  <span>{sending ? "Processing..." : "Stopped"}</span>
                  <span className="tabular-nums">{progress.done} of {progress.total}</span>
                </div>
                <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent} aria-label="Warning progress" className="h-2 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full bg-teal-500 transition-all" style={{ width: `${progressPercent}%` }} />
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400">Checkouts and emails cannot be undone once processed.</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={sending} className="border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800 hover:text-white">
              Cancel
            </Button>
            <Button type="button" onClick={sendWarnings} disabled={sending || chosen.length === 0} className="bg-teal-600 text-white hover:bg-teal-500">
              {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="mr-2 h-4 w-4" aria-hidden="true" />}
              {sending ? "Sending..." : `Process selected (${chosen.length})`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
