'use client'

import React from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Lock } from 'lucide-react'

interface AnnualLeaveLockedShieldProps {
  isLocked: boolean
  children: React.ReactNode
}

/**
 * Shield/Wrapper that disables leave planning UI when annual leave is locked
 * Shown to staff after Sept 1 or when they've already submitted
 */
export function AnnualLeaveLockedShield({ isLocked, children }: AnnualLeaveLockedShieldProps) {
  if (!isLocked) {
    return <>{children}</>
  }

  return (
    <div className="space-y-4">
      <Alert className="border-red-300 bg-red-50">
        <Lock className="h-5 w-5 text-red-600" />
        <AlertTitle className="text-red-900 font-semibold">
          🔒 Annual Leave Planning Locked
        </AlertTitle>
        <AlertDescription className="text-red-800 text-sm mt-2">
          Annual leave planning is locked after 1st October. You cannot modify or create new annual leave plans for this year.
          Planning will re-open on 1st January for the next calendar year.
        </AlertDescription>
      </Alert>

      <div className="opacity-50 pointer-events-none select-none">
        {children}
      </div>
    </div>
  )
}
