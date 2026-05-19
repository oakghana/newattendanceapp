import { type NextRequest, NextResponse } from "next/server"
import { generateProfessionalMemos, groupStaffByCategory } from "@/lib/payment-advice-service"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const { month, staffList } = await request.json()

    if (!month || !staffList || staffList.length === 0) {
      return NextResponse.json(
        { error: "Invalid request. Month and staff list required." },
        { status: 400 }
      )
    }

    // Generate professional memos per category
    const memos = generateProfessionalMemos(staffList, month)

    if (Object.keys(memos).length === 0) {
      return NextResponse.json(
        { error: "No staff found for memo generation" },
        { status: 400 }
      )
    }

    // Get category summary
    const categories = groupStaffByCategory(staffList)
    const summary = {
      total: staffList.length,
      manager: categories.Manager.length,
      senior: categories.Senior.length,
      junior: categories.Junior.length,
    }

    console.log("[v0] Generated professional memos:", { month, summary })

    return NextResponse.json({
      success: true,
      memos,
      summary,
    })
  } catch (err) {
    console.error("[v0] Error generating memo:", err)
    return NextResponse.json(
      { error: "Failed to generate memo", details: String(err) },
      { status: 500 }
    )
  }
}
