"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, Filter, Copy, Check } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { Input } from "@/components/ui/input"

interface PaymentAdviceMemo {
  id: string
  staff_id: string
  staff_name: string
  staff_number: string
  staff_category?: string
  memo_subject: string
  leave_period_start: string
  leave_period_end: string
  approved_days: number
  payment_amount?: number
  payment_currency?: string
  status: string
  signer_name?: string
  signer_id?: string
  hr_leave_office_name?: string
  created_at: string
  updated_at: string
  assigned_signers?: string[]
}

const statusColors: Record<string, { bg: string; text: string }> = {
  draft: { bg: "bg-gray-100", text: "text-gray-800" },
  ready_for_review: { bg: "bg-yellow-100", text: "text-yellow-800" },
  reviewed_by_hr: { bg: "bg-green-100", text: "text-green-800" },
  approved: { bg: "bg-green-100", text: "text-green-800" },
  finalized: { bg: "bg-green-100", text: "text-green-800" },
  signed_by_hr_executive: { bg: "bg-green-100", text: "text-green-800" },
  forwarded_to_accounts: { bg: "bg-blue-100", text: "text-blue-800" },
  acknowledged_by_accounts: { bg: "bg-indigo-100", text: "text-indigo-800" },
}

const statusLabels: Record<string, string> = {
  draft: "Draft",
  ready_for_review: "Ready for Review",
  reviewed_by_hr: "Approved by HR",
  approved: "Approved",
  finalized: "Finalized",
  signed_by_hr_executive: "Signed by Executive",
  forwarded_to_accounts: "Forwarded to Accounts",
  acknowledged_by_accounts: "Acknowledged by Accounts",
}

export function PaymentAdviceViewAllTab() {
  const [loading, setLoading] = useState(false)
  const [memos, setMemos] = useState<PaymentAdviceMemo[]>([])
  const [statusFilter, setStatusFilter] = useState("all")
  const [monthFilter, setMonthFilter] = useState(() => {
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, "0")
    return `${year}-${month}`
  })
  const [searchQuery, setSearchQuery] = useState("")
  const [summary, setSummary] = useState<any>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    fetchAllMemos()
  }, [statusFilter, monthFilter])

  const fetchAllMemos = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (statusFilter !== "all") params.append("status", statusFilter)
      params.append("month", monthFilter)

      const response = await fetch(`/api/leave/payment-advice/view-all?${params}`)
      if (response.ok) {
        const data = await response.json()
        setMemos(data.memos || [])
        setSummary(data.summary)
        console.log("[v0] Fetched all payment memos:", data.count)
      } else {
        const error = await response.json()
        toast({
          title: "Error",
          description: error.error || "Failed to fetch memos",
          variant: "destructive",
        })
        setMemos([])
      }
    } catch (err) {
      console.error("[v0] Error fetching all memos:", err)
      toast({
        title: "Error",
        description: "Failed to load payment advice requests",
        variant: "destructive",
      })
      setMemos([])
    } finally {
      setLoading(false)
    }
  }

  const filteredMemos = memos.filter((memo) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      memo.staff_name.toLowerCase().includes(query) ||
      memo.staff_number.toLowerCase().includes(query) ||
      memo.signer_name?.toLowerCase().includes(query) ||
      memo.memo_subject.toLowerCase().includes(query)
    )
  })

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            View All Payment Advice Requests
          </CardTitle>
          <CardDescription>
            Browse and manage all payment advice memos across all statuses
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">Month</label>
              <input
                type="month"
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="ready_for_review">Ready for Review</SelectItem>
                  <SelectItem value="reviewed_by_hr">Approved by HR</SelectItem>
                  <SelectItem value="forwarded_to_accounts">Forwarded to Accounts</SelectItem>
                  <SelectItem value="acknowledged_by_accounts">Acknowledged</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">Search</label>
              <Input
                placeholder="Search by name, staff no., or signer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{summary.total}</p>
                <p className="text-sm text-gray-600 mt-1">Total Memos</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">
                  {(summary.byStatus["reviewed_by_hr"] || 0) +
                    (summary.byStatus["signed_by_hr_executive"] || 0)}
                </p>
                <p className="text-sm text-gray-600 mt-1">Approved</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-yellow-600">
                  {summary.byStatus["ready_for_review"] || 0}
                </p>
                <p className="text-sm text-gray-600 mt-1">Pending Review</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-purple-600">
                  {summary.totalPaymentAmount?.toLocaleString() || "0"}
                </p>
                <p className="text-sm text-gray-600 mt-1">Total Amount</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Memos Table */}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
            </div>
          ) : filteredMemos.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>No payment advice requests found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-300 bg-gray-50">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Staff Name</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Staff #</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Category</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Leave Period</th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-700">Days</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700">Amount</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Signer</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Status</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMemos.map((memo) => {
                    const statusColor = statusColors[memo.status] || statusColors.draft
                    return (
                      <tr key={memo.id} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-4 text-gray-900">{memo.staff_name}</td>
                        <td className="py-3 px-4 text-gray-600">{memo.staff_number}</td>
                        <td className="py-3 px-4">
                          <Badge variant="outline">{memo.staff_category || "N/A"}</Badge>
                        </td>
                        <td className="py-3 px-4 text-gray-600 text-xs">
                          {new Date(memo.leave_period_start).toLocaleDateString()} -{" "}
                          {new Date(memo.leave_period_end).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 text-center font-medium">{memo.approved_days}</td>
                        <td className="py-3 px-4 text-right font-medium">
                          {memo.payment_amount
                            ? `${memo.payment_amount.toLocaleString()} ${memo.payment_currency || "GHS"}`
                            : "-"}
                        </td>
                        <td className="py-3 px-4">
                          {memo.signer_name ? (
                            <div className="flex items-center gap-1">
                              <span className="text-gray-700">{memo.signer_name}</span>
                              <button
                                onClick={() => copyToClipboard(memo.signer_id || "", memo.id)}
                                className="text-gray-400 hover:text-gray-600"
                                title="Copy signer ID"
                              >
                                {copiedId === memo.id ? (
                                  <Check className="h-4 w-4 text-green-600" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                              </button>
                            </div>
                          ) : (
                            <span className="text-gray-400">Pending</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <Badge className={`text-xs font-semibold ${statusColor.bg} ${statusColor.text} border-0`}>
                            {statusLabels[memo.status] || memo.status}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-gray-600 text-xs">
                          {new Date(memo.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results Summary */}
      {!loading && filteredMemos.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-600">
              Showing <span className="font-semibold">{filteredMemos.length}</span> of{" "}
              <span className="font-semibold">{memos.length}</span> payment advice requests
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
