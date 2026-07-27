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
import { Badge } from "@/components/ui/badge"
import { ArrowRight, RotateCw } from "lucide-react"
import { SortableTable, ColumnDef } from "@/components/ui/sortable-table"

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

  // Define columns for SortableTable
  const columns: ColumnDef<LeaveRequest>[] = [
    {
      key: "staffName",
      label: "Staff Name",
      getValue: (row) => row.staffName,
      render: (row) => (
        <div className="space-y-1">
          <div className="font-medium text-slate-900">{row.staffName}</div>
          <div className="text-xs text-slate-500">{row.staffEmail}</div>
        </div>
      ),
      sortable: true,
      filterable: true,
    },
    {
      key: "department",
      label: "Department",
      getValue: (row) => row.department,
      sortable: true,
      filterable: true,
    },
    {
      key: "leaveType",
      label: "Leave Type",
      getValue: (row) => row.reason || "—",
      sortable: true,
      filterable: true,
    },
    {
      key: "startDate",
      label: "Start Date",
      getValue: (row) => new Date(row.startDate),
      render: (row) => formatDate(row.startDate),
      sortable: true,
      filterable: false,
      compareFn: (a, b) => {
        if (!(a instanceof Date) || !(b instanceof Date)) return 0
        return a.getTime() - b.getTime()
      },
    },
    {
      key: "endDate",
      label: "End Date",
      getValue: (row) => new Date(row.endDate),
      render: (row) => formatDate(row.endDate),
      sortable: true,
      filterable: false,
      compareFn: (a, b) => {
        if (!(a instanceof Date) || !(b instanceof Date)) return 0
        return a.getTime() - b.getTime()
      },
    },
    {
      key: "days",
      label: "Days",
      getValue: (row) => calculateDays(row.startDate, row.endDate),
      render: (row) => <span className="font-semibold">{calculateDays(row.startDate, row.endDate)}</span>,
      sortable: true,
      filterable: false,
      compareFn: (a, b) => Number(a) - Number(b),
      className: "text-center",
    },
    {
      key: "hrApprovedAt",
      label: "HR Approval Date",
      getValue: (row) => row.hrApprovedAt || "—",
      render: (row) => (row.hrApprovedAt ? formatDate(row.hrApprovedAt) : "—"),
      sortable: true,
      filterable: false,
    },
    {
      key: "status",
      label: "Status",
      getValue: (row) => row.status,
      render: (row) => {
        const color = getStatusColor(row.status)
        return (
          <Badge className={`${color.bg} ${color.text} text-xs font-semibold border-0`}>
            {color.label}
          </Badge>
        )
      },
      sortable: true,
      filterable: true,
      filterFn: (value, filterText) => {
        const color = getStatusColor(String(value))
        return color.label.toLowerCase().includes(filterText.toLowerCase()) ||
               String(value).toLowerCase().includes(filterText.toLowerCase())
      },
    },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-2">
          <div className="inline-block animate-spin">
            <RotateCw className="h-6 w-6 text-slate-400" />
          </div>
          <p className="text-sm text-slate-600">Loading leave requests...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 w-full">
      {/* Status Filter */}
      <div className="flex gap-3">
        <div className="w-full sm:w-48">
          <label className="block text-xs font-semibold text-slate-600 mb-2">Filter by Status</label>
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
          className="gap-2 self-end"
        >
          <RotateCw className="h-4 w-4" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {/* Summary */}
      <div className="text-sm text-slate-600">
        Total: <strong>{pagination.totalCount}</strong> requests
      </div>

      {/* Sortable and Filterable Table */}
      {requests.length === 0 ? (
        <div className="border border-slate-200 rounded-lg bg-white p-8 text-center">
          <p className="text-sm font-medium text-slate-700">No leave requests found</p>
          <p className="text-xs text-slate-500 mt-1">Try adjusting your filters or search term</p>
        </div>
      ) : (
        <SortableTable<LeaveRequest>
          data={requests}
          columns={columns}
          rowKey={(row) => row.id}
          showGlobalSearch={true}
          searchPlaceholder="Search by staff name, email, or department..."
        />
      )}

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
