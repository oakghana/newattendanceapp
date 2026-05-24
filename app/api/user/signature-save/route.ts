import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"

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

    // Upload signature image to blob storage if provided
    let signatureUrl: string | null = null
    if (signature_data_url) {
      // Convert data URL to blob and upload
      try {
        const base64Data = signature_data_url.split(",")[1]
        const binaryData = Buffer.from(base64Data, "base64")
        
        // Use blob storage for signature images
        const timestamp = Date.now()
        const fileName = `signatures/${user.id}/${timestamp}.png`
        
        const { data: uploadedFile, error: uploadError } = await admin
          .storage
          .from("signatures")
          .upload(fileName, binaryData, {
            contentType: "image/png",
            upsert: true,
          })

        if (uploadError) {
          console.warn("[v0] Signature upload warning:", uploadError)
        } else {
          const { data: publicUrl } = admin
            .storage
            .from("signatures")
            .getPublicUrl(fileName)
          signatureUrl = publicUrl.publicUrl
          console.log("[v0] Signature uploaded successfully:", signatureUrl)
        }
      } catch (err) {
        console.warn("[v0] Could not upload signature image, will store data URL instead:", err)
        signatureUrl = signature_data_url
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

    console.log("[v0] Signature saved successfully:", result.data)

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
