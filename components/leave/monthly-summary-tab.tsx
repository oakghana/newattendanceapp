"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Loader2, Download, Calendar, Users, CheckCircle, Clock, FileText, Filter, ChevronDown } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"

interface MonthlySummaryMemo {
  id: string
  staff_id: string
  staff_name: string
  staff_number: string
  rank?: string
  location?: string
  department?: string
  leave_period_start: string
  leave_period_end: string
  approved_days: number
  status: string
  created_at: string
  hr_leave_office_name: string
  signer_name?: string
  staff_category?: string
  signature_data_url?: string
  memo_body?: any
}

interface MonthlySummaryData {
  memos: MonthlySummaryMemo[]
  approvableMemos: MonthlySummaryMemo[]
  summary: {
    total: number
    byStatus: Record<string, number>
    byCategory: Record<string, number>
    totalApprovedDays: number
    totalPaymentAmount: number
  }
  filters: {
    month: string
    status: string
    category: string
    assignedTo: string
  }
  userRole: string
}

const statusColors: Record<string, { bg: string; text: string; icon: any }> = {
  draft: { bg: "bg-gray-100", text: "text-gray-800", icon: Clock },
  ready_for_review: { bg: "bg-blue-100", text: "text-blue-800", icon: Clock },
  reviewed_by_hr: { bg: "bg-green-100", text: "text-green-800", icon: CheckCircle },
  approved: { bg: "bg-green-100", text: "text-green-800", icon: CheckCircle },
  finalized: { bg: "bg-green-100", text: "text-green-800", icon: CheckCircle },
}

