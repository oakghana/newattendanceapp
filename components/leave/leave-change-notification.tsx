"use client"

import { AlertCircle, Clock, Edit2 } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { LeaveChangeProposalModal } from "./leave-change-proposal-modal"

interface LeaveChangeNotificationProps {
  leaveRequestId: string
  staffName: string
  originalStartDate: string
  originalEndDate: string
  proposedStartDate: string
  proposedEndDate: string
  proposalReason: string
  proposedByRole: string
  status: "pending" | "accepted" | "rejected"
  userId: string
  userRole: string
  onRefresh?: () => void
}

export function LeaveChangeNotification({
  leaveRequestId,
  staffName,
  originalStartDate,
  originalEndDate,
  proposedStartDate,
  proposedEndDate,
  proposalReason,
  proposedByRole,
  status,
  userId,
  userRole,
  onRefresh,
}: LeaveChangeNotificationProps) {
  const [showModal, setShowModal] = useState(false)

  const formatDate = (date: string) => new Date(date).toLocaleDateString()

  const statusColors = {
    pending: "bg-amber-50 border-amber-200",
    accepted: "bg-green-50 border-green-200",
    rejected: "bg-red-50 border-red-200",
  }

  const statusIcons = {
    pending: <AlertCircle className="h-5 w-5 text-amber-600" />,
    accepted: <Clock className="h-5 w-5 text-green-600" />,
    rejected: <Clock className="h-5 w-5 text-red-600" />,
  }

  const statusTexts = {
    pending: "Awaiting Your Response",
    accepted: "Changes Accepted",
    rejected: "Changes Rejected",
  }

  return (
    <>
      <div className={`border rounded-lg p-4 ${statusColors[status]}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1">
            {statusIcons[status]}
            <div className="flex-1">
              <p className="font-semibold text-slate-900">Date Change Proposal</p>
              <p className="text-sm text-slate-600 mt-1">
                {proposedByRole === "department_head"
                  ? "Your Department Head"
                  : proposedByRole === "regional_manager"
                    ? "Your Regional Manager"
                    : "HR"}
                {" "}has proposed new dates for your leave.
              </p>

              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Current:</span>
                  <span className="font-medium text-slate-900">
                    {formatDate(originalStartDate)} to {formatDate(originalEndDate)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Proposed:</span>
                  <span className="font-medium text-blue-900">
                    {formatDate(proposedStartDate)} to {formatDate(proposedEndDate)}
                  </span>
                </div>
                {proposalReason && (
                  <div className="flex justify-between items-start">
                    <span className="text-slate-600">Reason:</span>
                    <span className="text-slate-700 max-w-xs text-right">{proposalReason}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {status === "pending" && (
            <Button
              onClick={() => setShowModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Edit2 className="h-4 w-4 mr-2" />
              Review
            </Button>
          )}
        </div>
      </div>

      <LeaveChangeProposalModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        leaveRequestId={leaveRequestId}
        staffName={staffName}
        originalStartDate={originalStartDate}
        originalEndDate={originalEndDate}
        proposedStartDate={proposedStartDate}
        proposedEndDate={proposedEndDate}
        proposalReason={proposalReason}
        userId={userId}
        userRole={userRole}
        onSuccess={() => {
          onRefresh?.()
        }}
      />
    </>
  )
}
