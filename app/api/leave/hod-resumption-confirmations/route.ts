import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get HOD's department from user profile
    const { data: userProfile, error: profileErr } = await admin
      .from('user_profiles')
      .select('department_id')
      .eq('id', user.id)
      .single()

    if (profileErr || !userProfile) {
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 404 }
      )
    }

    // Fetch HR-approved leaves from this department that are past their end date
    // and don't have HOD confirmation yet
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const { data: requests, error: fetchErr } = await admin
      .from('leave_plan_requests')
      .select(
        `id, user_id, leave_type_key, preferred_start_date, preferred_end_date, status,
         user_profiles!user_id (first_name, last_name, employee_id)`
      )
      .eq('status', 'hr_approved')
      .lte('preferred_end_date', today.toISOString().split('T')[0])
      .order('preferred_end_date', { ascending: false })

    if (fetchErr) {
      console.error('[v0] Fetch resumption requests error:', fetchErr)
      return NextResponse.json(
        { error: 'Failed to fetch requests' },
        { status: 500 }
      )
    }

    // Fetch resumption notification data for HOD confirmation status
    const requestIds = (requests || []).map((r: any) => r.id).filter(Boolean)
    let hodConfirmationMap: Record<string, { confirmed: boolean; confirmedAt: string | null }> = {}

    if (requestIds.length > 0) {
      const { data: resumptions } = await admin
        .from('leave_resumption_notifications')
        .select('leave_request_id, first_hod_rm_check_in_date')
        .in('leave_request_id', requestIds)

      if (resumptions) {
        for (const notif of resumptions) {
          hodConfirmationMap[notif.leave_request_id] = {
            confirmed: !!notif.first_hod_rm_check_in_date,
            confirmedAt: notif.first_hod_rm_check_in_date,
          }
        }
      }
    }

    // Map and filter: only show unconfirmed leaves, and calculate days overdue
    const formattedRequests = (requests || [])
      .map((req: any) => {
        const confirmation = hodConfirmationMap[req.id] || { confirmed: false, confirmedAt: null }
        
        // Calculate days overdue
        const endDate = new Date(req.preferred_end_date)
        endDate.setHours(0, 0, 0, 0)
        const daysOverdue = Math.max(0, Math.floor((today.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24)))

        return {
          id: req.id,
          user_id: req.user_id,
          staff_name: req.user_profiles ? `${req.user_profiles.first_name || ''} ${req.user_profiles.last_name || ''}`.trim() : 'Unknown',
          user_profiles: {
            first_name: req.user_profiles?.first_name,
            last_name: req.user_profiles?.last_name,
            employee_id: req.user_profiles?.employee_id,
          },
          leave_type_key: req.leave_type_key,
          preferred_start_date: req.preferred_start_date,
          preferred_end_date: req.preferred_end_date,
          status: req.status,
          hod_confirmed: confirmation.confirmed,
          hod_confirmed_at: confirmation.confirmedAt,
          daysOverdue,
        }
      })
      .filter((req: any) => !req.hod_confirmed) // Only show unconfirmed

    return NextResponse.json({
      success: true,
      requests: formattedRequests,
    })
  } catch (err) {
    console.error('[v0] HOD resumption confirmations error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
