"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Loader2, Download, Calendar, Users, CheckCircle, Clock, AlertCircle, ChevronDown } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"

interface MonthlySummaryMemo {
  id: string
  staff_id: string
  staff_name: string
  staff_number: string
  rank?: string
  location?: string
  leave_period_start: string
  leave_period_end: string
  approved_days: number
  status: string
  created_at: string
  signer_name?: string
  staff_category?: string
  signature_data_url?: string
}

interface MonthlySummaryData {
  memos: MonthlySummaryMemo[]
  summary: {
    total: number
    byStatus: Record<string, number>
    byCategory: Record<string, number>
    totalApprovedDays: number
  }
  userRole: string
}

const statusColors: Record<string, { bg: string; text: string }> = {
  draft: { bg: "bg-gray-100", text: "text-gray-800" },
  ready_for_review: { bg: "bg-yellow-100", text: "text-yellow-800" },
  reviewed_by_hr: { bg: "bg-green-100", text: "text-green-800" },
  approved: { bg: "bg-green-100", text: "text-green-800" },
  finalized: { bg: "bg-green-100", text: "text-green-800" },
}

const statusLabels: Record<string, string> = {
  draft: "Draft",
  ready_for_review: "Ready for Review",
  reviewed_by_hr: "Approved",
  approved: "Approved",
  finalized: "Finalized",
}

const categoryColors: Record<string, string> = {
  Manager: "bg-orange-100 border-orange-300",
  Senior: "bg-blue-100 border-blue-300",
  Junior: "bg-green-100 border-green-300",
}

const categoryIcons: Record<string, string> = {
  Manager: "👔",
  Senior: "🎯",
  Junior: "📚",
}

