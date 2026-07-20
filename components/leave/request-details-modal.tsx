'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Clock, User, Calendar, AlertCircle } from 'lucide-react'

export interface RequestDetailsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  filter: 'pending' | 'approved' | 'payment-pending' | 'payment-approved' | 'hod-pending'
}

interface LeaveRequest {
  id: string
  staff_name: string
  staff_id: string
  leave_type: string
  start_date: string
  end_date: string
  status?: string
  hod_review_status?: string
  daysPending?: number
  ageColor?: string
  user_profiles?: {
    employee_id?: string
    departments?: { name?: string }
  }
}

export function RequestDetailsModal({ open, onOpenChange, title, filter }: RequestDetailsModalProps) {
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    const fetchRequests = async () => {
      setLoading(true)
      setError(null)
      try {
        let endpoint = '/api/leave/requests?limit=1000'

        if (filter === 'hod-pending') {
          endpoint = '/api/leave/hod-pending-requests'
        } else if (filter === 'pending') {
          endpoint = '/api/leave/hr-staff-pending-requests'
        } else if (filter === 'approved') {
          endpoint = '/api/leave/requests?status=approved&limit=1000'
        } else if (filter === 'payment-pending') {
          endpoint = '/api/leave/payment-advice/pending-approval'
        } else if (filter === 'payment-approved') {
          endpoint = '/api/leave/payment-advice/approved-memos'
        }

        const res = await fetch(endpoint)
        
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`)
        }

        const data = await res.json()

        if (!data) {
          setRequests([])
          return
        }

        // Extract requests from different response formats
        let results: LeaveRequest[] = []
        
        if (filter === 'hod-pending') {
          results = Array.isArray(data.requests) ? data.requests : []
        } else if (filter === 'payment-pending' || filter === 'payment-approved') {
          results = Array.isArray(data.memos) ? data.memos : Array.isArray(data) ? data : []
        } else {
          results = Array.isArray(data.records) ? data.records : Array.isArray(data.requests) ? data.requests : Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : []
        }

        setRequests(Array.isArray(results) ? results : [])
      } catch (err) {
        console.error('[v0] Fetch requests error:', err)
        setError(`Failed to load requests: ${err instanceof Error ? err.message : 'Unknown error'}`)
      } finally {
        setLoading(false)
      }
    }

    fetchRequests()
  }, [open, filter])

  const getAgingBadgeColor = (daysPending?: number) => {
    if (!daysPending) return 'bg-gray-100 text-gray-800'
    if (daysPending > 7) return 'bg-red-100 text-red-800'
    if (daysPending > 3) return 'bg-amber-100 text-amber-800'
    return 'bg-green-100 text-green-800'
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="py-8 text-center text-muted-foreground">
            Loading requests...
          </div>
        )}

        {error && (
          <div className="py-4 px-4 bg-red-50 border border-red-200 rounded-lg text-red-800 flex gap-2">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {!loading && !error && requests.length === 0 && (
          <div className="py-8 text-center text-muted-foreground">
            No requests found
          </div>
        )}

        <div className="space-y-3">
          {requests.map((req, idx) => (
            <Card key={req.id || idx} className="border hover:border-primary/50 transition-colors">
              <CardContent className="pt-4 pb-4">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground">{req.staff_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {req.user_profiles?.employee_id} • {req.user_profiles?.departments?.name || 'N/A'}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {req.daysPending !== undefined && (
                        <Badge className={getAgingBadgeColor(req.daysPending)}>
                          {req.daysPending} days pending
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-xs">
                        {req.leave_type}
                      </Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>
                        {req.start_date 
                          ? new Date(req.start_date).toLocaleDateString() 
                          : 'N/A'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>
                        {req.end_date 
                          ? new Date(req.end_date).toLocaleDateString() 
                          : 'N/A'}
                      </span>
                    </div>
                  </div>

                  {req.status && (
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {req.status}
                      </Badge>
                    </div>
                  )}

                  {req.hod_review_status && (
                    <div className="flex items-center gap-2 text-xs bg-muted/50 p-2 rounded">
                      <Clock className="h-4 w-4 text-amber-600" />
                      <span className="text-muted-foreground">
                        HOD Review: {req.hod_review_status}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
