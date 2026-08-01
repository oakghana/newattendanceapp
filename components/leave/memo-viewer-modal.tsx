'use client'

import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import {
  Download,
  Printer,
  AlertCircle,
  CheckCircle,
  XCircle,
  Loader2,
  Copy
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { format } from 'date-fns'

interface MemoViewerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  memo: any
  memoType: 'deferment' | 'recall'
}

export function MemoViewerModal({
  open,
  onOpenChange,
  memo,
  memoType
}: MemoViewerModalProps) {
  const { toast } = useToast()
  const [downloading, setDownloading] = useState(false)

  const downloadPDF = async () => {
    try {
      setDownloading(true)
      const res = await fetch('/api/leave/deferment-recall/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memo_id: memo.id, memo_type: memoType })
      })

      if (!res.ok) throw new Error('Failed to generate PDF')

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${memoType}-memo-${memo.id.substring(0, 8)}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast({
        title: 'Success',
        description: 'Memo downloaded successfully'
      })
    } catch (error) {
      console.error('[v0] Error downloading PDF:', error)
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to download memo',
        variant: 'destructive'
      })
    } finally {
      setDownloading(false)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const getStatusDisplay = () => {
    switch (memo?.status) {
      case 'approved':
        return (
          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
            <CheckCircle className="h-3 w-3 mr-1" />
            Approved
          </Badge>
        )
      case 'rejected':
        return (
          <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
            <XCircle className="h-3 w-3 mr-1" />
            Rejected
          </Badge>
        )
      default:
        return (
          <Badge className="bg-slate-100 text-slate-700">
            {memo?.status || 'Unknown'}
          </Badge>
        )
    }
  }

  const staffName = memo?.staff?.first_name && memo?.staff?.last_name
    ? `${memo.staff.first_name} ${memo.staff.last_name}`
    : 'Unknown Staff'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="space-y-2">
            <DialogTitle className="text-2xl">
              {memoType === 'deferment' ? 'Leave Deferment Memo' : 'Leave Recall Memo'}
            </DialogTitle>
            <DialogDescription>
              Memo ID: {memo?.id?.substring(0, 12)}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-6">
          {/* Status Alert */}
          {memo?.status === 'rejected' && (
            <Alert className="border-red-200 bg-red-50">
              <XCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-700">
                This memo has been rejected
              </AlertDescription>
            </Alert>
          )}

          {/* Header Section */}
          <div className="text-center space-y-2 pb-4 border-b">
            <h2 className="text-lg font-semibold text-slate-900">
              {memoType === 'deferment' ? 'LEAVE DEFERMENT MEMO' : 'LEAVE RECALL MEMO'}
            </h2>
            <p className="text-sm text-slate-600">Ministry/Office of Human Resources</p>
            <p className="text-sm text-slate-600">Republic of Ghana</p>
            <div className="flex justify-center gap-2 pt-2">
              {getStatusDisplay()}
            </div>
          </div>

          {/* Memo Meta Information */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-lg">
            <div>
              <p className="text-xs font-semibold text-slate-600 uppercase">Memo ID</p>
              <p className="text-sm font-mono text-slate-900">{memo?.id?.substring(0, 12)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-600 uppercase">Date</p>
              <p className="text-sm text-slate-900">{format(new Date(), 'dd MMM yyyy')}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-600 uppercase">Status</p>
              <p className="text-sm text-slate-900 capitalize">{memo?.status}</p>
            </div>
          </div>

          {/* Staff Information */}
          <div className="space-y-3">
            <h3 className="font-semibold text-slate-900 text-sm uppercase">Staff Information</h3>
            <div className="grid grid-cols-2 gap-4 bg-white border border-slate-200 rounded p-4">
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-1">STAFF NAME</p>
                <p className="text-sm font-medium text-slate-900">{staffName}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-1">EMPLOYEE ID</p>
                <p className="text-sm font-medium text-slate-900">{memo?.staff?.employee_id || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-1">POSITION</p>
                <p className="text-sm font-medium text-slate-900">{memo?.staff?.position || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-1">DEPARTMENT</p>
                <p className="text-sm font-medium text-slate-900">{memo?.staff?.departments?.name || 'N/A'}</p>
              </div>
            </div>
          </div>

          {/* Leave Information */}
          <div className="space-y-3">
            <h3 className="font-semibold text-slate-900 text-sm uppercase">Leave Information</h3>
            <div className="grid grid-cols-2 gap-4 bg-white border border-slate-200 rounded p-4">
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-1">LEAVE TYPE</p>
                <p className="text-sm font-medium text-slate-900">{memo?.memo_body?.leave_type || 'Annual Leave'}</p>
              </div>
              {memoType === 'deferment' ? (
                <>
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-1">DEFER TO YEAR</p>
                    <p className="text-sm font-medium text-slate-900">{memo?.deferment_request?.requested_deferment_year || 'N/A'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs font-semibold text-slate-600 mb-1">ORIGINAL LEAVE PERIOD</p>
                    <p className="text-sm font-medium text-slate-900">
                      {memo?.memo_body?.original_start_date && memo?.memo_body?.original_end_date 
                        ? `${format(new Date(memo.memo_body.original_start_date), 'dd MMM yyyy')} - ${format(new Date(memo.memo_body.original_end_date), 'dd MMM yyyy')}`
                        : 'Not specified'
                      }
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-1">RECALL DATE</p>
                    <p className="text-sm font-medium text-slate-900">
                      {memo?.recall_request?.recall_date 
                        ? format(new Date(memo.recall_request.recall_date), 'dd MMM yyyy')
                        : 'Not specified'
                      }
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs font-semibold text-slate-600 mb-1">LEAVE PERIOD</p>
                    <p className="text-sm font-medium text-slate-900">
                      {memo?.memo_body?.original_start_date && memo?.memo_body?.original_end_date 
                        ? `${format(new Date(memo.memo_body.original_start_date), 'dd MMM yyyy')} - ${format(new Date(memo.memo_body.original_end_date), 'dd MMM yyyy')}`
                        : 'Not specified'
                      }
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Reason */}
          <div className="space-y-3">
            <h3 className="font-semibold text-slate-900 text-sm uppercase">
              {memoType === 'deferment' ? 'Reason for Deferment' : 'Reason for Recall'}
            </h3>
            <div className="bg-slate-50 border border-slate-200 rounded p-4">
              <p className="text-sm text-slate-700">
                {memoType === 'deferment'
                  ? memo?.deferment_request?.reason || 'No reason provided'
                  : memo?.recall_request?.recall_reason || 'No reason provided'
                }
              </p>
            </div>
          </div>

          {/* Approval Information */}
          {memo?.status === 'approved' && (
            <>
              <Separator />
              <div className="space-y-3">
                <h3 className="font-semibold text-slate-900 text-sm uppercase">Approval Information</h3>
                <div className="grid grid-cols-2 gap-4 bg-white border border-slate-200 rounded p-4">
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-1">APPROVED BY</p>
                    <p className="text-sm font-medium text-slate-900">{memo?.signer_name || 'HR Executive'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-1">POSITION</p>
                    <p className="text-sm font-medium text-slate-900">{memo?.signer_position || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-1">APPROVED DATE</p>
                    <p className="text-sm font-medium text-slate-900">
                      {memo?.generated_at ? format(new Date(memo.generated_at), 'dd MMM yyyy') : 'N/A'}
                    </p>
                  </div>
                  {memo?.memo_body?.approval_notes && (
                    <div className="col-span-2">
                      <p className="text-xs font-semibold text-slate-600 mb-1">NOTES</p>
                      <p className="text-sm text-slate-700">{memo.memo_body.approval_notes}</p>
                    </div>
                  )}
                </div>

                {/* Signature Display */}
                <div className="border-t pt-4">
                  <p className="text-xs font-semibold text-slate-600 mb-4">APPROVAL SIGNATURES</p>
                  
                  {/* HR Signature */}
                  {(memo?.hr_signature_data_url || memo?.hr_signature_text || memo?.signer_name) && (
                    <div className="bg-white border border-slate-200 rounded p-4 mb-3">
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs text-slate-500 uppercase tracking-wide">Approved By (HR)</p>
                          <p className="font-semibold text-slate-900">{memo?.signer_name || memo?.hr_approver_name || 'HR Executive'}</p>
                          <p className="text-xs text-slate-600">{memo?.signer_position || memo?.hr_approver_position || 'HR Executive'}</p>
                        </div>
                        
                        {memo?.hr_signature_data_url && (
                          <div className="bg-slate-50 p-2 rounded border border-slate-200 flex items-center justify-center min-h-[60px]">
                            <img 
                              src={memo.hr_signature_data_url} 
                              alt="HR Signature" 
                              className="max-h-16 max-w-xs object-contain"
                            />
                          </div>
                        )}
                        
                        {memo?.hr_signature_text && (
                          <div className="bg-slate-50 p-2 rounded border border-slate-200">
                            <p className="text-xl font-script italic text-slate-700">{memo.hr_signature_text}</p>
                          </div>
                        )}
                        
                        {memo?.hr_approved_at && (
                          <p className="text-xs text-slate-600">
                            Approved on {format(new Date(memo.hr_approved_at), 'dd MMM yyyy')}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* HOD Signature (if available) */}
                  {(memo?.hod_signature_data_url || memo?.hod_signature_text || memo?.hod_reviewer_name) && (
                    <div className="bg-white border border-slate-200 rounded p-4 mb-3">
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs text-slate-500 uppercase tracking-wide">Endorsed By (HOD)</p>
                          <p className="font-semibold text-slate-900">{memo?.hod_reviewer_name || 'Head of Department'}</p>
                          <p className="text-xs text-slate-600">{memo?.hod_position || 'HOD'}</p>
                        </div>
                        
                        {memo?.hod_signature_data_url && (
                          <div className="bg-slate-50 p-2 rounded border border-slate-200 flex items-center justify-center min-h-[60px]">
                            <img 
                              src={memo.hod_signature_data_url} 
                              alt="HOD Signature" 
                              className="max-h-16 max-w-xs object-contain"
                            />
                          </div>
                        )}
                        
                        {memo?.hod_signature_text && (
                          <div className="bg-slate-50 p-2 rounded border border-slate-200">
                            <p className="text-xl font-script italic text-slate-700">{memo.hod_signature_text}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Legacy signature display (fallback) */}
                  {!memo?.hr_signature_data_url && !memo?.hr_signature_text && (memo?.signature_image_url || memo?.memo_body?.signature_text) && (
                    <div className="bg-slate-50 border border-slate-200 rounded p-4">
                      {memo?.signature_image_url && (
                        <img 
                          src={memo.signature_image_url} 
                          alt="Signature" 
                          className="h-20 object-contain"
                        />
                      )}
                      {memo?.memo_body?.signature_text && (
                        <p className="text-2xl font-script italic text-slate-700">{memo.memo_body.signature_text}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2 pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
          {memo?.status === 'approved' && (
            <>
              <Button
                variant="outline"
                onClick={handlePrint}
                className="gap-2"
              >
                <Printer className="h-4 w-4" />
                Print
              </Button>
              <Button
                onClick={downloadPDF}
                disabled={downloading}
                className="bg-blue-600 hover:bg-blue-700 gap-2"
              >
                {downloading && <Loader2 className="h-4 w-4 animate-spin" />}
                <Download className="h-4 w-4" />
                Download PDF
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
