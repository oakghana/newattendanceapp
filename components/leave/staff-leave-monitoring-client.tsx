"use client"

import { useEffect, useState } from "react"
import { StaffLeaveMonitoringPanel } from "./staff-leave-monitoring-panel"
import { AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

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

interface StaffLeaveMonitoringClientProps {
  userRole: string | null
}

export function StaffLeaveMonitoringClient({ userRole }: StaffLeaveMonitoringClientProps) {
  const [staffOnLeave, setStaffOnLeave] = useState<StaffLeave[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Check if user has permission to view this
  const canViewLeaveMonitoring = ["head_of_department", "regional_manager", "hr_executive", "hr_leave_office", "admin"].includes(
    userRole || ""
  )

  useEffect(() => {
    if (!canViewLeaveMonitoring) {
      setIsLoading(false)
      return
    }

    const fetchStaffLeave = async () => {
      try {
        setIsLoading(true)
        const response = await fetch("/api/leave/staff-monitoring")

        if (!response.ok) {
          if (response.status === 403) {
            setError("You don't have permission to view staff leave schedules")
          } else {
            throw new Error("Failed to fetch staff leave schedules")
          }
          return
        }

        const data = await response.json()
        setStaffOnLeave(data.data || [])
        setError(null)
      } catch (err) {
        console.error("[v0] Error fetching staff leave:", err)
        setError("Failed to load staff leave schedules")
      } finally {
        setIsLoading(false)
      }
    }

    fetchStaffLeave()
    
    // Refresh every 5 minutes
    const interval = setInterval(fetchStaffLeave, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [canViewLeaveMonitoring])

  if (!canViewLeaveMonitoring) {
    return null
  }

  if (error) {
    return (
      <Alert className="bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800">
        <AlertCircle className="h-4 w-4 text-red-600" />
        <AlertDescription className="text-red-800 dark:text-red-200">{error}</AlertDescription>
      </Alert>
    )
  }

  return (
    <StaffLeaveMonitoringPanel
      staffOnLeave={staffOnLeave}
      title="👥 Team Leave Schedule"
      showCurrentlyOnly={true}
    />
  )
}
