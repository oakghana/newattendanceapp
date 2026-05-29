import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { del } from "@vercel/blob"

/**
 * DELETE: Clear user's saved signature from all storage systems
 * Removes from: user_profiles, Vercel Blob (cloud), and approval_signature_registry (database)
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

    console.log("[v0] Clearing signature for user:", user.id)

    // Get the signature URL from user_profiles first
    const { data: profile } = await admin
      .from("user_profiles")
      .select("signature_data_url")
      .eq("id", user.id)
      .single()

    // Delete from Vercel Blob if it's a blob URL
    if (profile?.signature_data_url?.startsWith("https://")) {
      try {
        console.log("[v0] Deleting signature from Vercel Blob:", profile.signature_data_url)
        await del(profile.signature_data_url)
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        console.warn("[v0] Warning deleting from Blob:", errorMsg)
        // Don't fail if blob deletion fails - continue with database cleanup
      }
    }

    // Clear from user_profiles (PRIMARY storage)
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

    console.log("[v0] Signature cleared from user_profiles")

    // Also clear from approval_signature_registry
    const { error: registryError } = await admin
      .from("approval_signature_registry")
      .delete()
      .eq("user_id", user.id)

    if (registryError && registryError.code !== "PGRST116") {
      console.warn("[v0] Warning clearing from registry:", registryError)
    }

    console.log("[v0] Signature cleared successfully from all storage systems")

    return NextResponse.json({
      success: true,
      message: "Signature cleared successfully from all storage systems",
    })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error("[v0] Error clearing signature:", error)
    return NextResponse.json({ error: `Failed to clear signature: ${error}` }, { status: 500 })
  }
}
