import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

export async function POST(request: NextRequest) {
  try {
    // Get all pending HOD requests grouped by HOD
    const { data: requests, error } = await supabase
      .from('leave_plan_requests')
      .select(`
        id,
        staff_name,
        created_at,
        user_profiles:staff_id (
          loan_hod_linkages:hod_id (
            id,
            name,
            employee_id,
            email
          )
        )
      `)
      .eq('hod_review_status', 'pending')
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[v0] Fetch pending requests error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const now = new Date()
    let notificationsSent = 0
    const hodRemindersSent: any[] = []

    // Group requests by HOD
    const hodGroups = (requests || []).reduce((acc: any, req: any) => {
      const hod = req.user_profiles?.loan_hod_linkages?.[0]
      if (!hod) return acc

      const hodId = hod.id
      if (!acc[hodId]) {
        acc[hodId] = {
          hod,
          requests: [],
        }
      }
      acc[hodId].requests.push(req)
      return acc
    }, {})

    // Send reminders for HODs with requests pending >3 days
    for (const [hodId, group] of Object.entries(hodGroups)) {
      const hodData = (group as any).hod
      const hodRequests = (group as any).requests

      // Calculate oldest pending days
      const oldestCreatedAt = new Date(hodRequests[0].created_at)
      const daysPending = Math.floor((now.getTime() - oldestCreatedAt.getTime()) / (1000 * 60 * 60 * 24))

      // Send reminder if >3 days pending
      if (daysPending >= 3) {
        // Create notification record
        const { error: notifError } = await supabase
          .from('notifications')
          .insert({
            user_id: hodData.id,
            notification_type: 'leave_request_hod',
            title: `${hodRequests.length} leave request(s) pending approval`,
            message: `You have ${hodRequests.length} leave request(s) awaiting your review. The oldest request has been pending for ${daysPending} days.`,
            is_read: false,
            created_at: new Date().toISOString(),
            related_id: null,
          })

        if (!notifError) {
          notificationsSent += 1
          hodRemindersSent.push({
            hodId: hodData.id,
            hodName: hodData.name,
            hodEmail: hodData.email,
            pendingRequests: hodRequests.length,
            daysPending,
          })
        } else {
          console.warn(`[v0] Failed to send notification to HOD ${hodData.id}:`, notifError)
        }
      }
    }

    return NextResponse.json({
      success: true,
      notificationsSent,
      reminders: hodRemindersSent,
      message: `${notificationsSent} HOD reminder(s) sent successfully`,
    })
  } catch (err) {
    console.error('[v0] Send HOD reminders error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
