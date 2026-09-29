export async function getNextQccReference(admin: any): Promise<string> {
  try {
    const { data, error } = await admin.rpc("next_qcc_reference")
    if (!error && data) {
      if (typeof data === "string") return data
      if (Array.isArray(data) && data[0]) {
        const v = data[0]
        if (typeof v === "string") return v
        if (typeof v?.next_qcc_reference === "string") return v.next_qcc_reference
        if (typeof v?.reference_number === "string") return v.reference_number
      }
      if (typeof (data as any)?.next_qcc_reference === "string") return (data as any).next_qcc_reference
      if (typeof (data as any)?.reference_number === "string") return (data as any).reference_number
    }
  } catch {
    // fallback below
  }

  const fallback = Date.now()
  return `QCC/HRD/SWL/V.2/${fallback}`
}

export async function ensureImportedLoanReferences(admin: any): Promise<number> {
  const { data: loans, error } = await admin
    .from("loan_requests")
    .select("id, reference_number, memo_reference_locked, is_imported, hod_review_note")
    .or("is_imported.eq.true,hod_review_note.ilike.Bulk imported by Administrator%")
    .or("reference_number.is.null,reference_number.eq.")
    .limit(2000)
  if (error || !loans?.length) return 0

  let updated = 0
  for (const loan of loans) {
    const reference = await getNextQccReference(admin)
    const { error: updateError } = await admin
      .from("loan_requests")
      .update({
        reference_number: reference,
        memo_reference_locked: true,
        memo_reference_locked_at: new Date().toISOString(),
        memo_reference_locked_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", loan.id)
      .or("reference_number.is.null,reference_number.eq.")
    if (!updateError) updated += 1
  }
  return updated
}
