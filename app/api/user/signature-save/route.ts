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

    // Upload signature image to Vercel Blob if provided
    let signatureUrl: string | null = null
    if (signature_data_url) {
      try {
        const base64Data = signature_data_url.split(",")[1]
        const binaryData = Buffer.from(base64Data, "base64")
        
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
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        console.error("[v0] Error uploading signature to Blob:", errorMsg)
        throw new Error(`Failed to upload signature: ${errorMsg}`)
      }
    }

    // Save or update signature in approval_signature_registry
    const { data: existingSignature } = await admin
      .from("approval_signature_registry")
      .select("id")
      .eq("user_id", user.id)
      .single()

    let result
    if (existingSignature) {
      // Update existing signature - only update what matters
      result = await admin
        .from("approval_signature_registry")
        .update({
          signature_data_url: signatureUrl,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id)
        .select()
        .single()
    } else {
      // Create new signature record - only insert required fields
      result = await admin
        .from("approval_signature_registry")
        .insert({
          user_id: user.id,
          signature_data_url: signatureUrl,
          is_active: true,
        })
        .select()
        .single()
    }

    if (result.error) {
      console.error("[v0] Database error saving signature:", {
        code: result.error.code,
        message: result.error.message,
        details: result.error.details,
      })
      throw new Error(`Database error: ${result.error.message || result.error.code}`)
    }

    console.log("[v0] Signature saved successfully to database:", result.data)

    return NextResponse.json({
      success: true,
      message: "Signature saved successfully",
      signature: result.data,
    })
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

    // Fetch user's saved signature
    const { data: signature, error } = await admin
      .from("approval_signature_registry")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single()

    if (error) {
      // No signature found is not an error
      if (error.code === "PGRST116") {
        return NextResponse.json({
          success: true,
          signature: null,
          message: "No signature found",
        })
      }
      throw error
    }

    return NextResponse.json({
      success: true,
      signature: {
        ...signature,
        // Map signature_data_url to signature_image_url for frontend compatibility
        signature_image_url: signature.signature_data_url,
      },
    })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error("[v0] Error fetching signature:", error)
    return NextResponse.json({ error: `Failed to fetch signature: ${error}` }, { status: 500 })
  }
}
