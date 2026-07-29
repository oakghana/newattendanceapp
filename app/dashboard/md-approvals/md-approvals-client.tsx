"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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
  Filter,
  X,
  BarChart3,
  MapPin,
  Building2,
  FileDown,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts"

interface Loan {
  id: string
  request_number: string
  loan_type_label: string
  loan_type_key?: string
  fixed_amount: number | null
  requested_amount: number | null
  status: string
  created_at: string
  md_approved_at: string | null
  md_approved_by_name: string | null
  staff_full_name: string | null
  staff_number: string | null
  staff_location_name?: string | null
  staff_district_name?: string | null
  staff_rank?: string | null
  department_id?: string | null
  departments?: { name: string } | null
  loan_category?: string | null
  user_profiles: {
    first_name: string
    last_name: string
    employee_id: string
    profile_image_url: string | null
    assigned_location_id?: string | null
    position?: string | null
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

function getMonthKey(d: string) {
  const dt = new Date(d)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`
}

function getMonthLabel(key: string) {
  const [y, m] = key.split("-")
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-GH", { month: "short", year: "numeric" })
}

function getQuarter(d: string) {
  const month = new Date(d).getMonth()
  return `Q${Math.floor(month / 3) + 1} ${new Date(d).getFullYear()}`
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

// ── CSV Export ──────────────────────────────────────────────────────────────
function exportToCSV(loans: Loan[], filename: string) {
  const headers = [
    "Request Number", "Staff Name", "Staff Number", "Loan Type",
    "Amount (GHc)", "Location", "Department", "Approved Date", "Approved By"
  ]
  const rows = loans.map((l) => {
    const amt = l.fixed_amount || l.requested_amount || 0
    const dept = l.departments?.name || "—"
    const loc = l.staff_location_name || "—"
    const approvedDate = l.md_approved_at ? new Date(l.md_approved_at).toLocaleDateString("en-GH") : "—"
    return [
      l.request_number,
      l.staff_full_name || `${l.user_profiles?.first_name || ""} ${l.user_profiles?.last_name || ""}`.trim(),
      l.staff_number || "—",
      l.loan_type_label,
      amt.toFixed(2),
      loc,
      dept,
      approvedDate,
      l.md_approved_by_name || "—"
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")
  })
  const csv = [headers.join(","), ...rows].join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── Loan Row ─────────────────────────────────────────────────────────────────
function LoanRow({
  loan, selected, onToggle, approved,
}: {
  loan: Loan; selected: boolean; onToggle: () => void; approved: boolean
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
      {!approved && (
        <div className={cn(
          "flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all duration-200",
          selected ? "bg-amber-500 border-amber-500" : "border-slate-300 bg-white group-hover:border-amber-400",
        )}>
          {selected && <CheckCircle2 className="h-3 w-3 text-white" />}
        </div>
      )}
      {approved && (
        <div className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
          <CheckCircle2 className="h-3 w-3 text-white" />
        </div>
      )}
      <Avatar className="h-10 w-10 flex-shrink-0 ring-2 ring-white shadow-sm">
        <AvatarImage src={loan.user_profiles?.profile_image_url || ""} />
        <AvatarFallback className={cn("text-xs font-bold", approved ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-slate-900 text-sm truncate">{staffName}</span>
          {loan.staff_number && <span className="text-xs text-slate-400 font-mono">#{loan.staff_number}</span>}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs text-slate-600">{loan.loan_type_label}</span>
          <span className="text-slate-300">·</span>
          <span className="text-xs font-mono text-slate-500">{loan.request_number}</span>
          <span className="text-slate-300">·</span>
          <span className="text-xs text-slate-500">{fmtDate(loan.created_at)}</span>
          {loan.staff_location_name && (
            <>
              <span className="text-slate-300">·</span>
              <span className="text-xs text-slate-400 flex items-center gap-0.5">
                <MapPin className="h-2.5 w-2.5" />{loan.staff_location_name}
              </span>
            </>
          )}
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className={cn("text-sm font-bold tabular-nums", approved ? "text-emerald-700" : "text-slate-900")}>
          {fmtAmt(amount)}
        </div>
        {approved && loan.md_approved_at && (
          <div className="text-xs text-emerald-600 mt-0.5">Approved {fmtDate(loan.md_approved_at)}</div>
        )}
      </div>
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

// ── Period Section ────────────────────────────────────────────────────────────
function PeriodSection({
  title, loans, selected, onToggle, onSelectAll, approvedIds, defaultOpen,
}: {
  title: string; loans: Loan[]; selected: Set<string>; onToggle: (id: string) => void;
  onSelectAll: (ids: string[]) => void; approvedIds: Set<string>; defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  if (loans.length === 0) return null
  const pendingLoans = loans.filter((l) => !approvedIds.has(l.id))
  const allSelected = pendingLoans.length > 0 && pendingLoans.every((l) => selected.has(l.id))

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      <button className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors" onClick={() => setOpen((o) => !o)}>
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
                allSelected ? "bg-amber-500 border-amber-500 text-white" : "border-amber-300 text-amber-700 hover:bg-amber-50",
              )}
              onClick={(e) => { e.stopPropagation(); onSelectAll(pendingLoans.map((l) => l.id)) }}
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
            <LoanRow key={loan.id} loan={loan} selected={selected.has(loan.id)} onToggle={() => onToggle(loan.id)} approved={approvedIds.has(loan.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Analytics Tab ─────────────────────────────────────────────────────────────
const CHART_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#f97316", "#84cc16"]

function AnalyticsTab({ loans }: { loans: Loan[] }) {
  const [analyticsView, setAnalyticsView] = useState<"month" | "quarter" | "location" | "type">("month")

  // ── Filter state ──────────────────────────────────────────────────────────
  const [filterLocation, setFilterLocation] = useState("")
  const [filterDepartment, setFilterDepartment] = useState("")
  const [filterLoanType, setFilterLoanType] = useState("")
  const [filterCategory, setFilterCategory] = useState("")
  const [filterPosition, setFilterPosition] = useState("")

  // ── Derive unique filter options from data ────────────────────────────────
  const locationOptions = useMemo(() => {
    const s = new Set<string>()
    loans.forEach((l) => { if (l.staff_location_name) s.add(l.staff_location_name) })
    return Array.from(s).sort()
  }, [loans])

  const departmentOptions = useMemo(() => {
    const s = new Set<string>()
    loans.forEach((l) => { if (l.departments?.name) s.add(l.departments.name) })
    return Array.from(s).sort()
  }, [loans])

  const loanTypeOptions = useMemo(() => {
    const s = new Set<string>()
    loans.forEach((l) => { if (l.loan_type_label) s.add(l.loan_type_label) })
    return Array.from(s).sort()
  }, [loans])

  const categoryOptions = useMemo(() => {
    const s = new Set<string>()
    loans.forEach((l) => { if (l.loan_category) s.add(l.loan_category) })
    return Array.from(s).sort()
  }, [loans])

  const positionOptions = useMemo(() => {
    const s = new Set<string>()
    loans.forEach((l) => {
      const pos = l.user_profiles?.position || l.staff_rank
      if (pos) s.add(pos)
    })
    return Array.from(s).sort()
  }, [loans])

  const activeFilterCount = [filterLocation, filterDepartment, filterLoanType, filterCategory, filterPosition].filter(Boolean).length

  const clearFilters = () => {
    setFilterLocation("")
    setFilterDepartment("")
    setFilterLoanType("")
    setFilterCategory("")
    setFilterPosition("")
  }

  // ── Apply filters to base dataset ────────────────────────────────────────
  const filteredLoans = useMemo(() => {
    return loans.filter((l) => {
      if (filterLocation && l.staff_location_name !== filterLocation) return false
      if (filterDepartment && l.departments?.name !== filterDepartment) return false
      if (filterLoanType && l.loan_type_label !== filterLoanType) return false
      if (filterCategory && l.loan_category !== filterCategory) return false
      if (filterPosition) {
        const pos = l.user_profiles?.position || l.staff_rank || ""
        if (pos !== filterPosition) return false
      }
      return true
    })
  }, [loans, filterLocation, filterDepartment, filterLoanType, filterCategory, filterPosition])

  const totalApproved = filteredLoans.length
  const totalAmount = filteredLoans.reduce((s, l) => s + (l.fixed_amount || l.requested_amount || 0), 0)

  // By month
  const byMonth = useMemo(() => {
    const map = new Map<string, { count: number; amount: number }>()
    filteredLoans.forEach((l) => {
      if (!l.md_approved_at) return
      const key = getMonthKey(l.md_approved_at)
      const existing = map.get(key) || { count: 0, amount: 0 }
      map.set(key, { count: existing.count + 1, amount: existing.amount + (l.fixed_amount || l.requested_amount || 0) })
    })
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => ({ name: getMonthLabel(k), count: v.count, amount: Number((v.amount / 1000).toFixed(1)) }))
  }, [filteredLoans])

  // By quarter
  const byQuarter = useMemo(() => {
    const map = new Map<string, { count: number; amount: number }>()
    filteredLoans.forEach((l) => {
      if (!l.md_approved_at) return
      const key = getQuarter(l.md_approved_at)
      const existing = map.get(key) || { count: 0, amount: 0 }
      map.set(key, { count: existing.count + 1, amount: existing.amount + (l.fixed_amount || l.requested_amount || 0) })
    })
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => ({ name: k, count: v.count, amount: Number((v.amount / 1000).toFixed(1)) }))
  }, [filteredLoans])

  // By location
  const byLocation = useMemo(() => {
    const map = new Map<string, { count: number; amount: number }>()
    filteredLoans.forEach((l) => {
      const loc = l.staff_location_name || "Unknown"
      const existing = map.get(loc) || { count: 0, amount: 0 }
      map.set(loc, { count: existing.count + 1, amount: existing.amount + (l.fixed_amount || l.requested_amount || 0) })
    })
    return Array.from(map.entries())
      .sort(([, a], [, b]) => b.count - a.count)
      .map(([k, v]) => ({ name: k, count: v.count, amount: Number((v.amount / 1000).toFixed(1)) }))
  }, [filteredLoans])

  // By loan type
  const byType = useMemo(() => {
    const map = new Map<string, { count: number; amount: number }>()
    filteredLoans.forEach((l) => {
      const type = l.loan_type_label || "Other"
      const existing = map.get(type) || { count: 0, amount: 0 }
      map.set(type, { count: existing.count + 1, amount: existing.amount + (l.fixed_amount || l.requested_amount || 0) })
    })
    return Array.from(map.entries())
      .sort(([, a], [, b]) => b.count - a.count)
      .map(([k, v]) => ({ name: k, count: v.count, amount: Number((v.amount / 1000).toFixed(1)) }))
  }, [filteredLoans])

  const chartData = analyticsView === "month" ? byMonth : analyticsView === "quarter" ? byQuarter : analyticsView === "location" ? byLocation : byType

  const topLocation = byLocation[0]?.name || "—"
  const topType = byType[0]?.name || "—"
  const thisMonthCount = byMonth.find((m) => {
    const now = new Date()
    const label = new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString("en-GH", { month: "short", year: "numeric" })
    return m.name === label
  })?.count ?? 0

  return (
    <div className="space-y-6">

      {/* ── Filter Bar ──────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-500" />
            <span className="text-sm font-semibold text-slate-700">Filter Analytics</span>
            {activeFilterCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-emerald-600 text-white text-xs font-bold">
                {activeFilterCount}
              </span>
            )}
          </div>
          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-600 transition-colors font-medium"
            >
              <X className="h-3.5 w-3.5" />
              Clear all
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 p-4">
          {/* Location */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500 flex items-center gap-1">
              <MapPin className="h-3 w-3" /> Location
            </label>
            <select
              value={filterLocation}
              onChange={(e) => setFilterLocation(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            >
              <option value="">All Locations</option>
              {locationOptions.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          {/* Department */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500 flex items-center gap-1">
              <Building2 className="h-3 w-3" /> Department
            </label>
            <select
              value={filterDepartment}
              onChange={(e) => setFilterDepartment(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            >
              <option value="">All Departments</option>
              {departmentOptions.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          {/* Loan Type */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500 flex items-center gap-1">
              <FileText className="h-3 w-3" /> Loan Type
            </label>
            <select
              value={filterLoanType}
              onChange={(e) => setFilterLoanType(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            >
              <option value="">All Loan Types</option>
              {loanTypeOptions.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          {/* Category */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500 flex items-center gap-1">
              <Star className="h-3 w-3" /> Category
            </label>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            >
              <option value="">All Categories</option>
              {categoryOptions.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          {/* Position / Rank */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-500 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Position
            </label>
            <select
              value={filterPosition}
              onChange={(e) => setFilterPosition(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            >
              <option value="">All Positions</option>
              {positionOptions.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>
        {activeFilterCount > 0 && (
          <div className="px-4 pb-3 flex flex-wrap gap-2">
            {filterLocation && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700">
                <MapPin className="h-2.5 w-2.5" />{filterLocation}
                <button onClick={() => setFilterLocation("")} className="ml-0.5 hover:text-red-500"><X className="h-2.5 w-2.5" /></button>
              </span>
            )}
            {filterDepartment && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-xs font-semibold text-blue-700">
                <Building2 className="h-2.5 w-2.5" />{filterDepartment}
                <button onClick={() => setFilterDepartment("")} className="ml-0.5 hover:text-red-500"><X className="h-2.5 w-2.5" /></button>
              </span>
            )}
            {filterLoanType && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-700">
                <FileText className="h-2.5 w-2.5" />{filterLoanType}
                <button onClick={() => setFilterLoanType("")} className="ml-0.5 hover:text-red-500"><X className="h-2.5 w-2.5" /></button>
              </span>
            )}
            {filterCategory && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-50 border border-violet-200 text-xs font-semibold text-violet-700">
                <Star className="h-2.5 w-2.5" />{filterCategory}
                <button onClick={() => setFilterCategory("")} className="ml-0.5 hover:text-red-500"><X className="h-2.5 w-2.5" /></button>
              </span>
            )}
            {filterPosition && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-300 text-xs font-semibold text-slate-700">
                <CheckCircle2 className="h-2.5 w-2.5" />{filterPosition}
                <button onClick={() => setFilterPosition("")} className="ml-0.5 hover:text-red-500"><X className="h-2.5 w-2.5" /></button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Approved", value: totalApproved.toString(), sub: "All time", icon: CheckCircle2, color: "emerald" },
          { label: "Total Value", value: `GHc ${(totalAmount / 1000).toFixed(0)}k`, sub: "All approvals", icon: TrendingUp, color: "blue" },
          { label: "This Month", value: thisMonthCount.toString(), sub: "Loans approved", icon: Calendar, color: "amber" },
          { label: "Top Location", value: topLocation, sub: byLocation[0]?.count ? `${byLocation[0].count} loans` : "", icon: MapPin, color: "violet" },
        ].map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className={cn(
            "rounded-2xl border p-5 bg-white shadow-sm",
            color === "emerald" && "border-emerald-200",
            color === "blue" && "border-blue-200",
            color === "amber" && "border-amber-200",
            color === "violet" && "border-violet-200",
          )}>
            <div className={cn(
              "h-9 w-9 rounded-xl flex items-center justify-center mb-3",
              color === "emerald" && "bg-emerald-100",
              color === "blue" && "bg-blue-100",
              color === "amber" && "bg-amber-100",
              color === "violet" && "bg-violet-100",
            )}>
              <Icon className={cn(
                "h-5 w-5",
                color === "emerald" && "text-emerald-600",
                color === "blue" && "text-blue-600",
                color === "amber" && "text-amber-600",
                color === "violet" && "text-violet-600",
              )} />
            </div>
            <div className="text-2xl font-black text-slate-900 tabular-nums truncate">{value}</div>
            <div className="text-xs font-semibold text-slate-500 mt-0.5">{label}</div>
            {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
          </div>
        ))}
      </div>

      {/* View selector + export */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-1.5 bg-white rounded-xl border border-slate-200 p-1 shadow-sm">
          {([
            { key: "month", label: "By Month", icon: Calendar },
            { key: "quarter", label: "By Quarter", icon: TrendingUp },
            { key: "location", label: "By Location", icon: MapPin },
            { key: "type", label: "By Loan Type", icon: BarChart3 },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setAnalyticsView(key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                analyticsView === key ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="border-slate-300 text-slate-700 hover:bg-slate-50 gap-2"
          onClick={() => exportToCSV(filteredLoans, `md-approved-loans-analytics-${new Date().toISOString().slice(0, 10)}.csv`)}
        >
          <FileDown className="h-4 w-4" />
          Export Data
        </Button>
      </div>

      {/* Main Bar Chart */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-bold text-slate-900 text-base">
              {analyticsView === "month" && "Approved Loans — Monthly Trend"}
              {analyticsView === "quarter" && "Approved Loans — Quarterly Summary"}
              {analyticsView === "location" && "Approved Loans — By Location"}
              {analyticsView === "type" && "Approved Loans — By Loan Type"}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Count of MD-approved loans</p>
          </div>
        </div>
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-slate-400 text-sm">No data available</div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: "10px", border: "1px solid #e2e8f0", fontSize: 12 }}
                formatter={(value: any, name: string) => [value, name === "count" ? "Loans Approved" : "Amount (GHc 000s)"]}
              />
              <Bar dataKey="count" fill="#10b981" radius={[6, 6, 0, 0]} name="count" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Two side-by-side charts: Pie (loan type) + Line (monthly amount) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pie — loan type distribution */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="font-bold text-slate-900 text-sm mb-1">Loan Type Distribution</h3>
          <p className="text-xs text-slate-500 mb-4">Share of approvals by type</p>
          {byType.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-slate-400 text-sm">No data</div>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie data={byType} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={60} strokeWidth={2} stroke="#fff">
                    {byType.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: "8px", fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5 min-w-0">
                {byType.slice(0, 6).map((t, i) => (
                  <div key={t.name} className="flex items-center gap-2 text-xs">
                    <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <span className="text-slate-700 truncate flex-1">{t.name}</span>
                    <span className="font-bold text-slate-900 tabular-nums">{t.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Line — monthly value trend */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="font-bold text-slate-900 text-sm mb-1">Monthly Value Trend</h3>
          <p className="text-xs text-slate-500 mb-4">Total approved amount (GHc 000s)</p>
          {byMonth.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-slate-400 text-sm">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={byMonth} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: "8px", fontSize: 11 }} formatter={(v: any) => [`GHc ${v}k`, "Amount"]} />
                <Line type="monotone" dataKey="amount" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3, fill: "#3b82f6" }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Location breakdown table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Location Breakdown</h3>
            <p className="text-xs text-slate-500 mt-0.5">Approvals by office / branch</p>
          </div>
          <MapPin className="h-4 w-4 text-slate-400" />
        </div>
        <div className="divide-y divide-slate-100">
          {byLocation.length === 0 ? (
            <div className="px-6 py-8 text-center text-slate-400 text-sm">No location data</div>
          ) : byLocation.map((loc, i) => {
            const pct = totalApproved > 0 ? Math.round((loc.count / totalApproved) * 100) : 0
            return (
              <div key={loc.name} className="flex items-center gap-4 px-6 py-3.5">
                <span className="text-xs font-mono text-slate-400 w-5 text-center">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-semibold text-slate-800 truncate">{loc.name}</span>
                    <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                      <span className="text-xs text-slate-500 tabular-nums">GHc {loc.amount}k</span>
                      <span className="text-xs font-bold text-slate-900 tabular-nums w-8 text-right">{loc.count}</span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
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
  const [allStampedMemos, setAllStampedMemos] = useState<Loan[]>([])
  const [loadingStamped, setLoadingStamped] = useState(false)

  // Filter state (for stamped memos tab — 5 dimensions)
  const [filterLocation, setFilterLocation] = useState("")
  const [filterDepartment, setFilterDepartment] = useState("")
  const [filterMonth, setFilterMonth] = useState("")
  const [filterLoanType, setFilterLoanType] = useState("")
  const [filterCategory, setFilterCategory] = useState("")
  const [showFilters, setShowFilters] = useState(false)

  const fetchApprovedLoans = useCallback(async () => {
    setLoadingApproved(true)
    try {
      const res = await fetch("/api/loan/md-approve?view=approved")
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Server error ${res.status}`)
      }
      const data = await res.json()
      setApprovedLoans(data.loans || [])
    } catch (err) {
      toast({ title: "Error loading approved loans", description: err instanceof Error ? err.message : "Please try refreshing.", variant: "destructive" })
    } finally {
      setLoadingApproved(false)
    }
  }, [toast])

  const fetchStampedMemos = useCallback(async () => {
    setLoadingStamped(true)
    try {
      const res = await fetch("/api/loan/md-approve?view=approved")
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Server error ${res.status}`)
      }
      const data = await res.json()
      setAllStampedMemos(data.loans || [])
    } catch (err) {
      toast({ title: "Error loading stamped memos", description: err instanceof Error ? err.message : "Please try refreshing.", variant: "destructive" })
    } finally {
      setLoadingStamped(false)
    }
  }, [toast])

  const downloadMemo = useCallback(async (loan: Loan) => {
    setDownloadingMemoId(loan.id)
    try {
      const linkRes = await fetch("/api/loan/memo-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: loan.id }),
      })
      const linkData = await linkRes.json()
      if (!linkRes.ok) throw new Error(linkData.error || "Failed to generate memo link")
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
    if (activeTab === "stamped" || activeTab === "analytics") {
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

  // Derive filter options from stamped memos
  const locationOptions = useMemo(() => {
    const set = new Set<string>()
    allStampedMemos.forEach((l) => { if (l.staff_location_name) set.add(l.staff_location_name) })
    return Array.from(set).sort()
  }, [allStampedMemos])

  const departmentOptions = useMemo(() => {
    const set = new Set<string>()
    allStampedMemos.forEach((l) => { if (l.departments?.name) set.add(l.departments.name) })
    return Array.from(set).sort()
  }, [allStampedMemos])

  const monthOptions = useMemo(() => {
    const set = new Set<string>()
    allStampedMemos.forEach((l) => { if (l.md_approved_at) set.add(getMonthKey(l.md_approved_at)) })
    return Array.from(set).sort().reverse().map((k) => ({ key: k, label: getMonthLabel(k) }))
  }, [allStampedMemos])

  const loanTypeOptions = useMemo(() => {
    const set = new Set<string>()
    allStampedMemos.forEach((l) => { if (l.loan_type_label) set.add(l.loan_type_label) })
    return Array.from(set).sort()
  }, [allStampedMemos])

  const categoryOptions = useMemo(() => {
    const set = new Set<string>()
    allStampedMemos.forEach((l) => { if (l.loan_category) set.add(l.loan_category) })
    return Array.from(set).sort()
  }, [allStampedMemos])

  // Filtered stamped memos — 5 dimensions
  const filteredStampedMemos = useMemo(() => {
    return allStampedMemos.filter((l) => {
      if (filterLocation && l.staff_location_name !== filterLocation) return false
      if (filterDepartment && l.departments?.name !== filterDepartment) return false
      if (filterMonth && l.md_approved_at && getMonthKey(l.md_approved_at) !== filterMonth) return false
      if (filterLoanType && l.loan_type_label !== filterLoanType) return false
      if (filterCategory && l.loan_category !== filterCategory) return false
      return true
    })
  }, [allStampedMemos, filterLocation, filterDepartment, filterMonth, filterLoanType, filterCategory])

  const activeFilterCount = [filterLocation, filterDepartment, filterMonth, filterLoanType, filterCategory].filter(Boolean).length

  const clearFilters = () => {
    setFilterLocation("")
    setFilterDepartment("")
    setFilterMonth("")
    setFilterLoanType("")
    setFilterCategory("")
  }

  // Derived KPIs for header
  const totalStampedValue = useMemo(() =>
    allStampedMemos.reduce((s, l) => s + (l.fixed_amount || l.requested_amount || 0), 0),
  [allStampedMemos])

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Executive Header ───────────────────────────────────────────────── */}
      <div className="bg-slate-900 text-white border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between gap-6 flex-wrap">
            {/* Identity */}
            <div className="flex items-center gap-4">
              <div className="relative flex-shrink-0">
                <Avatar className="h-14 w-14 ring-2 ring-amber-400/50 shadow-lg">
                  <AvatarImage src={profile.profile_image_url || ""} />
                  <AvatarFallback className="bg-amber-500 text-white text-lg font-black">{initials}</AvatarFallback>
                </Avatar>
                <div className="absolute -bottom-0.5 -right-0.5 bg-amber-400 rounded-full p-0.5">
                  <Star className="h-2.5 w-2.5 text-slate-900 fill-slate-900" />
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold tracking-[0.2em] uppercase text-amber-400 mb-0.5">Managing Director</p>
                <h1 className="text-xl font-bold tracking-tight leading-none">{fullName}</h1>
                <p className="text-slate-400 text-xs mt-1">
                  {profile.departments?.name || "QCC Head Office"} &mdash; Loan Approval Command
                </p>
              </div>
            </div>

            {/* KPI tiles */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 min-w-[90px] text-center">
                <div className="text-2xl font-black text-amber-400 tabular-nums leading-none">{totalPending}</div>
                <div className="text-xs text-slate-400 mt-1 font-medium">Awaiting</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 min-w-[90px] text-center">
                <div className="text-2xl font-black text-sky-400 tabular-nums leading-none">{grouped.today.length}</div>
                <div className="text-xs text-slate-400 mt-1 font-medium">Today</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 min-w-[90px] text-center">
                <div className="text-2xl font-black text-emerald-400 tabular-nums leading-none">{allStampedMemos.length}</div>
                <div className="text-xs text-slate-400 mt-1 font-medium">Total Approved</div>
              </div>
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 min-w-[120px] text-center">
                <div className="text-lg font-black text-emerald-300 tabular-nums leading-none">
                  {totalStampedValue >= 1000
                    ? `GHc ${(totalStampedValue / 1000).toFixed(1)}k`
                    : `GHc ${totalStampedValue.toLocaleString("en-GH")}`}
                </div>
                <div className="text-xs text-slate-400 mt-1 font-medium">Total Value</div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => { fetchLoans(); fetchStampedMemos() }}
                disabled={loading || loadingStamped}
                className="text-slate-400 hover:text-white hover:bg-white/10 rounded-xl h-11 w-11"
                title="Refresh all data"
              >
                <RefreshCw className={cn("h-4 w-4", (loading || loadingStamped) && "animate-spin")} />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-5">

        {/* ── Tab bar ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-1.5 bg-white rounded-xl border border-slate-200 p-1.5 shadow-sm w-full">
          <button
            onClick={() => setActiveTab("pending")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all flex-1 justify-center",
              activeTab === "pending"
                ? "bg-amber-500 text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
            )}
          >
            <Clock className="h-4 w-4 flex-shrink-0" />
            <span>Pending Approvals</span>
            {pendingLoans.length > 0 && (
              <span className={cn(
                "text-xs rounded-full px-2 py-0.5 tabular-nums font-bold ml-0.5",
                activeTab === "pending" ? "bg-white/25 text-white" : "bg-amber-100 text-amber-700"
              )}>
                {pendingLoans.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("stamped")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all flex-1 justify-center",
              activeTab === "stamped"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
            )}
          >
            <Stamp className="h-4 w-4 flex-shrink-0" />
            <span>MD Approved Memos</span>
            {allStampedMemos.length > 0 && (
              <span className={cn(
                "text-xs rounded-full px-2 py-0.5 tabular-nums font-bold ml-0.5",
                activeTab === "stamped" ? "bg-white/25 text-white" : "bg-emerald-100 text-emerald-700"
              )}>
                {allStampedMemos.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("analytics")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all flex-1 justify-center whitespace-nowrap",
              activeTab === "analytics"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
            )}
          >
            <TrendingUp className="h-4 w-4 flex-shrink-0" />
            <span>Executive Analytics</span>
          </button>
        </div>

        {/* ── ANALYTICS TAB ─────────────────────────────────────────────────── */}
        {activeTab === "analytics" && (
          loadingStamped ? (
            <div className="flex items-center justify-center py-20 gap-3">
              <Loader2 className="h-7 w-7 text-blue-500 animate-spin" />
              <p className="text-slate-500 text-sm font-medium">Loading analytics...</p>
            </div>
          ) : (
            <AnalyticsTab loans={allStampedMemos} />
          )
        )}

        {/* ── STAMPED MEMOS TAB ─────────────────────────────────────────────── */}
        {activeTab === "stamped" && (
          <div className="space-y-4">
            {/* ── Filter panel (always visible) ─────────────────────────────── */}
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-slate-400" />
                  <span className="text-sm font-semibold text-slate-700">Filter Memos</span>
                  {activeFilterCount > 0 && (
                    <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-emerald-600 text-white text-xs font-bold">
                      {activeFilterCount}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 font-medium tabular-nums">
                    {filteredStampedMemos.length} of {allStampedMemos.length} records
                  </span>
                  {activeFilterCount > 0 && (
                    <button
                      onClick={clearFilters}
                      className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-red-600 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />Clear
                    </button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-slate-200 text-slate-600 hover:bg-slate-50 gap-1.5 h-8 text-xs"
                    onClick={() => exportToCSV(filteredStampedMemos, `md-approved-loans-${new Date().toISOString().slice(0, 10)}.csv`)}
                    disabled={filteredStampedMemos.length === 0}
                  >
                    <FileDown className="h-3.5 w-3.5" />
                    Export CSV
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 p-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1">
                    <MapPin className="h-3 w-3" />Location
                  </label>
                  <select
                    value={filterLocation}
                    onChange={(e) => setFilterLocation(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">All Locations</option>
                    {locationOptions.map((loc) => <option key={loc} value={loc}>{loc}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1">
                    <Building2 className="h-3 w-3" />Department
                  </label>
                  <select
                    value={filterDepartment}
                    onChange={(e) => setFilterDepartment(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">All Departments</option>
                    {departmentOptions.map((dept) => <option key={dept} value={dept}>{dept}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1">
                    <FileText className="h-3 w-3" />Loan Type
                  </label>
                  <select
                    value={filterLoanType}
                    onChange={(e) => setFilterLoanType(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">All Loan Types</option>
                    {loanTypeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1">
                    <Calendar className="h-3 w-3" />Month
                  </label>
                  <select
                    value={filterMonth}
                    onChange={(e) => setFilterMonth(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">All Months</option>
                    {monthOptions.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1">
                    <Star className="h-3 w-3" />Category
                  </label>
                  <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">All Categories</option>
                    {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {loadingStamped ? (
              <div className="flex items-center justify-center py-20 gap-3">
                <Loader2 className="h-7 w-7 text-emerald-500 animate-spin" />
                <p className="text-slate-500 text-sm font-medium">Loading stamped memos...</p>
              </div>
            ) : filteredStampedMemos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4 rounded-2xl border border-slate-200 bg-white">
                <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center">
                  <Stamp className="h-8 w-8 text-slate-400" />
                </div>
                <div className="text-center">
                  <h3 className="font-bold text-slate-700 text-base">
                    {activeFilterCount > 0 ? "No results match your filters" : "No stamped memos yet"}
                  </h3>
                  <p className="text-slate-400 text-sm mt-1">
                    {activeFilterCount > 0 ? "Try adjusting or clearing your filters." : "Memos you approve will appear here for download and printing."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                {/* Table header */}
                <div className="grid grid-cols-[1fr_160px_140px_130px_110px] gap-4 px-5 py-3 border-b border-slate-100 bg-slate-50">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Staff / Loan</span>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Location</span>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Department</span>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide text-right">Amount</span>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide text-right">Actions</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {filteredStampedMemos.map((memo) => {
                    const approvedDate = memo.md_approved_at
                      ? new Date(memo.md_approved_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                      : "—"
                    const rawAmount = memo.fixed_amount || memo.requested_amount || 0
                    const amountFmt = rawAmount
                      ? `GHc ${Number(rawAmount).toLocaleString("en-GH", { minimumFractionDigits: 2 })}`
                      : "—"
                    const memoProfile = memo.user_profiles
                    const memoStaffName =
                      memo.staff_full_name?.trim() ||
                      (`${memoProfile?.first_name || ""} ${memoProfile?.last_name || ""}`.trim()) ||
                      "Unknown Staff"
                    const memoStaffNo = memo.staff_number || memoProfile?.employee_id || "—"
                    const memoInitials = memoStaffName !== "Unknown Staff"
                      ? memoStaffName.split(" ").map((p: string) => p[0]).join("").toUpperCase().slice(0, 2)
                      : "?"
                    return (
                      <div key={memo.id} className="grid grid-cols-[1fr_160px_140px_130px_110px] gap-4 px-5 py-4 items-center hover:bg-slate-50/70 transition-colors group">
                        {/* Staff + Loan info */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-9 w-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-xs flex-shrink-0 ring-2 ring-white">
                            {memoInitials}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-slate-900 text-sm truncate">{memoStaffName}</span>
                              <span className="text-xs text-slate-400 font-mono flex-shrink-0">#{memoStaffNo}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className="text-xs text-slate-500">{memo.loan_type_label || "Memo"}</span>
                              <span className="text-slate-300">·</span>
                              <span className="text-xs font-mono text-slate-400">{memo.request_number}</span>
                              <span className="text-slate-300">·</span>
                              <span className="text-xs text-slate-400">{approvedDate}</span>
                            </div>
                          </div>
                        </div>
                        {/* Location */}
                        <div className="text-sm text-slate-600 flex items-center gap-1.5 truncate">
                          {memo.staff_location_name ? (
                            <>
                              <MapPin className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                              <span className="truncate">{memo.staff_location_name}</span>
                            </>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </div>
                        {/* Department */}
                        <div className="text-sm text-slate-600 flex items-center gap-1.5 truncate">
                          {memo.departments?.name ? (
                            <>
                              <Building2 className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                              <span className="truncate">{memo.departments.name}</span>
                            </>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </div>
                        {/* Amount */}
                        <div className="text-right">
                          <span className="text-sm font-bold text-emerald-700 tabular-nums">{amountFmt}</span>
                        </div>
                        {/* Actions */}
                        <div className="flex items-center justify-end gap-1.5 flex-shrink-0">
                          <a
                            href={`/api/loan/memo/${memo.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors"
                            title="Download memo PDF"
                          >
                            <Download className="h-3.5 w-3.5" />
                            Download
                          </a>
                          <a
                            href={`/api/loan/memo/${memo.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => {
                              e.preventDefault()
                              const w = window.open(`/api/loan/memo/${memo.id}`, "_blank")
                              w?.addEventListener("load", () => w.print())
                            }}
                            className="inline-flex items-center justify-center p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors"
                            title="Print memo"
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {/* Table footer */}
                <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50">
                  <span className="text-xs text-slate-400">
                    Showing <span className="font-semibold text-slate-600">{filteredStampedMemos.length}</span> of{" "}
                    <span className="font-semibold text-slate-600">{allStampedMemos.length}</span> approved memos
                  </span>
                  <span className="text-xs font-semibold text-emerald-700 tabular-nums">
                    Total: GHc{" "}
                    {filteredStampedMemos
                      .reduce((s, l) => s + (l.fixed_amount || l.requested_amount || 0), 0)
                      .toLocaleString("en-GH", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── PENDING APPROVALS TAB ──────────────────────────────────────────── */}
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
                    <div className="font-bold text-base">{selectedCount} loan{selectedCount > 1 ? "s" : ""} selected</div>
                    <div className="text-xs text-slate-400">Ready for MD approval stamp</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} className="text-slate-400 hover:text-white hover:bg-white/10">
                    Clear
                  </Button>
                  <Button
                    onClick={handleApprove}
                    disabled={isApproving}
                    className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold px-6 shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 transition-all"
                  >
                    {isApproving ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Stamping...</>
                    ) : (
                      <><Stamp className="h-4 w-4 mr-2" />Approve All</>
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
                  <button onClick={() => setShowApprovedRecently(false)} className="text-xs text-emerald-600 hover:text-emerald-800 font-medium">
                    Dismiss
                  </button>
                </div>
                <div className="space-y-2">
                  {recentlyApprovedLoans.map((l) => (
                    <div key={l.id} className="flex items-center justify-between text-sm bg-white rounded-lg px-3 py-2 border border-emerald-100">
                      <div>
                        <span className="text-emerald-800 font-medium">{l.staff_full_name} &mdash; {l.loan_type_label}</span>
                        <span className="block font-mono text-emerald-600 text-xs mt-0.5">{l.request_number}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 ml-3 flex-shrink-0"
                        onClick={() => downloadMemo(l)}
                        disabled={downloadingMemoId === l.id}
                      >
                        {downloadingMemoId === l.id ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}
                        Download Stamped Memo
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {loading && (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <Loader2 className="h-8 w-8 text-amber-500 animate-spin" />
                <p className="text-slate-500 text-sm font-medium">Loading pending approvals...</p>
              </div>
            )}

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

            {!loading && (
              <div className="space-y-4">
                {grouped.today.length > 0 && (
                  <div className="flex items-center gap-3 mb-2">
                    <Clock className="h-4 w-4 text-amber-500" />
                    <h2 className="text-sm font-bold text-slate-600 uppercase tracking-wider">Received Today</h2>
                  </div>
                )}
                <PeriodSection title="Today" loans={grouped.today} selected={selected} onToggle={toggleSelect} onSelectAll={toggleSelectAll} approvedIds={approvedIds} defaultOpen={true} />
                {grouped.week.length > 0 && (
                  <div className="flex items-center gap-3 mb-2 mt-6">
                    <Calendar className="h-4 w-4 text-slate-400" />
                    <h2 className="text-sm font-bold text-slate-600 uppercase tracking-wider">This Week</h2>
                  </div>
                )}
                <PeriodSection title="This Week" loans={grouped.week} selected={selected} onToggle={toggleSelect} onSelectAll={toggleSelectAll} approvedIds={approvedIds} defaultOpen={true} />
                {grouped.month.length > 0 && (
                  <div className="flex items-center gap-3 mb-2 mt-6">
                    <TrendingUp className="h-4 w-4 text-slate-400" />
                    <h2 className="text-sm font-bold text-slate-600 uppercase tracking-wider">Earlier This Month</h2>
                  </div>
                )}
                <PeriodSection title="Earlier This Month" loans={grouped.month} selected={selected} onToggle={toggleSelect} onSelectAll={toggleSelectAll} approvedIds={approvedIds} defaultOpen={false} />
                <PeriodSection title="Older" loans={grouped.older} selected={selected} onToggle={toggleSelect} onSelectAll={toggleSelectAll} approvedIds={approvedIds} defaultOpen={false} />
              </div>
            )}

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
