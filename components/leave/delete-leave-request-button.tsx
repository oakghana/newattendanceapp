'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Trash2, AlertTriangle } from 'lucide-react'
import { useDeleteLeaveRequest } from '@/hooks/use-delete-leave-request'

interface DeleteLeaveRequestButtonProps {
  requestId: string
  staffName?: string
  requestStatus?: string
  onDeleteSuccess?: () => void
  showIcon?: boolean
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  className?: string
}

export function DeleteLeaveRequestButton({
  requestId,
  staffName = 'Staff Member',
  requestStatus = 'pending',
  onDeleteSuccess,
  showIcon = true,
  variant = 'destructive',
  size = 'sm',
  className = '',
}: DeleteLeaveRequestButtonProps) {
  const [showConfirmation, setShowConfirmation] = useState(false)
  const { deleteRequest, isLoading } = useDeleteLeaveRequest({
    onSuccess: () => {
      setShowConfirmation(false)
      onDeleteSuccess?.()
    },
  })

  const handleDelete = async () => {
    try {
      await deleteRequest(requestId, staffName)
    } catch (error) {
      console.error('[v0] Delete failed:', error)
    }
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => setShowConfirmation(true)}
        disabled={isLoading}
        className={className}
      >
        {showIcon && <Trash2 className="h-4 w-4 mr-2" />}
        {isLoading ? 'Deleting...' : 'Delete'}
      </Button>

      <Dialog open={showConfirmation} onOpenChange={setShowConfirmation}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <DialogTitle>Delete Leave Request?</DialogTitle>
            </div>
          </DialogHeader>
          <div className="space-y-3">
            <p className="font-medium text-foreground">
              You are about to permanently delete this leave request:
            </p>
            <div className="bg-slate-50 rounded p-3 space-y-1 text-sm">
              <p>
                <span className="font-semibold">Staff:</span> {staffName}
              </p>
              <p>
                <span className="font-semibold">Request ID:</span> {requestId.slice(0, 8)}...
              </p>
              <p>
                <span className="font-semibold">Status:</span> {requestStatus.replace(/_/g, ' ')}
              </p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded p-3">
              <p className="text-xs font-medium text-red-800 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>
                  This action is <strong>permanent</strong> and cannot be undone. All related records 
                  (balance transactions, payment memos, notifications, etc.) will also be deleted from the database.
                </span>
              </p>
            </div>
          </div>
          <DialogFooter className="flex gap-3 justify-end mt-6">
            <Button
              variant="outline"
              onClick={() => setShowConfirmation(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isLoading}
            >
              {isLoading ? 'Deleting...' : 'Delete Permanently'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
