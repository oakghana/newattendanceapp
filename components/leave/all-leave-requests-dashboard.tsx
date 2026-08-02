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
import { CheckCircle2, Download, Loader2, RotateCw, Search, XCircle } from "lucide-react"
import { ResumptionMemoModal } from "@/components/leave/resumption-memo-modal"
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
  status: string
  createdAt: string
  updatedAt: string
  hrApprovedAt?: string | null
  hodReviewers?: string[]
  daysOverdue: number
  staffConfirmed: boolean
  hodConfirmed: boolean
  resumptionMemoId: string | null
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
  const [departmentFilter, setDepartmentFilter] = useState("all")
  const [leaveTypeFilter, setLeaveTypeFilter] = useState("all")
  const [dateRangeFilter, setDateRangeFilter] = useState<{ from: string; to: string }>({ from: "", to: "" })
  const [searchTerm, setSearchTerm] = useState("")
  const [departments, setDepartments] = useState<string[]>([])
  const [leaveTypes, setLeaveTypes] = useState<string[]>([])
  const [memoModal, setMemoModal] = useState<{ open: boolean; memoId: string | null }>({ open: false, memoId: null })
  const [generatingMemoFor, setGeneratingMemoFor] = useState<string | null>(null) // rowId being generated

  const handleViewMemo = useCallback(async (row: LeaveRequest) => {
    // If memo already exists, open it directly
    if (row.resumptionMemoId) {
      setMemoModal({ open: true, memoId: row.resumptionMemoId })
      return
    }
    // Otherwise generate it on demand via POST to /api/leave/resumption-memo
    setGeneratingMemoFor(row.id)
    try {
      const res = await fetch("/api/leave/resumption-memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffUserId: row.userId,
          leaveEndDate: row.endDate,
          leaveType: row.leaveType || "leave",
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to generate memo")
      // Refresh the row so next time it has the memo ID
      setRequests(prev => prev.map(r => r.id === row.id ? { ...r, resumptionMemoId: data.memo_id } : r))
      setMemoModal({ open: true, memoId: data.memo_id })
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" })
    } finally {
      setGeneratingMemoFor(null)
    }
  }, [toast])

  const fetchRequests = useCallback(async (
    page = 1,
    status = "all",
    search = "",
    department = "all",
    leaveType = "all",
    dateFrom = "",
    dateTo = ""
  ) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append("page", String(page))
      params.append("page_size", "50")
      if (status !== "all") params.append("status", status)
      if (search) params.append("search", search)
      if (department !== "all") params.append("department", department)
      if (leaveType !== "all") params.append("leave_type", leaveType)
      if (dateFrom) params.append("date_from", dateFrom)
      if (dateTo) params.append("date_to", dateTo)

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

  // Load departments and leave types on mount
  useEffect(() => {
    const loadFilterOptions = async () => {
      try {
        const res = await fetch("/api/leave/filter-options")
        if (res.ok) {
          const json = await res.json()
          setDepartments(json.departments || [])
          setLeaveTypes(json.leaveTypes || [])
        }
      } catch (err) {
        console.error("Error loading filter options:", err)
      }
    }
    loadFilterOptions()
  }, [])

  useEffect(() => {
    fetchRequests(
      1,
      statusFilter,
      searchTerm,
      departmentFilter,
      leaveTypeFilter,
      dateRangeFilter.from,
      dateRangeFilter.to
    )
  }, [statusFilter, departmentFilter, leaveTypeFilter, dateRangeFilter, fetchRequests])

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

  const handleDepartmentChange = (value: string) => {
    setDepartmentFilter(value)
    setPagination(prev => ({ ...prev, page: 1 }))
  }

  const handleLeaveTypeChange = (value: string) => {
    setLeaveTypeFilter(value)
    setPagination(prev => ({ ...prev, page: 1 }))
  }

  const handleDateRangeChange = (type: "from" | "to", value: string) => {
    setDateRangeFilter(prev => ({ ...prev, [type]: value }))
    setPagination(prev => ({ ...prev, page: 1 }))
  }

  const clearAllFilters = () => {
    setStatusFilter("all")
    setDepartmentFilter("all")
    setLeaveTypeFilter("all")
    setDateRangeFilter({ from: "", to: "" })
    setSearchTerm("")
    setPagination(prev => ({ ...prev, page: 1 }))
  }

  const hasActiveFilters = statusFilter !== "all" || departmentFilter !== "all" || leaveTypeFilter !== "all" || dateRangeFilter.from || dateRangeFilter.to || searchTerm

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
      getValue: (row) => row.leaveType || "—",
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
    {
      key: "staffConfirmed",
      label: "Staff Confirmed",
      getValue: (row) => row.staffConfirmed,
      render: (row) => {
        const isHrApproved = row.status?.toLowerCase() === "hr_approved"
        if (row.staffConfirmed) {
          return (
            <Badge className="bg-green-100 text-green-800 border border-green-300 text-xs">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Confirmed
            </Badge>
          )
        }
        if (isHrApproved && row.daysOverdue > 0) {
          return (
            <Badge className={`border text-xs ${row.daysOverdue >= 5 ? "bg-red-100 text-red-800 border-red-300" : "bg-amber-100 text-amber-800 border-amber-300"}`}>
              <XCircle className="h-3 w-3 mr-1" />
              Awaiting
            </Badge>
          )
        }
        return <span className="text-slate-400 text-xs">—</span>
      },
      sortable: false,
      filterable: false,
      className: "text-center",
    },
    {
      key: "hodConfirmed",
      label: "HOD Confirmed",
      getValue: (row) => row.hodConfirmed,
      render: (row) => {
        const isHrApproved = row.status?.toLowerCase() === "hr_approved"
        if (row.hodConfirmed) {
          return (
            <Badge className="bg-green-100 text-green-800 border border-green-300 text-xs">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Confirmed
            </Badge>
          )
        }
        if (isHrApproved && row.daysOverdue > 0) {
          return (
            <Badge className={`border text-xs ${row.daysOverdue >= 5 ? "bg-red-100 text-red-800 border-red-300" : "bg-amber-100 text-amber-800 border-amber-300"}`}>
              <XCircle className="h-3 w-3 mr-1" />
              Pending
            </Badge>
          )
        }
        return <span className="text-slate-400 text-xs">—</span>
      },
      sortable: false,
      filterable: false,
      className: "text-center",
    },
    {
      key: "resumptionMemo",
      label: "Resumption Memo",
      getValue: (row) => (row.staffConfirmed && row.hodConfirmed ? "ready" : ""),
      render: (row) => {
        if (!row.staffConfirmed || !row.hodConfirmed) {
          return <span className="text-slate-400 text-xs">—</span>
        }
        const isGenerating = generatingMemoFor === row.id
        return (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            onClick={() => handleViewMemo(row)}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <><Loader2 className="h-3 w-3 animate-spin" /> Generating...</>
            ) : (
              <><Download className="h-3 w-3" /> View & Download</>
            )}
          </Button>
        )
      },
      sortable: false,
      filterable: false,
      className: "text-center",
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
      {/* Filters Section */}
      <div className="space-y-3 bg-slate-50 p-4 rounded-lg border border-slate-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700">Filters & Search</h3>
          {hasActiveFilters && (
            <Button
              onClick={clearAllFilters}
              variant="ghost"
              size="sm"
              className="text-xs h-7"
            >
              Clear All
            </Button>
          )}
        </div>

        {/* Search Bar */}
        <div className="flex gap-2">
          <Input
            placeholder="Search by name, email, ID..."
            value={searchTerm}
            onChange={handleSearch}
            onKeyDown={(e) => e.key === "Enter" && handleSearchSubmit()}
            className="text-sm"
          />
          <Button
            onClick={handleSearchSubmit}
            variant="outline"
            size="sm"
            className="gap-2 px-3"
          >
            <Search className="h-4 w-4" />
          </Button>
        </div>

        {/* Filter Row 1: Status, Department, Leave Type */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Status</label>
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

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Department</label>
            <Select value={departmentFilter} onValueChange={handleDepartmentChange}>
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map(dept => (
                  <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Leave Type</label>
            <Select value={leaveTypeFilter} onValueChange={handleLeaveTypeChange}>
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {leaveTypes.map(type => (
                  <SelectItem key={type} value={type}>{type.replace(/_/g, " ").toUpperCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => fetchRequests(
                pagination.page,
                statusFilter,
                searchTerm,
                departmentFilter,
                leaveTypeFilter,
                dateRangeFilter.from,
                dateRangeFilter.to
              )}
              variant="outline"
              size="sm"
              className="gap-2 w-full"
            >
              <RotateCw className="h-4 w-4" />
              <span>Refresh</span>
            </Button>
          </div>
        </div>

        {/* Filter Row 2: Date Range */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">From Date</label>
            <Input
              type="date"
              value={dateRangeFilter.from}
              onChange={(e) => handleDateRangeChange("from", e.target.value)}
              className="text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">To Date</label>
            <Input
              type="date"
              value={dateRangeFilter.to}
              onChange={(e) => handleDateRangeChange("to", e.target.value)}
              className="text-sm"
            />
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="text-sm text-slate-600">
        Total: <strong>{pagination.totalCount}</strong> requests
      </div>

      {/* Resumption Memo Modal — always mounted, toggled via state */}
      <ResumptionMemoModal
        isOpen={memoModal.open}
        memoId={memoModal.memoId}
        onClose={() => setMemoModal({ open: false, memoId: null })}
      />

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
          getRowStyle={(row) => {
            const isHrApproved = row.status?.toLowerCase() === "hr_approved"
            if (!isHrApproved || row.daysOverdue <= 0) return undefined
            const neitherConfirmed = !row.staffConfirmed && !row.hodConfirmed
            if (neitherConfirmed && row.daysOverdue >= 5)
              return { backgroundColor: "#fca5a5", borderLeft: "4px solid #dc2626" }
            if (neitherConfirmed && row.daysOverdue >= 1)
              return { backgroundColor: "#fecaca", borderLeft: "4px solid #ef4444" }
            if (row.daysOverdue >= 1)
              return { backgroundColor: "#fffbeb", borderLeft: "4px solid #f59e0b" }
            return undefined
          }}
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
