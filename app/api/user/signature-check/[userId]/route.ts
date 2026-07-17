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

    // PRIMARY: Check user_profiles first (this is where signature-save stores it)
    const { data: profile } = await admin
      .from("user_profiles")
      .select("signature_data_url")
      .eq("id", userId)
      .single()

    if (profile?.signature_data_url) {
      return NextResponse.json({ hasSignature: true, userId, source: "user_profiles" })
    }

    // FALLBACK: Check approval_signature_registry
    const { data: signature, error: sigErr } = await admin
      .from("approval_signature_registry")
      .select("id, signature_data_url")
      .eq("user_id", userId)
      .eq("is_active", true)
      .single()

    if (sigErr && sigErr.code !== "PGRST116") {
      return NextResponse.json({ error: "Failed to check signature" }, { status: 500 })
    }

    const hasSignature = !!signature?.signature_data_url

    return NextResponse.json({ hasSignature, userId, source: "approval_signature_registry" })
  } catch (error) {
    console.error("[v0] Error in GET signature-check:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
