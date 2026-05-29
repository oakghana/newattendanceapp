import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { del } from "@vercel/blob"

/**
 * DELETE: Clear user's saved signature from all storage systems
 * Removes from: Vercel Blob (cloud) and approval_signature_registry (database)
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

    // Fetch the signature to get the Blob URL
    const { data: signature } = await admin
      .from("approval_signature_registry")
      .select("signature_data_url")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single()

    // Delete from Vercel Blob if it's a blob URL (permanent cloud storage)
    if (signature?.signature_data_url?.startsWith("https://")) {
      try {
        console.log("[v0] Deleting signature from Vercel Blob:", signature.signature_data_url)
        await del(signature.signature_data_url)
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        console.warn("[v0] Warning deleting from Blob:", errorMsg)
        // Don't fail if blob deletion fails - continue with database cleanup
      }
    }

    // Delete from approval_signature_registry (database storage)
    const { error: deleteError } = await admin
      .from("approval_signature_registry")
      .delete()
      .eq("user_id", user.id)

    if (deleteError && deleteError.code !== "PGRST116") {
      console.error("[v0] Error deleting signature from database:", deleteError)
      throw new Error(`Failed to delete signature: ${deleteError.message}`)
    }

    console.log("[v0] Signature cleared successfully from all storage systems (Blob + Database)")

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
