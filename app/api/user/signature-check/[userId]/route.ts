import { createAdminClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

/**
 * GET: Check if an HR executive has a saved signature
 * Used to validate signatures before submitting payment advice memos
 */
export async function GET(
  request: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const admin = await createAdminClient()
    const userId = params.userId

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      )
    }

    // Check if user has an active signature in approval_signature_registry
    const { data: signature, error: sigErr } = await admin
      .from("approval_signature_registry")
      .select("id, signature_data_url")
      .eq("user_id", userId)
      .eq("is_active", true)
      .single()

    if (sigErr && sigErr.code !== "PGRST116") {
      // PGRST116 = no rows found
      console.error("[v0] Error checking signature:", sigErr)
      return NextResponse.json(
        { error: "Failed to check signature" },
        { status: 500 }
      )
    }

    // Return whether signature exists and has data
    const hasSignature = !!signature?.signature_data_url

    return NextResponse.json({
      hasSignature,
      userId,
    })
  } catch (error) {
    console.error("[v0] Error in GET signature-check:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
