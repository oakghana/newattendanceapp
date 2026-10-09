"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { toast } from "sonner"
import { BellRing, Download, RefreshCw, Search, Send, UserX, CheckCircle2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type YetToApplyStaff = {
  id: string
  full_name: string
  employee_id: string
  position: string
  department_name: string
  location_name: string
  previous_request_status: string | null
}

type YetToApplyResponse = {
  year: string
  total_staff: number
  applied_count: number
  yet_to_apply_count: number
  staff: YetToApplyStaff[]
}

async function fetchYetToApply(url: string): Promise<YetToApplyResponse> {
  const res = await fetch(url, { cache: "no-store" })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || "Failed to load staff who have not applied")
  return json
}

function formatStatus(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

async function downloadStaffExcel(rows: YetToApplyStaff[], year: string, sheetName: string) {
  const XLSX = await import("xlsx")
  const body = rows.map((row, index) => ({
    "#": index + 1,
    "Staff Name": row.full_name,
    "Employee ID": row.employee_id,
    Rank: row.position,
    Department: row.department_name,
    Location: row.location_name,
    "Previous Request": row.previous_request_status ? formatStatus(row.previous_request_status) : "None",
  }))
  const sheet = XLSX.utils.json_to_sheet(body)
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, sheetName.slice(0, 31))
  XLSX.writeFile(book, `staff-yet-to-apply-annual-leave-${year}-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

interface YetToApplyListProps {
  scope: "regional" | "hod"
  title: string
  description: string
}

export function YetToApplyList({ scope, title, description }: YetToApplyListProps) {
  const { data, error, isLoading, isValidating, mutate } = useSWR<YetToApplyResponse>(
    `/api/leave/yet-to-apply?scope=${scope}`,
    fetchYetToApply,
    { revalidateOnFocus: false },
  )
  const [search, setSearch] = useState("")
  const [locationFilter, setLocationFilter] = useState("all")
  const [departmentFilter, setDepartmentFilter] = useState("all")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [remindIds, setRemindIds] = useState<string[] | null>(null)
  const [remindMessage, setRemindMessage] = useState("")
  const [sending, setSending] = useState(false)

  const staff = data?.staff ?? []

  const toggleSelected = (id: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const sendReminders = async () => {
    if (!remindIds || remindIds.length === 0) return
    setSending(true)
    try {
      const res = await fetch("/api/leave/yet-to-apply/remind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, staff_ids: remindIds, message: remindMessage.trim() || undefined }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || "Could not send reminders")
      if (json.sent > 0) {
        toast.success(`Reminder sent to ${json.sent} staff`, {
          description:
            json.skipped_recent > 0
              ? `${json.skipped_recent} were reminded in the last 30 minutes and were skipped.`
              : "They will see a pop-up and a desktop notification.",
        })
      } else {
        toast.info(json.message || "Nobody to remind right now.")
      }
      setRemindIds(null)
      setRemindMessage("")
      setSelected(new Set())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send reminders")
    } finally {
      setSending(false)
    }
  }

  const locations = useMemo(
    () => Array.from(new Set(staff.map((s) => s.location_name).filter(Boolean))).sort(),
    [staff],
  )
  const departments = useMemo(
    () => Array.from(new Set(staff.map((s) => s.department_name).filter(Boolean))).sort(),
    [staff],
  )

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return staff.filter((s) => {
      if (locationFilter !== "all" && s.location_name !== locationFilter) return false
      if (departmentFilter !== "all" && s.department_name !== departmentFilter) return false
      if (!term) return true
      return [s.full_name, s.employee_id, s.position, s.department_name, s.location_name]
        .join(" ")
        .toLowerCase()
        .includes(term)
    })
  }, [staff, search, locationFilter, departmentFilter])

  return (
    <section aria-labelledby={`yet-to-apply-${scope}`} className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id={`yet-to-apply-${scope}`} className="text-base font-semibold text-slate-800">
            {title}
          </h3>
          <p className="mt-1 text-sm text-slate-500 text-pretty">{description}</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => mutate()}
          disabled={isValidating}
          aria-label="Refresh list of staff yet to apply"
        >
          <RefreshCw className={`mr-1 h-3 w-3 ${isValidating ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {data && (
        <dl className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <dt className="text-xs text-slate-500">Staff in scope</dt>
            <dd className="text-lg font-semibold text-slate-800">{data.total_staff}</dd>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <dt className="text-xs text-slate-500">Applied for {data.year}</dt>
            <dd className="text-lg font-semibold text-emerald-700">{data.applied_count}</dd>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <dt className="text-xs text-slate-500">Yet to apply</dt>
            <dd className="text-lg font-semibold text-amber-700">{data.yet_to_apply_count}</dd>
          </div>
        </dl>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-slate-400" aria-hidden="true" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, employee ID, rank..."
            className="h-8 pl-8"
            aria-label="Search staff yet to apply"
          />
        </div>
        <Select value={locationFilter} onValueChange={setLocationFilter}>
          <SelectTrigger className="h-8 w-44" aria-label="Filter by location">
            <SelectValue placeholder="All locations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All locations</SelectItem>
            {locations.map((loc) => (
              <SelectItem key={loc} value={loc}>
                {loc}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
          <SelectTrigger className="h-8 w-44" aria-label="Filter by department">
            <SelectValue placeholder="All departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {departments.map((dept) => (
              <SelectItem key={dept} value={dept}>
                {dept}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          disabled={filtered.length === 0}
          onClick={() => {
            const chosen = filtered.filter((s) => selected.has(s.id)).map((s) => s.id)
            setRemindIds(chosen.length > 0 ? chosen : filtered.map((s) => s.id))
          }}
        >
          <BellRing className="mr-1 h-3 w-3" aria-hidden="true" />
          {selected.size > 0 ? `Remind selected (${selected.size})` : `Remind all (${filtered.length})`}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={filtered.length === 0}
          onClick={() => downloadStaffExcel(filtered, data?.year ?? "", "Yet to Apply")}
        >
          <Download className="mr-1 h-3 w-3" /> Export Excel ({filtered.length})
        </Button>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-500">
          Loading staff...
        </div>
      ) : error ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error.message}
        </div>
      ) : staff.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-14 text-center text-slate-500">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-400" aria-hidden="true" />
          <p className="font-medium">
            {data && data.total_staff > 0 ? "Everyone has applied" : "No staff found"}
          </p>
          <p className="mt-1 text-sm">
            {data && data.total_staff > 0
              ? `All ${data.total_staff} staff have submitted an annual leave request for ${data.year}.`
              : "No staff are linked to you yet."}
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-10 text-center text-sm text-slate-500">
          No staff match the current filters.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {filtered.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="flex min-w-0 items-start gap-3">
                <Checkbox
                  checked={selected.has(s.id)}
                  onCheckedChange={() => toggleSelected(s.id)}
                  aria-label={`Select ${s.full_name}`}
                  className="mt-0.5"
                />
                <UserX className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">{s.full_name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {[s.employee_id && `#${s.employee_id}`, s.position, s.department_name, s.location_name]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {s.previous_request_status ? (
                  <Badge variant="outline" className="border-red-200 bg-red-50 text-xs text-red-700">
                    Previous: {formatStatus(s.previous_request_status)}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-xs text-amber-700">
                    Not applied
                  </Badge>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2"
                  onClick={() => setRemindIds([s.id])}
                  aria-label={`Send reminder to ${s.full_name}`}
                >
                  <BellRing className="h-3 w-3" aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={remindIds !== null} onOpenChange={(next) => !next && !sending && setRemindIds(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Send reminder to {remindIds?.length ?? 0} staff
            </DialogTitle>
            <DialogDescription>
              Each person gets a pop-up on their screen, a sound, and a desktop notification, even if they are not
              signed in. The reminder disappears once they apply.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor={`remind-message-${scope}`} className="text-sm font-medium text-slate-700">
              Message (optional)
            </label>
            <Textarea
              id={`remind-message-${scope}`}
              value={remindMessage}
              onChange={(e) => setRemindMessage(e.target.value.slice(0, 400))}
              placeholder={`You have not yet submitted your ${data?.year ?? ""} annual leave request. Please submit it now.`}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={sending} onClick={() => setRemindIds(null)}>
              Cancel
            </Button>
            <Button disabled={sending} onClick={sendReminders}>
              <Send className="mr-2 h-4 w-4" aria-hidden="true" />
              {sending ? "Sending..." : "Send reminder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
