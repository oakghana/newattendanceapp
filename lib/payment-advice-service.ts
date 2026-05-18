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
 * Generate payment advice memo template
 */
export function generateMemoTemplate(
  staffList: StaffOnLeave[],
  month: string
): string {
  const monthDate = new Date(`${month}-01`)
  const monthName = monthDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  })

  const categories = groupStaffByCategory(staffList)

  let memoText = `PAYMENT ADVICE MEMO\n\n`
  memoText += `TO: Deputy Director, Finance\n`
  memoText += `FROM: Human Resources Department\n`
  memoText += `DATE: ${new Date().toLocaleDateString("en-US")}\n`
  memoText += `RE: Annual Leave Payment Advice for ${monthName}\n\n`

  memoText += `Dear Sir/Madam,\n\n`

  memoText += `Please be informed that the following staff members are scheduled to be on approved annual leave during the month of ${monthName}.\n\n`

  memoText += `STAFF SUMMARY BY CATEGORY:\n`
  memoText += `================================\n`
  memoText += `Managers: ${categories.Manager.length}\n`
  memoText += `Senior Staff: ${categories.Senior.length}\n`
  memoText += `Junior Staff: ${categories.Junior.length}\n`
  memoText += `Total: ${staffList.length}\n\n`

  memoText += `DETAILED STAFF LIST:\n`
  memoText += `================================\n\n`

  for (const [category, staff] of Object.entries(categories)) {
    if ((staff as StaffOnLeave[]).length > 0) {
      memoText += `${category} Staff (${(staff as StaffOnLeave[]).length}):\n`
      memoText += `---\n`
      ;(staff as StaffOnLeave[]).forEach((s, idx) => {
        memoText += `${idx + 1}. ${s.full_name} (${s.employee_id}) - ${s.department_name}\n`
        memoText += `   Position: ${s.position}\n`
        memoText += `   Leave Period: ${s.start_date} to ${s.end_date}\n\n`
      })
    }
  }

  memoText += `Please process the leave allowances accordingly.\n\n`
  memoText += `Yours faithfully,\n`
  memoText += `Human Resources Department\n`

  return memoText
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