export function MonthlySummaryTab() {
  const [loading, setLoading] = useState(false)
  const [summaryData, setSummaryData] = useState<MonthlySummaryData | null>(null)
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, "0")
    return `${year}-${month}`
  })
  const [statusFilter, setStatusFilter] = useState("all")
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(["Manager", "Senior", "Junior"]))
  const { toast } = useToast()

  // Fetch monthly summary on mount and when filters change
  useEffect(() => {
    fetchMonthlySummary()
  }, [selectedMonth, statusFilter])

  const fetchMonthlySummary = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      params.append("month", selectedMonth)
      if (statusFilter !== "all") params.append("status", statusFilter)

      console.log("[v0] Fetching monthly summary:", { month: selectedMonth, status: statusFilter })

      const response = await fetch(`/api/leave/payment-advice/monthly-summary?${params}`)

      if (!response.ok) {
        const errorData = await response.json()
        console.error("[v0] API error:", errorData)
        throw new Error(errorData.error || "Failed to fetch monthly summary")
      }

      const data: MonthlySummaryData = await response.json()
      console.log("[v0] Monthly summary received:", {
        total: data.summary.total,
        byCategory: data.summary.byCategory,
        memos: data.memos.length,
      })

      setSummaryData(data)
    } catch (error) {
      console.error("[v0] Error fetching monthly summary:", error)
      toast({
        title: "Error",
        description: "Failed to load monthly summary. Please try again.",
        variant: "destructive",
      })
      setSummaryData(null)
    } finally {
      setLoading(false)
    }
  }

  const downloadMemo = async (memo: MonthlySummaryMemo) => {
    try {
      setDownloadingId(memo.id)
      console.log("[v0] Downloading memo:", memo.id)

      const response = await fetch(`/api/leave/payment-advice/download?memo_id=${memo.id}`)

      if (!response.ok) {
        throw new Error("Failed to download memo")
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `Payment-Advice-${memo.staff_name.replace(/\s+/g, "-")}-${selectedMonth}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)

      toast({
        title: "Success",
        description: `Downloaded memo for ${memo.staff_name}`,
      })
    } catch (error) {
      console.error("[v0] Error downloading memo:", error)
      toast({
        title: "Error",
        description: "Failed to download memo. Please try again.",
        variant: "destructive",
      })
    } finally {
      setDownloadingId(null)
    }
  }

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(category)) {
      newExpanded.delete(category)
    } else {
      newExpanded.add(category)
    }
    setExpandedCategories(newExpanded)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  const getStatusColor = (status: string) => {
    return statusColors[status] || statusColors.draft
  }

  // Group memos by category
  const memosByCategory = summaryData?.memos.reduce(
    (acc, memo) => {
      const category = memo.staff_category || "Unassigned"
      if (!acc[category]) {
        acc[category] = []
      }
      acc[category].push(memo)
      return acc
    },
    {} as Record<string, MonthlySummaryMemo[]>
  ) || {}

  const monthDisplay = selectedMonth ? new Date(selectedMonth + "-01").toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "All Months"

  return (
    <div className="space-y-6">
      {/* Summary Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Total Memos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-bold">{summaryData?.summary.total || 0}</div>
              <Users className="h-4 w-4 text-gray-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Approved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-bold text-green-600">
                {(summaryData?.summary.byStatus.reviewed_by_hr || 0) +
                  (summaryData?.summary.byStatus.approved || 0) +
                  (summaryData?.summary.byStatus.finalized || 0)}
              </div>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Pending Review</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-bold text-yellow-600">
                {(summaryData?.summary.byStatus.draft || 0) + (summaryData?.summary.byStatus.ready_for_review || 0)}
              </div>
              <Clock className="h-4 w-4 text-yellow-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">Total Days</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-bold text-purple-600">
                {summaryData?.summary.totalApprovedDays || 0}
              </div>
              <Calendar className="h-4 w-4 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters Card */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Summary - {monthDisplay}</CardTitle>
          <CardDescription>View and download payment advice memos for all staff categories</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="month-select" className="mb-2 block text-sm font-medium">
                Month & Year
              </Label>
              <Input
                id="month-select"
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full"
              />
            </div>

            <div>
              <Label htmlFor="status-filter" className="mb-2 block text-sm font-medium">
                Status Filter
              </Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger id="status-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="ready_for_review">Ready for Review</SelectItem>
                  <SelectItem value="reviewed_by_hr,approved,finalized">Approved Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Staff Category Sections */}
      {loading ? (
        <Card>
          <CardContent className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </CardContent>
        </Card>
      ) : summaryData?.memos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-gray-600 font-medium">No payment advice memos found for {monthDisplay}</p>
            <p className="text-sm text-gray-500 mt-1">Try selecting a different month or adjusting your filters</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {["Manager", "Senior", "Junior"].map((category) => {
            const categoryMemos = memosByCategory[category] || []
            const categoryCount = categoryMemos.length

            if (categoryCount === 0) return null

            const isExpanded = expandedCategories.has(category)

            return (
              <Card key={category} className={`border-2 ${categoryColors[category]}`}>
                <CardHeader
                  className="cursor-pointer hover:bg-white/50 transition-colors"
                  onClick={() => toggleCategory(category)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{categoryIcons[category]}</span>
                      <div>
                        <CardTitle className="text-lg">
                          {category} Staff - {selectedMonth}
                        </CardTitle>
                        <CardDescription>
                          {categoryCount} staff member{categoryCount !== 1 ? "s" : ""} pending approval
                        </CardDescription>
                      </div>
                    </div>
                    <ChevronDown
                      className={`h-5 w-5 transition-transform ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                    />
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="space-y-4 pt-0">
                    {/* Header Row */}
                    <div className="grid grid-cols-12 gap-2 text-sm font-semibold text-gray-700 bg-gray-100 p-3 rounded">
                      <div className="col-span-3">Name</div>
                      <div className="col-span-2">Staff No.</div>
                      <div className="col-span-2">Rank</div>
                      <div className="col-span-2">Signer</div>
                      <div className="col-span-2">Status</div>
                      <div className="col-span-1 text-center">Action</div>
                    </div>

                    {/* Staff Rows */}
                    {categoryMemos.map((memo) => {
                      const statusColor = getStatusColor(memo.status)
                      const isDownloadable = ["reviewed_by_hr", "approved", "finalized"].includes(memo.status)

                      return (
                        <div key={memo.id} className="grid grid-cols-12 gap-2 items-center p-3 border rounded hover:bg-gray-50">
                          <div className="col-span-3">
                            <p className="font-medium text-gray-900">{memo.staff_name}</p>
                          </div>
                          <div className="col-span-2 text-sm text-gray-700">{memo.staff_number}</div>
                          <div className="col-span-2 text-sm text-gray-700">{memo.rank || "N/A"}</div>
                          <div className="col-span-2 text-sm text-gray-700">{memo.signer_name || "Pending"}</div>
                          <div className="col-span-2">
                            <Badge className={`text-xs font-semibold ${statusColor.bg} ${statusColor.text} border-0`}>
                              {statusLabels[memo.status] || memo.status}
                            </Badge>
                          </div>
                          <div className="col-span-1 text-center">
                            {isDownloadable ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => downloadMemo(memo)}
                                disabled={downloadingId !== null}
                                className="h-8 w-8 p-0"
                                title="Download memo"
                              >
                                {downloadingId === memo.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Download className="h-4 w-4" />
                                )}
                              </Button>
                            ) : (
                              <span className="text-xs text-gray-400">–</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Approval Details Card */}
      {summaryData && summaryData.memos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border-l-4 border-green-500 pl-4">
                <p className="text-sm text-gray-600 mb-1">Total Approved Memos</p>
                <p className="text-2xl font-bold text-green-600">
                  {(summaryData.summary.byStatus.reviewed_by_hr || 0) +
                    (summaryData.summary.byStatus.approved || 0) +
                    (summaryData.summary.byStatus.finalized || 0)}
                </p>
              </div>
              <div className="border-l-4 border-yellow-500 pl-4">
                <p className="text-sm text-gray-600 mb-1">Pending Review</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {(summaryData.summary.byStatus.draft || 0) + (summaryData.summary.byStatus.ready_for_review || 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
