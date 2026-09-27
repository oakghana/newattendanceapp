export async function hasAssignedReviewer(admin: any, staffUserId: string): Promise<boolean> {
  const { data: linkages, error: linkageError } = await admin
    .from("loan_hod_linkages")
    .select("id, hod_user_id")
    .eq("staff_user_id", staffUserId)
    .limit(1)

  if (linkageError) {
    throw linkageError
  }

  return (linkages || []).some((linkage: any) => Boolean(linkage?.hod_user_id))
}

export const REVIEWER_LINKAGE_REQUIRED_MESSAGE =
  "You cannot submit a loan or leave request because no HOD or Regional Manager is assigned to you. Please contact an administrator to be linked before applying."
