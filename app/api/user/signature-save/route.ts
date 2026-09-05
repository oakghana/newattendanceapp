import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { put, del } from "@vercel/blob"

/**
 * POST: Save user signature to approval_signature_registry
 * PUT: Update existing signature
 * GET: Fetch user's saved signature
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { signature_data_url, signature_text } = body

    if (!signature_data_url && !signature_text) {
      return NextResponse.json(
        { error: "Signature data or text is required" },
        { status: 400 }
      )
    }

    // Upload signature image to Vercel Blob when configured. Local/self-hosted
    // environments can safely keep the data URL in the existing profile field.
    let signatureUrl: string | null = null
    if (signature_data_url) {
      try {
        // Handle both "data:image/png;base64,..." and raw base64 strings
        let base64Data: string
        if (signature_data_url.includes(",")) {
          base64Data = signature_data_url.split(",")[1]
        } else {
          base64Data = signature_data_url
        }

        if (!base64Data) {
          throw new Error("Could not extract base64 data from signature_data_url")
        }

        const binaryData = Buffer.from(base64Data, "base64")
        
        if (!process.env.BLOB_READ_WRITE_TOKEN) {
          signatureUrl = String(signature_data_url)
        } else {
        // Delete old signature if exists
        const { data: existingSignature } = await admin
          .from("approval_signature_registry")
          .select("signature_data_url")
          .eq("user_id", user.id)
          .single()

        if (existingSignature?.signature_data_url) {
          try {
            // Only delete if it's a blob URL (not a data URL)
            if (existingSignature.signature_data_url?.startsWith("https://")) {
              await del(existingSignature.signature_data_url)
              console.log("[v0] Old signature deleted from blob")
            }
          } catch (err) {
            console.warn("[v0] Could not delete old signature:", err)
          }
        }

        // Upload new signature to Vercel Blob
        const timestamp = Date.now()
        const fileName = `signatures/${user.id}/${timestamp}.png`
        
        const blob = await put(fileName, binaryData, {
          contentType: "image/png",
          access: "public",
        })

        signatureUrl = blob.url
        console.log("[v0] Signature uploaded to Blob successfully:", signatureUrl)
        }
      } catch (err) {
        // Blob outages must not prevent a user from saving a valid signature.
        console.warn("[v0] Blob upload unavailable; storing signature data URL in profile", err)
        signatureUrl = String(signature_data_url)
      }
    }

    // Save signature to BOTH user_profiles AND approval_signature_registry
    // user_profiles is the primary permanent storage, approval_signature_registry is for workflow approvals
    console.log("[v0] Saving signature for user:", user.id, "Blob URL:", signatureUrl)
    
    try {
      // FIRST: Update user_profiles with the signature (PRIMARY persistent storage)
      console.log("[v0] Updating user_profiles with signature for user:", user.id)
      const { error: profileUpdateError } = await admin
        .from("user_profiles")
        .update({
          signature_data_url: signatureUrl,
          signature_updated_at: new Date().toISOString(),
          signature_mode: "draw",
        })
        .eq("id", user.id)

      if (profileUpdateError) {
        console.error("[v0] Error updating user_profiles:", profileUpdateError)
        throw new Error(`Failed to save to profile: ${profileUpdateError.message}`)
      }

      console.log("[v0] Signature saved to user_profiles successfully")

      // SECOND: Also save to approval_signature_registry for workflow approvals
      // Delete existing signature for this user to avoid duplicates
      const { error: deleteError } = await admin
        .from("approval_signature_registry")
        .delete()
        .eq("user_id", user.id)
        .eq("workflow_domain", "loan")
        .eq("approval_stage", "director_hr")

      if (deleteError && deleteError.code !== "PGRST116") {
        console.warn("[v0] Warning deleting old signature from registry:", deleteError)
      }

      // Insert new signature into approval_signature_registry
      const { data: result, error: insertError } = await admin
        .from("approval_signature_registry")
        .insert({
          user_id: user.id,
          signature_data_url: signatureUrl,
          is_active: true,
          workflow_domain: "loan",
          approval_stage: "director_hr",
          signature_mode: "draw",
        })
        .select()
        .single()

      if (insertError) {
        console.error("[v0] Database error inserting to approval_signature_registry:", {
          code: insertError.code,
          message: insertError.message,
          details: insertError.details,
        })
        throw new Error(`Database error: ${insertError.message || insertError.code}`)
      }

      console.log("[v0] Signature saved successfully to both tables")

      return NextResponse.json({
        success: true,
        message: "Signature saved successfully and backed up to cloud storage",
        signature: result,
      })
    } catch (err) {
      throw err
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error("[v0] Error saving signature:", error)
    return NextResponse.json({ error: `Failed to save signature: ${error}` }, { status: 500 })
  }
}

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

    console.log("[v0] Fetching signature for user:", user.id)

    // PRIORITY 1: Fetch from user_profiles first (PRIMARY permanent storage)
    const { data: profile, error: profileError } = await admin
      .from("user_profiles")
      .select("signature_data_url, signature_updated_at, signature_mode")
      .eq("id", user.id)
      .single()

    if (profile && profile.signature_data_url) {
      console.log("[v0] Signature found in user_profiles, returning persistent signature")
      return NextResponse.json({
        success: true,
        signature: {
          id: user.id,
          user_id: user.id,
          signature_data_url: profile.signature_data_url,
          signature_image_url: profile.signature_data_url,
          signature_mode: profile.signature_mode || "draw",
          updated_at: profile.signature_updated_at,
          is_active: true,
          source: "user_profiles",
        },
      })
    }

    // PRIORITY 2: Fallback to approval_signature_registry if not in user_profiles
    const { data: signature, error } = await admin
      .from("approval_signature_registry")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single()

    if (error) {
      // No signature found is not an error
      if (error.code === "PGRST116") {
        console.log("[v0] No signature found for user:", user.id)
        return NextResponse.json({
          success: true,
          signature: null,
          message: "No signature saved yet",
        })
      }
      throw error
    }

    console.log("[v0] Signature found in approval_signature_registry (fallback)")
    return NextResponse.json({
      success: true,
      signature: {
        ...signature,
        signature_image_url: signature.signature_data_url,
        source: "approval_signature_registry",
      },
    })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error("[v0] Error fetching signature:", error)
    return NextResponse.json({ error: `Failed to fetch signature: ${error}` }, { status: 500 })
  }
}
