import { createClient } from "@/lib/supabase/server"

export interface StaffOnLeave {
  id: string
  full_name: string
  employee_id: string
  department_name: string
  position: string
  staff_category: string
  start_date: string
  end_date: string
  leave_type: string
}

export interface PaymentAdviceMemo {
  id?: string
  month: string
  memo_text: string
  staff_list: StaffOnLeave[]
  staff_count_by_category: Record<string, number>
  generated_at: string
}

/**
 * Detect all staff on annual leave for a given month
 */
export async function detectStaffOnLeaveForMonth(month: string): Promise<StaffOnLeave[]> {
  const supabase = await createClient()

  // Parse month string (YYYY-MM)
  const [year, monthNum] = month.split("-")
  const monthStart = new Date(`${year}-${monthNum}-01`)
  const monthEnd = new Date(
    parseInt(year),
    parseInt(monthNum),
    0,
    23,
    59,
    59
  )

  try {
    const { data: staffOnLeave, error } = await supabase
      .from("leave_plan_requests")
      .select(
        `
        id,
        user_id,
        staff_category,
        preferred_start_date,
        preferred_end_date,
        leave_type_key,
        user_profiles!inner(
          id,
          full_name,
          employee_id,
          department_name,
          position
        )
      `
      )
      .eq("leave_type_key", "annual")
      .eq("status", "approved")
      .lte("preferred_start_date", monthEnd.toISOString().split("T")[0])
      .gte("preferred_end_date", monthStart.toISOString().split("T")[0])

    if (error) throw error

    const formatted = (staffOnLeave || []).map((record: any) => ({
      id: record.id,
      full_name: record.user_profiles.full_name,
      employee_id: record.user_profiles.employee_id,
      department_name: record.user_profiles.department_name,
      position: record.user_profiles.position,
      staff_category: record.staff_category || "Junior",
      start_date: record.preferred_start_date,
      end_date: record.preferred_end_date,
      leave_type: record.leave_type_key,
    }))

    return formatted
  } catch (err) {
    console.error("[v0] Error detecting staff on leave:", err)
    throw err
  }
}

/**
 * Generate professional payment advice memos per category
 * @param staffList - List of staff on leave
 * @param month - Month in YYYY-MM format
 * @param signer - The HR Executive signer info (name, position) - if not provided, uses "HUMAN RESOURCE MANAGER"
 */
