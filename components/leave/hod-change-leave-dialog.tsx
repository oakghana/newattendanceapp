"use client"

import { Calendar, Loader2 } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"

interface HodChangeLeaveRequestDialogProps {
  isOpen: boolean
  onClose: () => void
  leaveRequestId: string
  staffName: string
  currentStartDate: string
  currentEndDate: string
  userId: string
  userRole: string
  onSuccess?: () => void
}

export function HodChangeLeaveRequestDialog({
  isOpen,
  onClose,
  leaveRequestId,
  staffName,
  currentStartDate,
  currentEndDate,
  userId,
  userRole,
  onSuccess,
}: HodChangeLeaveRequestDialogProps) {
  const [newStartDate, setNewStartDate] = useState(currentStartDate)
  const [newEndDate, setNewEndDate] = useState(currentEndDate)
  const [reason, setReason] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()

  const handleSubmit = async () => {
    try {
      // Validate dates
      if (!newStartDate || !newEndDate) {
        toast({ title: "Error", description: "Please select both start and end dates", variant: "destructive" })
        return
      }

      if (new Date(newStartDate) > new Date(newEndDate)) {
        toast({ title: "Error", description: "Start date must be before end date", variant: "destructive" })
        return
      }

      if (!reason.trim()) {
        toast({ title: "Error", description: "Please provide a reason for the change", variant: "destructive" })
        return
      }

      setIsSubmitting(true)

      const response = await fetch("/api/leave/change-proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leave_request_id: leaveRequestId,
          proposed_start_date: newStartDate,
          proposed_end_date: newEndDate,
          reason: reason,
          action_type: "propose_change",
          user_id: userId,
          user_role: userRole,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to propose changes")
      }

      toast({
        title: "Success",
        description: `Date change proposal sent to ${staffName}. They will be notified to acknowledge or propose counter-dates.`,
      })

      onSuccess?.()
      setNewStartDate(currentStartDate)
      setNewEndDate(currentEndDate)
      setReason("")
      onClose()
    } catch (error) {
      console.error("[v0] Change proposal error:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to propose changes",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Propose Date Changes
          </DialogTitle>
          <DialogDescription>Suggest new dates for {staffName}&apos;s leave</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Staff Info */}
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
            <p className="text-xs text-slate-600 mb-1">Current Leave Dates</p>
            <p className="text-sm font-semibold text-slate-900">
              {new Date(currentStartDate).toLocaleDateString()} to {new Date(currentEndDate).toLocaleDateString()}
            </p>
          </div>

          {/* New Dates */}
          <div className="space-y-3">
            <div>
              <label className="text-sm font-semibold text-slate-700 mb-1 block">New Start Date</label>
              <Input
                type="date"
                value={newStartDate}
                onChange={(e) => setNewStartDate(e.target.value)}
                className="border-slate-300"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700 mb-1 block">New End Date</label>
              <Input
                type="date"
                value={newEndDate}
                onChange={(e) => setNewEndDate(e.target.value)}
                className="border-slate-300"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700 mb-1 block">Reason for Change</label>
              <Textarea
                placeholder="Explain why you're proposing these date changes..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="resize-none border-slate-300 focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Info Message */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-900">
              <span className="font-semibold">Note:</span> {staffName} will receive this proposal and can agree, disagree, or suggest different dates. Once agreed, it will go to HR for processing.
            </p>
          </div>

          {/* Buttons */}
          <div className="flex gap-2 pt-2">
            <Button onClick={onClose} variant="outline" className="flex-1" disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                "Send Proposal"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
