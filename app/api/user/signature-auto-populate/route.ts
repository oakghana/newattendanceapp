import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"

/**
 * GET: Auto-populate signature for memo approval
 * Fetches the user's saved signature from user_profiles.signature_data_url
 * This endpoint is called when a signer needs to approve any memo (payment advice, loan, leave, etc.)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("[v0] Auto-populating signature for memo approval. User:", user.id)

    // Fetch signature from user_profiles (primary source)
    const { data: profile, error: profileError } = await admin
      .from("user_profiles")
      .select("signature_data_url, signature_mode, first_name, last_name, position")
      .eq("id", user.id)
      .single()

    if (profileError) {
      console.error("[v0] Error fetching user_profiles:", profileError)
      throw new Error(`Failed to fetch profile: ${profileError.message}`)
    }

    if (!profile?.signature_data_url) {
      console.log("[v0] No signature found in user_profiles for user:", user.id)
      return NextResponse.json({
        success: true,
        hasSignature: false,
        message: "No saved signature found",
      })
    }

    console.log("[v0] Signature found, auto-populating for memo approval")

    return NextResponse.json({
      success: true,
      hasSignature: true,
      signature: {
        signature_data_url: profile.signature_data_url,
        signature_mode: profile.signature_mode || "draw",
        signer_name: `${profile.first_name} ${profile.last_name}`.trim(),
        signer_position: profile.position,
      },
      message: "Signature auto-populated from profile",
    })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error("[v0] Error auto-populating signature:", error)
    return NextResponse.json({ error: `Failed to auto-populate signature: ${error}` }, { status: 500 })
  }
}
