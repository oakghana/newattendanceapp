'use client'

import React, { useState, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  Pen,
  Type,
  Trash2
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { format } from 'date-fns'

interface MemoApprovalModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  memo: any
  memoType: 'deferment' | 'recall'
  requestId: string
  onApprovalSuccess?: () => void
}

export function MemoApprovalModal({
  open,
  onOpenChange,
  memo,
  memoType,
  requestId,
  onApprovalSuccess
}: MemoApprovalModalProps) {
  const { toast } = useToast()
  const [decision, setDecision] = useState<'approved' | 'rejected' | null>(null)
  const [approvalNotes, setApprovalNotes] = useState('')
  const [signatureMode, setSignatureMode] = useState<'draw' | 'type'>('draw')
  const [signatureText, setSignatureText] = useState('')
  const [signatureImage, setSignatureImage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawing = useRef(false)

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.beginPath()
      ctx.moveTo(x, y)
      isDrawing.current = true
    }
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.lineTo(x, y)
      ctx.stroke()
    }
  }

  const stopDrawing = () => {
    const canvas = canvasRef.current
    if (canvas && isDrawing.current) {
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.closePath()
      setSignatureImage(canvas.toDataURL())
    }
    isDrawing.current = false
  }

  const clearSignature = () => {
    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
    }
    setSignatureImage(null)
    setSignatureText('')
  }

  const handleApprove = async () => {
    if (!decision) {
      toast({
        title: 'Error',
        description: 'Please select a decision (Approve or Reject)',
        variant: 'destructive'
      })
      return
    }

    if (decision === 'approved' && signatureMode === 'draw' && !signatureImage) {
      toast({
        title: 'Error',
        description: 'Please provide a signature to approve',
        variant: 'destructive'
      })
      return
    }

    if (decision === 'approved' && signatureMode === 'type' && !signatureText.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter your signature text',
        variant: 'destructive'
      })
      return
    }

    try {
      setSubmitting(true)
      const res = await fetch('/api/leave/deferment-recall/approve-memo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memo_id: memo.id,
          memo_type: memoType,
          request_id: requestId,
          decision,
          signature_data_url: signatureImage,
          signature_text: signatureText,
          signature_mode: signatureMode,
          approval_notes: approvalNotes
        })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to process decision')

      toast({
        title: 'Success',
        description: data.message || `Memo ${decision} successfully`
      })

      onOpenChange(false)
      onApprovalSuccess?.()
    } catch (error) {
      console.error('[v0] Error processing decision:', error)
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to process decision',
        variant: 'destructive'
      })
    } finally {
      setSubmitting(false)
    }
  }

  const staffName = memo?.staff?.first_name && memo?.staff?.last_name
    ? `${memo.staff.first_name} ${memo.staff.last_name}`
    : 'Unknown Staff'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{memoType === 'deferment' ? 'Approve Deferment Memo' : 'Approve Recall Memo'}</span>
            <Badge variant="outline">{staffName}</Badge>
          </DialogTitle>
          <DialogDescription>
            Review and approve this leave {memoType} memo
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Directed To Badge */}
          {(memo as any).assigned_hr_executive_id && (
            <Alert className="bg-blue-50 border-blue-200 text-blue-900">
              <AlertCircle className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-900">
                This memo has been directed specifically to you for approval by HR Leave Office.
              </AlertDescription>
            </Alert>
          )}

          {/* Memo Preview Section */}
          <div className="bg-slate-50 rounded-lg p-4 space-y-3">
            <h3 className="font-semibold text-slate-900">Memo Summary</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-slate-600">Staff Name</p>
                <p className="font-medium text-slate-900">{staffName}</p>
              </div>
              <div>
                <p className="text-slate-600">Employee ID</p>
                <p className="font-medium text-slate-900">{memo?.staff?.employee_id}</p>
              </div>
              <div>
                <p className="text-slate-600">Position</p>
                <p className="font-medium text-slate-900">{memo?.staff?.position}</p>
              </div>
              <div>
                <p className="text-slate-600">Department</p>
                <p className="font-medium text-slate-900">{memo?.staff?.departments?.name}</p>
              </div>
              <div>
                <p className="text-slate-600">Leave Type</p>
                <p className="font-medium text-slate-900">{memo?.memo_body?.leave_type || 'Annual Leave'}</p>
              </div>
              {memoType === 'deferment' && (
                <div>
                  <p className="text-slate-600">Defer To</p>
                  <p className="font-medium text-slate-900">{memo?.deferment_request?.requested_deferment_year}</p>
                </div>
              )}
            </div>
          </div>

          {/* Decision Section */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Decision</Label>
            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={() => setDecision('approved')}
                className={`h-20 flex flex-col items-center justify-center gap-2 transition-all ${
                  decision === 'approved'
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <CheckCircle className="h-6 w-6" />
                <span>Approve</span>
              </Button>
              <Button
                onClick={() => setDecision('rejected')}
                className={`h-20 flex flex-col items-center justify-center gap-2 transition-all ${
                  decision === 'rejected'
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <XCircle className="h-6 w-6" />
                <span>Reject</span>
              </Button>
            </div>
          </div>

          {/* Approval Notes */}
          <div className="space-y-3">
            <Label htmlFor="notes">Approval Notes (Optional)</Label>
            <Textarea
              id="notes"
              placeholder="Add any notes regarding this decision..."
              value={approvalNotes}
              onChange={(e) => setApprovalNotes(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>

          {/* Signature Section - Only for Approval */}
          {decision === 'approved' && (
            <div className="space-y-3 border-t pt-4">
              <Label className="text-base font-semibold">Signature</Label>
              
              <Tabs value={signatureMode} onValueChange={(v: any) => setSignatureMode(v)}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="draw" className="gap-2">
                    <Pen className="h-4 w-4" />
                    Draw
                  </TabsTrigger>
                  <TabsTrigger value="type" className="gap-2">
                    <Type className="h-4 w-4" />
                    Type
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="draw" className="space-y-3">
                  <div className="border-2 border-dashed border-slate-300 rounded-lg overflow-hidden bg-white">
                    <canvas
                      ref={canvasRef}
                      width={500}
                      height={150}
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={stopDrawing}
                      onMouseLeave={stopDrawing}
                      className="w-full cursor-crosshair bg-white"
                      style={{ touchAction: 'none' }}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={clearSignature}
                    className="gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    Clear Signature
                  </Button>
                </TabsContent>

                <TabsContent value="type" className="space-y-3">
                  <Input
                    type="text"
                    placeholder="Type your full name as signature"
                    value={signatureText}
                    onChange={(e) => setSignatureText(e.target.value)}
                    className="text-lg font-script italic"
                  />
                  {signatureText && (
                    <div className="border border-slate-200 rounded p-4 bg-slate-50">
                      <p className="text-2xl font-script italic text-slate-700">{signatureText}</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>

        <DialogFooter className="gap-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleApprove}
            disabled={submitting || !decision}
            className={decision === 'approved' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}
          >
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {decision === 'approved' ? 'Approve Memo' : decision === 'rejected' ? 'Reject Memo' : 'Select Decision'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
