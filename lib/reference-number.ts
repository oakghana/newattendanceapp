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
