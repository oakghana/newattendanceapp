import { resolveStaffAssignments } from "@/lib/hr-workflow"

export async function hasAssignedReviewer(admin: any, staffUserId: string): Promise<boolean> {
  const [{ data: linkages, error: linkageError }, { data: profile, error: profileError }] = await Promise.all([
    admin
      .from("loan_hod_linkages")
      .select("id, hod_user_id")
      .eq("staff_user_id", staffUserId),
    admin
      .from("user_profiles")
      .select("hod_id")
      .eq("id", staffUserId)
      .maybeSingle(),
  ])

  if (linkageError) throw linkageError
  if (profileError) throw profileError
  if ((linkages || []).some((linkage: any) => Boolean(linkage?.hod_user_id))) return true
  if (profile?.hod_id) return true

  const assignments = await resolveStaffAssignments(admin, staffUserId)
  return Boolean(assignments.hodId || assignments.regionalManagerId)
}

export const REVIEWER_LINKAGE_REQUIRED_MESSAGE =
  "You cannot submit a loan or leave request because no HOD or Regional Manager is assigned to you. Please contact an administrator to be linked before applying."
