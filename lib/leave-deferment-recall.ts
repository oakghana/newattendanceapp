import { createClient } from "@/lib/supabase/server"

// Helper function to calculate working days (excluding weekends and holidays)
export async function calculateWorkingDays(startDate: string, endDate: string): Promise<{ workingDays: number; weekendDays: number; holidayDays: number }> {
  const supabase = await createClient()
  
  // Fetch public holidays
  const { data: holidays } = await supabase
    .from("ghana_public_holidays")
    .select("holiday_date")
    .gte("holiday_date", startDate)
    .lte("holiday_date", endDate)
  
  const holidaySet = new Set((holidays || []).map(h => h.holiday_date))
  
  const start = new Date(startDate)
  const end = new Date(endDate)
  
  let weekendDays = 0
  let holidayDays = 0
  let totalDays = 0
  let current = new Date(start)
  
  while (current <= end) {
    totalDays++
    const dayOfWeek = current.getDay()
    const dateStr = current.toISOString().split("T")[0]
    
    if (dayOfWeek === 0 || dayOfWeek === 6) { // Sunday or Saturday
      weekendDays++
    } else if (holidaySet.has(dateStr)) {
      holidayDays++
    }
    
    current.setDate(current.getDate() + 1)
  }
  
  const workingDays = totalDays - weekendDays - holidayDays
  
  return { workingDays, weekendDays, holidayDays }
}

export interface DefermentRequest {
  id: string
  user_id: string
  leave_plan_request_id?: string
  original_start_date: string
  original_end_date: string
  new_start_date: string
  new_end_date: string
  reason?: string
  status: "pending_hod" | "pending_hr_office" | "pending_executive_hr" | "approved" | "rejected" | "cancelled"
  requested_by: string
  created_at: string
  hod_decision?: string
  hr_office_decision?: string
  executive_hr_decision?: string
  original_working_days?: number
  new_working_days?: number
  working_days_change?: number
}

export interface RecallRequest {
  id: string
  user_id: string
  leave_plan_request_id?: string
  leave_start_date: string
  leave_end_date: string
  recall_date: string
  reason?: string
  status: "pending_hod" | "pending_hr_office" | "pending_executive_hr" | "approved" | "rejected" | "cancelled"
  requested_by: string
  created_at: string
  hod_decision?: string
  hr_office_decision?: string
  executive_hr_decision?: string
  total_leave_days?: number
  days_already_spent?: number
  days_to_restore?: number
}

export async function createDefermentRequest(
  userId: string,
  originalStartDate: Date,
  originalEndDate: Date,
  newStartDate: Date,
  newEndDate: Date,
  reason: string,
  leaveRequestId?: string
): Promise<DefermentRequest> {
  const supabase = await createClient()
  
  // Calculate working days for original and new dates
  const originalDateStr = originalStartDate.toISOString().split("T")[0]
  const originalEndDateStr = originalEndDate.toISOString().split("T")[0]
  const newDateStr = newStartDate.toISOString().split("T")[0]
  const newEndDateStr = newEndDate.toISOString().split("T")[0]
  
  const originalCalculation = await calculateWorkingDays(originalDateStr, originalEndDateStr)
  const newCalculation = await calculateWorkingDays(newDateStr, newEndDateStr)
  
  const { data, error } = await supabase
    .from("leave_deferment_requests")
    .insert([
      {
        user_id: userId,
        leave_plan_request_id: leaveRequestId,
        original_start_date: originalDateStr,
        original_end_date: originalEndDateStr,
        new_start_date: newDateStr,
        new_end_date: newEndDateStr,
        reason,
        status: "pending_hod",
        requested_by: userId,
        original_working_days: originalCalculation.workingDays,
        new_working_days: newCalculation.workingDays,
        working_days_change: newCalculation.workingDays - originalCalculation.workingDays,
      },
    ])
    .select()
    .single()

  if (error) throw new Error(`Failed to create deferment request: ${error.message}`)
  return data
}

