'use client'

import React from 'react'
import { LeaveResumptionBadge } from './leave-resumption-badge'
import { GlobalWarningsToasts } from './global-warnings-toasts'
import { DashboardCountdownWrapper } from './dashboard-countdown-wrapper'
import { AnnualLeaveCompliancePanel } from './annual-leave-compliance-panel'

interface LeaveManagementPageWrapperProps {
  children: React.ReactNode
}

export function LeaveManagementPageWrapper({ children }: LeaveManagementPageWrapperProps) {
  return (
    <>
      <GlobalWarningsToasts />
      <div className="space-y-4 px-2">
        <AnnualLeaveCompliancePanel />
        <LeaveResumptionBadge />
        <DashboardCountdownWrapper />
      </div>
      {children}
    </>
  )
}
