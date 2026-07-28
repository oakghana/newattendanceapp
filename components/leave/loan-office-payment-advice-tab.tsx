"use client"

import { useState, useEffect, useMemo } from "react"
import { Download, Loader2, FileText, Users, Calendar, RefreshCw, Filter } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { generateProfessionalMemoPDF, downloadMemoPDF } from "@/lib/professional-memo-generator"

interface PaymentMemo {
  id: string
  staff_id: string
  staff_name: string
  staff_number: string
  staff_category?: string
  memo_subject: string
  memo_body?: any
  leave_period_start: string
  leave_period_end: string
  approved_days: number
  travelling_days_added?: number
  status: string
  signer_name?: string
  signer_id?: string
  hr_leave_office_name?: string
  signature_data_url?: string
  created_at: string
  updated_at: string
}

interface MonthGroup {
  monthKey: string
  monthLabel: string
  totalCount: number
  categoryGroups: CategoryGroup[]
}

interface CategoryGroup {
  category: string
  signerName: string
  memos: PaymentMemo[]
}

function fmtMonth(monthKey: string): string {
  const [year, mon] = monthKey.split("-").map(Number)
  return new Date(Date.UTC(year, mon - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  })
}

function fmtDate(d?: string | null): string {
  if (!d) return "N/A"
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

function normalizeCategory(raw?: string | null): string {
  const v = String(raw || "").toLowerCase()
  if (v.includes("manager")) return "Manager Staff"
  if (v.includes("senior")) return "Senior Staff"
  return "Junior Staff"
}

async function downloadSingleMemo(memo: PaymentMemo, toast: ReturnType<typeof useToast>["toast"]) {
  try {
    const currentDate = new Date()
    const dateStr = currentDate.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })

    let signerName = "HUMAN RESOURCE MANAGER"
    let signerTitle = "HR DEPARTMENT"
    let signerSignatureUrl = ""
    let staffPosition = "Staff"
    let staffDepartment = "Department"
    let staffRank = ""
    let staffLocation = ""
    let referenceNumber = "QCC/"

    if (memo.memo_body) {
      try {
        const memoBody = typeof memo.memo_body === "string" ? JSON.parse(memo.memo_body) : memo.memo_body
        if (memoBody.selectedSigner) {
          signerName = memoBody.selectedSigner.name || signerName
          signerTitle = memoBody.selectedSigner.position || signerTitle
          signerSignatureUrl = memoBody.selectedSigner.signature_data_url || ""
        }
        // Top-level fields stored by submit-memo API
        staffPosition = memoBody.staff_position || memoBody.staffList?.[0]?.position || staffPosition
        staffDepartment = memoBody.staff_department || memoBody.staffList?.[0]?.department || staffDepartment
        staffRank = memoBody.staff_rank_label || memoBody.staffList?.[0]?.rank || ""
        staffLocation = memoBody.staff_location_name || memoBody.staffList?.[0]?.assigned_location_name || memoBody.staffList?.[0]?.location_name || ""
        if (memoBody.referenceNumber) {
          referenceNumber = memoBody.referenceNumber
        }
      } catch {}
    }
    
    // Fallback: If signature still missing, try to fetch from memo record's signature_data_url column
    if (!signerSignatureUrl && memo.signature_data_url) {
      signerSignatureUrl = memo.signature_data_url
    }



    const memoData = {
      to: "DEPUTY DIRECTOR, FINANCE",
      from: "HUMAN RESOURCE MANAGER",
      subject: `PAYMENT OF LEAVE ALLOWANCE - ${memo.staff_name || "Staff"}`,
      date: dateStr,
      refNo: referenceNumber,
      body: `We wish to inform you that the undermentioned staff member has been approved for leave payment.\n\nWe, therefore, kindly request you to process and pay their leave allowance accordingly.\n\nWe count on your co-operation.`,
      signatory: {
        name: signerName.toUpperCase(),
        title: signerTitle.toUpperCase(),
        signature_image_url: signerSignatureUrl,
      },
      ccList: ["Finance Director", "HR Department", "Internal Audit"],
      memoType: "payment" as const,
      staffList: [
        {
          no: 1,
          name: memo.staff_name || "N/A",
          employeeId: memo.staff_number || "N/A",
          position: staffPosition,
          department: staffDepartment,
          rank: staffRank || "N/A",
          location: staffLocation || "N/A",
          leaveDate: memo.leave_period_start ? new Date(memo.leave_period_start).toLocaleDateString() : "N/A",
          approved_days: memo.approved_days || 0,
          travelling_days_added: memo.travelling_days_added || 0,
          leave_period_start: memo.leave_period_start || undefined,
          leave_period_end: memo.leave_period_end || undefined,
        },
      ],
    }

    const slugName = (memo.staff_name || "staff").toLowerCase().replace(/\s+/g, "-")
    const dateSuffix = `${currentDate.getFullYear()}${String(currentDate.getMonth() + 1).padStart(2, "0")}${String(currentDate.getDate()).padStart(2, "0")}`
    const pdf = await generateProfessionalMemoPDF(memoData, `leave-payment-${slugName}.pdf`)
    await downloadMemoPDF(pdf, `leave-payment-${slugName}-${dateSuffix}.pdf`)
  } catch (err) {
    console.error("[v0] Error downloading single memo:", err)
    toast({ title: "Error", description: "Failed to download memo", variant: "destructive" })
  }
}

