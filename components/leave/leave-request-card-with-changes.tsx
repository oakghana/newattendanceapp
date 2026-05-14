"use client"

import { useState } from "react"
import { HodChangeLeaveRequestDialog } from "./hod-change-leave-dialog"
import { LeaveChangeNotification } from "./leave-change-notification"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Edit2 } from "lucide-react"

interface LeaveRequestWithChangesProps {
  leaveRequestId: string
  staffName: string
  staffEmail: string
  startDate: string
  endDate: string
  leaveType: string
  status: string
  userId: string
  userRole: string
  // Change proposal data (optional)
  changeProposal?: {
    originalStartDate: string
    originalEndDate: string
    proposedStartDate: string
    proposedEndDate: string
    proposalReason: string
    proposedByRole: string
    changeStatus: "pending" | "accepted" | "rejected"
  }
  isManagerView?: boolean
  onRefresh?: () => void
}

export function LeaveRequestCardWithChanges({
  leaveRequestId,
  staffName,
  staffEmail,
  startDate,
  endDate,
  leaveType,
  status,
  userId,
  userRole,
  changeProposal,
  isManagerView = false,
  onRefresh,
}: LeaveRequestWithChangesProps) {
  const [showChangeDialog, setShowChangeDialog] = useState(false)

  const formatDate = (date: string) => new Date(date).toLocaleDateString()

  return (
    <>
      <Card className="border border-slate-200 hover:shadow-md transition-shadow">
        {/* Change Notification Alert - Show if there's a pending change proposal */}
        {changeProposal && changeProposal.changeStatus === "pending" && (
          <div className="border-b border-slate-200">
            <LeaveChangeNotification
              leaveRequestId={leaveRequestId}
              staffName={staffName}
              originalStartDate={changeProposal.originalStartDate}
              originalEndDate={changeProposal.originalEndDate}
              proposedStartDate={changeProposal.proposedStartDate}
              proposedEndDate={changeProposal.proposedEndDate}
              proposalReason={changeProposal.proposalReason}
              proposedByRole={changeProposal.proposedByRole}
              status={changeProposal.changeStatus}
              userId={userId}
              userRole={userRole}
              onRefresh={onRefresh}
            />
          </div>
        )}

        {/* Main Card Content */}
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-base">{staffName}</CardTitle>
              <CardDescription className="text-xs mt-1">{staffEmail}</CardDescription>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold ${
                status === "approved"
                  ? "bg-green-100 text-green-800"
                  : status === "pending"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-slate-100 text-slate-800"
              }`}
            >
              {status}
            </span>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Leave Type and Dates */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-900">{leaveType}</p>
            <p className="text-sm text-slate-600">
              {formatDate(startDate)} to {formatDate(endDate)}
            </p>
          </div>

          {/* Show applied changes if accepted */}
          {changeProposal && changeProposal.changeStatus === "accepted" && (
            <div className="bg-green-50 border border-green-200 rounded p-2">
              <p className="text-xs text-green-700 font-semibold mb-1">Applied Changes:</p>
              <p className="text-xs text-green-900">
                {formatDate(changeProposal.proposedStartDate)} to {formatDate(changeProposal.proposedEndDate)}
              </p>
            </div>
          )}

          {/* Manager Actions - Can propose date changes */}
          {isManagerView && status === "approved" && !changeProposal && (
            <Button
              onClick={() => setShowChangeDialog(true)}
              variant="outline"
              size="sm"
              className="w-full text-blue-600 border-blue-300 hover:bg-blue-50"
            >
              <Edit2 className="h-3.5 w-3.5 mr-2" />
              Propose Date Changes
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Change Dialog for Managers */}
      <HodChangeLeaveRequestDialog
        isOpen={showChangeDialog}
        onClose={() => setShowChangeDialog(false)}
        leaveRequestId={leaveRequestId}
        staffName={staffName}
        currentStartDate={startDate}
        currentEndDate={endDate}
        userId={userId}
        userRole={userRole}
        onSuccess={() => {
          onRefresh?.()
          setShowChangeDialog(false)
        }}
      />
    </>
  )
}
