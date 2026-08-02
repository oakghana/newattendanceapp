import { createClient } from '@/lib/supabase/server'

/**
 * Check if a staff member's leave has ended but they haven't confirmed resumption
 * Used to highlight overdue non-resumptions in red on the All Requests view
 */
export async function checkResumptionStatus(
  leaveEndDate: string,
  leaveResumptionId: string | null
): Promise<{
  isOverdue: boolean
  daysOverdue: number
  confirmationStatus: 'confirmed' | 'pending' | 'pending_hod_rm' | 'unconfirmed' | 'pending_hr_manual' | null
}> {
  const today = new Date().toISOString().split('T')[0]
  const endDate = new Date(leaveEndDate).toISOString().split('T')[0]
  const isOverdue = today > endDate

  if (!leaveResumptionId || !isOverdue) {
    return {
      isOverdue: false,
      daysOverdue: 0,
      confirmationStatus: null,
    }
  }

  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('leave_resumption_notifications')
      .select('confirmation_status')
      .eq('id', leaveResumptionId)
      .single()

    const confirmationStatus = data?.confirmation_status as any || 'unconfirmed'
    const daysOverdue = Math.floor((new Date(today).getTime() - new Date(endDate).getTime()) / (1000 * 60 * 60 * 24))

    return {
      isOverdue,
      daysOverdue,
      confirmationStatus,
    }
  } catch {
    return {
      isOverdue,
      daysOverdue: 0,
      confirmationStatus: null,
    }
  }
}

/**
 * Get row highlight class based on resumption status
 * Light red for overdue non-confirmations
 */
export function getResumptionRowClass(
  leaveEndDate: string,
  confirmationStatus: string | null,
  isOverdue: boolean
): string {
  const today = new Date().toISOString().split('T')[0]
  const endDate = new Date(leaveEndDate).toISOString().split('T')[0]
  const leaveHasEnded = today > endDate

  if (!leaveHasEnded) return ''
  if (!confirmationStatus || confirmationStatus === 'confirmed') return ''

  // Light red for pending or unconfirmed resumptions
  if (confirmationStatus === 'pending_hod_rm' || confirmationStatus === 'unconfirmed' || confirmationStatus === 'pending_hr_manual') {
    return 'bg-red-50 hover:bg-red-100 transition-colors'
  }

  return ''
}
