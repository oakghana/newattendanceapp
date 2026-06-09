import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

// HR Executive roles that can approve deferment/recall requests
const HR_EXECUTIVE_ROLES = ["hr_executive", "hr_director", "hr_head", "admin", "department_head", "regional_manager", "hr_officer", "manager_hr", "director_hr", "hr_leave_office"]

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    const body = await request.json()
    const { 
      request_id, 
      request_type, // 'deferment' or 'recall'
      decision, // 'approved' or 'rejected'
      rejection_reason,
      hr_executive_id,
      hr_executive_role 
    } = body

    // Validate required fields
    if (!request_id || !request_type || !decision || !hr_executive_id) {
      return NextResponse.json(
        { error: "Missing required fields: request_id, request_type, decision, hr_executive_id" },
        { status: 400 }
      )
    }

    // Validate decision
    if (!['approved', 'rejected'].includes(decision)) {
      return NextResponse.json(
        { error: "Decision must be 'approved' or 'rejected'" },
        { status: 400 }
      )
    }

    // Verify user role has access
    const normalizedRole = String(hr_executive_role || "").toLowerCase().replace(/[-\s]+/g, "_")
    if (!HR_EXECUTIVE_ROLES.includes(normalizedRole)) {
      return NextResponse.json(
        { error: "Access denied. Only HR Executives can approve or reject requests." },
        { status: 403 }
      )
    }

    // Determine the correct table
    const tableName = request_type === 'deferment' 
      ? 'leave_deferment_requests' 
      : 'leave_recall_requests'

    // First verify the request exists and is assigned to this HR executive
    const { data: existingRequest, error: fetchError } = await supabase
      .from(tableName)
      .select('*')
      .eq('id', request_id)
      .single()

    if (fetchError || !existingRequest) {
      return NextResponse.json(
        { error: `${request_type} request not found` },
        { status: 404 }
      )
    }

    // Verify it's assigned to this HR executive (check hr_office_reviewed_by for deferment, hr_reviewed_by for recall)
    const hrReviewerField = request_type === 'deferment' ? 'hr_office_reviewed_by' : 'hr_reviewed_by'
    if (existingRequest[hrReviewerField] && existingRequest[hrReviewerField] !== hr_executive_id) {
      return NextResponse.json(
        { error: "This request is not assigned to you" },
        { status: 403 }
      )
    }

    // Verify it hasn't already been processed (check the decision field)
    const decisionField = request_type === 'deferment' ? 'hr_office_decision' : 'hr_decision'
    if (existingRequest[decisionField] && existingRequest[decisionField] !== null) {
      return NextResponse.json(
        { error: `This request has already been ${existingRequest[decisionField]}` },
        { status: 400 }
      )
    }

    // Update the request with the decision
    const updateData: Record<string, unknown> = {}
    
    if (request_type === 'deferment') {
      updateData.hr_office_decision = decision
      updateData.hr_office_reviewed_at = new Date().toISOString()
      updateData.hr_office_reviewed_by = hr_executive_id
      updateData.hr_office_decision_note = rejection_reason || null
    } else {
      updateData.hr_decision = decision
      updateData.hr_reviewed_at = new Date().toISOString()
      updateData.hr_reviewed_by = hr_executive_id
      updateData.hr_decision_note = rejection_reason || null
    }
    
    updateData.status = decision
    updateData.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from(tableName)
      .update(updateData)
      .eq('id', request_id)
      .select()
      .single()

    if (error) {
      console.error(`[v0] Error updating ${request_type} request:`, error)
      return NextResponse.json(
        { error: error.message || `Failed to ${decision} ${request_type} request` },
        { status: 500 }
      )
    }

    // If approved, generate memo and send notifications
    if (decision === 'approved') {
      try {
        // Generate memo for deferment/recall
        if (request_type === 'deferment') {
          await generateDefermentMemo(supabase, data, hr_executive_id)
        } else {
          await generateRecallMemo(supabase, data, hr_executive_id)
        }

        // Send notifications to relevant parties
        await sendApprovalNotifications(supabase, data, request_type, 'approved')
      } catch (memoError) {
        console.error(`[v0] Error generating memo or sending notifications:`, memoError)
        // Don't fail the approval if memo generation fails, but log it
      }
    } else if (decision === 'rejected') {
      // Send rejection notification
      try {
        await sendApprovalNotifications(supabase, data, request_type, 'rejected', rejection_reason)
      } catch (notifError) {
        console.error(`[v0] Error sending rejection notification:`, notifError)
      }
    }

    // Get staff details for notification message
    const staffQuery = request_type === 'deferment'
      ? supabase.from('user_profiles').select('first_name, last_name').eq('id', existingRequest.user_id).single()
      : supabase.from('user_profiles').select('first_name, last_name').eq('id', existingRequest.staff_user_id).single()

    const { data: staffData } = await staffQuery
    const staffName = staffData ? `${staffData.first_name} ${staffData.last_name}` : 'the staff member'

    return NextResponse.json({
      success: true,
      data,
      message: decision === 'approved'
        ? `${request_type === 'deferment' ? 'Deferment' : 'Recall'} request for ${staffName} has been approved and memo generated`
        : `${request_type === 'deferment' ? 'Deferment' : 'Recall'} request for ${staffName} has been rejected`
    })
  } catch (error) {
    console.error("[v0] HR Executive decision API error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}

// Helper function to generate deferment memo
async function generateDefermentMemo(supabase: any, defermentData: any, hrExecutiveId: string) {
  try {
    // Get staff and leave details
    const { data: staffData } = await supabase
      .from('user_profiles')
      .select('first_name, last_name, email, position, department_id')
      .eq('id', defermentData.user_id)
      .single()

    const { data: hodData } = await supabase
      .from('loan_hod_linkages')
      .select('hod_user_id')
      .eq('staff_user_id', defermentData.user_id)
      .single()

    // Create deferment memo record
    const memoData = {
      deferment_request_id: defermentData.id,
      staff_id: defermentData.user_id,
      hod_id: hodData?.hod_user_id || null,
      hr_signer_id: hrExecutiveId,
      status: 'generated',
      generated_at: new Date().toISOString(),
      memo_body: {
        staff_name: `${staffData?.first_name} ${staffData?.last_name}`,
        staff_email: staffData?.email,
        leave_type: defermentData.leave_type_key,
        deferment_period: `${defermentData.deferment_start_date} to ${defermentData.deferment_end_date}`,
        reason: defermentData.reason,
        deferment_year: defermentData.requested_deferment_year
      }
    }

    const { data: memo, error: memoError } = await supabase
      .from('deferment_memos')
      .insert([memoData])
      .select()
      .single()

    if (memoError) throw memoError

    // Create memo distributions for relevant roles
    const distributions = [
      { recipient_id: defermentData.user_id, recipient_role: 'staff' },
      { recipient_id: hodData?.hod_user_id, recipient_role: 'hod' }
    ]

    // Add HR Leave Office recipient
    const { data: hrLeaveOfficeUsers } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('role', 'hr_leave_office')
      .limit(1)

    if (hrLeaveOfficeUsers?.length) {
      distributions.push({ recipient_id: hrLeaveOfficeUsers[0].id, recipient_role: 'hr_leave_office' })
    }

    for (const dist of distributions) {
      if (dist.recipient_id) {
        await supabase.from('deferment_memo_distributions').insert([{
          deferment_memo_id: memo.id,
          recipient_id: dist.recipient_id,
          recipient_role: dist.recipient_role,
          created_at: new Date().toISOString()
        }])
      }
    }

    console.log('[v0] Deferment memo generated successfully:', memo.id)
  } catch (error) {
    console.error('[v0] Error generating deferment memo:', error)
    throw error
  }
}

// Helper function to generate recall memo
async function generateRecallMemo(supabase: any, recallData: any, hrExecutiveId: string) {
  try {
    // Get staff details
    const { data: staffData } = await supabase
      .from('user_profiles')
      .select('first_name, last_name, email, position, department_id')
      .eq('id', recallData.staff_user_id)
      .single()

    const { data: hodData } = await supabase
      .from('loan_hod_linkages')
      .select('hod_user_id')
      .eq('staff_user_id', recallData.staff_user_id)
      .single()

    // Create recall memo record
    const memoData = {
      recall_request_id: recallData.id,
      staff_id: recallData.staff_user_id,
      hr_signer_id: hrExecutiveId,
      status: 'generated',
      generated_at: new Date().toISOString(),
      memo_body: {
        staff_name: `${staffData?.first_name} ${staffData?.last_name}`,
        staff_email: staffData?.email,
        recall_date: recallData.recall_date,
        recall_reason: recallData.recall_reason,
        recall_notes: recallData.recall_notes
      }
    }

    const { data: memo, error: memoError } = await supabase
      .from('recall_memos')
      .insert([memoData])
      .select()
      .single()

    if (memoError) throw memoError

    // Create memo distributions
    const distributions = [
      { recipient_id: recallData.staff_user_id, recipient_role: 'staff' },
      { recipient_id: hodData?.hod_user_id, recipient_role: 'hod' }
    ]

    // Add HR Leave Office recipient
    const { data: hrLeaveOfficeUsers } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('role', 'hr_leave_office')
      .limit(1)

    if (hrLeaveOfficeUsers?.length) {
      distributions.push({ recipient_id: hrLeaveOfficeUsers[0].id, recipient_role: 'hr_leave_office' })
    }

    for (const dist of distributions) {
      if (dist.recipient_id) {
        await supabase.from('recall_memo_distributions').insert([{
          recall_memo_id: memo.id,
          recipient_id: dist.recipient_id,
          recipient_role: dist.recipient_role,
          created_at: new Date().toISOString()
        }])
      }
    }

    console.log('[v0] Recall memo generated successfully:', memo.id)
  } catch (error) {
    console.error('[v0] Error generating recall memo:', error)
    throw error
  }
}

// Helper function to send notifications
async function sendApprovalNotifications(supabase: any, requestData: any, requestType: 'deferment' | 'recall', decision: string, reason?: string) {
  try {
    const staffId = requestType === 'deferment' ? requestData.user_id : requestData.staff_user_id

    const { data: staffData } = await supabase
      .from('user_profiles')
      .select('first_name, last_name, email')
      .eq('id', staffId)
      .single()

    const staffName = `${staffData?.first_name} ${staffData?.last_name}`
    const messageType = requestType === 'deferment' ? 'Deferment Request' : 'Recall Request'

    let message = ''
    if (decision === 'approved') {
      message = `Your ${messageType} has been approved by HR Executive. A memo has been generated and distributed to relevant parties.`
    } else {
      message = `Your ${messageType} has been rejected by HR Executive. Reason: ${reason || 'No reason provided'}`
    }

    // Create notification for staff
    await supabase.from('leave_notifications').insert([{
      leave_request_id: requestType === 'deferment' ? requestData.leave_plan_request_id : requestData.leave_plan_request_id,
      recipient_id: staffId,
      sender_id: null,
      message,
      notification_type: `${requestType}_${decision}`,
      status: 'pending',
      is_read: false,
      created_at: new Date().toISOString()
    }]).catch(() => null) // Don't fail if notification fails

    console.log(`[v0] Sent ${decision} notification to ${staffName}`)
  } catch (error) {
    console.error('[v0] Error sending notifications:', error)
    throw error
  }
}
