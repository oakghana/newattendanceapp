'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Download, FileText, Calendar, Clock, CheckCircle, AlertCircle, DollarSign } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { format } from 'date-fns'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

interface DefermentRequest {
  id: string
  user_id: string
  reason: string
  requested_deferment_period: string
  requested_deferment_year: string
  deferment_start_date: string
  deferment_end_date: string
  original_start_date: string
  original_end_date: string
  status: string
  created_at: string
  user_profiles: {
    id: string
    first_name: string
    last_name: string
    employee_id: string
    position: string
    departments: { name: string }
  }
}

interface RecallRequest {
  id: string
  staff_user_id: string
  recall_date: string
  recall_reason: string
  recall_notes: string
  status: string
  created_at: string
  user_profiles: {
    id: string
    first_name: string
    last_name: string
    employee_id: string
    position: string
    departments: { name: string }
  }
}

interface PaymentAdviceMemo {
  id: string
  staffName: string
  leaveType: string
  leaveYear: string
  staffCategory: string
  approvedDays: number
  paymentAmount: number | null
  paymentCurrency: string
  status: string
  createdAt: string
  forwardedAt: string | null
  acknowledgedAt: string | null
  leaveStartDate: string | null
  leaveEndDate: string | null
}

interface Props {
  userId: string
  userProfile: any
  initialDefermentRequests: DefermentRequest[]
  initialRecallRequests: RecallRequest[]
}

