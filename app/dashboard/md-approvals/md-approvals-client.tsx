"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import {
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Loader2,
  Printer,
  RefreshCw,
  Stamp,
  TrendingUp,
  Calendar,
  ChevronDown,
  ChevronUp,
  Star,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface Loan {
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
  user_profiles: {
    first_name: string
    last_name: string
    employee_id: string
    profile_image_url: string | null
  } | null
}

interface Props {
  profile: {
    id: string
    role: string
    first_name: string
    last_name: string
    profile_image_url: string | null
    md_signature_url: string | null
    departments: { name: string } | null
  }
}

function fmtAmt(n: number | null) {
  if (!n) return "—"
  return `GHc ${n.toLocaleString("en-GH", { minimumFractionDigits: 2 })}`
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GH", { day: "2-digit", month: "short", year: "numeric" })
}

function groupByPeriod(loans: Loan[]) {
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfWeek = new Date(startOfDay)
  startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay())
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  return {
    today: loans.filter((l) => new Date(l.created_at) >= startOfDay),
    week: loans.filter((l) => new Date(l.created_at) >= startOfWeek && new Date(l.created_at) < startOfDay),
    month: loans.filter((l) => new Date(l.created_at) >= startOfMonth && new Date(l.created_at) < startOfWeek),
    older: loans.filter((l) => new Date(l.created_at) < startOfMonth),
  }
}

