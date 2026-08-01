'use client'

import React from 'react'
import { LeaveResumptionBadge } from './leave-resumption-badge'
import { GlobalWarningsToasts } from './global-warnings-toasts'

interface LeaveManagementPageWrapperProps {
  children: React.ReactNode
}

export function LeaveManagementPageWrapper({ children }: LeaveManagementPageWrapperProps) {
  return (
    <>
      <GlobalWarningsToasts />
      <div className="px-2">
        <LeaveResumptionBadge />
      </div>
      {children}
    </>
  )
}
