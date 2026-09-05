"use client"

import { useEffect, useState } from "react"
import {
  Activity,
  AlertCircle,
  Baby,
  BookOpen,
  Briefcase,
  Heart,
  Loader2,
  Sun,
  TrendingUp,
  User,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface ActiveStaffEntry {
  userId: string
  staffName: string
  startDate: string
  endDate: string
  days: number
}

interface LeaveBalance {
  key: string
  label: string
  entitlement: number
  used: number
  remaining: number
  active_staff_count?: number
  active_staff_list?: ActiveStaffEntry[]
}

interface LeaveBalanceData {
  balances: LeaveBalance[]
  period: string
  showLeadershipMetrics?: boolean
  totalActiveStaff?: number
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  annual: <Sun className="h-4 w-4" />,
  sick: <Heart className="h-4 w-4" />,
  maternity: <Baby className="h-4 w-4" />,
  paternity: <User className="h-4 w-4" />,
  casual: <Briefcase className="h-4 w-4" />,
  compassionate: <AlertCircle className="h-4 w-4" />,
  study_with_pay: <BookOpen className="h-4 w-4" />,
  study_without_pay: <BookOpen className="h-4 w-4" />,
  special_unpaid: <Activity className="h-4 w-4" />,
}

const TYPE_COLOURS: Record<string, { bar: string; icon: string; badge: string }> = {
  annual: { bar: "bg-cyan-500", icon: "text-cyan-600 bg-cyan-50", badge: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  sick: { bar: "bg-rose-500", icon: "text-rose-600 bg-rose-50", badge: "bg-rose-50 text-rose-700 border-rose-200" },
  maternity: { bar: "bg-pink-500", icon: "text-pink-600 bg-pink-50", badge: "bg-pink-50 text-pink-700 border-pink-200" },
  paternity: { bar: "bg-violet-500", icon: "text-violet-600 bg-violet-50", badge: "bg-violet-50 text-violet-700 border-violet-200" },
  casual: { bar: "bg-amber-500", icon: "text-amber-600 bg-amber-50", badge: "bg-amber-50 text-amber-700 border-amber-200" },
  compassionate: { bar: "bg-orange-500", icon: "text-orange-600 bg-orange-50", badge: "bg-orange-50 text-orange-700 border-orange-200" },
  study_with_pay: { bar: "bg-emerald-500", icon: "text-emerald-600 bg-emerald-50", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  study_without_pay: { bar: "bg-teal-500", icon: "text-teal-600 bg-teal-50", badge: "bg-teal-50 text-teal-700 border-teal-200" },
  special_unpaid: { bar: "bg-slate-400", icon: "text-slate-500 bg-slate-50", badge: "bg-slate-50 text-slate-600 border-slate-200" },
}

const DEFAULT_COLOUR = { bar: "bg-blue-500", icon: "text-blue-600 bg-blue-50", badge: "bg-blue-50 text-blue-700 border-blue-200" }

function getColour(key: string) {
  return TYPE_COLOURS[key] ?? DEFAULT_COLOUR
}

interface AnnualEntitlementInfo {
  annualLeaveDays: number
  travelDays: number
  totalEntitlement: number
  tierLabel: string
  yearsOfService: number
}

export function LeaveBalanceWidget() {
  const [data, setData] = useState<LeaveBalanceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [annualEntitlement, setAnnualEntitlement] = useState<AnnualEntitlementInfo | null>(null)

  // Load the user's annual leave entitlement separately
  useEffect(() => {
    fetch("/api/leave/annual-entitlement", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.entitlement) setAnnualEntitlement(d.entitlement) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000) // 15 second timeout

    fetch("/api/leave/balance", { 
      cache: "no-store",
      signal: controller.signal 
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d) => {
        if (d.error) throw new Error(d.error)
        // Show data even if balances array is empty — user just has no usage yet
        setData({
          balances: d.balances || [],
          period: d.period || String(new Date().getFullYear()),
          showLeadershipMetrics: d.showLeadershipMetrics ?? false,
          totalActiveStaff: d.totalActiveStaff ?? 0,
        })
        setLoading(false)
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return
        console.error("[v0] LeaveBalanceWidget error:", e)
        setError(e.message || "Failed to load leave balance")
        setLoading(false)
      })

    return () => {
      clearTimeout(timeout)
      controller.abort()
    }
  }, [])

  if (loading) {
    return (
      <Card className="border-slate-200 bg-white/85 shadow-sm">
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="border-slate-200 bg-white/85 shadow-sm">
        <CardContent className="py-8 text-center text-sm text-slate-500">
          <AlertCircle className="mx-auto mb-2 h-8 w-8 text-slate-300" />
          Could not load leave balances
        </CardContent>
      </Card>
    )
  }

  if (!data || data.balances.length === 0) {
    return (
      <Card className="border-slate-200 bg-white/85 shadow-sm">
        <CardContent className="py-8 text-center text-sm text-slate-500">
          <AlertCircle className="mx-auto mb-2 h-8 w-8 text-slate-300" />
          No leave types configured for this period
        </CardContent>
      </Card>
    )
  }

  const totalUsed = data.balances.reduce((s, b) => s + b.used, 0)
  const totalEntitlement = data.balances.reduce((s, b) => s + b.entitlement, 0)

  return (
    <Card className="overflow-hidden border-0 shadow-md">
      {/* Header */}
      <div className="bg-[linear-gradient(135deg,_#0f2741_0%,_#1e3a5f_100%)] px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/10 p-2.5">
              <TrendingUp className="h-5 w-5 text-cyan-200" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-white">{data.showLeadershipMetrics ? "Leave Availability" : "Your Leave Balance"}</CardTitle>
              <p className="text-xs text-slate-300">{data.showLeadershipMetrics ? "Staff currently on approved leave" : `Period ${data.period}`}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-white">{data.showLeadershipMetrics ? Number(data.totalActiveStaff || 0) : totalUsed}</p>
            <p className="text-xs text-slate-300">{data.showLeadershipMetrics ? "staff on leave today" : `of ${totalEntitlement} days used`}</p>
            {data.showLeadershipMetrics && (
              <p className="text-[11px] text-cyan-200 mt-0.5">{Number(data.totalActiveStaff || 0)} staff currently on leave</p>
            )}
          </div>
        </div>
        {/* Overall progress bar */}
        {!data.showLeadershipMetrics && <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-cyan-400 transition-all duration-700"
            style={{ width: totalEntitlement > 0 ? `${Math.min(100, (totalUsed / totalEntitlement) * 100)}%` : "0%" }}
          />
        </div>}
      </div>

      {/* Annual leave entitlement breakdown — staff-specific based on category and service */}
      {annualEntitlement && !data.showLeadershipMetrics && (
        <div className="mx-3 mb-0 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3">
          <p className="text-xs font-semibold text-cyan-800 mb-2">Your Annual Leave Entitlement</p>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="text-xs text-cyan-700">
              <span className="text-cyan-500">Category: </span>{annualEntitlement.tierLabel}
            </div>
            <div className="text-xs text-cyan-700">
              <span className="text-cyan-500">Service: </span>{annualEntitlement.yearsOfService} yr{annualEntitlement.yearsOfService !== 1 ? "s" : ""}
            </div>
            <div className="text-xs text-cyan-700">
              <span className="text-cyan-500">Leave: </span>{annualEntitlement.annualLeaveDays}d
            </div>
            <div className="text-xs text-cyan-700">
              <span className="text-cyan-500">Travel: </span>{annualEntitlement.travelDays}d
            </div>
            <div className="ml-auto text-xs font-bold text-cyan-900">
              Total: {annualEntitlement.totalEntitlement} days
            </div>
          </div>
        </div>
      )}

      <CardContent className="p-3 sm:p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {data.balances.map((balance) => {
            const pct = balance.entitlement > 0 ? Math.min(100, (balance.used / balance.entitlement) * 100) : 0
            const col = getColour(balance.key)
            const icon = TYPE_ICONS[balance.key] ?? <Activity className="h-4 w-4" />
            const isExhausted = balance.remaining === 0 && balance.entitlement > 0

            return (
              <div
                key={balance.key}
                className="group relative overflow-hidden rounded-2xl border border-slate-100 bg-slate-50/60 p-4 transition-shadow hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className={`rounded-xl p-2 ${col.icon}`}>{icon}</div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{balance.label}</p>
                      <p className="text-xs text-slate-400">
                        {data.showLeadershipMetrics
                          ? `${balance.active_staff_count || 0} staff currently on leave`
                          : `${balance.used} used · ${balance.entitlement} total`}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge
                      variant="outline"
                      className={`shrink-0 border text-xs font-semibold ${
                        isExhausted ? "border-red-200 bg-red-50 text-red-600" : col.badge
                      }`}
                    >
                      {data.showLeadershipMetrics ? "View staff" : isExhausted ? "Exhausted" : `${balance.remaining}d left`}
                    </Badge>
                    {data.showLeadershipMetrics && (
                      <button
                        type="button"
                        onClick={() => {
                          if ((balance.active_staff_count || 0) > 0) setSelectedType(balance.key)
                        }}
                        className={`text-[11px] font-medium rounded-full px-2 py-0.5 border transition-colors ${
                          (balance.active_staff_count || 0) > 0
                            ? `${col.badge} cursor-pointer hover:opacity-80`
                            : "border-slate-200 bg-slate-50 text-slate-400 cursor-default"
                        }`}
                      >
                        {balance.active_staff_count || 0} on leave
                      </button>
                    )}
                  </div>
                </div>
                {/* Per-type progress bar */}
                {!data.showLeadershipMetrics && <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${isExhausted ? "bg-red-400" : col.bar}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>}
              </div>
            )
          })}
        </div>
      </CardContent>

      {/* Staff on leave modal */}
      {data.showLeadershipMetrics && (
        <Dialog open={Boolean(selectedType)} onOpenChange={() => setSelectedType(null)}>
          <DialogContent className="max-w-md">
            {(() => {
              const sel = data.balances.find((b) => b.key === selectedType)
              const col = selectedType ? getColour(selectedType) : DEFAULT_COLOUR
              const icon = selectedType ? (TYPE_ICONS[selectedType] ?? <Activity className="h-4 w-4" />) : null
              return (
                <>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      {icon && <span className={`rounded-lg p-1.5 ${col.icon}`}>{icon}</span>}
                      Staff on {sel?.label ?? "Leave"}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="mt-2 space-y-2 max-h-80 overflow-y-auto pr-1">
                    {(sel?.active_staff_list?.length ?? 0) === 0 ? (
                      <p className="text-sm text-slate-500 text-center py-6">No staff currently on this leave type.</p>
                    ) : (
                      sel!.active_staff_list!.map((s) => (
                        <div
                          key={s.userId}
                          className={`flex items-center justify-between rounded-xl border px-3 py-2.5 ${col.badge} border-opacity-60`}
                        >
                          <div>
                            <p className="text-sm font-semibold">{s.staffName}</p>
                            <p className="text-[11px] opacity-75">
                              {s.startDate} – {s.endDate}
                            </p>
                          </div>
                          <span className="text-xs font-bold">{s.days}d</span>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )
            })()}
          </DialogContent>
        </Dialog>
      )}
    </Card>
  )
}
