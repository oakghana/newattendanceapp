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

    const { month, memos, staffList, selectedSigner, referenceNumber } = await request.json()

    if (!month || !memos || !staffList || !selectedSigner || !referenceNumber) {
      console.error("[v0] Missing fields:", { month: !!month, memos: !!memos, staffList: !!staffList, selectedSigner: !!selectedSigner, referenceNumber: !!referenceNumber })
      return NextResponse.json(
        { error: "Missing required fields", details: "month, memos, staffList, selectedSigner, and referenceNumber are all required" },
        { status: 400 }
      )
    }

    // Group and count staff
    const categories = groupStaffByCategory(staffList)
    
    // Store memo content with signer information and reference number
    const memoContentWithSigner = {
      memos,
      month,
      referenceNumber,
      staffList,
      staffCountByCategory: {
        Manager: categories.Manager.length,
        Senior: categories.Senior.length,
        Junior: categories.Junior.length,
      },
      selectedSigner: {
        id: selectedSigner.id,
        name: selectedSigner.name,
        position: selectedSigner.position,
      },
    }

    // Save memo to database using only existing columns
    const { data, error } = await supabase
      .from("leave_payment_memos")
      .insert({
        memo_body: JSON.stringify(memoContentWithSigner), // Store all data as JSON
        hr_leave_office_id: user.id,
        status: "generated",
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

    console.log("[v0] Memo saved successfully:", data.id)
    return NextResponse.json({ success: true, memoId: data.id })
  } catch (err: any) {
    console.error("[v0] Error submitting memo:", err)
    return NextResponse.json(
      { error: "Internal server error", details: err.message },
      { status: 500 }
    )
  }
}