export function generateProfessionalMemos(
  staffList: StaffOnLeave[],
  month: string,
  signer?: { name?: string; position?: string; signature_image_url?: string }
): Record<string, string> {
  const monthDate = new Date(`${month}-01`)
  const monthName = monthDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  })

  // Use provided signer info, or fall back to defaults if not provided
  const signerName = signer?.name?.toUpperCase() || "HUMAN RESOURCE MANAGER"
  const signerPosition = signer?.position?.toUpperCase() || "HUMAN RESOURCE MANAGER"

  const categories = groupStaffByCategory(staffList)
  const memos: Record<string, string> = {}

  const categoryLabels: Record<string, string> = {
    Manager: "MANAGEMENT STAFF",
    Senior: "SNR. STAFF",
    Junior: "JNR. STAFF",
  }

  // Category codes for reference numbers
  const categoryCodes: Record<string, string> = {
    Manager: "MGT",
    Senior: "SNR",
    Junior: "JNR",
  }

  Object.entries(categories).forEach(([category, staff]) => {
    if ((staff as StaffOnLeave[]).length === 0) return

    const categoryLabel = categoryLabels[category] || category
    const categoryCode = categoryCodes[category] || "GEN"
    const today = new Date()
    const dateStr = today.toLocaleDateString("en-GB", { 
      day: "2-digit", 
      month: "long", 
      year: "numeric" 
    })
    
    // Generate professional reference number: QCC/HR/PA/{YEAR}/{MONTH}/{CATEGORY}/{SEQUENCE}
    const year = monthDate.getFullYear()
    const monthNum = String(monthDate.getMonth() + 1).padStart(2, "0")
    const sequence = String((staff as StaffOnLeave[]).length).padStart(3, "0")
    const refNo = `QCC/HR/PA/${year}/${monthNum}/${categoryCode}/${sequence}`

    let memo = `QUALITY CONTROL COMPANY LTD.
(COCOBOD)
P. O. BOX M54
ACCRA                                                    MEMORANDUM

REF. NO: ${refNo}                         DATE: ${dateStr}

TO:      DEPUTY DIRECTOR, FINANCE

FROM:    ${signerPosition}

SUBJECT: PAYMENT OF LEAVE ALLOWANCE (${categoryLabel}) – ${monthName.toUpperCase()}

We wish to inform you that the under-listed ${categoryLabel} are scheduled to proceed on their annual vacation leave in ${monthName}.

NO    NAME                          S/NO        POSITION                      DEPARTMENT              LEAVE DATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`

    ;(staff as StaffOnLeave[]).forEach((s, idx) => {
      const startDate = new Date(s.start_date)
      const dateFormatted = `${startDate.getDate()}-${String(startDate.getMonth() + 1).padStart(2, "0")}-${startDate.getFullYear().toString().slice(2)}`
      memo += `\n${String(idx + 1).padEnd(3)} ${s.full_name.padEnd(30)} ${s.employee_id.padEnd(11)} ${s.position.substring(0, 28).padEnd(30)} ${(s.department_name || "N/A").padEnd(23)} ${dateFormatted}`
    })

    memo += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

We count on your co-operation.

We, therefore, kindly request you to process and pay their leave allowance accordingly.


${signerName}
${signerPosition}
FOR: MANAGING DIRECTOR

cc:    Managing Director
       Deputy Director, HR
       Audit Manager

Prepared by: Human Resource Department
Date: ${monthName}`

    memos[category] = memo
  })

  return memos
}

/**
 * Generate a single combined memo with all staff categories (Manager, Senior, Junior)
 * Useful for group downloads where all staff from all categories in a month go into one memo
 */
export function generateCombinedMemo(
  staffList: StaffOnLeave[],
  month: string,
  signer?: { name?: string; position?: string; signature_image_url?: string }
): string {
  const monthDate = new Date(`${month}-01`)
  const monthName = monthDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  })

  const signerName = signer?.name?.toUpperCase() || "HUMAN RESOURCE MANAGER"
  const signerPosition = signer?.position?.toUpperCase() || "HUMAN RESOURCE MANAGER"

  const categories = groupStaffByCategory(staffList)
  const today = new Date()
  const dateStr = today.toLocaleDateString("en-GB", { 
    day: "2-digit", 
    month: "long", 
    year: "numeric" 
  })
  
  const year = monthDate.getFullYear()
  const monthNum = String(monthDate.getMonth() + 1).padStart(2, "0")
  const totalStaff = String(staffList.length).padStart(3, "0")
  const refNo = `QCC/HR/PA/${year}/${monthNum}/CMB/${totalStaff}`

  let memo = `QUALITY CONTROL COMPANY LTD.
(COCOBOD)
P. O. BOX M54
ACCRA                                                    MEMORANDUM

REF. NO: ${refNo}                         DATE: ${dateStr}

TO:      DEPUTY DIRECTOR, FINANCE

FROM:    ${signerPosition}

SUBJECT: PAYMENT OF LEAVE ALLOWANCE (ALL STAFF CATEGORIES) – ${monthName.toUpperCase()}

We wish to inform you that the staff members listed in the attached document are scheduled to proceed on annual vacation leave in ${monthName}.

NO    NAME                          S/NO        POSITION                      DEPARTMENT              CATEGORY             LEAVE DATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`

  let rowNum = 1
  Object.entries(categories).forEach(([category, staff]) => {
    ;(staff as StaffOnLeave[]).forEach((s) => {
      const startDate = new Date(s.start_date)
      const dateFormatted = `${startDate.getDate()}-${String(startDate.getMonth() + 1).padStart(2, "0")}-${startDate.getFullYear().toString().slice(2)}`
      const catLabel = category === "Manager" ? "MGT" : category === "Senior" ? "SNR" : "JNR"
      memo += `\n${String(rowNum).padEnd(3)} ${s.full_name.padEnd(30)} ${s.employee_id.padEnd(11)} ${s.position.substring(0, 28).padEnd(30)} ${(s.department_name || "N/A").padEnd(23)} ${catLabel.padEnd(19)} ${dateFormatted}`
      rowNum++
    })
  })

  memo += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

We count on your co-operation.

We, therefore, kindly request you to process and pay their leave allowance accordingly.


${signerName}
${signerPosition}
FOR: MANAGING DIRECTOR

cc:    Managing Director
       Deputy Director, HR
       Audit Manager

Prepared by: Human Resource Department
Date: ${monthName}`

  return memo
}

/**
 * Group staff by category
 */
export function groupStaffByCategory(
  staffList: StaffOnLeave[]
): Record<string, StaffOnLeave[]> {
  return staffList.reduce(
    (acc, staff) => {
      const category = staff.staff_category || "Junior"
      if (!acc[category]) acc[category] = []
      acc[category].push(staff)
      return acc
    },
    {
      Manager: [] as StaffOnLeave[],
      Senior: [] as StaffOnLeave[],
      Junior: [] as StaffOnLeave[],
    } as Record<string, StaffOnLeave[]>
  )
}

/**
 * Save payment memo to database
 */
export async function savePaymentMemo(
  month: string,
  memoText: string,
  staffList: StaffOnLeave[]
): Promise<string> {
  const supabase = await createClient()

  const categories = groupStaffByCategory(staffList)
  const staffCountByCategory = {
    Manager: categories.Manager.length,
    Senior: categories.Senior.length,
    Junior: categories.Junior.length,
  }

  try {
    const { data, error } = await supabase
      .from("leave_payment_memos")
      .insert({
        month,
        memo_content: memoText,
        staff_count_by_category: staffCountByCategory,
        staff_list_json: staffList,
        generated_by: (await supabase.auth.getUser()).data.user?.id,
        generated_at: new Date().toISOString(),
      })
      .select("id")
      .single()

    if (error) throw error
    return data.id
  } catch (err) {
    console.error("[v0] Error saving payment memo:", err)
    throw err
  }
}