function LoanRow({
  loan,
  selected,
  onToggle,
  approved,
}: {
  loan: Loan
  selected: boolean
  onToggle: () => void
  approved: boolean
}) {
  const amount = loan.fixed_amount || loan.requested_amount
  const staffName = loan.staff_full_name || `${loan.user_profiles?.first_name ?? ""} ${loan.user_profiles?.last_name ?? ""}`.trim()
  const initials = staffName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()

  return (
    <div
      className={cn(
        "group relative flex items-center gap-4 rounded-xl border px-5 py-4 cursor-pointer transition-all duration-200",
        approved
          ? "bg-emerald-50/60 border-emerald-200 opacity-70 pointer-events-none"
          : selected
          ? "bg-amber-50 border-amber-300 shadow-md shadow-amber-100"
          : "bg-white border-slate-200 hover:border-amber-200 hover:bg-amber-50/40 hover:shadow-sm",
      )}
      onClick={approved ? undefined : onToggle}
    >
      {/* Checkbox */}
      {!approved && (
        <div
          className={cn(
            "flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all duration-200",
            selected ? "bg-amber-500 border-amber-500" : "border-slate-300 bg-white group-hover:border-amber-400",
          )}
        >
          {selected && <CheckCircle2 className="h-3 w-3 text-white" />}
        </div>
      )}

      {approved && (
        <div className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
          <CheckCircle2 className="h-3 w-3 text-white" />
        </div>
      )}

      {/* Staff avatar */}
      <Avatar className="h-10 w-10 flex-shrink-0 ring-2 ring-white shadow-sm">
        <AvatarImage src={loan.user_profiles?.profile_image_url || ""} />
        <AvatarFallback className={cn("text-xs font-bold", approved ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>
          {initials}
        </AvatarFallback>
      </Avatar>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-slate-900 text-sm truncate">{staffName}</span>
          {loan.staff_number && (
            <span className="text-xs text-slate-400 font-mono">#{loan.staff_number}</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs text-slate-600">{loan.loan_type_label}</span>
          <span className="text-slate-300">·</span>
          <span className="text-xs font-mono text-slate-500">{loan.request_number}</span>
          <span className="text-slate-300">·</span>
          <span className="text-xs text-slate-500">{fmtDate(loan.created_at)}</span>
        </div>
      </div>

      {/* Amount */}
      <div className="text-right flex-shrink-0">
        <div className={cn("text-sm font-bold tabular-nums", approved ? "text-emerald-700" : "text-slate-900")}>
          {fmtAmt(amount)}
        </div>
        {approved && loan.md_approved_at && (
          <div className="text-xs text-emerald-600 mt-0.5">Approved {fmtDate(loan.md_approved_at)}</div>
        )}
      </div>

      {/* Stamp overlay for approved */}
      {approved && (
        <div className="absolute right-16 top-1/2 -translate-y-1/2 opacity-20 pointer-events-none select-none rotate-[-15deg]">
          <div className="border-4 border-emerald-600 rounded px-2 py-0.5 text-emerald-600 font-black text-xs tracking-widest uppercase">
            MD Approved
          </div>
        </div>
      )}
    </div>
  )
}

function PeriodSection({
  title,
  loans,
  selected,
  onToggle,
  onSelectAll,
  approvedIds,
  defaultOpen,
}: {
  title: string
  loans: Loan[]
  selected: Set<string>
  onToggle: (id: string) => void
  onSelectAll: (ids: string[]) => void
  approvedIds: Set<string>
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  if (loans.length === 0) return null

  const pendingLoans = loans.filter((l) => !approvedIds.has(l.id))
  const allSelected = pendingLoans.length > 0 && pendingLoans.every((l) => selected.has(l.id))

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      <button
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-3">
          <span className="font-semibold text-slate-700 text-sm">{title}</span>
          <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-amber-200 text-xs">
            {pendingLoans.length} pending
          </Badge>
          {approvedIds.size > 0 && loans.some((l) => approvedIds.has(l.id)) && (
            <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">
              {loans.filter((l) => approvedIds.has(l.id)).length} approved
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          {pendingLoans.length > 1 && open && (
            <button
              className={cn(
                "text-xs font-semibold px-3 py-1 rounded-full border transition-all",
                allSelected
                  ? "bg-amber-500 border-amber-500 text-white"
                  : "border-amber-300 text-amber-700 hover:bg-amber-50",
              )}
              onClick={(e) => {
                e.stopPropagation()
                onSelectAll(pendingLoans.map((l) => l.id))
              }}
            >
              {allSelected ? "Deselect All" : "Select All"}
            </button>
          )}
          {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-100 divide-y divide-slate-100">
          {loans.map((loan) => (
            <LoanRow
              key={loan.id}
              loan={loan}
              selected={selected.has(loan.id)}
              onToggle={() => onToggle(loan.id)}
              approved={approvedIds.has(loan.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function MdApprovalsClient({ profile }: Props) {
  const { toast } = useToast()
  const [loans, setLoans] = useState<Loan[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set())
  const [isApproving, setIsApproving] = useState(false)
  const [justApproved, setJustApproved] = useState<string[]>([])
  const [showApprovedRecently, setShowApprovedRecently] = useState(false)
  const [recentlyApprovedLoans, setRecentlyApprovedLoans] = useState<Loan[]>([])
  const [downloadingMemoId, setDownloadingMemoId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("pending")
  const [approvedLoans, setApprovedLoans] = useState<Loan[]>([])
  const [loadingApproved, setLoadingApproved] = useState(false)
  const [allStampedMemos, setAllStampedMemos] = useState<any[]>([])
  const [loadingStamped, setLoadingStamped] = useState(false)

  const fetchApprovedLoans = useCallback(async () => {
    setLoadingApproved(true)
    try {
      const res = await fetch("/api/loan/md-approve?view=approved")
      if (!res.ok) throw new Error("Failed to fetch approved loans")
      const data = await res.json()
      setApprovedLoans(data.loans || [])
    } catch (err) {
      toast({ title: "Error loading approved loans", variant: "destructive" })
    } finally {
      setLoadingApproved(false)
    }
  }, [toast])

  const fetchStampedMemos = useCallback(async () => {
    setLoadingStamped(true)
    try {
      const res = await fetch("/api/loan/md-approve?view=approved")
      if (!res.ok) throw new Error("Failed to fetch stamped memos")
      const data = await res.json()
      setAllStampedMemos(data.loans || [])
    } catch (err) {
      toast({ title: "Error loading stamped memos", variant: "destructive" })
    } finally {
      setLoadingStamped(false)
    }
  }, [toast])

  const downloadMemo = useCallback(async (loan: Loan) => {
    setDownloadingMemoId(loan.id)
    try {
      // Get a secure signed memo link
      const linkRes = await fetch("/api/loan/memo-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: loan.id }),
      })
      const linkData = await linkRes.json()
      if (!linkRes.ok) throw new Error(linkData.error || "Failed to generate memo link")
      // Trigger browser download
      const a = document.createElement("a")
      a.href = linkData.path
      a.download = `loan-memo-${loan.request_number}.pdf`
      a.target = "_blank"
      a.rel = "noopener noreferrer"
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (err) {
      toast({ title: "Download failed", description: err instanceof Error ? err.message : "Could not download memo", variant: "destructive" })
    } finally {
      setDownloadingMemoId(null)
    }
  }, [toast])

  const fullName = `${profile.first_name} ${profile.last_name}`.trim()
  const initials = [profile.first_name[0], profile.last_name[0]].join("").toUpperCase()

  const fetchLoans = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/loan/md-approve?view=pending")
      const data = await res.json()
      setLoans(data.loans || [])
    } catch {
      toast({ title: "Error loading loans", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { fetchLoans() }, [fetchLoans])

  useEffect(() => {
    if (activeTab === "stamped") {
      fetchStampedMemos()
    }
  }, [activeTab, fetchStampedMemos])

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleSelectAll = (ids: string[]) => {
    setSelected((prev) => {
      const allSelected = ids.every((id) => prev.has(id))
      const next = new Set(prev)
      if (allSelected) ids.forEach((id) => next.delete(id))
      else ids.forEach((id) => next.add(id))
      return next
    })
  }

  const handleApprove = async () => {
    if (selected.size === 0) return
    setIsApproving(true)
    try {
      const res = await fetch("/api/loan/md-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loanIds: Array.from(selected) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      const approvedLoansList = loans.filter((l) => selected.has(l.id))
      setRecentlyApprovedLoans(approvedLoansList)
      setJustApproved(Array.from(selected))
      setApprovedIds((prev) => {
        const next = new Set(prev)
        selected.forEach((id) => next.add(id))
        return next
      })
      setSelected(new Set())
      setShowApprovedRecently(true)

      toast({
        title: `${data.approvedCount} loan${data.approvedCount > 1 ? "s" : ""} approved`,
        description: `Stamped with MD approval by ${data.approvedBy}`,
      })

      // Remove approved loans from pending list after 2s animation
      setTimeout(() => {
        setLoans((prev) => prev.filter((l) => !approvedIds.has(l.id) && !justApproved.includes(l.id)))
        setApprovedIds(new Set())
        setJustApproved([])
      }, 2200)
    } catch (err) {
      toast({ title: "Approval failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" })
    } finally {
      setIsApproving(false)
    }
  }

  const pendingLoans = useMemo(() => loans.filter((l) => !approvedIds.has(l.id)), [loans, approvedIds])
  const grouped = useMemo(() => groupByPeriod(pendingLoans), [pendingLoans])
  const totalPending = pendingLoans.length
  const selectedCount = selected.size

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Executive Header */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            {/* Left: identity */}
            <div className="flex items-center gap-5">
              <div className="relative">
                <Avatar className="h-16 w-16 ring-4 ring-amber-400/60 shadow-xl">
                  <AvatarImage src={profile.profile_image_url || ""} />
                  <AvatarFallback className="bg-amber-500 text-white text-xl font-black">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute -bottom-1 -right-1 bg-amber-400 rounded-full p-1">
                  <Star className="h-3 w-3 text-slate-900 fill-slate-900" />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold tracking-[0.15em] uppercase text-amber-400">
                    Managing Director
                  </span>
                </div>
                <h1 className="text-2xl font-bold tracking-tight">{fullName}</h1>
                <p className="text-slate-400 text-sm mt-0.5">
                  {profile.departments?.name || "QCC Head Office"} &mdash; Loan Approval Command
                </p>
              </div>
            </div>

            {/* Right: stats */}
            <div className="flex items-center gap-4">
              <div className="text-center rounded-xl bg-white/10 border border-white/10 px-5 py-3">
                <div className="text-3xl font-black text-amber-400 tabular-nums">{totalPending}</div>
                <div className="text-xs text-slate-400 mt-0.5 font-medium">Awaiting Approval</div>
              </div>
              <div className="text-center rounded-xl bg-white/10 border border-white/10 px-5 py-3">
                <div className="text-3xl font-black text-emerald-400 tabular-nums">{grouped.today.length}</div>
                <div className="text-xs text-slate-400 mt-0.5 font-medium">Today</div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={fetchLoans}
                disabled={loading}
                className="text-slate-400 hover:text-white hover:bg-white/10 rounded-xl h-11 w-11"
              >
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-5">

        {/* Tab switcher */}
        <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-200 p-1.5 shadow-sm w-fit">
          <button
            onClick={() => setActiveTab("pending")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
              activeTab === "pending"
                ? "bg-amber-500 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50"
            )}
          >
            <Clock className="h-4 w-4" />
            Pending Approvals
            {pendingLoans.length > 0 && (
              <span className={cn(
                "text-xs rounded-full px-2 py-0.5 tabular-nums font-bold",
                activeTab === "pending" ? "bg-white/25 text-white" : "bg-amber-100 text-amber-700"
              )}>
                {pendingLoans.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("stamped")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
              activeTab === "stamped"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50"
            )}
          >
            <Stamp className="h-4 w-4" />
            MD Approved Memos
            {allStampedMemos.length > 0 && (
              <span className={cn(
                "text-xs rounded-full px-2 py-0.5 tabular-nums font-bold",
                activeTab === "stamped" ? "bg-white/25 text-white" : "bg-emerald-100 text-emerald-700"
              )}>
                {allStampedMemos.length}
              </span>
            )}
          </button>
        </div>

        {/* Stamped Memos Tab Content */}
        {activeTab === "stamped" && (
          <div className="space-y-4">
            {loadingStamped ? (
              <div className="flex items-center justify-center py-20 gap-3">
                <Loader2 className="h-7 w-7 text-emerald-500 animate-spin" />
                <p className="text-slate-500 text-sm font-medium">Loading stamped memos...</p>
              </div>
            ) : allStampedMemos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4 rounded-2xl border border-slate-200 bg-white">
                <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center">
                  <Stamp className="h-8 w-8 text-emerald-600" />
                </div>
                <div className="text-center">
                  <h3 className="font-bold text-slate-800 text-lg">No stamped memos yet</h3>
                  <p className="text-slate-500 text-sm mt-1">Memos you approve will appear here for download and printing.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {allStampedMemos.map((memo: any) => {
                  const approvedDate = memo.md_approved_at ? new Date(memo.md_approved_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"
                  const amount = memo.fixed_amount ? `GHc ${Number(memo.fixed_amount).toLocaleString("en-GH", { minimumFractionDigits: 2 })}` : null
                  return (
                    <div key={memo.id} className="rounded-xl border border-emerald-200 bg-gradient-to-r from-white to-emerald-50 p-4 hover:border-emerald-300 transition-all">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex-1 min-w-[200px]">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-sm flex-shrink-0">
                              {String(memo.staff_full_name || "?").split(" ").map((p: string) => p[0]).join("").toUpperCase().slice(0, 2)}
                            </div>
                            <div>
                              <h3 className="font-bold text-slate-900 text-sm">{memo.staff_full_name || "Unknown Staff"}</h3>
                              <p className="text-xs text-slate-500">{memo.staff_number || memo.request_number || "—"}</p>
                            </div>
                            <div className="ml-2 flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5">
                              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                              <span className="text-xs font-semibold text-emerald-700">MD Approved</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-slate-600 flex-wrap">
                            <span className="font-semibold text-slate-700">{memo.loan_type_label || memo.leave_type || "Memo"}</span>
                            {amount && <span className="text-emerald-700 font-bold">{amount}</span>}
                            <span className="text-xs text-slate-400">Approved {approvedDate}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <a
                            href={`/api/loan/memo/${memo.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors"
                          >
                            <Download className="h-4 w-4" />
                            Download
                          </a>
                          <a
                            href={`/api/loan/memo/${memo.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => { e.preventDefault(); const w = window.open(`/api/loan/memo/${memo.id}`, "_blank"); w?.addEventListener("load", () => w.print()) }}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-semibold transition-colors"
                          >
                            <Printer className="h-4 w-4" />
                          </a>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Pending Approvals content — only shown on pending tab */}
        {activeTab === "pending" && (
        <>

        {/* Sticky approval bar */}
        {selectedCount > 0 && (
          <div className="sticky top-4 z-30 flex items-center justify-between gap-4 rounded-2xl bg-slate-900 text-white shadow-2xl border border-amber-500/30 px-6 py-4 animate-in slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-9 w-9 rounded-full bg-amber-500 shadow-lg">
                <Stamp className="h-4 w-4 text-white" />
              </div>
              <div>
                <div className="font-bold text-base">
                  {selectedCount} loan{selectedCount > 1 ? "s" : ""} selected
                </div>
                <div className="text-xs text-slate-400">Ready for MD approval stamp</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelected(new Set())}
                className="text-slate-400 hover:text-white hover:bg-white/10"
              >
                Clear
              </Button>
              <Button
                onClick={handleApprove}
                disabled={isApproving}
                className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold px-6 shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 transition-all"
              >
                {isApproving ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Stamping...</>
                ) : (
                  <><Stamp className="h-4 w-4 mr-2" /> Approve All</>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Recently approved flash */}
        {showApprovedRecently && recentlyApprovedLoans.length > 0 && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <span className="font-bold text-emerald-800">
                  {recentlyApprovedLoans.length} loan{recentlyApprovedLoans.length > 1 ? "s" : ""} stamped with MD approval
                </span>
              </div>
              <button
                onClick={() => setShowApprovedRecently(false)}
                className="text-xs text-emerald-600 hover:text-emerald-800 font-medium"
              >
                Dismiss
              </button>
            </div>
            <div className="space-y-2">
              {recentlyApprovedLoans.map((l) => (
                <div key={l.id} className="flex items-center justify-between text-sm bg-white rounded-lg px-3 py-2 border border-emerald-100">
                  <div>
                    <span className="text-emerald-800 font-medium">
                      {l.staff_full_name} &mdash; {l.loan_type_label}
                    </span>
                    <span className="block font-mono text-emerald-600 text-xs mt-0.5">{l.request_number}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 ml-3 flex-shrink-0"
                    onClick={() => downloadMemo(l)}
                    disabled={downloadingMemoId === l.id}
                  >
                    {downloadingMemoId === l.id ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Download Stamped Memo
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="h-8 w-8 text-amber-500 animate-spin" />
            <p className="text-slate-500 text-sm font-medium">Loading pending approvals...</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && totalPending === 0 && !showApprovedRecently && (
          <div className="flex flex-col items-center justify-center py-24 gap-4 rounded-2xl border border-slate-200 bg-white">
            <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <div className="text-center">
              <h3 className="font-bold text-slate-800 text-lg">All clear</h3>
              <p className="text-slate-500 text-sm mt-1">No loan memos awaiting your approval at this time.</p>
            </div>
          </div>
        )}

        {/* Grouped sections */}
        {!loading && (
          <div className="space-y-4">
            {grouped.today.length > 0 && (
              <div className="flex items-center gap-3 mb-2">
                <Clock className="h-4 w-4 text-amber-500" />
                <h2 className="text-sm font-bold text-slate-600 uppercase tracking-wider">Received Today</h2>
              </div>
            )}
            <PeriodSection
              title="Today"
              loans={grouped.today}
              selected={selected}
              onToggle={toggleSelect}
              onSelectAll={toggleSelectAll}
              approvedIds={approvedIds}
              defaultOpen={true}
            />
            {grouped.week.length > 0 && (
              <div className="flex items-center gap-3 mb-2 mt-6">
                <Calendar className="h-4 w-4 text-slate-400" />
                <h2 className="text-sm font-bold text-slate-600 uppercase tracking-wider">This Week</h2>
              </div>
            )}
            <PeriodSection
              title="This Week"
              loans={grouped.week}
              selected={selected}
              onToggle={toggleSelect}
              onSelectAll={toggleSelectAll}
              approvedIds={approvedIds}
              defaultOpen={true}
            />
            {grouped.month.length > 0 && (
              <div className="flex items-center gap-3 mb-2 mt-6">
                <TrendingUp className="h-4 w-4 text-slate-400" />
                <h2 className="text-sm font-bold text-slate-600 uppercase tracking-wider">Earlier This Month</h2>
              </div>
            )}
            <PeriodSection
              title="Earlier This Month"
              loans={grouped.month}
              selected={selected}
              onToggle={toggleSelect}
              onSelectAll={toggleSelectAll}
              approvedIds={approvedIds}
              defaultOpen={false}
            />
            <PeriodSection
              title="Older"
              loans={grouped.older}
              selected={selected}
              onToggle={toggleSelect}
              onSelectAll={toggleSelectAll}
              approvedIds={approvedIds}
              defaultOpen={false}
            />
          </div>
        )}

        {/* Quick select-all bottom bar */}
        {!loading && totalPending > 0 && selectedCount === 0 && (
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-3.5 shadow-sm">
            <div className="flex items-center gap-3">
              <FileText className="h-4 w-4 text-slate-400" />
              <span className="text-sm text-slate-600">
                <span className="font-semibold text-slate-900">{totalPending}</span> memos pending your approval
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => toggleSelectAll(pendingLoans.map((l) => l.id))}
              className="border-amber-300 text-amber-700 hover:bg-amber-50 font-semibold"
            >
              Select All {totalPending}
            </Button>
          </div>
        )}
        </>
        )}
      </div>
    </div>
  )
}