async function downloadCombinedMemo(
  memos: PaymentMemo[],
  category: string,
  signerName: string,
  monthLabel: string,
  toast: ReturnType<typeof useToast>["toast"],
) {
  try {
    const currentDate = new Date()
    const dateStr = currentDate.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })

    let signerTitle = "HR DEPARTMENT"
    let signerSignatureUrl = ""

    if (memos[0]?.memo_body) {
      try {
        const body = typeof memos[0].memo_body === "string" ? JSON.parse(memos[0].memo_body) : memos[0].memo_body
        if (body.selectedSigner) {
          signerTitle = body.selectedSigner.position || signerTitle
          signerSignatureUrl = body.selectedSigner.signature_data_url || ""
        }
      } catch {}
    }
    
    // Fallback: If signature still missing, try to fetch from first memo's signature_data_url column
    if (!signerSignatureUrl && memos[0]?.signature_data_url) {
      signerSignatureUrl = memos[0].signature_data_url
    }



    const staffList = memos.map((memo, idx) => {
      let staffPosition = "Staff"
      let staffDepartment = "Department"
      let staffRank = "N/A"
      let staffLocation = "N/A"
      if (memo.memo_body) {
        try {
          const b = typeof memo.memo_body === "string" ? JSON.parse(memo.memo_body) : memo.memo_body
          staffPosition = b.staff_position || b.staffList?.[0]?.position || staffPosition
          staffDepartment = b.staff_department || b.staffList?.[0]?.department || staffDepartment
          staffRank = b.staff_rank_label || b.staffList?.[0]?.rank || "N/A"
          staffLocation = b.staff_location_name || b.staffList?.[0]?.assigned_location_name || b.staffList?.[0]?.location_name || "N/A"
        } catch {}
      }
      return {
        no: idx + 1,
        name: memo.staff_name || "N/A",
        employeeId: memo.staff_number || "N/A",
        position: staffPosition,
        department: staffDepartment,
        rank: staffRank,
        location: staffLocation,
        leaveDate: memo.leave_period_start ? new Date(memo.leave_period_start).toLocaleDateString() : "N/A",
        approved_days: memo.approved_days || 0,
        travelling_days_added: memo.travelling_days_added || 0,
        leave_period_start: memo.leave_period_start || undefined,
        leave_period_end: memo.leave_period_end || undefined,
      }
    })

    const memoData = {
      to: "DEPUTY DIRECTOR, FINANCE",
      from: "HUMAN RESOURCE MANAGER",
      subject: `PAYMENT OF LEAVE ALLOWANCE - ${category.toUpperCase()} (${monthLabel.toUpperCase()})`,
      date: dateStr,
      refNo: "QCC/",
      body: `We wish to inform you that the undermentioned staff members have been approved for leave payment for the month of ${monthLabel}.\n\nWe, therefore, kindly request you to process and pay their leave allowances accordingly.\n\nWe count on your co-operation.`,
      signatory: {
        name: (signerName || "HUMAN RESOURCE MANAGER").toUpperCase(),
        title: signerTitle.toUpperCase(),
        signature_image_url: signerSignatureUrl,
      },
      ccList: ["Finance Director", "HR Department", "Internal Audit"],
      memoType: "payment" as const,
      staffList,
    }

    const slug = category.toLowerCase().replace(/\s+/g, "-")
    const monthSlug = monthLabel.toLowerCase().replace(/\s+/g, "-")
    const dateSuffix = `${currentDate.getFullYear()}${String(currentDate.getMonth() + 1).padStart(2, "0")}`
    const pdf = await generateProfessionalMemoPDF(memoData, `combined-leave-payment-${slug}-${monthSlug}.pdf`)
    await downloadMemoPDF(pdf, `combined-leave-payment-${slug}-${monthSlug}-${dateSuffix}.pdf`)
  } catch (err) {
    console.error("[v0] Error downloading combined memo:", err)
    toast({ title: "Error", description: "Failed to download combined memo", variant: "destructive" })
  }
}