export async function createRecallRequest(
  userId: string,
  leaveStartDate: Date,
  leaveEndDate: Date,
  recallDate: Date,
  reason: string,
  leaveRequestId?: string
): Promise<RecallRequest> {
  const supabase = await createClient()
  
  const leaveStartDateStr = leaveStartDate.toISOString().split("T")[0]
  const leaveEndDateStr = leaveEndDate.toISOString().split("T")[0]
  const recallDateStr = recallDate.toISOString().split("T")[0]
  
  // Calculate total working days for the leave period
  const totalCalculation = await calculateWorkingDays(leaveStartDateStr, leaveEndDateStr)
  
  // Calculate days already spent (from start date to recall date)
  const alreadySpentCalculation = await calculateWorkingDays(leaveStartDateStr, recallDateStr)
  
  // Calculate days to restore (remaining working days after recall date)
  const daysToRestore = totalCalculation.workingDays - alreadySpentCalculation.workingDays
  
  const { data, error } = await supabase
    .from("leave_recall_requests")
    .insert([
      {
        user_id: userId,
        leave_plan_request_id: leaveRequestId,
        leave_start_date: leaveStartDateStr,
        leave_end_date: leaveEndDateStr,
        recall_date: recallDateStr,
        reason,
        status: "pending_hod",
        requested_by: userId,
        total_leave_days: totalCalculation.workingDays,
        days_already_spent: alreadySpentCalculation.workingDays,
        days_to_restore: Math.max(0, daysToRestore),
      },
    ])
    .select()
    .single()

  if (error) throw new Error(`Failed to create recall request: ${error.message}`)
  return data
}

export async function submitDefermentForHodReview(
  defermentId: string,
  userId: string
): Promise<DefermentRequest> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from("leave_deferment_requests")
    .update({ status: "pending_hod" })
    .eq("id", defermentId)
    .select()
    .single()

  if (error) throw new Error(`Failed to submit deferment: ${error.message}`)
  
  // Log to audit trail
  await logAuditAction("deferment_requested", "deferment", defermentId, userId, null, "Deferment request submitted for HOD review")
  
  return data
}

export async function hodReviewDeferment(
  defermentId: string,
  decision: "approve" | "reject",
  comments: string,
  hodId: string
): Promise<DefermentRequest> {
  const supabase = await createClient()
  
  const newStatus = decision === "approve" ? "pending_hr_office" : "rejected"
  
  const { data, error } = await supabase
    .from("leave_deferment_requests")
    .update({
      status: newStatus,
      hod_decision: decision,
      hod_comments: comments,
      hod_reviewer_id: hodId,
      hod_reviewed_at: new Date().toISOString(),
    })
    .eq("id", defermentId)
    .select()
    .single()

  if (error) throw new Error(`Failed to review deferment: ${error.message}`)
  
  await logAuditAction("deferment_hod_reviewed", "deferment", defermentId, hodId, { decision }, comments)
  
  return data
}

export async function hrOfficeReviewDeferment(
  defermentId: string,
  decision: "approve" | "reject",
  comments: string,
  hrOfficeId: string
): Promise<DefermentRequest> {
  const supabase = await createClient()
  
  const newStatus = decision === "approve" ? "pending_executive_hr" : "rejected"
  
  const { data, error } = await supabase
    .from("leave_deferment_requests")
    .update({
      status: newStatus,
      hr_office_decision: decision,
      hr_office_comments: comments,
      hr_office_reviewer_id: hrOfficeId,
      hr_office_reviewed_at: new Date().toISOString(),
    })
    .eq("id", defermentId)
    .select()
    .single()

  if (error) throw new Error(`Failed to review deferment: ${error.message}`)
  
  await logAuditAction("deferment_hr_approved", "deferment", defermentId, hrOfficeId, { decision }, comments)
  
  return data
}

export async function executiveHrApproveDeferment(
  defermentId: string,
  decision: "approve" | "reject",
  comments: string,
  executiveHrId: string
): Promise<DefermentRequest> {
  const supabase = await createClient()
  
  const newStatus = decision === "approve" ? "approved" : "rejected"
  
  const { data, error } = await supabase
    .from("leave_deferment_requests")
    .update({
      status: newStatus,
      executive_hr_decision: decision,
      executive_hr_comments: comments,
      executive_hr_reviewer_id: executiveHrId,
      executive_hr_reviewed_at: new Date().toISOString(),
    })
    .eq("id", defermentId)
    .select()
    .single()

  if (error) throw new Error(`Failed to approve deferment: ${error.message}`)
  
  await logAuditAction(
    decision === "approve" ? "deferment_approved" : "deferment_rejected",
    "deferment",
    defermentId,
    executiveHrId,
    { decision },
    comments
  )
  
  return data
}

