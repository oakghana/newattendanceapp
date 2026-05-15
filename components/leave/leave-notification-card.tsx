import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Calendar, CheckCircle, Clock, AlertCircle, Bell } from "lucide-react"
import Link from "next/link"

export interface LeaveNotification {
  id: string
  user_id: string
  staff_name: string
  leave_type: string
  start_date: string
  end_date: string
  reason?: string
  status: "pending" | "approved" | "rejected"
  created_at: string
  can_dismiss: boolean
  // Approval information
  hr_approver_name?: string
  hr_approver_id?: string
  hr_approved_at?: string
  hr_approval_note?: string
  hr_office_reviewer_name?: string
  hr_office_reviewer_id?: string
  hr_office_reviewed_at?: string
  submitted_at?: string
}

interface LeaveNotificationCardProps {
  notification: LeaveNotification
  onDismiss?: (id: string) => void
  onApprove?: (id: string) => void
  onReject?: (id: string) => void
  isManager: boolean
}

export function LeaveNotificationCard({
  notification,
  onDismiss,
  onApprove,
  onReject,
  isManager,
}: LeaveNotificationCardProps) {
  const startDate = new Date(notification.start_date)
  const endDate = new Date(notification.end_date)
  const durationDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1

  const statusConfig = {
    pending: {
      label: "Pending",
      color: "bg-yellow-100 text-yellow-800 border-yellow-200",
      icon: Clock,
    },
    approved: {
      label: "Approved",
      color: "bg-green-100 text-green-800 border-green-200",
      icon: CheckCircle,
    },
    rejected: {
      label: "Rejected",
      color: "bg-red-100 text-red-800 border-red-200",
      icon: AlertCircle,
    },
  }

  const config = statusConfig[notification.status]
  const StatusIcon = config.icon

  return (
    <Card className="border-0 shadow-md hover:shadow-lg transition-shadow overflow-hidden">
      <CardHeader className="pb-3 bg-gradient-to-r from-card to-card/80">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Bell className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">{notification.staff_name}</CardTitle>
            </div>
            <CardDescription className="text-sm">{notification.leave_type} Leave Request</CardDescription>
          </div>
          <Badge className={`${config.color} border flex items-center gap-1 text-xs font-semibold`}>
            <StatusIcon className="h-3 w-3" />
            {config.label}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium">Start Date</p>
            <p className="text-sm font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              {startDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium">End Date</p>
            <p className="text-sm font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              {endDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </p>
          </div>
        </div>

        <div className="bg-muted/30 rounded-lg p-3 border border-muted/50">
          <p className="text-xs text-muted-foreground font-medium mb-1">Duration</p>
          <p className="text-sm font-semibold text-foreground">{durationDays} working day(s)</p>
        </div>

        {notification.reason && (
          <div className="bg-muted/30 rounded-lg p-3 border border-muted/50">
            <p className="text-xs text-muted-foreground font-medium mb-1">Reason</p>
            <p className="text-sm text-foreground">{notification.reason}</p>
          </div>
        )}

        {/* Approval Information Section */}
        {notification.status === "approved" && (
          <div className="space-y-3 pt-3 border-t border-muted/30">
            {notification.hr_office_reviewer_name && notification.hr_office_reviewed_at && (
              <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-3 border border-green-200 dark:border-green-900">
                <p className="text-xs text-muted-foreground font-medium mb-1">HR Leave Office Review</p>
                <p className="text-sm font-semibold text-green-700 dark:text-green-300">
                  {notification.hr_office_reviewer_name}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(notification.hr_office_reviewed_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            )}

            {notification.hr_approver_name && notification.hr_approved_at && (
              <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-3 border border-blue-200 dark:border-blue-900">
                <p className="text-xs text-muted-foreground font-medium mb-1">HR Executive Approval</p>
                <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                  {notification.hr_approver_name}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(notification.hr_approved_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
                {notification.hr_approval_note && (
                  <p className="text-xs text-foreground mt-2 italic">{notification.hr_approval_note}</p>
                )}
              </div>
            )}

            {notification.submitted_at && !notification.hr_approver_name && (
              <div className="bg-slate-50 dark:bg-slate-900/20 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
                <p className="text-xs text-muted-foreground font-medium mb-1">Submission Date</p>
                <p className="text-xs text-foreground">
                  {new Date(notification.submitted_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            )}
          </div>
        )}

        {isManager && notification.status === "pending" && (
          <div className="flex gap-2 pt-2 border-t border-muted/30">
            <Button
              onClick={() => onApprove?.(notification.id)}
              size="sm"
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              Approve
            </Button>
            <Button
              onClick={() => onReject?.(notification.id)}
              size="sm"
              variant="outline"
              className="flex-1 border-red-200 text-red-600 hover:bg-red-50"
            >
              <AlertCircle className="h-4 w-4 mr-1" />
              Reject
            </Button>
          </div>
        )}

        {notification.status !== "pending" && onDismiss && (
          <Button
            onClick={() => onDismiss(notification.id)}
            size="sm"
            variant="outline"
            className="w-full"
          >
            Dismiss Notification
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
