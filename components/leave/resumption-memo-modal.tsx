"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ResumptionMemo } from "./resumption-memo"
import { Loader2, Download, X } from "lucide-react"

interface ResumptionMemoModalProps {
  isOpen: boolean
  memoId: string | null
  onClose: () => void
}

export function ResumptionMemoModal({ isOpen, memoId, onClose }: ResumptionMemoModalProps) {
  const [isPrinting, setIsPrinting] = useState(false)

  if (!memoId) return null

  const handlePrint = () => {
    setIsPrinting(true)
    setTimeout(() => {
      window.print()
      setIsPrinting(false)
    }, 100)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Return to Work Resumption Memo</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-6 w-6 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </DialogTitle>
          <DialogDescription>
            Professional memo notifying your return to work. You can download, print, and share with supervisors.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Action Buttons */}
          <div className="flex gap-2 print:hidden">
            <Button
              size="sm"
              onClick={handlePrint}
              disabled={isPrinting}
              className="gap-1"
            >
              {isPrinting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Preparing...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Print / Download PDF
                </>
              )}
            </Button>
          </div>

          {/* Memo Content */}
          <div className="border rounded-lg overflow-hidden">
            <ResumptionMemo
              memoId={memoId}
              onClose={onClose}
              showPrintButton={false}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
