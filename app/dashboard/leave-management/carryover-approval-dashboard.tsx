'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Loader2, Clock, AlertCircle, Search, Download, Calendar, TrendingUp } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface CarryoverRequest {
  id: string
  staff_id: string
  staff_name: string
  staff_employee_id: string
  staff_position: string
  staff_department: string
  leave_year: string
  leave_type_key: string
  balance_available: number
  max_carryover_allowed: number
  requested_carryover_days: number
  approved_days: number
  forfeited_days: number
  status: string
  requested_at: string
  approval_note: string
  approval_reason: string
  forfeited_reason: string
}

export function CarryoverApprovalDashboard() {
  const [carryoverRequests, setCarryoverRequests] = useState<CarryoverRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'>('ALL')
  const [searchTerm, setSearchTerm] = useState('')
  const [leaveYear, setLeaveYear] = useState('2025/2026')
  const { toast } = useToast()

  useEffect(() => {
    fetchCarryovers()
  }, [filterStatus, leaveYear])

  const fetchCarryovers = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterStatus !== 'ALL') params.append('status', filterStatus)
      if (leaveYear) params.append('leave_year', leaveYear)
      params.append('limit', '100')

      const res = await fetch(`/api/leave/carryover/pending?${params.toString()}`)
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        console.error('[v0] Carryover fetch error:', res.status, errorData)
        toast({
          title: 'Error',
          description: errorData.error || `Failed to load carryover data (${res.status})`,
          variant: 'destructive',
        })
        setCarryoverRequests([])
        return
      }
      
      const data = await res.json()
      setCarryoverRequests(data.carryover_requests || [])
    } catch (error) {
      console.error('[v0] Failed to fetch carryover data:', error)
      toast({
        title: 'Error',
        description: 'Failed to load carryover data',
        variant: 'destructive',
      })
      setCarryoverRequests([])
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Pending</Badge>
      case 'APPROVED':
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Approved</Badge>
      case 'REJECTED':
        return <Badge className="bg-red-100 text-red-800 border-red-200">Rejected</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  // Filter by search term
  const filteredRequests = carryoverRequests.filter(req => 
    req.staff_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    req.staff_employee_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    req.staff_department?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Calculate stats
  const stats = {
    pending: carryoverRequests.filter(r => r.status === 'PENDING').length,
    approved: carryoverRequests.filter(r => r.status === 'APPROVED').length,
    rejected: carryoverRequests.filter(r => r.status === 'REJECTED').length,
    totalDays: carryoverRequests.reduce((sum, r) => sum + (r.requested_carryover_days || 0), 0),
    totalDaysTaken: carryoverRequests.reduce((sum, r) => sum + (r.approved_days || 0), 0),
    totalDaysForfeited: carryoverRequests.reduce((sum, r) => sum + (r.forfeited_days || 0), 0),
  }

  const exportToCSV = () => {
    const headers = ['Staff Name', 'Employee ID', 'Department', 'Leave Year', 'Leave Type', 'Requested Days', 'Approved Days', 'Forfeited Days', 'Status', 'Requested Date']
    const rows = filteredRequests.map(req => [
      req.staff_name,
      req.staff_employee_id,
      req.staff_department,
      req.leave_year,
      req.leave_type_key,
      req.requested_carryover_days,
      req.approved_days || 0,
      req.forfeited_days || 0,
      req.status,
      new Date(req.requested_at).toLocaleDateString(),
    ])
    
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `carryover-report-${leaveYear.replace('/', '-')}.csv`
    a.click()
  }

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-600">{stats.pending}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600">Approved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-600">{stats.approved}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600">Rejected</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{stats.rejected}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600">Total Days</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{stats.totalDays}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 flex-wrap">
        {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).map(status => (
          <Button
            key={status}
            variant={filterStatus === status ? 'default' : 'outline'}
            onClick={() => setFilterStatus(status)}
            size="sm"
          >
            {status}
          </Button>
        ))}
      </div>

      {/* Empty State when no data */}
      {!loading && carryoverRequests.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-slate-400 mb-2" />
            <p className="text-slate-600 font-medium">No carryover requests found</p>
            <p className="text-sm text-slate-500 mt-1">There are no carryover records for this period</p>
          </CardContent>
        </Card>
      )}

      {/* Additional Stats when we have data */}
      {carryoverRequests.length > 0 && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="bg-blue-50 border-blue-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-blue-700 flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Total Days Taken
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-700">{stats.totalDaysTaken}</div>
            </CardContent>
          </Card>

          <Card className="bg-rose-50 border-rose-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-rose-700">Days Forfeited</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-rose-700">{stats.totalDaysForfeited}</div>
            </CardContent>
          </Card>

          <Card className="bg-emerald-50 border-emerald-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-emerald-700">Carryovers Approved</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-emerald-700">{stats.approved}</div>
            </CardContent>
          </Card>

          <Card className="bg-purple-50 border-purple-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-purple-700">Adjustments Made</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-purple-700">{stats.approved + stats.rejected}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters & Export */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters & Export</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search staff or leave type..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <select
              value={leaveYear}
              onChange={(e) => setLeaveYear(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
            >
              <option value="2025/2026">2025/2026</option>
              <option value="2024/2025">2024/2025</option>
              <option value="2023/2024">2023/2024</option>
            </select>
            <select className="px-3 py-2 border border-slate-300 rounded-lg text-sm">
              <option value="">All Types</option>
              <option value="annual">Annual</option>
              <option value="casual">Casual</option>
              <option value="sick">Sick</option>
            </select>
            <Button onClick={exportToCSV} variant="default" className="bg-emerald-600 hover:bg-emerald-700">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          <span className="ml-2 text-slate-500">Loading carryover data...</span>
        </div>
      )}

      {/* Requests Table */}
      {!loading && filteredRequests.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Staff</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Leave Year</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Type</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Days</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Balance</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Reason</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Created By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRequests.map((request) => (
                    <tr key={request.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {new Date(request.requested_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-slate-900">{request.staff_name}</div>
                        <div className="text-xs text-slate-500">{request.staff_employee_id}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">{request.leave_year}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-xs uppercase">
                          {request.leave_type_key?.replace('_', ' ') || 'LEAVE_TAKEN'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-rose-600">
                        {request.requested_carryover_days > 0 ? `-${request.requested_carryover_days}` : request.requested_carryover_days}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-slate-700">
                        {request.balance_available || 0}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {request.approval_reason || request.forfeited_reason || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">System</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