interface LoanOfficePaymentAdviceTabProps {
  isHrLeaveOffice?: boolean
}

export function LoanOfficePaymentAdviceTab({ isHrLeaveOffice = false }: LoanOfficePaymentAdviceTabProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [memos, setMemos] = useState<PaymentMemo[]>([])
  const [filterMonth, setFilterMonth] = useState("")
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set())

  const fetchMemos = async () => {
    setLoading(true)
    try {
      const url = filterMonth
        ? `/api/leave/payment-advice/approved-memos?month=${filterMonth}`
        : "/api/leave/payment-advice/approved-memos"
      const res = await fetch(url, { cache: "no-store" })
      if (res.ok) {
        const data = await res.json()
        setMemos(data.memos || [])
      } else {
        const err = await res.json()
        toast({ title: "Error", description: err.error || "Failed to load memos", variant: "destructive" })
        setMemos([])
      }
    } catch (err) {
      console.error("[v0] Error fetching approved memos:", err)
      toast({ title: "Error", description: "Could not load payment advice memos", variant: "destructive" })
      setMemos([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMemos()
  }, [filterMonth])

  // Group memos by month → rank
  const monthGroups = useMemo<MonthGroup[]>(() => {
    const byMonth = new Map<string, PaymentMemo[]>()
    for (const memo of memos) {
      const key = String(memo.created_at || memo.updated_at || "").slice(0, 7)
      if (!key) continue
      if (!byMonth.has(key)) byMonth.set(key, [])
      byMonth.get(key)!.push(memo)
    }

    return Array.from(byMonth.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([monthKey, monthMemos]) => {
        const byRank = new Map<string, PaymentMemo[]>()
        for (const memo of monthMemos) {
          // Extract rank from memo_body if available
          let rank = "Other"
          if (memo.memo_body) {
            try {
              const b = typeof memo.memo_body === "string" ? JSON.parse(memo.memo_body) : memo.memo_body
              rank = b.staff_rank_label || "Other"
            } catch {}
          }
          if (!byRank.has(rank)) byRank.set(rank, [])
          byRank.get(rank)!.push(memo)
        }

        // Sort ranks in logical order: Manager, Senior, Junior, Other
        const RANK_ORDER = ["Manager", "Senior", "Junior", "Other"]
        const categoryGroups: CategoryGroup[] = Array.from(byRank.entries())
          .sort(([a], [b]) => {
            const aIdx = RANK_ORDER.findIndex(r => a.includes(r))
            const bIdx = RANK_ORDER.findIndex(r => b.includes(r))
            return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx)
          })
          .map(([rank, rankMemos]) => {
            const signerName =
              rankMemos.find((m) => m.signer_name)?.signer_name || "HRM"
            return { category: rank, signerName, memos: rankMemos }
          })

        return {
          monthKey,
          monthLabel: fmtMonth(monthKey),
          totalCount: monthMemos.length,
          categoryGroups,
        }
      })
  }, [memos])

  const toggleCategory = (key: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const setDownloading = (key: string, val: boolean) => {
    setDownloadingIds((prev) => {
      const next = new Set(prev)
      if (val) next.add(key)
      else next.delete(key)
      return next
    })
  }

  const handleDownloadAll = async (monthGroup: MonthGroup) => {
    const key = `month-${monthGroup.monthKey}`
    setDownloading(key, true)
    try {
      // Merge all staff from all category groups into one combined PDF for the month
      const allMemos = monthGroup.categoryGroups.flatMap((cg) => cg.memos)
      const firstSigner = monthGroup.categoryGroups.find((cg) => cg.signerName)?.signerName || "HRM"

      // Use a combined category label e.g. "All Staff"
      const categoryLabel = monthGroup.categoryGroups.length === 1
        ? monthGroup.categoryGroups[0].category
        : "All Staff"

      await downloadCombinedMemo(allMemos, categoryLabel, firstSigner, monthGroup.monthLabel, toast)

      toast({
        title: "Download complete",
        description: `Downloaded combined memo for ${monthGroup.monthLabel} (${allMemos.length} staff member${allMemos.length !== 1 ? "s" : ""})`,
      })
    } catch (err) {
      console.error("[v0] Error in bulk download:", err)
      toast({ title: "Download failed", description: String(err), variant: "destructive" })
    } finally {
      setDownloading(key, false)
    }
  }

  const handleDownloadAllCategory = async (cg: CategoryGroup, monthLabel: string, monthKey: string) => {
    const key = `all-${monthKey}-${cg.category}`
    setDownloading(key, true)
    for (const memo of cg.memos) {
      await downloadSingleMemo(memo, toast)
    }
    setDownloading(key, false)
  }

  const handleDownloadCombined = async (cg: CategoryGroup, monthLabel: string, monthKey: string) => {
    const key = `combined-${monthKey}-${cg.category}`
    setDownloading(key, true)
    await downloadCombinedMemo(cg.memos, cg.category, cg.signerName, monthLabel, toast)
    setDownloading(key, false)
  }

  const handleDownloadSingle = async (memo: PaymentMemo) => {
    setDownloading(memo.id, true)
    await downloadSingleMemo(memo, toast)
    setDownloading(memo.id, false)
  }

  const totalMemos = memos.length
  const totalMonths = monthGroups.length

  return (
    <div className="space-y-4">
      {/* Header banner */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
        <p className="text-sm text-blue-800">
          <span className="font-semibold">Payment Advice Download:</span> View and download approved leave payment advice memos.
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          {totalMemos > 0 && (
            <span className="font-medium">
              {totalMemos} approved memo{totalMemos !== 1 ? "s" : ""} across {totalMonths} month{totalMonths !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <input
              type="month"
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="border-0 bg-transparent text-sm text-slate-700 outline-none"
            />
          </div>
          <Button variant="outline" size="sm" onClick={fetchMemos} disabled={loading} className="gap-1.5">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </Button>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
          <span className="ml-3 text-sm text-slate-500">Loading payment advice records...</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && memos.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="h-12 w-12 text-slate-300 mb-4" />
            <p className="text-base font-medium text-slate-600">No Approved Memos Found</p>
            <p className="mt-1 text-sm text-slate-400">
              {filterMonth
                ? `No approved leave payment advice memos for ${fmtMonth(filterMonth)}.`
                : "No approved leave payment advice memos are available yet."}
            </p>
            {filterMonth && (
              <Button variant="outline" size="sm" className="mt-4" onClick={() => setFilterMonth("")}>
                Clear Filter
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Month groups */}
      {!loading && monthGroups.map((mg) => (
        <div key={mg.monthKey} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {/* Month header */}
          <div className="flex items-center justify-between bg-slate-800 px-5 py-3.5">
            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-slate-300" />
              <span className="font-semibold text-white">{mg.monthLabel}</span>
              <Badge className="bg-slate-600 text-slate-100 text-xs font-medium">
                {mg.totalCount} staff member{mg.totalCount !== 1 ? "s" : ""}
              </Badge>
            </div>
            <Button
              size="sm"
              className="gap-1.5 bg-orange-500 text-white hover:bg-orange-600"
              disabled={downloadingIds.has(`month-${mg.monthKey}`)}
              onClick={() => handleDownloadAll(mg)}
            >
              {downloadingIds.has(`month-${mg.monthKey}`) ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Download All ({mg.totalCount})
            </Button>
          </div>

          {/* Rank groups */}
          <div className="divide-y divide-slate-100">
            {mg.categoryGroups.map((cg) => {
              const rankKey = `${mg.monthKey}-${cg.category}`
              const isExpanded = expandedCategories.has(rankKey)
              const allKey = `all-${mg.monthKey}-${cg.category}`
              const combinedKey = `combined-${mg.monthKey}-${cg.category}`

              return (
                <div key={rankKey} className="bg-white">
                  {/* Rank row */}
                  <div className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                    <div className="flex flex-1 items-center gap-2.5 min-w-0">
                      <Users className="h-4 w-4 shrink-0 text-slate-500" />
                      <span className="font-medium text-slate-800">{cg.category}</span>
                      <Badge variant="outline" className="border-slate-200 text-slate-600 text-xs">
                        {cg.memos.length} member{cg.memos.length !== 1 ? "s" : ""}
                      </Badge>
                      <span className="text-xs text-slate-400">Signed by: {cg.signerName}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 text-xs border-slate-300"
                        disabled={downloadingIds.has(allKey)}
                        onClick={() => handleDownloadAllCategory(cg, mg.monthLabel, mg.monthKey)}
                      >
                        {downloadingIds.has(allKey) ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Download className="h-3 w-3" />
                        )}
                        Download All ({cg.memos.length})
                      </Button>
                      <Button
                        size="sm"
                        className="gap-1 text-xs bg-blue-600 text-white hover:bg-blue-700"
                        disabled={downloadingIds.has(combinedKey)}
                        onClick={() => handleDownloadCombined(cg, mg.monthLabel, mg.monthKey)}
                      >
                        {downloadingIds.has(combinedKey) ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <FileText className="h-3 w-3" />
                        )}
                        Combined ({cg.memos.length})
                      </Button>
                      <button
                        onClick={() => toggleCategory(rankKey)}
                        className="ml-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                      >
                        {isExpanded ? "Hide" : "Show"} staff
                      </button>
                    </div>
                  </div>

                  {/* Individual staff list — table view */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 bg-white">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50">
                            <th className="px-5 py-3 text-left font-medium text-slate-700">Name</th>
                            <th className="px-5 py-3 text-left font-medium text-slate-700">Staff No.</th>
                            <th className="px-5 py-3 text-left font-medium text-slate-700">Rank</th>
                            <th className="px-5 py-3 text-left font-medium text-slate-700">Station/Location</th>
                            <th className="px-5 py-3 text-left font-medium text-slate-700">Leave Date</th>
                            <th className="px-5 py-3 text-left font-medium text-slate-700">Days</th>
                            <th className="px-5 py-3 text-left font-medium text-slate-700">Status</th>
                            <th className="px-5 py-3 text-center font-medium text-slate-700">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cg.memos.map((memo) => {
                            let staffRank = "N/A"
                            let staffLocation = "N/A"
                            if (memo.memo_body) {
                              try {
                                const b = typeof memo.memo_body === "string" ? JSON.parse(memo.memo_body) : memo.memo_body
                                staffRank = b.staff_rank_label || b.staffList?.[0]?.rank || "N/A"
                                staffLocation = b.staff_location_name || b.staffList?.[0]?.assigned_location_name || b.staffList?.[0]?.location_name || "N/A"
                              } catch {}
                            }
                            const leaveStartDate = memo.leave_period_start ? new Date(memo.leave_period_start) : null
                            const leaveEndDate = memo.leave_period_end ? new Date(memo.leave_period_end) : null
                            const daysDiff = leaveStartDate && leaveEndDate ? Math.ceil((leaveEndDate.getTime() - leaveStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1 : 0
                            return (
                              <tr key={memo.id} className="border-b border-slate-100 hover:bg-slate-50">
                                <td className="px-5 py-3 text-slate-800 font-medium">{memo.staff_name || "N/A"}</td>
                                <td className="px-5 py-3 text-slate-700">{memo.staff_number || "N/A"}</td>
                                <td className="px-5 py-3 text-slate-700">{staffRank}</td>
                                <td className="px-5 py-3 text-slate-700">{staffLocation}</td>
                                <td className="px-5 py-3 text-slate-700">{leaveStartDate ? leaveStartDate.toLocaleDateString() : "N/A"}</td>
                                <td className="px-5 py-3 text-slate-700">{daysDiff || "N/A"}</td>
                                <td className="px-5 py-3">
                                  <Badge className="bg-green-600 text-white text-xs">Approved</Badge>
                                </td>
                                <td className="px-5 py-3 text-center">
                                  <Button
                              variant="outline"
                              size="sm"
                              className="shrink-0 gap-1 text-xs"
                              disabled={downloadingIds.has(memo.id)}
                              onClick={() => handleDownloadSingle(memo)}
                            >
                              {downloadingIds.has(memo.id) ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Download className="h-3 w-3" />
                              )}
                              Download
                            </Button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
