import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { groupStaffByCategory } from "@/lib/payment-advice-service"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { month, memoText, staffList } = await request.json()

    if (!month || !memoText || !staffList) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    // Group and count staff
    const categories = groupStaffByCategory(staffList)
    const staffCountByCategory = {
      Manager: categories.Manager.length,
      Senior: categories.Senior.length,
      Junior: categories.Junior.length,
    }

    // Save memo to database
    const { data, error } = await supabase
      .from("leave_payment_memos")
      .insert({
        month,
        memo_content: memoText,
        staff_count_by_category: staffCountByCategory,
        staff_list_json: staffList,
        generated_by: user.id,
        generated_at: new Date().toISOString(),
      })
      .select("id")
      .single()

    if (error) {
      console.error("[v0] Error saving memo:", error)
      return NextResponse.json(
        { error: "Failed to save memo" },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, memoId: data.id })
  } catch (err) {
    console.error("[v0] Error submitting memo:", err)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
