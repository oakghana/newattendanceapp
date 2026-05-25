import { type NextRequest, NextResponse } from "next/server"
import { generateProfessionalMemos, groupStaffByCategory } from "@/lib/payment-advice-service"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const { month, staffList, selectedSigner } = await request.json()

    if (!month || !staffList || staffList.length === 0) {
      return NextResponse.json(
        { error: "Invalid request. Month and staff list required." },
        { status: 400 }
      )
    }

    // Generate professional memos per category using the selected HR Executive signer
    // If no signer provided, falls back to "HUMAN RESOURCE MANAGER"
    const memos = generateProfessionalMemos(staffList, month, selectedSigner)

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

    console.log("[v0] Generated professional memos:", { 
      month, 
      summary,
      signerName: selectedSigner?.name || "Not provided",
    })

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
