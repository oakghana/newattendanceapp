import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { del } from "@vercel/blob"

/**
 * DELETE: Remove user's saved signature
 * Handles cleanup from both user_profiles and approval_signature_registry
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get the signature URLs before deleting
    const { data: profile } = await admin
      .from("user_profiles")
      .select("signature_data_url")
      .eq("id", user.id)
      .single()

    // Delete from Vercel Blob if it's a blob URL
    if (profile?.signature_data_url && profile.signature_data_url.startsWith("https://")) {
      try {
        await del(profile.signature_data_url)
        console.log("[v0] Old signature deleted from Blob storage")
      } catch (err) {
        console.warn("[v0] Could not delete signature from Blob:", err)
      }
    }

    // Clear from user_profiles
    const { error: profileError } = await admin
      .from("user_profiles")
      .update({
        signature_data_url: null,
        signature_mode: null,
        signature_updated_at: new Date().toISOString(),
      })
      .eq("id", user.id)

    if (profileError) {
      console.error("[v0] Error clearing signature from user_profiles:", profileError)
      throw new Error(`Failed to clear signature: ${profileError.message}`)
    }

    // Also clear from approval_signature_registry
    await admin
      .from("approval_signature_registry")
      .delete()
      .eq("user_id", user.id)

    console.log("[v0] Signature cleared from both tables")

    return NextResponse.json({
      success: true,
      message: "Signature cleared successfully",
    })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error("[v0] Error clearing signature:", error)
    return NextResponse.json({ error: `Failed to clear signature: ${error}` }, { status: 500 })
  }
}
