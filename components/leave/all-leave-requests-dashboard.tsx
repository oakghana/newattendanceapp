"use client"

import { useCallback, useEffect, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { ArrowRight, Search, RotateCw } from "lucide-react"

interface LeaveRequest {
  id: string
  userId: string
  staffName: string
  staffEmail: string
  department: string
  departmentCode?: string
  startDate: string
  endDate: string
  reason: string
  status: string
  createdAt: string
  updatedAt: string
  hodReviewers?: string[]
}

interface PaginationInfo {
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: "bg-yellow-100", text: "text-yellow-700", label: "Pending" },
  hr_approved: { bg: "bg-green-100", text: "text-green-700", label: "HR Approved" },
  hod_approved: { bg: "bg-blue-100", text: "text-blue-700", label: "HOD Approved" },
  approved: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Fully Approved" },
  rejected: { bg: "bg-red-100", text: "text-red-700", label: "Rejected" },
  pending_hod_review: { bg: "bg-amber-100", text: "text-amber-700", label: "Awaiting HOD Review" },
}

export function AllLeaveRequestsDashboard() {
  const { toast } = useToast()
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    pageSize: 50,
    totalCount: 0,
    totalPages: 0,
  })
  const [statusFilter, setStatusFilter] = useState("all")
  const [searchTerm, setSearchTerm] = useState("")

  const fetchRequests = useCallback(async (page = 1, status = "all", search = "") => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append("page", String(page))
      params.append("page_size", "50")
      if (status !== "all") params.append("status", status)
      if (search) params.append("search", search)

      const res = await fetch(`/api/leave/all-requests?${params}`)
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Failed to fetch (${res.status})`)
      }

      const json = await res.json()
      setRequests(json.data || [])
      setPagination(json.pagination)
    } catch (err: any) {
      console.error("[v0] Error fetching leave requests:", err)
      toast({
        title: "Error",
        description: err.message || "Failed to load leave requests",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchRequests(1, statusFilter, searchTerm)
  }, [statusFilter, fetchRequests])

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value)
  }

  const handleSearchSubmit = () => {
    fetchRequests(1, statusFilter, searchTerm)
  }

  const handleStatusChange = (value: string) => {
    setStatusFilter(value)
    setPagination(prev => ({ ...prev, page: 1 }))
  }

  const calculateDays = (start: string, end: string) => {
    const startDate = new Date(start)
    const endDate = new Date(end)
    return Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  const getStatusColor = (status: string) => {
    return STATUS_COLORS[status] || {
      bg: "bg-gray-100",
      text: "text-gray-700",
      label: status.replace(/_/g, " ").toUpperCase(),
    }
  }

  return (
    <div className="space-y-6 w-full">
      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-3">
        <div className="flex-1">
          <label className="block text-xs font-semibold text-slate-600 mb-2">Search Staff</label>
          <div className="flex gap-2">
            <Input
              placeholder="Name, email, or ID..."
              value={searchTerm}
              onChange={handleSearch}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearchSubmit()
              }}
              className="text-sm"
            />
            <Button
              onClick={handleSearchSubmit}
              size="sm"
              variant="outline"
              className="px-3"
            >
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="w-full sm:w-48">
          <label className="block text-xs font-semibold text-slate-600 mb-2">Status</label>
          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger className="text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="pending_hod_review">Awaiting HOD</SelectItem>
              <SelectItem value="hod_approved">HOD Approved</SelectItem>
              <SelectItem value="hr_approved">HR Approved</SelectItem>
              <SelectItem value="approved">Fully Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={() => fetchRequests(pagination.page, statusFilter, searchTerm)}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          <RotateCw className="h-4 w-4" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {/* Summary */}
      <div className="text-sm text-slate-600">
        Showing <strong>{requests.length}</strong> of <strong>{pagination.totalCount}</strong> requests
      </div>

      {/* Table */}
      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center space-y-2">
              <div className="inline-block animate-spin">
                <RotateCw className="h-6 w-6 text-slate-400" />
              </div>
              <p className="text-sm text-slate-600">Loading leave requests...</p>
            </div>
          </div>
        ) : requests.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center space-y-2">
              <p className="text-sm font-medium text-slate-700">No leave requests found</p>
              <p className="text-xs text-slate-500">Try adjusting your filters or search term</p>
            </div>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-slate-200 bg-slate-50">
                <TableHead className="font-semibold text-slate-700">Staff Name</TableHead>
                <TableHead className="font-semibold text-slate-700">Department</TableHead>
                <TableHead className="font-semibold text-slate-700">Leave Period</TableHead>
                <TableHead className="font-semibold text-slate-700 text-center">Days</TableHead>
                <TableHead className="font-semibold text-slate-700">HR Approval Date</TableHead>
                <TableHead className="font-semibold text-slate-700">Assigned HOD</TableHead>
                <TableHead className="font-semibold text-slate-700">Reason</TableHead>
                <TableHead className="font-semibold text-slate-700">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((request) => {
                const color = getStatusColor(request.status)
                const days = calculateDays(request.startDate, request.endDate)
                return (
                  <TableRow key={request.id} className="border-slate-200 hover:bg-slate-50 transition-colors">
                    <TableCell className="font-medium text-slate-900">
                      <div className="space-y-1">
                        <div>{request.staffName}</div>
                        <div className="text-xs text-slate-500">{request.staffEmail}</div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-slate-700">
                      {request.department}
                    </TableCell>
                    <TableCell className="text-sm text-slate-700">
                      <div className="flex items-center gap-2">
                        <span>{formatDate(request.startDate)}</span>
                        <ArrowRight className="h-3 w-3 text-slate-400" />
                        <span>{formatDate(request.endDate)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-sm font-semibold text-slate-900">
                      {days}
                    </TableCell>
                    <TableCell className="text-sm text-slate-700">
                      {request.hrApprovedAt ? formatDate(request.hrApprovedAt) : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-slate-700 max-w-[180px]">
                      {Array.isArray(request.hodReviewers) && request.hodReviewers.length > 0 ? (
                        <div className="flex flex-col gap-0.5">
                          {request.hodReviewers.slice(0, 2).map((name, i) => (
                            <span key={i} className="block truncate text-xs">{name}</span>
                          ))}
                          {request.hodReviewers.length > 2 && (
                            <span
                              className="text-xs text-slate-400 italic cursor-default"
                              title={request.hodReviewers.slice(2).join(", ")}
                            >
                              +{request.hodReviewers.length - 2} more
                            </span>
                          )}
                        </div>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-slate-700 max-w-xs truncate">
                      {request.reason || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={`${color.bg} ${color.text} text-xs font-semibold border-0`}
                      >
                        {color.label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              onClick={() => fetchRequests(pagination.page - 1, statusFilter, searchTerm)}
              disabled={pagination.page === 1}
              variant="outline"
              size="sm"
            >
              Previous
            </Button>
            <Button
              onClick={() => fetchRequests(pagination.page + 1, statusFilter, searchTerm)}
              disabled={pagination.page >= pagination.totalPages}
              variant="outline"
              size="sm"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
