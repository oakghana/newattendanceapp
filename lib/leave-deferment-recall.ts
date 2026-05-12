import { createClient } from "@/lib/supabase/server"

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
  
  const { data, error } = await supabase
    .from("leave_deferment_requests")
    .insert([
      {
        user_id: userId,
        leave_plan_request_id: leaveRequestId,
        original_start_date: originalStartDate.toISOString().split("T")[0],
        original_end_date: originalEndDate.toISOString().split("T")[0],
        new_start_date: newStartDate.toISOString().split("T")[0],
        new_end_date: newEndDate.toISOString().split("T")[0],
        reason,
        status: "pending_hod",
        requested_by: userId,
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
  
  const { data, error } = await supabase
    .from("leave_recall_requests")
    .insert([
      {
        user_id: userId,
        leave_plan_request_id: leaveRequestId,
        leave_start_date: leaveStartDate.toISOString().split("T")[0],
        leave_end_date: leaveEndDate.toISOString().split("T")[0],
        recall_date: recallDate.toISOString().split("T")[0],
        reason,
        status: "pending_hod",
        requested_by: userId,
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