const statusLabels: Record<string, string> = {
  draft: "Draft",
  ready_for_review: "Ready for Review",
  reviewed_by_hr: "Approved",
  approved: "Approved",
  finalized: "Finalized",
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
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    fetchMonthlySummary()
  }, [selectedMonth, statusFilter, categoryFilter])

  const fetchMonthlySummary = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      params.append("month", selectedMonth)
      if (statusFilter !== "all") params.append("status", statusFilter)
      if (categoryFilter !== "all") params.append("category", categoryFilter)

      const response = await fetch(`/api/leave/payment-advice/monthly-summary?${params}`)

      if (!response.ok) {
        throw new Error("Failed to fetch monthly summary")
      }

      const data: MonthlySummaryData = await response.json()
      setSummaryData(data)

      console.log("[v0] Monthly summary fetched:", {
        total: data.summary.total,
        month: selectedMonth,
        statuses: data.summary.byStatus,
      })
    } catch (error) {
      console.error("[v0] Error fetching monthly summary:", error)
      toast({
        title: "Error",
        description: "Failed to load monthly summary. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const downloadMemo = async (memo: MonthlySummaryMemo) => {
    try {
      setDownloadingId(memo.id)
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

  const downloadAllMemos = async () => {
    if (!summaryData?.approvableMemos.length) {
      toast({
        title: "No Memos",
        description: "No approved memos available for download.",
        variant: "destructive",
      })
      return
    }

    try {
      setDownloadingId("all")
      const memoIds = summaryData.approvableMemos.map(m => m.id).join(",")
      const response = await fetch(`/api/leave/payment-advice/download-batch?memo_ids=${memoIds}`)

      if (!response.ok) {
        throw new Error("Failed to download memos")
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `Payment-Advice-Batch-${selectedMonth}.zip`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)

      toast({
        title: "Success",
        description: `Downloaded ${summaryData.approvableMemos.length} memos as ZIP file`,
      })
    } catch (error) {
      console.error("[v0] Error downloading batch:", error)
      toast({
        title: "Error",
        description: "Failed to download memos. Please try again.",
        variant: "destructive",
      })
    } finally {
      setDownloadingId(null)
    }
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

  return (
    <div className="space-y-6">
      {/* Header with Summary Stats */}
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
              <div className="text-3xl font-bold text-blue-600">
                {summaryData?.summary.byStatus.ready_for_review || 0}
              </div>
              <Clock className="h-4 w-4 text-blue-600" />
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

      {/* Filters and Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Monthly Summary - Payment Advice Requests
          </CardTitle>
          <CardDescription>
            View, filter, and download all payment advice memos for the selected period
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filter Controls */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                Status
              </Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger id="status-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="ready_for_review">Ready for Review</SelectItem>
                  <SelectItem value="reviewed_by_hr">Approved</SelectItem>
                  <SelectItem value="finalized">Finalized</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="category-filter" className="mb-2 block text-sm font-medium">
                Staff Category
              </Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger id="category-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="Manager">Manager</SelectItem>
                  <SelectItem value="Senior">Senior</SelectItem>
                  <SelectItem value="Junior">Junior</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              {summaryData?.approvableMemos.length ? (
                <Button
                  onClick={downloadAllMemos}
                  disabled={downloadingId !== null}
                  className="w-full gap-2 bg-green-600 hover:bg-green-700"
                >
                  {downloadingId === "all" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {downloadingId === "all" ? "Downloading..." : "Download All"}
                </Button>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {loading ? "Loading memos..." : `${summaryData?.memos.length || 0} Payment Advice Request(s)`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : summaryData?.memos.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-gray-600 font-medium">No payment advice memos found for {selectedMonth}</p>
              <p className="text-sm text-gray-500 mt-1">Try selecting a different month or adjusting your filters</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50 hover:bg-gray-50">
                    <TableHead className="font-semibold">Staff Name</TableHead>
                    <TableHead className="font-semibold">Staff #</TableHead>
                    <TableHead className="font-semibold">Rank</TableHead>
                    <TableHead className="font-semibold">Location</TableHead>
                    <TableHead className="font-semibold">Leave Period</TableHead>
                    <TableHead className="text-center font-semibold">Days</TableHead>
                    <TableHead className="font-semibold">Category</TableHead>
                    <TableHead className="font-semibold">Assigned to</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="text-center font-semibold">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summaryData?.memos.map((memo) => {
                    const statusColor = getStatusColor(memo.status)
                    const isApprovable = ["reviewed_by_hr", "approved", "finalized"].includes(memo.status)

                    return (
                      <TableRow key={memo.id} className="hover:bg-gray-50">
                        <TableCell className="font-medium text-gray-900">{memo.staff_name}</TableCell>
                        <TableCell className="text-gray-700">{memo.staff_number}</TableCell>
                        <TableCell className="text-gray-700">{memo.rank || "N/A"}</TableCell>
                        <TableCell className="text-gray-700">{memo.location || "N/A"}</TableCell>
                        <TableCell className="text-sm text-gray-700">
                          {formatDate(memo.leave_period_start)} to {formatDate(memo.leave_period_end)}
                        </TableCell>
                        <TableCell className="text-center font-semibold text-gray-900">
                          {memo.approved_days}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {memo.staff_category || "N/A"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-gray-700">
                          {memo.signer_name || "Pending"}
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-xs font-semibold ${statusColor.bg} ${statusColor.text} border-0`}>
                            {statusLabels[memo.status] || memo.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {isApprovable ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => downloadMemo(memo)}
                              disabled={downloadingId !== null}
                              className="gap-1 h-8 text-xs"
                            >
                              {downloadingId === memo.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Download className="h-3 w-3" />
                              )}
                              {downloadingId === memo.id ? "..." : "Download"}
                            </Button>
                          ) : (
                            <span className="text-xs text-gray-500">Pending</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary by Category */}
      {summaryData && summaryData.memos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Summary by Staff Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.entries(summaryData.summary.byCategory).map(([category, count]) => (
                <div key={category} className="p-4 border rounded-lg">
                  <div className="text-sm font-medium text-gray-600 mb-2">{category} Staff</div>
                  <div className="text-2xl font-bold text-gray-900">{count}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {count === 1 ? "person" : "people"}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
