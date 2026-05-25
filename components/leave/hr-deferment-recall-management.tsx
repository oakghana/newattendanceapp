'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlertCircle, CheckCircle, Clock, FileText, Mail } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface DefermentRequest {
  id: string
  staff_name: string
  staff_email: string
  leave_type: string
  deferment_start_date: string
  deferment_end_date: string
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

interface RecallRequest {
  id: string
  staff_name: string
  staff_email: string
  leave_type: string
  recall_date: string
  recall_reason: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

export function HRDefermentRecallManagement() {
  const { toast } = useToast()
  const [deferrments, setDeferrments] = useState<DefermentRequest[]>([])
  const [recalls, setRecalls] = useState<RecallRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDeferment, setSelectedDeferment] = useState<string | null>(null)
  const [selectedRecall, setSelectedRecall] = useState<string | null>(null)
  const [decisionNote, setDecisionNote] = useState('')
  const [filterStatus, setFilterStatus] = useState('pending')
  const [processingId, setProcessingId] = useState<string | null>(null)

  useEffect(() => {
    fetchRequests()
  }, [filterStatus])

  const fetchRequests = async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/leave/hr-deferment-recall-management?status=${filterStatus}`)
      if (!res.ok) throw new Error('Failed to fetch requests')
      
      const data = await res.json()
      setDeferrments(data.deferments || [])
      setRecalls(data.recalls || [])
    } catch (error) {
      console.error('[v0] Error fetching requests:', error)
      toast({ title: 'Error', description: 'Failed to load requests', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (type: 'deferment' | 'recall', id: string) => {
    try {
      setProcessingId(id)
      const res = await fetch('/api/leave/hr-deferment-recall-management', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_type: type,
          request_id: id,
          decision: 'approved',
          decision_note: decisionNote,
          generate_memo: true
        })
      })

      if (!res.ok) throw new Error('Failed to approve')
      
      toast({ title: 'Success', description: `${type} approved and memo generated` })
      setDecisionNote('')
      fetchRequests()
    } catch (error) {
      console.error(`[v0] Error approving ${type}:`, error)
      toast({ title: 'Error', description: `Failed to approve ${type}`, variant: 'destructive' })
    } finally {
      setProcessingId(null)
    }
  }

  const handleReject = async (type: 'deferment' | 'recall', id: string) => {
    if (!decisionNote) {
      toast({ title: 'Error', description: 'Please provide a rejection reason', variant: 'destructive' })
      return
    }

    try {
      setProcessingId(id)
      const res = await fetch('/api/leave/hr-deferment-recall-management', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_type: type,
          request_id: id,
          decision: 'rejected',
          decision_note: decisionNote
        })
      })

      if (!res.ok) throw new Error('Failed to reject')
      
      toast({ title: 'Success', description: `${type} rejected` })
      setDecisionNote('')
      fetchRequests()
    } catch (error) {
      console.error(`[v0] Error rejecting ${type}:`, error)
      toast({ title: 'Error', description: `Failed to reject ${type}`, variant: 'destructive' })
    } finally {
      setProcessingId(null)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800'
      case 'approved':
        return 'bg-green-100 text-green-800'
      case 'rejected':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4" />
      case 'approved':
        return <CheckCircle className="h-4 w-4" />
      case 'rejected':
        return <AlertCircle className="h-4 w-4" />
      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="deferrments" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="deferrments">
            Deferments ({deferrments.length})
          </TabsTrigger>
          <TabsTrigger value="recalls">
            Recalls ({recalls.length})
          </TabsTrigger>
        </TabsList>

        <div className="mt-4 flex gap-2">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <TabsContent value="deferrments" className="space-y-4 mt-4">
          {loading ? (
            <p className="text-center text-gray-500 py-8">Loading deferrments...</p>
          ) : deferrments.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-gray-500">No deferment requests found</p>
              </CardContent>
            </Card>
          ) : (
            deferrments.map((deferment) => (
              <Card key={deferment.id} className="border-l-4 border-l-blue-500">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{deferment.staff_name}</CardTitle>
                      <CardDescription>{deferment.staff_email}</CardDescription>
                    </div>
                    <Badge className={getStatusColor(deferment.status)}>
                      {getStatusIcon(deferment.status)}
                      <span className="ml-1">{deferment.status.toUpperCase()}</span>
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Leave Type:</span>
                      <p>{deferment.leave_type}</p>
                    </div>
                    <div>
                      <span className="font-medium">Deferment Period:</span>
                      <p>{new Date(deferment.deferment_start_date).toLocaleDateString()} - {new Date(deferment.deferment_end_date).toLocaleDateString()}</p>
                    </div>
                  </div>
                  
                  <div>
                    <span className="font-medium text-sm">Reason:</span>
                    <p className="text-sm text-gray-600 mt-1">{deferment.reason}</p>
                  </div>

                  {deferment.status === 'pending' && selectedDeferment === deferment.id && (
                    <div className="mt-4 space-y-3 pt-4 border-t">
                      <div>
                        <label className="text-sm font-medium">Decision Note</label>
                        <Textarea
                          value={decisionNote}
                          onChange={(e) => setDecisionNote(e.target.value)}
                          placeholder="Add approval/rejection notes..."
                          className="mt-1"
                        />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="outline"
                          onClick={() => setSelectedDeferment(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => handleReject('deferment', deferment.id)}
                          disabled={processingId === deferment.id}
                        >
                          Reject
                        </Button>
                        <Button
                          className="bg-green-600 hover:bg-green-700"
                          onClick={() => handleApprove('deferment', deferment.id)}
                          disabled={processingId === deferment.id}
                        >
                          Approve & Generate Memo
                        </Button>
                      </div>
                    </div>
                  )}

                  {deferment.status === 'pending' && selectedDeferment !== deferment.id && (
                    <Button
                      variant="outline"
                      className="w-full mt-2"
                      onClick={() => setSelectedDeferment(deferment.id)}
                    >
                      Review
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="recalls" className="space-y-4 mt-4">
          {loading ? (
            <p className="text-center text-gray-500 py-8">Loading recalls...</p>
          ) : recalls.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-gray-500">No recall requests found</p>
              </CardContent>
            </Card>
          ) : (
            recalls.map((recall) => (
              <Card key={recall.id} className="border-l-4 border-l-orange-500">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{recall.staff_name}</CardTitle>
                      <CardDescription>{recall.staff_email}</CardDescription>
                    </div>
                    <Badge className={getStatusColor(recall.status)}>
                      {getStatusIcon(recall.status)}
                      <span className="ml-1">{recall.status.toUpperCase()}</span>
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Leave Type:</span>
                      <p>{recall.leave_type}</p>
                    </div>
                    <div>
                      <span className="font-medium">Recall Date:</span>
                      <p>{new Date(recall.recall_date).toLocaleDateString()}</p>
                    </div>
                  </div>
                  
                  <div>
                    <span className="font-medium text-sm">Reason:</span>
                    <p className="text-sm text-gray-600 mt-1">{recall.recall_reason}</p>
                  </div>

                  {recall.status === 'pending' && selectedRecall === recall.id && (
                    <div className="mt-4 space-y-3 pt-4 border-t">
                      <div>
                        <label className="text-sm font-medium">Decision Note</label>
                        <Textarea
                          value={decisionNote}
                          onChange={(e) => setDecisionNote(e.target.value)}
                          placeholder="Add approval/rejection notes..."
                          className="mt-1"
                        />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="outline"
                          onClick={() => setSelectedRecall(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => handleReject('recall', recall.id)}
                          disabled={processingId === recall.id}
                        >
                          Reject
                        </Button>
                        <Button
                          className="bg-green-600 hover:bg-green-700"
                          onClick={() => handleApprove('recall', recall.id)}
                          disabled={processingId === recall.id}
                        >
                          Approve & Generate Memo
                        </Button>
                      </div>
                    </div>
                  )}

                  {recall.status === 'pending' && selectedRecall !== recall.id && (
                    <Button
                      variant="outline"
                      className="w-full mt-2"
                      onClick={() => setSelectedRecall(recall.id)}
                    >
                      Review
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
