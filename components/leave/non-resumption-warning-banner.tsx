'use client'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertTriangle, AlertCircle, XCircle } from 'lucide-react'
import { format } from 'date-fns'

export interface NonResumptionWarningProps {
  leaveEndDate: string
  status: 'warning_sent' | 'letter_sent' | 'memo_sent'
  daysOverdue: number
}

export function NonResumptionWarningBanner({
  leaveEndDate,
  status,
  daysOverdue,
}: NonResumptionWarningProps) {
  if (!leaveEndDate) return null

  const getWarningConfig = () => {
    switch (status) {
      case 'warning_sent':
        return {
          title: '⚠ Non-Resumption Warning',
          message: `You have not resumed duty for ${daysOverdue} days after your leave ended on ${format(new Date(leaveEndDate), 'dd MMM yyyy')}. Please check in immediately through the Attendance System.`,
          severity: 'warning',
          icon: AlertTriangle,
          color: 'bg-amber-50 border-amber-200',
          textColor: 'text-amber-800',
          bgColor: 'bg-amber-100',
        }
      case 'letter_sent':
        return {
          title: '⚠ Warning Letter Issued',
          message: `A formal warning letter has been issued due to non-resumption of duty for ${daysOverdue} days. Please respond immediately and resume duty or contact HR with supporting documentation.`,
          severity: 'high',
          icon: AlertCircle,
          color: 'bg-orange-50 border-orange-300',
          textColor: 'text-orange-900',
          bgColor: 'bg-orange-100',
        }
      case 'memo_sent':
        return {
          title: '🚨 Critical: Query Memo - Disciplinary Investigation',
          message: `A formal query memo has been issued. Investigation into non-resumption of duty is in progress. You are required to provide a written statement immediately and resume duty within 24 hours.`,
          severity: 'critical',
          icon: XCircle,
          color: 'bg-red-50 border-red-300',
          textColor: 'text-red-900',
          bgColor: 'bg-red-100',
        }
      default:
        return null
    }
  }

  const config = getWarningConfig()
  if (!config) return null

  const Icon = config.icon

  return (
    <Alert className={`${config.color} border-2`}>
      <Icon className={`h-5 w-5 ${config.textColor}`} />
      <AlertDescription className={`${config.textColor} font-semibold`}>
        <div className="font-bold text-base mb-2">{config.title}</div>
        <div className="text-sm mb-3">{config.message}</div>
        {status === 'memo_sent' && (
          <div className={`${config.bgColor} p-3 rounded text-sm font-semibold mt-3`}>
            ESCALATION TIMELINE:
            <ul className="list-disc list-inside mt-2">
              <li>Day 2: Warning notification sent</li>
              <li>Day 5: Formal warning letter issued</li>
              <li>Day 10: Query memo issued - Investigation phase</li>
              <li>Next Step: Possible termination of employment</li>
            </ul>
          </div>
        )}
        {status === 'letter_sent' && (
          <div className={`${config.bgColor} p-2 rounded text-xs mt-3`}>
            Next escalation: Query Memo (if not resolved within 5 days)
          </div>
        )}
      </AlertDescription>
    </Alert>
  )
}

/**
 * Hook to fetch and display warning for a user
 */
export function useNonResumptionWarning(userId: string) {
  // This would be called from a server component or fetched via SWR
  // Returns the warning banner if applicable
}
