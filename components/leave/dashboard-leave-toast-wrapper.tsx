"use client"

import { useState, useEffect } from "react"
import { LeaveCountdownToast } from "./leave-countdown-toast"
import { shouldShowCountdownToast } from "@/lib/leave-toast-utils"

interface DashboardLeaveToastWrapperProps {
  leaveStatus: string | null
  leaveStartDate: string | null
  leaveEndDate: string | null
  leaveType: string | null
  staffName: string
}

export function DashboardLeaveToastWrapper({
  leaveStatus,
  leaveStartDate,
  leaveEndDate,
  leaveType,
  staffName,
}: DashboardLeaveToastWrapperProps) {
  const [showToast, setShowToast] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Check if we should show the toast
    const shouldShow = 
      shouldShowCountdownToast(leaveStatus, leaveStartDate, leaveEndDate) &&
      !dismissed

    setShowToast(shouldShow)

    // Load dismissed state from localStorage
    const dismissedToasts = localStorage.getItem("dismissedLeaveToasts") || "{}"
    const parsed = JSON.parse(dismissedToasts)
    if (parsed[leaveEndDate]) {
      setDismissed(true)
      setShowToast(false)
    }
  }, [leaveStatus, leaveStartDate, leaveEndDate, dismissed])

  const handleDismiss = () => {
    setShowToast(false)
    setDismissed(true)
    
    // Store dismissed state with date so it can be shown again next day
    const dismissedToasts = JSON.parse(localStorage.getItem("dismissedLeaveToasts") || "{}")
    const today = new Date().toISOString().split("T")[0]
    dismissedToasts[leaveEndDate] = today
    localStorage.setItem("dismissedLeaveToasts", JSON.stringify(dismissedToasts))
  }

  if (
    !showToast ||
    !leaveStartDate ||
    !leaveEndDate ||
    !leaveType ||
    !shouldShowCountdownToast(leaveStatus, leaveStartDate, leaveEndDate)
  ) {
    return null
  }

  return (
    <LeaveCountdownToast
      leaveStartDate={leaveStartDate}
      leaveEndDate={leaveEndDate}
      leaveType={leaveType}
      staffName={staffName}
      onDismiss={handleDismiss}
    />
  )
}
