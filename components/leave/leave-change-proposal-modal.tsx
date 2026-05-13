"use client"

import { AlertCircle, CheckCircle2, Clock, XCircle } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"

interface LeaveChangeProposalModalProps {
  isOpen: boolean
  onClose: () => void
  leaveRequestId: string
  staffName: string
  originalStartDate: string
  originalEndDate: string
  proposedStartDate: string
  proposedEndDate: string
  proposalReason: string
  userId: string
  userRole: string
  onSuccess?: () => void
}

export function LeaveChangeProposalModal({
  isOpen,
  onClose,
  leaveRequestId,
  staffName,
  originalStartDate,
  originalEndDate,
  proposedStartDate,
  proposedEndDate,
  proposalReason,
  userId,
  userRole,
  onSuccess,
}: LeaveChangeProposalModalProps) {
  const [action, setAction] = useState<"view" | "accept" | "reject" | "counter">("view")
  const [counterText, setCounterText] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()

  const formatDate = (date: string) => new Date(date).toLocaleDateString()

  const handleAction = async (actionType: "acknowledge_accept" | "acknowledge_reject" | "counter_propose") => {
    try {
      if (actionType === "counter_propose" && !counterText.trim()) {
        toast({ title: "Error", description: "Please provide your counter-proposal details", variant: "destructive" })
        return
      }

      setIsSubmitting(true)

      const response = await fetch("/api/leave/change-proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leave_request_id: leaveRequestId,
          proposed_start_date: proposedStartDate,
          proposed_end_date: proposedEndDate,
          reason: proposalReason,
          action_type: actionType,
          user_id: userId,
          user_role: userRole,
          response_text: counterText || null,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to process request")
      }

      const messages = {
        acknowledge_accept: "You have agreed to the proposed dates. The request will proceed to HR.",
        acknowledge_reject: "You have declined the proposed dates. The original dates will be used.",
        counter_propose: "Your counter-proposal has been sent to the manager for review.",
      }

      toast({
        title: "Success",
        description: messages[actionType],
      })

      onSuccess?.()
      onClose()
    } catch (error) {
      console.error("[v0] Action error:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to process request",
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
          <DialogTitle>Leave Dates Review</DialogTitle>
          <DialogDescription>Review and respond to the proposed leave date changes</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Staff Info */}
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <p className="text-sm text-slate-600">Staff Member</p>
            <p className="font-semibold text-slate-900">{staffName}</p>
          </div>

          {/* Proposed Changes */}
          <div className="space-y-3">
            <div className="text-sm font-semibold text-slate-700">Original Dates</div>
            <div className="flex items-center justify-between bg-red-50 p-3 rounded-lg border border-red-200">
              <div className="text-sm">
                <p className="text-slate-600">From</p>
                <p className="font-semibold text-slate-900">{formatDate(originalStartDate)}</p>
              </div>
              <div className="text-sm">
                <p className="text-slate-600">To</p>
                <p className="font-semibold text-slate-900">{formatDate(originalEndDate)}</p>
              </div>
            </div>

            <div className="flex items-center justify-center py-2">
              <div className="border-t-2 border-slate-300 flex-1" />
              <Clock className="h-4 w-4 text-slate-400 mx-2" />
              <div className="border-t-2 border-slate-300 flex-1" />
            </div>

            <div className="text-sm font-semibold text-slate-700">Proposed Dates</div>
            <div className="flex items-center justify-between bg-blue-50 p-3 rounded-lg border border-blue-200">
              <div className="text-sm">
                <p className="text-slate-600">From</p>
                <p className="font-semibold text-slate-900">{formatDate(proposedStartDate)}</p>
              </div>
              <div className="text-sm">
                <p className="text-slate-600">To</p>
                <p className="font-semibold text-slate-900">{formatDate(proposedEndDate)}</p>
              </div>
            </div>

            {proposalReason && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-amber-900 mb-1">Reason for Change</p>
                <p className="text-sm text-amber-800">{proposalReason}</p>
              </div>
            )}
          </div>

          {/* Response Options */}
          {action === "view" && (
            <div className="space-y-2 pt-4">
              <Button
                onClick={() => setAction("accept")}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Agree with Changes
              </Button>
              <Button onClick={() => setAction("counter")} variant="outline" className="w-full">
                <AlertCircle className="h-4 w-4 mr-2" />
                Propose Counter Dates
              </Button>
              <Button
                onClick={() => setAction("reject")}
                className="w-full bg-red-600 hover:bg-red-700 text-white"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Disagree & Request Original
              </Button>
            </div>
          )}

          {/* Accept Confirmation */}
          {action === "accept" && (
            <div className="space-y-3 pt-4 border-t">
              <p className="text-sm text-slate-700">
                You&apos;re agreeing to the proposed dates. This will be sent to HR Leave Office for processing.
              </p>
              <div className="flex gap-2">
                <Button onClick={() => setAction("view")} variant="outline" className="flex-1">
                  Back
                </Button>
                <Button
                  onClick={() => handleAction("acknowledge_accept")}
                  disabled={isSubmitting}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  {isSubmitting ? "Processing..." : "Confirm Agreement"}
                </Button>
              </div>
            </div>
          )}

          {/* Reject Confirmation */}
          {action === "reject" && (
            <div className="space-y-3 pt-4 border-t">
              <p className="text-sm text-slate-700">
                The original leave dates will be retained and sent to HR for processing.
              </p>
              <div className="flex gap-2">
                <Button onClick={() => setAction("view")} variant="outline" className="flex-1">
                  Back
                </Button>
                <Button
                  onClick={() => handleAction("acknowledge_reject")}
                  disabled={isSubmitting}
                  className="flex-1 bg-red-600 hover:bg-red-700"
                >
                  {isSubmitting ? "Processing..." : "Confirm Rejection"}
                </Button>
              </div>
            </div>
          )}

          {/* Counter Proposal */}
          {action === "counter" && (
            <div className="space-y-3 pt-4 border-t">
              <div>
                <label className="text-sm font-semibold text-slate-700 mb-2 block">
                  Your Counter-Proposal Details
                </label>
                <Textarea
                  placeholder="Explain your proposed dates and why you need different dates..."
                  value={counterText}
                  onChange={(e) => setCounterText(e.target.value)}
                  rows={4}
                  className="resize-none border-slate-300 focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={() => setAction("view")} variant="outline" className="flex-1">
                  Back
                </Button>
                <Button
                  onClick={() => handleAction("counter_propose")}
                  disabled={isSubmitting}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  {isSubmitting ? "Sending..." : "Send Counter"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
