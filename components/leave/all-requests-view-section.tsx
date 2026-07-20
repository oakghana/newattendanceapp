'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Clock, User, Calendar, AlertCircle, Loader2, Search } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface LeaveRequest {
  id: string
  staff_name?: string
  user_profiles?: {
    first_name?: string
    last_name?: string
    employee_id?: string
    departments?: { name?: string }
  }
  leave_type?: string
  start_date?: string
  end_date?: string
  status?: string
  hod_review_status?: string
  created_at?: string
  daysPending?: number
}

export function AllRequestsViewSection() {
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [filteredRequests, setFilteredRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    fetchAllRequests()
  }, [])

  useEffect(() => {
    // Filter requests based on search term
    const filtered = requests.filter((req) => {
      const staffName =
        `${req.user_profiles?.first_name || ''} ${req.user_profiles?.last_name || ''}`.toLowerCase() ||
        req.staff_name?.toLowerCase() ||
        ''
      const deptName = req.user_profiles?.departments?.name?.toLowerCase() || ''
      const empId = req.user_profiles?.employee_id?.toLowerCase() || ''
      const searchLower = searchTerm.toLowerCase()

      return staffName.includes(searchLower) || deptName.includes(searchLower) || empId.includes(searchLower)
    })
    setFilteredRequests(filtered)
  }, [searchTerm, requests])

  const fetchAllRequests = async () => {
    try {
      setLoading(true)
      setError(null)

      const res = await fetch('/api/leave/requests?limit=1000')

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      const data = await res.json()
      setRequests(Array.isArray(data.records) ? data.records : Array.isArray(data.data) ? data.data : [])
    } catch (err) {
      console.error('[v0] All requests fetch error:', err)
      setError('Failed to load requests')
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string | undefined) => {
    switch (status?.toLowerCase()) {
      case 'approved':
        return <Badge className="bg-green-100 text-green-700">Approved</Badge>
      case 'rejected':
        return <Badge className="bg-red-100 text-red-700">Rejected</Badge>
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-700">Pending</Badge>
      default:
        return <Badge variant="outline">{status || 'Unknown'}</Badge>
    }
  }

  const getHodStatusBadge = (status: string | undefined) => {
    switch (status?.toLowerCase()) {
      case 'approved':
        return <Badge className="bg-blue-100 text-blue-700">HOD Approved</Badge>
      case 'rejected':
        return <Badge className="bg-red-100 text-red-700">HOD Rejected</Badge>
      case 'pending':
        return <Badge className="bg-orange-100 text-orange-700">Pending HOD</Badge>
      default:
        return <Badge variant="outline">-</Badge>
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by staff name, department, or employee ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {filteredRequests.length === 0 && requests.length > 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            <p>No requests match your search</p>
          </CardContent>
        </Card>
      ) : filteredRequests.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            <p>No leave requests found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Staff Name</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Leave Type</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>HOD Review</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRequests.map((req) => {
                const staffName =
                  `${req.user_profiles?.first_name || ''} ${req.user_profiles?.last_name || ''}`.trim() ||
                  req.staff_name ||
                  'Unknown'
                const deptName = req.user_profiles?.departments?.name || 'N/A'
                const startDate = req.start_date ? new Date(req.start_date).toLocaleDateString() : 'N/A'
                const endDate = req.end_date ? new Date(req.end_date).toLocaleDateString() : 'N/A'

                return (
                  <TableRow key={req.id}>
                    <TableCell className="font-medium">{staffName}</TableCell>
                    <TableCell>{deptName}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{req.leave_type || 'Leave'}</Badge>
                    </TableCell>
                    <TableCell>{startDate}</TableCell>
                    <TableCell>{endDate}</TableCell>
                    <TableCell>{getStatusBadge(req.status)}</TableCell>
                    <TableCell>{getHodStatusBadge(req.hod_review_status)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {filteredRequests.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Showing {filteredRequests.length} of {requests.length} requests
        </p>
      )}
    </div>
  )
}
