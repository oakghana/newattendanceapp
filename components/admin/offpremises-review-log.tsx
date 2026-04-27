'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertTriangle,
  MapPin,
  User,
  CheckCircle2,
  Calendar,
  Navigation,
  Loader2,
  Download,
  ArrowUpDown,
  Filter,
  X,
  RefreshCw,
} from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'

interface ApprovedRecord {
  id: string
  user_id: string
  check_in_time: string
  actual_location_name: string
  actual_latitude: number
  actual_longitude: number
  on_official_duty_outside_premises: boolean
  check_in_type: string
  device_info: any
  staff_name: string
  current_location_name: string
  google_maps_name: string
  reason?: string
  request_type?: string
  approved_at: string
  latitude: number
  longitude: number
  user_profiles: {
    id: string
    first_name: string
    last_name: string
    email: string
    department_id: string
    phone?: string
  }
  approved_by?: {
    id: string
    first_name: string
    last_name: string
  }
}

type SortField = 'staff_name' | 'location' | 'approval_time' | 'department'
type SortOrder = 'asc' | 'desc'

export function OffPremisesReviewLog() {
  const [records, setRecords] = useState<ApprovedRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [managerProfile, setManagerProfile] = useState<any>(null)
  const [totalRecords, setTotalRecords] = useState(0)
  const [currentPage, setCurrentPage] = useState(0)
  const [pageSize] = useState(20)

  // Search and filter state
  const [searchTerm, setSearchTerm] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState<string | null>(null)
  const [departments, setDepartments] = useState<any[]>([])
  const [sortField, setSortField] = useState<SortField>('approval_time')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
  }

  const SortableHeader = ({ field, label }: { field: SortField; label: string }) => (
    <TableHead
      onClick={() => handleSort(field)}
      className="cursor-pointer hover:bg-gray-100 select-none"
    >
      <div className="flex items-center gap-2">
        {label}
        <ArrowUpDown
          className={`h-4 w-4 ${sortField === field ? 'text-blue-600' : 'text-gray-300'}`}
        />
      </div>
    </TableHead>
  )

  const loadApprovedRecords = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const supabase = createClient()

      // Step 1: get current user (fast — uses cached session)
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
      if (authError || !authUser) {
        setError('Authentication error — please log in again')
        return
      }

      // Step 2: fetch user profile + departments in PARALLEL
      const [profileResult, deptResult] = await Promise.all([
        supabase
          .from('user_profiles')
          .select('id, role, department_id')
          .eq('id', authUser.id)
          .maybeSingle(),
        supabase
          .from('departments')
          .select('id, name, code')
          .order('name'),
      ])

      if (profileResult.error || !profileResult.data) {
        setError('Failed to fetch user profile')
        return
      }

      const profile = profileResult.data
      setManagerProfile(profile)
      setDepartments(deptResult.data || [])

      // Step 3: build and execute the main records query
      let query = supabase
        .from('pending_offpremises_checkins')
        .select(`
          id,
          user_id,
          current_location_name,
          google_maps_name,
          latitude,
          longitude,
          reason,
          request_type,
          created_at,
          approved_at,
          status,
          device_info,
          user_profiles!pending_offpremises_checkins_user_id_fkey (
            id,
            first_name,
            last_name,
            email,
            department_id,
            phone,
            departments ( id, name, code )
          ),
          approved_by:approved_by_id (
            id,
            first_name,
            last_name
          )
        `, { count: 'exact' })
        .eq('status', 'approved')
        .order('approved_at', { ascending: false })
        .range(0, 499) // load up to 500 records for client-side filtering

      // Department heads only see their department's staff
      if (profile.role === 'department_head' && profile.department_id) {
        query = query.eq('user_profiles.department_id', profile.department_id)
      }

      const { data: requestRecords, error: fetchError, count } = await query

      if (fetchError) {
        console.error('[v0] Off-premises fetch error:', fetchError)
        setError('Failed to fetch approved records: ' + fetchError.message)
        return
      }

      setRecords((requestRecords as any[]) || [])
      setTotalRecords(count || 0)
    } catch (err: any) {
      console.error('[v0] Unexpected error:', err)
      setError(err.message || 'An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Fire on mount
  useEffect(() => {
    loadApprovedRecords()
  }, [loadApprovedRecords])

  // Apply client-side filtering and sorting
  const filteredAndSortedRecords = useMemo(() => {
    let filtered = [...records]

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(
        (r) =>
          r.user_profiles?.first_name.toLowerCase().includes(term) ||
          r.user_profiles?.last_name.toLowerCase().includes(term) ||
          r.user_profiles?.email.toLowerCase().includes(term) ||
          r.current_location_name?.toLowerCase().includes(term) ||
          r.google_maps_name?.toLowerCase().includes(term)
      )
    }

    // Department filter
    if (departmentFilter) {
      filtered = filtered.filter((r) => r.user_profiles?.department_id === departmentFilter)
    }

    // Date filters
    if (dateFrom) {
      const fromDate = new Date(dateFrom)
      filtered = filtered.filter((r) => new Date(r.approved_at || r.created_at) >= fromDate)
    }
    if (dateTo) {
      const toDate = new Date(dateTo)
      toDate.setHours(23, 59, 59, 999)
      filtered = filtered.filter((r) => new Date(r.approved_at || r.created_at) <= toDate)
    }

    // Sorting
    filtered.sort((a, b) => {
      let aVal: any
      let bVal: any

      if (sortField === 'staff_name') {
        aVal = `${a.user_profiles?.first_name} ${a.user_profiles?.last_name}`
        bVal = `${b.user_profiles?.first_name} ${b.user_profiles?.last_name}`
      } else if (sortField === 'location') {
        aVal = a.current_location_name
        bVal = b.current_location_name
      } else if (sortField === 'approval_time') {
        aVal = new Date(a.approved_at || a.created_at)
        bVal = new Date(b.approved_at || b.created_at)
      } else if (sortField === 'department') {
        aVal = a.user_profiles?.department_id
        bVal = b.user_profiles?.department_id
      }

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1
      return 0
    })

    return filtered
  }, [records, searchTerm, departmentFilter, dateFrom, dateTo, sortField, sortOrder])

  // Apply pagination to filtered and sorted records
  const paginatedRecords = useMemo(() => {
    const start = currentPage * pageSize
    const end = start + pageSize
    return filteredAndSortedRecords.slice(start, end)
  }, [filteredAndSortedRecords, currentPage, pageSize])

  const totalPages = Math.ceil(filteredAndSortedRecords.length / pageSize)

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return dateString
    }
  }

  const formatCoordinates = (lat: number, lon: number) => {
    return `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`
  }

  const handleExportCSV = () => {
    if (filteredAndSortedRecords.length === 0) {
      alert('No records to export')
      return
    }

    const csv = [
      [
        'Staff Name',
        'Email',
        'Department',
        'Request Type',
        'Phone',
        'Location Name',
        'Google Maps Location',
        'Coordinates',
        'Off-Grid Hours',
        'Reason',
        'Check-In Time',
        'Approved By',
        'Device Info',
      ].join(','),
      ...filteredAndSortedRecords.map((record) =>
        [
          `"${record.user_profiles?.first_name} ${record.user_profiles?.last_name}"`,
          record.user_profiles?.email,
          record.user_profiles?.department_id || 'N/A',
          record.request_type === 'checkout' ? 'Checkout' : 'Check-in',
          record.user_profiles?.phone || 'N/A',
          `"${record.current_location_name}"`,
          `"${record.google_maps_name || ''}"`,
          formatCoordinates(record.latitude, record.longitude),
          `"${(record.device_info as any)?.off_grid_hours_before_request ?? 'N/A'}"`,
          `"${record.reason || 'Not provided'}"`,
          formatDate(record.approved_at || record.created_at),
          `"${record.approved_by?.first_name || ''} ${record.approved_by?.last_name || ''}"`,
          `"${record.device_info || ''}"`,
        ].join(',')
      ),
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `off-premises-review-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <Skeleton className="h-9 w-64 mb-2" />
            <Skeleton className="h-5 w-96" />
          </div>
          <Card className="mb-6">
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-9" />)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 space-y-4">
              {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
                <h1 className="text-3xl font-bold">Off-Premises Review Log</h1>
              </div>
              <p className="text-gray-600 ml-9">
                View all approved off-premises check-ins and staff location records
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => { setCurrentPage(0); loadApprovedRecords() }}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
              <Button
                onClick={handleExportCSV}
                disabled={records.length === 0}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
            </div>
          </div>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filters & Search
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">Search</label>
                <Input
                  placeholder="Staff name, email, location..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value)
                    setCurrentPage(0)
                  }}
                  className="h-9"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">Department</label>
                <select
                  value={departmentFilter || ''}
                  onChange={(e) => {
                    setDepartmentFilter(e.target.value || null)
                    setCurrentPage(0)
                  }}
                  className="w-full h-9 px-3 border border-gray-300 rounded-md text-sm"
                >
                  <option value="">All Departments</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">From Date</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value)
                    setCurrentPage(0)
                  }}
                  className="w-full h-9 px-3 border border-gray-300 rounded-md text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">To Date</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value)
                    setCurrentPage(0)
                  }}
                  className="w-full h-9 px-3 border border-gray-300 rounded-md text-sm"
                />
              </div>
            </div>
            {(searchTerm || departmentFilter || dateFrom || dateTo) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchTerm('')
                  setDepartmentFilter(null)
                  setDateFrom('')
                  setDateTo('')
                  setCurrentPage(0)
                }}
                className="mt-4 gap-2"
              >
                <X className="h-4 w-4" />
                Clear Filters
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Off-Premises Request Records</CardTitle>
                <CardDescription>
                  Showing {filteredAndSortedRecords.length} of {totalRecords} total approved requests
                </CardDescription>
              </div>
              <Button
                onClick={handleExportCSV}
                disabled={filteredAndSortedRecords.length === 0}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {filteredAndSortedRecords.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle2 className="h-12 w-12 text-gray-300 mb-4" />
                <p className="text-gray-600 text-lg font-medium">No approved records found</p>
                <p className="text-gray-500 mt-2">
                  {searchTerm || departmentFilter || dateFrom || dateTo
                    ? 'Try adjusting your filters'
                    : 'Off-premises check-ins will appear here once approved'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableHeader field="staff_name" label="Staff Name" />
                      <TableHead>Email</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Type</TableHead>
                      <SortableHeader field="location" label="Location" />
                      <TableHead>Coordinates</TableHead>
                      <TableHead>Off-Grid</TableHead>
                      <TableHead>Reason</TableHead>
                      <SortableHeader field="approval_time" label="Approval Time" />
                      <TableHead>Approved By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedRecords.map((record) => (
                      <TableRow key={record.id} className="hover:bg-gray-50">
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-gray-400" />
                            <div>
                              <p>
                                {record.user_profiles?.first_name} {record.user_profiles?.last_name}
                              </p>
                              {record.user_profiles?.phone && (
                                <p className="text-xs text-gray-500">{record.user_profiles?.phone}</p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {record.user_profiles?.email}
                        </TableCell>
                        <TableCell className="text-sm">
                          {(record.user_profiles as any)?.departments?.name ||
                            departments.find((d) => d.id === record.user_profiles?.department_id)?.name ||
                            'N/A'}
                        </TableCell>
                        <TableCell className="text-sm">
                          <Badge variant="outline">
                            {record.request_type === 'checkout' ? 'Checkout' : 'Check-in'}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <div className="flex items-start gap-2">
                            <MapPin className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                            <div className="text-sm">
                              <p className="font-medium">{record.current_location_name}</p>
                              {record.google_maps_name &&
                                record.google_maps_name !== record.current_location_name && (
                                  <p className="text-gray-500 text-xs">{record.google_maps_name}</p>
                                )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="flex items-center gap-2">
                            <Navigation className="h-4 w-4 text-blue-500" />
                            <span className="font-mono text-xs">
                              {formatCoordinates(record.latitude, record.longitude)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {typeof (record.device_info as any)?.off_grid_hours_before_request === 'number'
                            ? `${(record.device_info as any).off_grid_hours_before_request} hrs`
                            : 'N/A'}
                        </TableCell>
                        <TableCell className="text-sm max-w-xs">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                            <div className="text-sm">
                              <p className="text-gray-700">{record.reason || 'Not provided'}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-gray-400" />
                            {formatDate(record.approved_at || record.created_at)}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {record.approved_by?.first_name && record.approved_by?.last_name ? (
                            <Badge variant="outline">
                              {record.approved_by.first_name} {record.approved_by.last_name}
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Pending</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Pagination */}
            {filteredAndSortedRecords.length > pageSize && (
              <div className="flex flex-col md:flex-row items-center justify-between mt-6 pt-6 border-t gap-4">
                <p className="text-sm text-gray-600 order-2 md:order-1">
                  Showing <span className="font-semibold">{currentPage * pageSize + 1}</span> to{' '}
                  <span className="font-semibold">
                    {Math.min((currentPage + 1) * pageSize, filteredAndSortedRecords.length)}
                  </span>{' '}
                  of <span className="font-semibold">{filteredAndSortedRecords.length}</span> records
                  {filteredAndSortedRecords.length < totalRecords && (
                    <span className="text-gray-500 ml-1">
                      ({filteredAndSortedRecords.length} after filtering)
                    </span>
                  )}
                </p>
                <div className="flex items-center gap-2 order-1 md:order-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                    disabled={currentPage === 0}
                    className="gap-2"
                  >
                    Previous
                  </Button>
                  <div className="px-4 py-2 bg-gray-50 rounded-md text-sm font-medium text-gray-700 border">
                    Page {currentPage + 1} of {totalPages}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
                    disabled={currentPage >= totalPages - 1}
                    className="gap-2"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
