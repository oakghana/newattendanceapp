import { type NextRequest, NextResponse } from "next/server"
import { generateMemoTemplate, groupStaffByCategory } from "@/lib/payment-advice-service"

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

    // Generate memo template
    const memo = generateMemoTemplate(staffList, month)

    return NextResponse.json({ memo })
  } catch (err) {
    console.error("[v0] Error generating memo:", err)
    return NextResponse.json(
      { error: "Failed to generate memo" },
      { status: 500 }
    )
  }
}