export function StaffRequestsClient({
  userId,
  userProfile,
  initialDefermentRequests,
  initialRecallRequests,
}: Props) {
  const { toast } = useToast()
  const [memoRefDialogOpen, setMemoRefDialogOpen] = useState(false)
  const [memoRefNumber, setMemoRefNumber] = useState('')
  const [selectedRequest, setSelectedRequest] = useState<DefermentRequest | RecallRequest | null>(null)
  const [selectedType, setSelectedType] = useState<'deferment' | 'recall'>('deferment')
  const [paymentAdviceMemos, setPaymentAdviceMemos] = useState<PaymentAdviceMemo[]>([])
  const [paymentAdviceLoading, setPaymentAdviceLoading] = useState(true)

  // Fetch payment advice memos on mount
  useEffect(() => {
    const fetchPaymentAdvice = async () => {
      try {
        const response = await fetch('/api/leave/payment-advice/my-status')
        if (!response.ok) throw new Error('Failed to fetch payment advice')
        const data = await response.json()
        setPaymentAdviceMemos(data.memos || [])
      } catch (err) {
        console.error('[v0] Error fetching payment advice:', err)
        setPaymentAdviceMemos([])
      } finally {
        setPaymentAdviceLoading(false)
      }
    }
    fetchPaymentAdvice()
  }, [])

  // Generate memo PDF for approved requests
  const generateAndDownloadMemo = () => {
    if (!selectedRequest || !memoRefNumber.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a reference number',
        variant: 'destructive',
      })
      return
    }

    try {
      const req = selectedRequest
      const staffName = `${userProfile.first_name} ${userProfile.last_name}`
      const staffNo = userProfile.employee_id || 'N/A'
      const position = userProfile.position || 'N/A'
      const department = userProfile.departments?.name || 'Management'

      let subject = ''
      let details = ''

      if (selectedType === 'deferment') {
        const dreq = req as DefermentRequest
        subject = 'APPROVAL FOR RESCHEDULING OF ' + (dreq.requested_deferment_year || 'ANNUAL') + ' LEAVE'
        details = `
          <p>We refer to your request dated ${format(new Date(req.created_at), 'd MMMM yyyy')} and wish to inform you that Management has granted approval for your leave to be rescheduled.</p>
          
          <p>Accordingly, your outstanding leave of ${dreq.deferment_end_date ? 'the period as submitted' : 'days'} shall be deferred to ${dreq.requested_deferment_year || '2026'}.</p>
          
          <p><strong>Details:</strong></p>
          <p>Original Leave Period: ${dreq.requested_deferment_period || 'As per submitted request'}<br/>
          Deferment Year: ${dreq.requested_deferment_year || 'To be determined'}<br/>
          Reason: ${dreq.reason || 'Not specified'}</p>
          
          <p>We wish you a pleasant continuation of service.</p>
        `
      } else {
        const recreq = req as RecallRequest
        subject = 'NOTICE OF RECALL FROM LEAVE'
        details = `
          <p>We are pleased to inform you that your request for recall from leave has been approved.</p>
          
          <p>You are expected to resume duty on <strong>${recreq.recall_date ? format(new Date(recreq.recall_date), 'EEEE, d MMMM yyyy') : 'the date as specified'}</strong>.</p>
          
          <p><strong>Details:</strong></p>
          <p>Reason for Recall: ${recreq.recall_reason || 'Not specified'}<br/>
          Recall Notes: ${recreq.recall_notes || 'None'}</p>
          
          <p>Please ensure proper handover of your duties upon resumption.</p>
        `
      }

      const memoHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>${subject}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px 60px; line-height: 1.8; color: #333; }
            .memo-header { margin-bottom: 40px; }
            .staff-info { margin-bottom: 10px; font-weight: bold; }
            .to-line { margin-bottom: 30px; }
            .subject { margin: 30px 0; font-weight: bold; text-decoration: underline; }
            .memo-body { margin: 30px 0; text-align: justify; }
            .memo-body p { margin: 15px 0; }
            .signature-block { margin-top: 50px; }
            .signer-name { margin-top: 40px; font-weight: bold; }
            .cc-line { margin-top: 30px; font-size: 12px; }
            .reference-line { margin-top: 10px; font-size: 11px; color: #666; }
            .footer { margin-top: 50px; text-align: center; font-size: 10px; color: #999; border-top: 1px solid #ccc; padding-top: 20px; }
            @media print { body { padding: 20px; } }
          </style>
        </head>
        <body>
          <div class="memo-header">
            <div class="staff-info">${staffName.toUpperCase()} (S/NO. ${staffNo})</div>
            <div class="staff-info">${position.toUpperCase()}</div>
          </div>
          
          <div class="to-line">
            <strong>THRO'</strong> THE HEAD OF ${department.toUpperCase()}<br/>
            QUALITY CONTROL COMPANY LTD.<br/>
            HEAD OFFICE, ACCRA
          </div>
          
          <div class="subject">${subject}</div>
          
          <div class="memo-body">
            ${details}
          </div>
          
          <div class="signature-block">
            <p>FRANK FREDUA-MENSAH (ESQ.)<br/>
            DEP. HUMAN RESOURCE MANAGER<br/>
            FOR: MANAGING DIRECTOR</p>
          </div>
          
          <div class="reference-line">
            Ref: ${memoRefNumber}
          </div>
          
          <div class="cc-line">
            <strong>cc:</strong> Managing Director<br/>
            &nbsp;&nbsp;&nbsp;&nbsp;Dep. Director HR<br/>
            &nbsp;&nbsp;&nbsp;&nbsp;Deputy Director, Finance<br/>
            &nbsp;&nbsp;&nbsp;&nbsp;Audit Manager
          </div>
          
          <div class="footer">
            <p>This is an official memo from QCC Limited Leave Management System - ${format(new Date(), 'd MMM yyyy')}</p>
          </div>
        </body>
        </html>
      `

      const printWindow = window.open('', '', 'height=800,width=900')
      if (!printWindow) {
        throw new Error('Unable to open print window. Please check your browser popup settings.')
      }

      printWindow.document.write(memoHTML)
      printWindow.document.close()

      setTimeout(() => {
        printWindow.print()
      }, 100)

      setMemoRefDialogOpen(false)
      setMemoRefNumber('')
      setSelectedRequest(null)

      toast({
        title: 'Success',
        description: 'Memo ready. Use the print dialog to save as PDF.',
      })
    } catch (error) {
      console.error('[v0] Error generating memo:', error)
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to generate memo',
        variant: 'destructive',
      })
    }
  }

  const getStatusBadge = (status: string) => {
    const statusLower = status.toLowerCase()
    if (statusLower.includes('approved')) {
      return <Badge className="bg-green-600">Approved</Badge>
    }
    if (statusLower.includes('rejected')) {
      return <Badge className="bg-red-600">Rejected</Badge>
    }
    if (statusLower.includes('pending')) {
      return <Badge className="bg-yellow-600">Pending</Badge>
    }
    return <Badge className="bg-gray-600">{status}</Badge>
  }

  const getPaymentAdviceStatusBadge = (status: string) => {
    const statusLower = status.toLowerCase()
    if (statusLower.includes('acknowledged')) {
      return <Badge className="bg-blue-600">Acknowledged by Finance</Badge>
    }
    if (statusLower.includes('forwarded')) {
      return <Badge className="bg-green-600">Sent to Finance</Badge>
    }
    if (statusLower.includes('processing') || statusLower.includes('pending')) {
      return <Badge className="bg-yellow-600">Processing</Badge>
    }
    return <Badge className="bg-gray-600">{status}</Badge>
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">My Requests</h1>
        <p className="text-gray-600 mt-2">View your deferment and recall requests with memo download</p>
      </div>

      {/* Deferment Requests Section */}
      {initialDefermentRequests.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Deferment Requests ({initialDefermentRequests.length})
          </h2>
          <div className="grid gap-4">
            {initialDefermentRequests.map((req) => (
              <Card key={req.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">
                        Deferment Request - {req.requested_deferment_year}
                      </CardTitle>
                      <CardDescription>
                        Requested on {format(new Date(req.created_at), 'd MMM yyyy')}
                      </CardDescription>
                    </div>
                    {getStatusBadge(req.status)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Requested Period</p>
                      <p className="font-medium">{req.requested_deferment_period || 'Not specified'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Deferment Year</p>
                      <p className="font-medium">{req.requested_deferment_year || 'To be determined'}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-sm text-gray-600">Reason</p>
                      <p className="font-medium">{req.reason || 'Not specified'}</p>
                    </div>
                  </div>

                  {req.status.toLowerCase().includes('approved') && (
                    <Button
                      className="w-full gap-2 bg-blue-600 hover:bg-blue-700"
                      onClick={() => {
                        setSelectedRequest(req)
                        setSelectedType('deferment')
                        setMemoRefNumber('')
                        setMemoRefDialogOpen(true)
                      }}
                    >
                      <Download className="h-4 w-4" />
                      Download Memo
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Recall Requests Section */}
      {initialRecallRequests.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Recall Requests ({initialRecallRequests.length})
          </h2>
          <div className="grid gap-4">
            {initialRecallRequests.map((req) => (
              <Card key={req.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">Recall Request</CardTitle>
                      <CardDescription>
                        Requested on {format(new Date(req.created_at), 'd MMM yyyy')}
                      </CardDescription>
                    </div>
                    {getStatusBadge(req.status)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Recall Date</p>
                      <p className="font-medium">
                        {req.recall_date ? format(new Date(req.recall_date), 'd MMM yyyy') : 'Not specified'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Status</p>
                      <p className="font-medium capitalize">{req.status.replace(/_/g, ' ')}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-sm text-gray-600">Reason</p>
                      <p className="font-medium">{req.recall_reason || 'Not specified'}</p>
                    </div>
                    {req.recall_notes && (
                      <div className="col-span-2">
                        <p className="text-sm text-gray-600">Notes</p>
                        <p className="font-medium">{req.recall_notes}</p>
                      </div>
                    )}
                  </div>

                  {req.status.toLowerCase().includes('approved') && (
                    <Button
                      className="w-full gap-2 bg-blue-600 hover:bg-blue-700"
                      onClick={() => {
                        setSelectedRequest(req)
                        setSelectedType('recall')
                        setMemoRefNumber('')
                        setMemoRefDialogOpen(true)
                      }}
                    >
                      <Download className="h-4 w-4" />
                      Download Memo
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Payment Advice Status Section */}
      {!paymentAdviceLoading && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Payment Advice Status
          </h2>
          
          {paymentAdviceMemos.length > 0 ? (
            <div className="grid gap-4">
              {paymentAdviceMemos.map((memo) => (
                <Card key={memo.id} className="overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">
                          {memo.leaveType} Leave - {memo.leaveYear}
                        </CardTitle>
                        <CardDescription>
                          Created on {format(new Date(memo.createdAt), 'd MMM yyyy')}
                        </CardDescription>
                      </div>
                      {getPaymentAdviceStatusBadge(memo.status)}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Approved Days</p>
                        <p className="font-medium">{memo.approvedDays} days</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Category</p>
                        <p className="font-medium">{memo.staffCategory}</p>
                      </div>
                      {memo.paymentAmount !== null && (
                        <div>
                          <p className="text-sm text-gray-600">Payment Amount</p>
                          <p className="font-medium text-green-700">
                            {memo.paymentAmount.toFixed(2)} {memo.paymentCurrency}
                          </p>
                        </div>
                      )}
                      {memo.forwardedAt && (
                        <div>
                          <p className="text-sm text-gray-600">Sent to Finance</p>
                          <p className="font-medium">{format(new Date(memo.forwardedAt), 'd MMM yyyy')}</p>
                        </div>
                      )}
                    </div>

                    {memo.leaveStartDate && memo.leaveEndDate && (
                      <div className="pt-2 border-t border-gray-200">
                        <p className="text-sm text-gray-600">Leave Period</p>
                        <p className="font-medium">
                          {format(new Date(memo.leaveStartDate), 'd MMM yyyy')} - {format(new Date(memo.leaveEndDate), 'd MMM yyyy')}
                        </p>
                      </div>
                    )}

                    {/* Status timeline */}
                    <div className="space-y-2 pt-2 border-t border-gray-200">
                      <p className="text-sm font-medium text-gray-600">Timeline</p>
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          <span>Processing by HR: {format(new Date(memo.createdAt), 'd MMM yyyy HH:mm')}</span>
                        </div>
                        {memo.forwardedAt && (
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span>Sent to Finance: {format(new Date(memo.forwardedAt), 'd MMM yyyy HH:mm')}</span>
                          </div>
                        )}
                        {memo.acknowledgedAt && (
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-blue-600" />
                            <span>Acknowledged by Finance: {format(new Date(memo.acknowledgedAt), 'd MMM yyyy HH:mm')}</span>
                          </div>
                        )}
                        {!memo.acknowledgedAt && memo.forwardedAt && (
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-yellow-600" />
                            <span>Awaiting Finance Acknowledgement</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Alert>
              <DollarSign className="h-4 w-4" />
              <AlertDescription>
                No payment advice memos yet. Your payment advice will appear here once HR processes your approved leave request.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* Empty State */}
      {initialDefermentRequests.length === 0 && initialRecallRequests.length === 0 && paymentAdviceMemos.length === 0 && (
        <Alert>
          <FileText className="h-4 w-4" />
          <AlertDescription>
            You have no deferment, recall, or payment advice requests. Contact HR Leave Office if you need to submit a request.
          </AlertDescription>
        </Alert>
      )}

      {/* Memo Reference Number Dialog */}
      <Dialog open={memoRefDialogOpen} onOpenChange={setMemoRefDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Enter Memo Reference Number</DialogTitle>
            <DialogDescription>
              Please provide the memo reference number (obtained from HR Leave Office)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Reference Number
              </label>
              <Input
                placeholder="e.g., QCC/PF/HR/001/2026"
                value={memoRefNumber}
                onChange={(e) => setMemoRefNumber(e.target.value)}
                className="w-full"
              />
              <p className="text-xs text-slate-500 mt-2">
                Format: Organization/Department/Type/Number/Year
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setMemoRefDialogOpen(false)
                setMemoRefNumber('')
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={generateAndDownloadMemo}
              disabled={!memoRefNumber.trim()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Download className="h-4 w-4 mr-2" />
              Download Memo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
