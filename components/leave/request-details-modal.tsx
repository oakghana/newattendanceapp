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
    department_name?: string
    departments?: { name?: string }
    full_name?: string
    first_name?: string
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
        // The overview counts approved using these statuses; we must match exactly
        const APPROVED_STATUSES = ['approved', 'hr_approved', 'hod_approved', 'finalized', 'completed']
        // The overview counts HOD pending using these statuses
        const HOD_PENDING_STATUSES = ['pending_hod_review', 'hod_review', 'pending_hod', 'submitted']

        let results: LeaveRequest[] = []

        if (filter === 'payment-pending') {
          const res = await fetch('/api/leave/payment-advice/pending-approval')
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const d = await res.json()
          results = Array.isArray(d.memos) ? d.memos : Array.isArray(d) ? d : []
        } else if (filter === 'payment-approved') {
          const res = await fetch('/api/leave/payment-advice/approved-memos')
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const d = await res.json()
          results = Array.isArray(d.memos) ? d.memos : Array.isArray(d) ? d : []
        } else if (filter === 'pending') {
          const res = await fetch('/api/leave/hr-staff-pending-requests')
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const d = await res.json()
          results = Array.isArray(d.requests) ? d.requests
            : Array.isArray(d.data) ? d.data
            : Array.isArray(d) ? d : []
        } else if (filter === 'approved') {
          // Fetch all requests and client-filter by approved statuses to match the metric
          const res = await fetch('/api/leave/requests?limit=2000')
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const d = await res.json()
          const all: any[] = Array.isArray(d.data) ? d.data
            : Array.isArray(d.records) ? d.records
            : Array.isArray(d.requests) ? d.requests
            : Array.isArray(d) ? d : []
          results = all.filter((r: any) => APPROVED_STATUSES.includes(r.status))
        } else if (filter === 'hod-pending') {
          // Fetch all requests and client-filter by HOD pending statuses to match the metric
          const res = await fetch('/api/leave/requests?limit=2000')
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const d = await res.json()
          const all: any[] = Array.isArray(d.data) ? d.data
            : Array.isArray(d.records) ? d.records
            : Array.isArray(d.requests) ? d.requests
            : Array.isArray(d) ? d : []
          // Also include hod-pending-requests results which use hod_decision filter
          const hodRes = await fetch('/api/leave/hod-pending-requests')
          const hodData = hodRes.ok ? await hodRes.json() : {}
          const hodRequests: any[] = Array.isArray(hodData.requests) ? hodData.requests : []
          // Merge both sources, deduplicate by id
          const fromStatus = all.filter((r: any) => HOD_PENDING_STATUSES.includes(r.status))
          const merged = [...fromStatus]
          hodRequests.forEach((hr: any) => {
            if (!merged.find(m => m.id === hr.id)) merged.push(hr)
          })
          results = merged
        } else {
          const res = await fetch('/api/leave/requests?limit=2000')
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const d = await res.json()
          results = Array.isArray(d.data) ? d.data
            : Array.isArray(d.records) ? d.records
            : Array.isArray(d.requests) ? d.requests
            : Array.isArray(d) ? d : []
        }

        // Map fields to match interface: ensure staff_name is populated
        const mapped = results.map((req: any) => ({
          ...req,
          staff_name: req.staff_name || req.user_profiles?.full_name || req.user_profiles?.first_name || 'N/A',
          staff_id: req.staff_id || req.user_profiles?.employee_id || 'N/A',
        }))

        setRequests(Array.isArray(mapped) ? mapped : [])
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
                        {req.user_profiles?.employee_id || req.staff_id || 'Staff'} • {req.user_profiles?.department_name || req.user_profiles?.departments?.name || 'General'}
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
