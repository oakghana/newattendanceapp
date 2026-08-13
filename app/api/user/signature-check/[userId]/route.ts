import { createAdminClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

/**
 * GET: Check if an HR executive has a saved signature
 * Used to validate signatures before submitting payment advice memos
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const admin = await createAdminClient()
    const { userId } = await params

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      )
    }

    // PRIMARY: Check user_profiles first (this is where signature-save stores it)
    // Accept either a drawn/uploaded signature image or a saved typed signature.
    const { data: profile } = await admin
      .from("user_profiles")
      .select("signature_data_url, signature_text")
      .eq("id", userId)
      .maybeSingle()

    const profileHasSignature =
      Boolean(String(profile?.signature_data_url || "").trim()) ||
      Boolean(String(profile?.signature_text || "").trim())

    if (profileHasSignature) {
      return NextResponse.json({ hasSignature: true, userId, source: "user_profiles" })
    }

    // FALLBACK: Check approval_signature_registry for the most recently saved
    // active signature. Use maybeSingle + ordering so duplicate active rows
    // (from different workflow domains) never cause a false negative.
    const { data: signature, error: sigErr } = await admin
      .from("approval_signature_registry")
      .select("id, signature_data_url, signature_text")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (sigErr) {
      return NextResponse.json({ error: "Failed to check signature" }, { status: 500 })
    }

    const hasSignature =
      Boolean(String(signature?.signature_data_url || "").trim()) ||
      Boolean(String(signature?.signature_text || "").trim())

    return NextResponse.json({ hasSignature, userId, source: "approval_signature_registry" })
  } catch (error) {
    console.error("[v0] Error in GET signature-check:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
