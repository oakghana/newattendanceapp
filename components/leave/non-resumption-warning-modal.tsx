'use client'

import { useState } from 'react'
import { AlertTriangle, AlertCircle, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface Props {
  leaveEndDate: string
  status: 'warning_sent' | 'letter_sent' | 'memo_sent'
  daysOverdue: number
}

export function NonResumptionWarningModal({ leaveEndDate, status, daysOverdue }: Props) {
  const [open, setOpen] = useState(true)
  const critical = status === 'memo_sent'
  const formal = status === 'letter_sent' || critical
  const Icon = critical ? XCircle : formal ? AlertCircle : AlertTriangle

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className={critical ? 'border-destructive' : 'border-amber-500'}>
        <DialogHeader>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <Icon className="h-7 w-7" aria-hidden="true" />
          </div>
          <DialogTitle className="text-center text-xl">
            {critical ? 'Serious warning letter issued' : formal ? 'Formal resumption warning' : 'Management action warning'}
          </DialogTitle>
          <DialogDescription className="space-y-3 text-center leading-6">
            <span className="block">Your leave ended on <strong>{new Date(leaveEndDate).toLocaleDateString('en-GB')}</strong>, and you are {daysOverdue} calendar days overdue.</span>
            <span className="block">Please check in immediately and inform your HOD or Regional Manager so they can confirm your resumption.</span>
            <span className="block font-semibold">If you do not check in, management action may be taken. HR Leave and the HR Executive have been notified.</span>
            {critical && <span className="block">Please open and read the serious warning letter in your portal and respond through HR.</span>}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-center">
          <Button onClick={() => setOpen(false)} variant={critical ? 'destructive' : 'default'}>I understand</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
