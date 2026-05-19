import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { groupStaffByCategory } from "@/lib/payment-advice-service"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    let requestBody: any
    try {
      requestBody = await request.json()
    } catch (parseErr: any) {
      console.error("[v0] JSON parse error:", parseErr.message)
      return NextResponse.json(
        { error: "Invalid JSON in request body", details: parseErr.message },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { month, memos, staffList, selectedSigner, referenceNumbers } = requestBody

    if (!month || !memos || !staffList || !selectedSigner || !referenceNumbers) {
      console.error("[v0] Missing fields:", { month: !!month, memos: !!memos, staffList: !!staffList, selectedSigner: !!selectedSigner, referenceNumbers: !!referenceNumbers })
      return NextResponse.json(
        { error: "Missing required fields", details: "month, memos, staffList, selectedSigner, and referenceNumbers are all required" },
        { status: 400 }
      )
    }

    // Group and count staff
    const categories = groupStaffByCategory(staffList)
    
    // Store memo content with signer information and reference numbers
    // Only include serializable data
    const memoContentWithSigner = {
      memos: memos || {},
      month,
      referenceNumbers,
      staffList: Array.isArray(staffList) ? staffList : [],
      staffCountByCategory: {
        Manager: categories.Manager?.length || 0,
        Senior: categories.Senior?.length || 0,
        Junior: categories.Junior?.length || 0,
      },
      selectedSigner: {
        id: selectedSigner.id || "",
        name: selectedSigner.name || "",
        position: selectedSigner.position || "",
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
    console.error("[v0] Error submitting memo:", err.message || err)
    return NextResponse.json(
      { error: "Internal server error", details: err.message || "Unknown error" },
      { status: 500 }
    )
  }
}
