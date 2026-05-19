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

    const { month, memos, staffList, selectedSigner } = await request.json()

    if (!month || !memos || !staffList || !selectedSigner) {
      console.error("[v0] Missing fields:", { month: !!month, memos: !!memos, staffList: !!staffList, selectedSigner: !!selectedSigner })
      return NextResponse.json(
        { error: "Missing required fields", details: "month, memos, staffList, and selectedSigner are all required" },
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

    // Save memo to database with signer information
    const { data, error } = await supabase
      .from("leave_payment_memos")
      .insert({
        month,
        memo_content: JSON.stringify(memos), // Store all memos as JSON
        staff_count_by_category: staffCountByCategory,
        staff_list_json: staffList,
        generated_by: user.id,
        signer_id: selectedSigner.id,
        signer_name: selectedSigner.name,
        signer_position: selectedSigner.position,
        generated_at: new Date().toISOString(),
      })
      .select("id")
      .single()

    if (error) {
      console.error("[v0] Error saving memo:", error)
      return NextResponse.json(
        { error: "Failed to save memo", details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, memoId: data.id })
  } catch (err: any) {
    console.error("[v0] Error submitting memo:", err)
    return NextResponse.json(
      { error: "Internal server error", details: err.message },
      { status: 500 }
    )
  }
}
