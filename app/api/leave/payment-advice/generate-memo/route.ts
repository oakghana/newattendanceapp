import { type NextRequest, NextResponse } from "next/server"
import { generateProfessionalMemos, groupStaffByCategory } from "@/lib/payment-advice-service"
import { createAdminClient } from "@/lib/supabase/server"

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

    // Fetch the selected signer's profile to get their signature
    let signerData = selectedSigner
    if (selectedSigner?.id) {
      const admin = await createAdminClient()
      const { data: signerProfile } = await admin
        .from("user_profiles")
        .select("id, full_name, position, signature_data_url")
        .eq("id", selectedSigner.id)
        .single()

      if (signerProfile) {
        signerData = {
          id: signerProfile.id,
          name: signerProfile.full_name,
          position: signerProfile.position,
          signature_image_url: signerProfile.signature_data_url, // Include signature from profile
        }
      }
    }

    // Generate professional memos per category using the selected HR Executive signer
    // If no signer provided, falls back to "HUMAN RESOURCE MANAGER"
    const memos = generateProfessionalMemos(staffList, month, signerData)

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

    console.log("[v0] Generated professional memos with signature:", { 
      month, 
      summary,
      signerName: signerData?.name || "Not provided",
      hasSignature: !!signerData?.signature_image_url,
    })

    return NextResponse.json({
      success: true,
      memos,
      summary,
      signerData, // Include signer data with signature for storage in memo_body
    })
  } catch (err) {
    console.error("[v0] Error generating memo:", err)
    return NextResponse.json(
      { error: "Failed to generate memo", details: String(err) },
      { status: 500 }
    )
  }
}