export async function logAuditAction(
  actionType: string,
  entityType: "deferment" | "recall",
  entityId: string,
  performedBy: string,
  changes: Record<string, any> | null,
  comments?: string
): Promise<void> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from("leave_deferment_recall_audit_log")
    .insert([
      {
        action_type: actionType,
        entity_type: entityType,
        entity_id: entityId,
        performed_by: performedBy,
        changes,
        comments,
      },
    ])

  if (error) console.error("[v0] Failed to log audit action:", error)
}

export async function getDefermentRequest(defermentId: string): Promise<DefermentRequest | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from("leave_deferment_requests")
    .select("*")
    .eq("id", defermentId)
    .single()

  if (error) return null
  return data
}

export async function getRecallRequest(recallId: string): Promise<RecallRequest | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from("leave_recall_requests")
    .select("*")
    .eq("id", recallId)
    .single()

  if (error) return null
  return data
}

export async function getUserDefermentRequests(userId: string): Promise<DefermentRequest[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from("leave_deferment_requests")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  if (error) return []
  return data || []
}

export async function getUserRecallRequests(userId: string): Promise<RecallRequest[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from("leave_recall_requests")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  if (error) return []
  return data || []
}

// Function to restore leave days when a recall is approved
export async function restoreLeaveDaysOnRecallApproval(
  recallId: string,
  leaveRequestId: string,
  daysToRestore: number,
  userId: string
): Promise<void> {
  const supabase = await createClient()
  
  // Get the current leave request
  const { data: leaveRequest, error: fetchError } = await supabase
    .from("leave_plan_requests")
    .select("requested_days, adjusted_days")
    .eq("id", leaveRequestId)
    .single()
  
  if (fetchError) throw new Error(`Failed to fetch leave request: ${fetchError.message}`)
  
  // Restore the leave days
  const currentRequestedDays = leaveRequest?.requested_days || 0
  const newRequestedDays = currentRequestedDays + daysToRestore
  
  const { error: updateError } = await supabase
    .from("leave_plan_requests")
    .update({
      requested_days: newRequestedDays,
      adjustment_reason: `Leave days restored after recall on ${new Date().toISOString().split("T")[0]}. Restored: ${daysToRestore} days`,
    })
    .eq("id", leaveRequestId)
  
  if (updateError) throw new Error(`Failed to restore leave days: ${updateError.message}`)
  
  // Log the restoration action
  await logAuditAction("leave_days_restored_on_recall", "recall", recallId, userId, { daysRestored: daysToRestore }, `Restored ${daysToRestore} leave days to request`)
}

// Function to handle leave day adjustment when deferment is approved
export async function adjustLeaveDaysOnDefermentApproval(
  defermentId: string,
  leaveRequestId: string,
  workingDaysChange: number,
  userId: string
): Promise<void> {
  const supabase = await createClient()
  
  if (workingDaysChange === 0) return // No adjustment needed
  
  // Get the current leave request
  const { data: leaveRequest, error: fetchError } = await supabase
    .from("leave_plan_requests")
    .select("requested_days")
    .eq("id", leaveRequestId)
    .single()
  
  if (fetchError) throw new Error(`Failed to fetch leave request: ${fetchError.message}`)
  
  // Adjust the leave days based on the change in working days
  const currentRequestedDays = leaveRequest?.requested_days || 0
  const newRequestedDays = currentRequestedDays + workingDaysChange
  
  const { error: updateError } = await supabase
    .from("leave_plan_requests")
    .update({
      requested_days: Math.max(0, newRequestedDays),
      adjustment_reason: `Leave days adjusted due to deferment on ${new Date().toISOString().split("T")[0]}. Change: ${workingDaysChange > 0 ? '+' : ''}${workingDaysChange} days`,
    })
    .eq("id", leaveRequestId)
  
  if (updateError) throw new Error(`Failed to adjust leave days: ${updateError.message}`)
  
  // Log the adjustment action
  await logAuditAction("leave_days_adjusted_on_deferment", "deferment", defermentId, userId, { workingDaysChange }, `Adjusted leave days by ${workingDaysChange}`)
}
