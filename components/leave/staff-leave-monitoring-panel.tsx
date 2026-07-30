"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Calendar, Clock, Users, AlertCircle, TrendingDown } from "lucide-react"
import { differenceInCalendarDays, format, isPast, isToday } from "date-fns"

interface StaffLeave {
  id: string
  user_id: string
  first_name: string
  last_name: string
  department: string
  leave_type: string
  leave_start_date: string
  leave_end_date: string
  leave_status: string
}

interface StaffLeaveMonitoringPanelProps {
  staffOnLeave: StaffLeave[]
  title?: string
  showCurrentlyOnly?: boolean
}

export function StaffLeaveMonitoringPanel({
  staffOnLeave,
  title = "Staff Leave Schedule",
  showCurrentlyOnly = true,
}: StaffLeaveMonitoringPanelProps) {
  const [filteredStaff, setFilteredStaff] = useState<StaffLeave[]>([])

  useEffect(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (showCurrentlyOnly) {
      // Only show staff currently on leave
      const onLeaveNow = staffOnLeave.filter((staff) => {
        const startDate = new Date(staff.leave_start_date)
        startDate.setHours(0, 0, 0, 0)
        const endDate = new Date(staff.leave_end_date)
        endDate.setHours(0, 0, 0, 0)

        return today >= startDate && today <= endDate
      })
      setFilteredStaff(onLeaveNow)
    } else {
      setFilteredStaff(staffOnLeave)
    }
  }, [staffOnLeave, showCurrentlyOnly])

  if (!filteredStaff || filteredStaff.length === 0) {
    return (
      <Card className="border-0 shadow-md bg-gradient-to-br from-white/90 to-white/50 dark:from-slate-900/90 dark:to-slate-800/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            {title}
          </CardTitle>
          <CardDescription>Monitor your team's leave schedules</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Users className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground font-medium">No staff currently on leave</p>
            <p className="text-sm text-muted-foreground">Your team is working hard!</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-0 shadow-md bg-gradient-to-br from-white/90 to-white/50 dark:from-slate-900/90 dark:to-slate-800/50">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              {title}
            </CardTitle>
            <CardDescription>
              {filteredStaff.length} staff member{filteredStaff.length !== 1 ? "s" : ""} on leave
            </CardDescription>
          </div>
          <Badge variant="secondary" className="text-lg px-3 py-1">
            {filteredStaff.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {filteredStaff.map((staff) => {
          const endDate = new Date(staff.leave_end_date)
          const daysRemaining = Math.max(
            0,
            differenceInCalendarDays(endDate, new Date().setHours(0, 0, 0, 0)) + 1
          )
          const isEndingToday = isToday(endDate)
          const isOverdue = isPast(endDate)

          let urgency: "low" | "medium" | "high" | "critical" = "low"
          let badgeVariant: "default" | "secondary" | "destructive" | "outline" = "default"
          let emoji = "🏖️"
          let statusText = `${daysRemaining} day${daysRemaining !== 1 ? "s" : ""} left`

          if (isOverdue) {
            urgency = "critical"
            badgeVariant = "destructive"
            emoji = "🔴"
            statusText = "Overdue"
          } else if (isEndingToday) {
            urgency = "critical"
            badgeVariant = "destructive"
            emoji = "🎉"
            statusText = "Resumes Today"
          } else if (daysRemaining <= 2) {
            urgency = "high"
            badgeVariant = "destructive"
            emoji = "⏰"
            statusText = `${daysRemaining} day${daysRemaining !== 1 ? "s" : ""} left`
          } else if (daysRemaining <= 5) {
            urgency = "medium"
            badgeVariant = "secondary"
            emoji = "📅"
            statusText = `${daysRemaining} day${daysRemaining !== 1 ? "s" : ""} left`
          }

          return (
            <div
              key={staff.id}
              className="flex items-center justify-between gap-4 p-4 rounded-lg bg-white/50 dark:bg-slate-800/50 border border-white/40 dark:border-slate-700/40 hover:bg-white/70 dark:hover:bg-slate-800/70 transition-colors"
            >
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="text-2xl pt-1">{emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-semibold text-sm">
                      {staff.first_name} {staff.last_name}
                    </h4>
                    <Badge variant="outline" className="text-xs">
                      {staff.department}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1.5">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {format(new Date(staff.leave_start_date), "dd MMM")} –{" "}
                      {format(new Date(staff.leave_end_date), "dd MMM")}
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {staff.leave_type}
                    </div>
                  </div>
                </div>
              </div>

              <Badge variant={badgeVariant} className="shrink-0 text-xs font-semibold whitespace-nowrap">
                {statusText}
              </Badge>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
