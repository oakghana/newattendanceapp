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
          .select("signature_image_url")
          .eq("user_id", user.id)
          .single()

        if (existingSignature?.signature_image_url) {
          try {
            await del(existingSignature.signature_image_url)
            console.log("[v0] Old signature deleted from blob")
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
      // Update existing signature
      result = await admin
        .from("approval_signature_registry")
        .update({
          signature_image_url: signatureUrl,
          signature_text: signature_text || null,
          status: "approved",
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id)
        .select()
        .single()
    } else {
      // Create new signature record
      result = await admin
        .from("approval_signature_registry")
        .insert({
          user_id: user.id,
          signature_image_url: signatureUrl,
          signature_text: signature_text || null,
          status: "approved",
        })
        .select()
        .single()
    }

    if (result.error) {
      throw result.error
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
      signature: signature,
    })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error("[v0] Error fetching signature:", error)
    return NextResponse.json({ error: `Failed to fetch signature: ${error}` }, { status: 500 })
  }
}
