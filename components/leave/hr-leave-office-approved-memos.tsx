"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Download,
  Calendar,
  Users,
  CheckCircle,
  FileText,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  Filter,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface ApprovedMemoGroup {
  month: string          // "2026-07"
  monthLabel: string     // "July 2026"
  category: string       // "Junior" | "Senior" | "Manager"
  staffCount: number
  signerName: string
  memoIds: string[]
  memos: {
    id: string
    staff_name: string
    staff_number: string
    leave_period_start: string
    approved_days: number
    status: string
    signer_name: string
    staff_category: string
    location?: string
  }[]
}

const CATEGORY_STYLE: Record<string, { badge: string; border: string; header: string }> = {
  Junior:  { badge: "bg-emerald-100 text-emerald-800 border-emerald-200",  border: "border-l-4 border-l-emerald-500",  header: "bg-emerald-50" },
  Senior:  { badge: "bg-blue-100 text-blue-800 border-blue-200",           border: "border-l-4 border-l-blue-500",      header: "bg-blue-50"   },
  Manager: { badge: "bg-orange-100 text-orange-800 border-orange-200",     border: "border-l-4 border-l-orange-500",    header: "bg-orange-50" },
}

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
]

function fmtMonthLabel(ym: string): string {
  if (!ym) return ""
  const [y, m] = ym.split("-")
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`
}

export function HrLeaveOfficeApprovedMemos() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [groups, setGroups] = useState<ApprovedMemoGroup[]>([])
  const [filterMonth, setFilterMonth] = useState("")
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [downloadingGroup, setDownloadingGroup] = useState<string | null>(null)
  const [downloadingAll, setDownloadingAll] = useState<string | null>(null)
  const [downloadingAllGroups, setDownloadingAllGroups] = useState(false)

  const fetchApprovedMemos = useCallback(async () => {
    setLoading(true)
    try {
      const url = filterMonth
        ? `/api/leave/payment-advice/approved-memos?month=${filterMonth}`
        : `/api/leave/payment-advice/approved-memos`
      const res = await fetch(url, { cache: "no-store" })
      if (!res.ok) throw new Error("Failed to load approved memos")
      const data = await res.json()
      const memos: any[] = data.memos || data || []

      // Group by month + staff_category
      const map: Record<string, ApprovedMemoGroup> = {}
      for (const memo of memos) {
        const body = typeof memo.memo_body === "string"
          ? JSON.parse(memo.memo_body || "{}")
          : (memo.memo_body || {})
        const rawCategory =
          memo.staff_category || body.staff_rank_label || body.category || "Junior"
        const category =
          rawCategory.toLowerCase().includes("manager") ? "Manager"
          : rawCategory.toLowerCase().includes("senior") ? "Senior"
          : "Junior"

        const createdAt = memo.created_at || memo.updated_at || ""
        const ym = createdAt ? createdAt.slice(0, 7) : "unknown"
        const key = `${ym}||${category}`

        if (!map[key]) {
          map[key] = {
            month: ym,
            monthLabel: fmtMonthLabel(ym),
            category,
            staffCount: 0,
            signerName: memo.signer_name || "",
            memoIds: [],
            memos: [],
          }
        }
        map[key].staffCount += 1
        map[key].memoIds.push(memo.id)
        map[key].memos.push({
          id: memo.id,
          staff_name: memo.staff_name || "",
          staff_number: memo.staff_number || "",
          leave_period_start: memo.leave_period_start || "",
          approved_days: memo.approved_days || 0,
          status: memo.status || "",
          signer_name: memo.signer_name || "",
          staff_category: category,
          location: body.staff_location_name || "",
        })
        if (memo.signer_name && !map[key].signerName) {
          map[key].signerName = memo.signer_name
        }
      }

      // Sort by month descending
      const sorted = Object.values(map).sort((a, b) => b.month.localeCompare(a.month))
      setGroups(sorted)
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [filterMonth, toast])

  useEffect(() => { fetchApprovedMemos() }, [fetchApprovedMemos])

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const downloadSingleMemo = async (memoId: string, staffName: string) => {
    try {
      const res = await fetch(`/api/leave/payment-advice/download?memoId=${memoId}`)
      if (!res.ok) throw new Error("Download failed")
      const blob = await res.blob()
      const cd = res.headers.get("content-disposition") || ""
      const match = cd.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
      const filename = match?.[1]?.replace(/['"]/g, "") ?? `payment-advice-${memoId}.pdf`
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      toast({ title: "Download failed", description: err.message, variant: "destructive" })
    }
  }

  const downloadGroupAll = async (group: ApprovedMemoGroup) => {
    const key = `${group.month}||${group.category}`
    setDownloadingGroup(key)
    try {
      let downloaded = 0
      for (const memo of group.memos) {
        await downloadSingleMemo(memo.id, memo.staff_name)
        downloaded++
        await new Promise(r => setTimeout(r, 350)) // slight delay between files
      }
      toast({
        title: "Download complete",
        description: `Downloaded ${downloaded} memo(s) for ${group.category} Staff – ${group.monthLabel}`,
      })
    } finally {
      setDownloadingGroup(null)
    }
  }

  const downloadMonthAll = async (monthGroups: ApprovedMemoGroup[], monthLabel: string) => {
    const key = monthGroups[0]?.month
    setDownloadingAll(key)
    try {
      let total = 0
      for (const group of monthGroups) {
        for (const memo of group.memos) {
          await downloadSingleMemo(memo.id, memo.staff_name)
          total++
          await new Promise(r => setTimeout(r, 350))
        }
      }
      toast({
        title: "Download complete",
        description: `Downloaded all ${total} memo(s) for ${monthLabel}`,
      })
    } finally {
      setDownloadingAll(null)
    }
  }

  const downloadAllGroupsFunc = async () => {
    setDownloadingAllGroups(true)
    try {
      let total = 0
      for (const group of groups) {
        for (const memo of group.memos) {
          await downloadSingleMemo(memo.id, memo.staff_name)
          total++
          await new Promise(r => setTimeout(r, 350))
        }
      }
      toast({
        title: "Download complete",
        description: `Downloaded all ${total} approved memo(s) from all months`,
      })
    } finally {
      setDownloadingAllGroups(false)
    }
  }

  // Group groups by month for the month-level view
  const byMonth: Record<string, ApprovedMemoGroup[]> = {}
  for (const g of groups) {
    if (!byMonth[g.month]) byMonth[g.month] = []
    byMonth[g.month].push(g)
  }
  const months = Object.keys(byMonth).sort((a, b) => b.localeCompare(a))

  const totalMemos = groups.reduce((s, g) => s + g.staffCount, 0)

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-800">Approved Payment Advice Memos</h3>
          <p className="text-sm text-slate-500 mt-0.5">
            {totalMemos > 0
              ? `${totalMemos} approved memo${totalMemos !== 1 ? "s" : ""} across ${months.length} month${months.length !== 1 ? "s" : ""}`
              : "All payment advice memos approved by HR Executive, ready to download"}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Filter className="h-4 w-4 text-slate-400" />
            <Input
              type="month"
              value={filterMonth}
              onChange={e => setFilterMonth(e.target.value)}
              className="w-38 h-8 text-sm"
            />
            {filterMonth && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={() => setFilterMonth("")}
              >
                Clear
              </Button>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchApprovedMemos}
            disabled={loading}
            className="h-8 gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Action buttons bar */}
      {!loading && totalMemos > 0 && (
        <div className="flex flex-col sm:flex-row gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <a
            href="/dashboard/leave-management?tab=my-requests"
            className="flex-1"
          >
            <Button className="w-full bg-teal-600 hover:bg-teal-700 text-white gap-2">
              <Calendar className="h-4 w-4" />
              Apply for Leave
            </Button>
          </a>
          <Button
            onClick={downloadAllGroupsFunc}
            disabled={downloadingAllGroups}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
          >
            {downloadingAllGroups
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Downloading...</>
              : <><Download className="h-4 w-4" /> Download All ({totalMemos})</>
            }
          </Button>
        </div>
      )}
    </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12 text-slate-500 gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading approved memos...</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && groups.length === 0 && (
        <div className="flex flex-col items-center justify-center py-14 text-center text-slate-500 gap-3">
          <FileText className="h-10 w-10 text-slate-300" />
          <p className="font-medium text-slate-600">No approved memos found</p>
          <p className="text-sm max-w-xs">
            {filterMonth
              ? `No approved payment advice memos for ${fmtMonthLabel(filterMonth)}.`
              : "Once HR Executive approves your submitted payment advice memos they will appear here."}
          </p>
        </div>
      )}

      {/* Month sections */}
      {!loading && months.map(month => {
        const monthGroups = byMonth[month]
        const monthLabel = monthGroups[0].monthLabel
        const monthTotal = monthGroups.reduce((s, g) => s + g.staffCount, 0)
        const isDownloadingThisMonth = downloadingAll === month

        return (
          <Card key={month} className="overflow-hidden border-slate-200 shadow-sm">
            {/* Month header */}
            <div className="flex items-center justify-between px-5 py-3.5 bg-slate-800">
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-slate-300" />
                <span className="font-semibold text-white text-sm">{monthLabel}</span>
                <Badge className="bg-slate-600 text-slate-200 text-xs border-0">
                  {monthTotal} staff member{monthTotal !== 1 ? "s" : ""}
                </Badge>
              </div>
              <Button
                size="sm"
                onClick={() => downloadMonthAll(monthGroups, monthLabel)}
                disabled={isDownloadingThisMonth}
                className="h-7 gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs border-0"
              >
                {isDownloadingThisMonth
                  ? <><Loader2 className="h-3 w-3 animate-spin" /> Downloading...</>
                  : <><Download className="h-3 w-3" /> Download All ({monthTotal})</>
                }
              </Button>
            </div>

            <CardContent className="p-0 divide-y divide-slate-100">
              {monthGroups.map(group => {
                const key = `${group.month}||${group.category}`
                const isExpanded = expandedGroups.has(key)
                const isDownloading = downloadingGroup === key
                const style = CATEGORY_STYLE[group.category] || CATEGORY_STYLE.Junior

                return (
                  <div key={key} className={`${style.border}`}>
                    {/* Group row */}
                    <div className={`flex items-center justify-between px-5 py-3 ${style.header}`}>
                      <div className="flex items-center gap-3 min-w-0">
                        <Users className="h-4 w-4 text-slate-500 shrink-0" />
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-slate-800 text-sm">
                            {group.category} Staff
                          </span>
                          <Badge variant="outline" className={`text-xs ${style.badge}`}>
                            {group.staffCount} member{group.staffCount !== 1 ? "s" : ""}
                          </Badge>
                          {group.signerName && (
                            <span className="text-xs text-slate-500">
                              Signed by: <span className="font-medium text-slate-700">{group.signerName}</span>
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => downloadGroupAll(group)}
                          disabled={isDownloading}
                          className="h-7 gap-1.5 text-xs"
                        >
                          {isDownloading
                            ? <><Loader2 className="h-3 w-3 animate-spin" /> Downloading...</>
                            : <><Download className="h-3 w-3" /> Download All ({group.staffCount})</>
                          }
                        </Button>
                        <button
                          onClick={() => toggleGroup(key)}
                          className="p-1 rounded hover:bg-slate-200 text-slate-500 transition-colors"
                          aria-label={isExpanded ? "Collapse" : "Expand"}
                        >
                          {isExpanded
                            ? <ChevronUp className="h-4 w-4" />
                            : <ChevronDown className="h-4 w-4" />
                          }
                        </button>
                      </div>
                    </div>

                    {/* Expanded staff list */}
                    {isExpanded && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                              <th className="text-left px-5 py-2 text-slate-600 font-semibold">Name</th>
                              <th className="text-left px-3 py-2 text-slate-600 font-semibold">Staff No.</th>
                              <th className="text-left px-3 py-2 text-slate-600 font-semibold">Leave Date</th>
                              <th className="text-left px-3 py-2 text-slate-600 font-semibold">Days</th>
                              <th className="text-left px-3 py-2 text-slate-600 font-semibold">Status</th>
                              <th className="text-right px-5 py-2 text-slate-600 font-semibold">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {group.memos.map(memo => (
                              <tr key={memo.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-5 py-2.5 font-medium text-slate-800">
                                  {memo.staff_name}
                                </td>
                                <td className="px-3 py-2.5 text-slate-600">{memo.staff_number}</td>
                                <td className="px-3 py-2.5 text-slate-600">
                                  {memo.leave_period_start
                                    ? new Date(memo.leave_period_start).toLocaleDateString("en-GB", {
                                        day: "2-digit", month: "short", year: "numeric",
                                      })
                                    : "—"}
                                </td>
                                <td className="px-3 py-2.5 text-slate-600">{memo.approved_days}</td>
                                <td className="px-3 py-2.5">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                                    <CheckCircle className="h-3 w-3" />
                                    Approved
                                  </span>
                                </td>
                                <td className="px-5 py-2.5 text-right">
                                  <button
                                    onClick={() => downloadSingleMemo(memo.id, memo.staff_name)}
                                    className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium transition-colors"
                                  >
                                    <Download className="h-3 w-3" />
                                    Download
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
