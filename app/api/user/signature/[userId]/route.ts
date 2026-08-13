import { createAdminClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * GET: Fetch a user's saved signature from approval_signature_registry
 * Used when rendering approved payment advice memos to include the signer's signature
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      )
    }

    const admin = await createAdminClient()

    // Fetch the user's active signature
    const { data: signature, error } = await admin
      .from("approval_signature_registry")
      .select("id, signature_data_url, user_id, is_active, created_at")
      .eq("user_id", userId)
      .eq("is_active", true)
      .single()

    if (error || !signature) {
      console.log("[v0] No active signature found for user:", userId)
      return NextResponse.json(
        {
          success: false,
          message: "No active signature found for this user",
          signature_image_url: null,
        },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      signature_image_url: signature.signature_data_url,
      userId: signature.user_id,
      createdAt: signature.created_at,
    })
  } catch (err: any) {
    console.error("[v0] Error fetching user signature:", err.message || err)
    return NextResponse.json(
      { error: "Internal server error", details: err.message || "Unknown error" },
      { status: 500 }
    )
  }
}
