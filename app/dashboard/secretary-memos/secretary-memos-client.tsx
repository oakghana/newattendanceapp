"use client"

import { useState, useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import {
  Banknote,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Loader2,
  Printer,
  Search,
  Star,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface LoanMemo {
  id: string
  request_number: string
  loan_type_label: string
  fixed_amount: number | null
  requested_amount: number | null
  status: string
  created_at: string
  md_approved_at: string | null
  md_approved_by_name: string | null
  staff_full_name: string | null
  staff_number: string | null
  user_id: string | null
  user_profiles: {
    first_name: string
    last_name: string
    employee_id: string
    profile_image_url: string | null
    departments: { name: string } | null
    geofence_locations: { name: string } | null
  } | null
}

interface LeaveMemo {
  id: string
  leave_type: string
  status: string
  start_date: string
  end_date: string
  reason: string | null
  created_at: string
  hr_approved_at: string | null
  memo_token: string | null
  user_id: string
  user_profiles: {
    first_name: string
    last_name: string
    employee_id: string
    profile_image_url: string | null
    departments: { name: string } | null
  } | null
}

interface ApprovedMemo {
  id: string
  request_number: string
  type: "loan" | "leave"
  loan_type_label?: string
  leave_type?: string
  staff_full_name: string | null
  staff_number: string | null
  fixed_amount?: number | null
  start_date?: string
  end_date?: string
  md_approved_at: string
  md_approved_by_name: string | null
}

interface Props {
  profile: {
    id: string
    role: string
    first_name: string
    last_name: string
    profile_image_url: string | null
    departments: { name: string } | null
  }
  loanMemos: LoanMemo[]
  leaveMemos: LeaveMemo[]
  approvedMemos?: ApprovedMemo[]
}

function fmtAmt(n: number | null) {
  if (!n) return "—"
  return `GHc ${n.toLocaleString("en-GH", { minimumFractionDigits: 2 })}`
}

function fmtDate(d: string | null) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" })
}

function leaveDays(start: string, end: string) {
  const diff = (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24) + 1
  return `${diff} day${diff !== 1 ? "s" : ""}`
}

const LOAN_STATUS_MAP: Record<string, { label: string; color: string }> = {
  awaiting_director_hr: { label: "HR Exec Approved (Pending MD)", color: "bg-blue-100 text-blue-800 border-blue-200" },
  approved_director: { label: "MD Approved", color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  staff_receiving_funds: { label: "Funds Disbursed", color: "bg-violet-100 text-violet-800 border-violet-200" },
  partially_recovered: { label: "Partially Recovered", color: "bg-amber-100 text-amber-800 border-amber-200" },
  fully_recovered: { label: "Fully Recovered", color: "bg-slate-100 text-slate-800 border-slate-200" },
}

const LEAVE_STATUS_MAP: Record<string, { label: string; color: string }> = {
  approved: { label: "Approved", color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  hr_approved: { label: "HR Approved", color: "bg-blue-100 text-blue-800 border-blue-200" },
  hod_approved: { label: "HOD Approved", color: "bg-teal-100 text-teal-800 border-teal-200" },
}

export function SecretaryMemosClient({ profile, loanMemos, leaveMemos, approvedMemos = [] }: Props) {
  const [tab, setTab] = useState<"loans" | "leave" | "approved">("loans")
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [deptFilter, setDeptFilter] = useState("all")
  const [locationFilter, setLocationFilter] = useState("all")
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const fullName = `${profile.first_name} ${profile.last_name}`.trim()
  const initials = [profile.first_name[0], profile.last_name[0]].join("").toUpperCase()

  const downloadMemo = async (memo: ApprovedMemo) => {
    setDownloadingId(memo.id)
    try {
      const linkRes = await fetch("/api/loan/memo-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: memo.id }),
      })
      const linkData = await linkRes.json()
      if (!linkRes.ok) throw new Error(linkData.error || "Failed to generate memo link")
      const a = document.createElement("a")
      a.href = linkData.path
      a.download = `${memo.type}-memo-${memo.request_number}.pdf`
      a.target = "_blank"
      a.rel = "noopener noreferrer"
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (err) {
      console.error("Download failed:", err)
    } finally {
      setDownloadingId(null)
    }
  }

  // Derive unique departments and locations from loan memos for filter dropdowns
  const uniqueDepts = useMemo(() => {
    const s = new Set<string>()
    loanMemos.forEach((m) => { 
      const deptName = m.user_profiles?.departments?.name
      if (deptName) s.add(deptName) 
    })
    return Array.from(s).sort()
  }, [loanMemos])

  const uniqueLocations = useMemo(() => {
    const s = new Set<string>()
    loanMemos.forEach((m) => { 
      const locName = m.user_profiles?.geofence_locations?.name
      if (locName) s.add(locName) 
    })
    return Array.from(s).sort()
  }, [loanMemos])

  const filteredLoanMemos = useMemo(() => {
    const q = search.toLowerCase()
    return loanMemos.filter((m) => {
      const matchesSearch = !q || (m.staff_full_name?.toLowerCase().includes(q) || m.request_number?.toLowerCase().includes(q))
      const matchesStatus = statusFilter === "all" || m.status === statusFilter
      const matchesDept = deptFilter === "all" || m.user_profiles?.departments?.name === deptFilter
      const matchesLocation = locationFilter === "all" || m.user_profiles?.geofence_locations?.name === locationFilter
      return matchesSearch && matchesStatus && matchesDept && matchesLocation
    })
  }, [loanMemos, search, statusFilter, deptFilter, locationFilter])

  const filteredLeaveMemos = useMemo(() => {
    const q = search.toLowerCase()
    return leaveMemos.filter((m) => {
      const name = `${m.user_profiles?.first_name} ${m.user_profiles?.last_name}`.toLowerCase()
      const matchesSearch = !q || name.includes(q) || m.leave_type?.toLowerCase().includes(q)
      const matchesStatus = statusFilter === "all" || m.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [leaveMemos, search, statusFilter])

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Secretary Header */}
      <div className="bg-gradient-to-br from-teal-900 via-slate-800 to-teal-900 text-white">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div className="flex items-center gap-5">
              <div className="relative">
                <Avatar className="h-14 w-14 ring-4 ring-teal-400/50 shadow-xl">
                  <AvatarImage src={profile.profile_image_url || ""} />
                  <AvatarFallback className="bg-teal-500 text-white text-lg font-black">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute -bottom-1 -right-1 bg-teal-400 rounded-full p-1">
                  <Star className="h-3 w-3 text-teal-900 fill-teal-900" />
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold tracking-[0.15em] uppercase text-teal-400 mb-1">
                  Secretary
                </div>
                <h1 className="text-xl font-bold tracking-tight">{fullName}</h1>
                <p className="text-slate-400 text-sm mt-0.5">
                  {profile.departments?.name || "QCC Head Office"} &mdash; Memo Review Console
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-center rounded-xl bg-white/10 border border-white/10 px-4 py-3">
                <div className="text-2xl font-black text-teal-300 tabular-nums">{loanMemos.length}</div>
                <div className="text-xs text-slate-400 mt-0.5 font-medium">Loan Memos</div>
              </div>
              <div className="text-center rounded-xl bg-white/10 border border-white/10 px-4 py-3">
                <div className="text-2xl font-black text-teal-300 tabular-nums">{leaveMemos.length}</div>
                <div className="text-xs text-slate-400 mt-0.5 font-medium">Leave Memos</div>
              </div>
              <div className="text-center rounded-xl bg-white/10 border border-white/10 px-4 py-3">
                <div className="text-2xl font-black text-emerald-300 tabular-nums">{approvedMemos.length}</div>
                <div className="text-xs text-slate-400 mt-0.5 font-medium">MD Approved</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-5">
        {/* Tabs + Search */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            <button
              onClick={() => { setTab("loans"); setStatusFilter("all"); setDeptFilter("all"); setLocationFilter("all") }}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
                tab === "loans"
                  ? "bg-teal-700 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50",
              )}
            >
              <Banknote className="h-4 w-4" />
              Loan Memos
              <span className={cn("text-xs rounded-full px-2 py-0.5 tabular-nums",
                tab === "loans" ? "bg-white/20" : "bg-teal-100 text-teal-700")}>
                {loanMemos.length}
              </span>
            </button>
            <button
              onClick={() => { setTab("leave"); setStatusFilter("all") }}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
                tab === "leave"
                  ? "bg-teal-700 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50",
              )}
            >
              <Calendar className="h-4 w-4" />
              Leave Memos
              <span className={cn("text-xs rounded-full px-2 py-0.5 tabular-nums",
                tab === "leave" ? "bg-white/20" : "bg-teal-100 text-teal-700")}>
                {leaveMemos.length}
              </span>
            </button>
            <button
              onClick={() => { setTab("approved"); setStatusFilter("all") }}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
                tab === "approved"
                  ? "bg-emerald-700 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50",
              )}
            >
              <CheckCircle2 className="h-4 w-4" />
              MD Approved
              <span className={cn("text-xs rounded-full px-2 py-0.5 tabular-nums",
                tab === "approved" ? "bg-white/20" : "bg-emerald-100 text-emerald-700")}>
                {approvedMemos.length}
              </span>
            </button>
          </div>

          <div className="flex-1 relative min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder={tab === "loans" ? "Search staff name or reference..." : "Search staff name or leave type..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-white border-slate-200"
            />
          </div>

          {/* Department filter — only for loan tab */}
          {tab === "loans" && uniqueDepts.length > 0 && (
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-teal-300"
            >
              <option value="all">All Departments</option>
              {uniqueDepts.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          )}

          {/* Location filter — only for loan tab */}
          {tab === "loans" && uniqueLocations.length > 0 && (
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-teal-300"
            >
              <option value="all">All Locations</option>
              {uniqueLocations.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          )}

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-teal-300"
          >
            <option value="all">All Statuses</option>
            {tab === "loans" ? (
              <>
                <option value="awaiting_director_hr">HR Exec Approved (Pending MD)</option>
                <option value="approved_director">MD Approved</option>
                <option value="staff_receiving_funds">Funds Disbursed</option>
                <option value="partially_recovered">Partially Recovered</option>
                <option value="fully_recovered">Fully Recovered</option>
              </>
            ) : (
              <>
                <option value="approved">Approved</option>
                <option value="hr_approved">HR Approved</option>
                <option value="hod_approved">HOD Approved</option>
              </>
            )}
          </select>
        </div>

        {/* Loan Memos Table */}
        {tab === "loans" && (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700">
                {filteredLoanMemos.length} loan memo{filteredLoanMemos.length !== 1 ? "s" : ""}
              </span>
              <span className="text-xs text-slate-400">Read-only view</span>
            </div>
            {filteredLoanMemos.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <FileText className="h-10 w-10 mx-auto mb-3 text-slate-200" />
                <p className="text-sm font-medium">No loan memos match your search.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredLoanMemos.map((memo) => {
                  const staffName = memo.staff_full_name || `${memo.user_profiles?.first_name ?? ""} ${memo.user_profiles?.last_name ?? ""}`.trim()
                  const initials2 = staffName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
                  const statusInfo = LOAN_STATUS_MAP[memo.status] || { label: memo.status, color: "bg-slate-100 text-slate-600 border-slate-200" }
                  const amount = memo.fixed_amount || memo.requested_amount
                  return (
                    <div key={memo.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors">
                      <Avatar className="h-9 w-9 flex-shrink-0">
                        <AvatarImage src={memo.user_profiles?.profile_image_url || ""} />
                        <AvatarFallback className="bg-teal-100 text-teal-700 text-xs font-bold">{initials2}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-slate-900 truncate">{staffName}</span>
                          {memo.staff_number && <span className="text-xs text-slate-400 font-mono">#{memo.staff_number}</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap text-xs text-slate-500">
                          <span>{memo.loan_type_label}</span>
                          <span className="text-slate-300">·</span>
                          <span className="font-mono">{memo.request_number}</span>
                          <span className="text-slate-300">·</span>
                          <span>{fmtDate(memo.created_at)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="font-bold text-sm text-slate-900 tabular-nums">{fmtAmt(amount)}</span>
                        <Badge className={cn("text-xs border font-medium", statusInfo.color)}>
                          {statusInfo.label}
                        </Badge>
                        {memo.md_approved_at && (
                          <Badge className="text-xs border bg-amber-100 text-amber-800 border-amber-200 font-medium">
                            MD Approved
                          </Badge>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Leave Memos Table */}
        {tab === "leave" && (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700">
                {filteredLeaveMemos.length} leave memo{filteredLeaveMemos.length !== 1 ? "s" : ""}
              </span>
              <span className="text-xs text-slate-400">Read-only view</span>
            </div>
            {filteredLeaveMemos.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <Calendar className="h-10 w-10 mx-auto mb-3 text-slate-200" />
                <p className="text-sm font-medium">No leave memos match your search.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredLeaveMemos.map((memo) => {
                  const name = `${memo.user_profiles?.first_name ?? ""} ${memo.user_profiles?.last_name ?? ""}`.trim()
                  const initials2 = name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
                  const statusInfo = LEAVE_STATUS_MAP[memo.status] || { label: memo.status, color: "bg-slate-100 text-slate-600 border-slate-200" }
                  return (
                    <div key={memo.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors">
                      <Avatar className="h-9 w-9 flex-shrink-0">
                        <AvatarImage src={memo.user_profiles?.profile_image_url || ""} />
                        <AvatarFallback className="bg-teal-100 text-teal-700 text-xs font-bold">{initials2}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-slate-900 truncate">{name}</span>
                          {memo.user_profiles?.employee_id && (
                            <span className="text-xs text-slate-400 font-mono">#{memo.user_profiles.employee_id}</span>
                          )}
                          {memo.user_profiles?.departments?.name && (
                            <span className="text-xs text-slate-400">{memo.user_profiles.departments.name}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap text-xs text-slate-500">
                          <span className="capitalize">{memo.leave_type?.replace(/_/g, " ")}</span>
                          <span className="text-slate-300">·</span>
                          <span>{fmtDate(memo.start_date)} &rarr; {fmtDate(memo.end_date)}</span>
                          <span className="text-slate-300">·</span>
                          <span className="font-semibold text-slate-700">{leaveDays(memo.start_date, memo.end_date)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="text-right text-xs text-slate-500">
                          <div>{memo.hr_approved_at ? "HR Approved" : "Requested"}</div>
                          <div className="font-medium text-slate-700">{fmtDate(memo.hr_approved_at || memo.created_at)}</div>
                        </div>
                        <Badge className={cn("text-xs border font-medium", statusInfo.color)}>
                          {statusInfo.label}
                        </Badge>
                        {memo.memo_token && (
                          <>
                            <button
                              onClick={() => {
                                const url = `/api/leave/planning/memo/${memo.id}?token=${encodeURIComponent(memo.memo_token || "")}`
                                window.open(url, "_blank")
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold transition-colors"
                              title="Download leave memo PDF"
                            >
                              <Download className="h-3.5 w-3.5" />
                              Download
                            </button>
                            <button
                              onClick={() => {
                                const url = `/api/leave/planning/memo/${memo.id}?token=${encodeURIComponent(memo.memo_token || "")}`
                                const win = window.open(url, "_blank")
                                win?.addEventListener("load", () => win.print())
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
                              title="Print leave memo"
                            >
                              <Printer className="h-3.5 w-3.5" />
                              Print
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* MD Approved Memos Tab */}
        {tab === "approved" && (
          <>
            {approvedMemos.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="py-16 text-center text-slate-400">
                  <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-slate-200" />
                  <p className="text-sm font-medium">No MD approved memos yet.</p>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-700">
                    {approvedMemos.length} MD approved memo{approvedMemos.length !== 1 ? "s" : ""}
                  </span>
                  <span className="text-xs text-slate-400">MD signed off</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {approvedMemos.map((memo) => {
                    const staffName = memo.staff_full_name || "Unknown Staff"
                    const staffId = memo.staff_number || "—"
                    const memoType = memo.type === "loan" ? "Loan" : "Leave"
                    const typeLabel = memo.loan_type_label || memo.leave_type || memoType
                    const initials2 = staffName.split(" ").map((p: string) => p[0]).join("").toUpperCase().slice(0, 2)
                    return (
                      <div
                        key={memo.id}
                        className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors"
                      >
                        <div className="h-9 w-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-xs flex-shrink-0">
                          {initials2}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-slate-900 truncate">{staffName}</span>
                            <span className="text-xs text-slate-400 font-mono">#{staffId}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap text-xs text-slate-500">
                            <span className="capitalize font-medium text-slate-700">{typeLabel}</span>
                            {memo.type === "loan" && memo.fixed_amount && (
                              <>
                                <span className="text-slate-300">·</span>
                                <span className="text-emerald-700 font-semibold">{fmtAmt(memo.fixed_amount)}</span>
                              </>
                            )}
                            {memo.type === "leave" && memo.start_date && memo.end_date && (
                              <>
                                <span className="text-slate-300">·</span>
                                <span>{fmtDate(memo.start_date)} &rarr; {fmtDate(memo.end_date)}</span>
                                <span className="text-slate-300">·</span>
                                <span className="font-semibold text-slate-700">{leaveDays(memo.start_date, memo.end_date)}</span>
                              </>
                            )}
                            <span className="text-slate-300">·</span>
                            <span>MD: {memo.md_approved_by_name || "MD"}</span>
                            <span className="text-slate-300">·</span>
                            <span>{fmtDate(memo.md_approved_at)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge className="text-xs border bg-emerald-100 text-emerald-800 border-emerald-200 font-medium">
                            MD Approved
                          </Badge>
                          <button
                            onClick={() => downloadMemo(memo)}
                            disabled={downloadingId === memo.id}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                          >
                            {downloadingId === memo.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Download className="h-4 w-4" />
                            )}
                            Download
                          </button>
                          <button
                            onClick={() => { downloadMemo(memo).then(() => setTimeout(() => window.print(), 500)) }}
                            disabled={downloadingId === memo.id}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-semibold transition-colors disabled:opacity-50"
                          >
                            <Printer className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  )
}
