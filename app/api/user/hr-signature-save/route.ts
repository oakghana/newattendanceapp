import { createClient, createAdminClient } from "@/lib/supabase/server"
import { NextResponse, NextRequest } from "next/server"

/**
 * Quick signature save endpoint for HR executives
 * Allows HR to save/update their signature permanently for use in all payment advice memos
 * Accepts either { signatureDataUrl, userId } or { signature_data } (uses session user)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    console.log("[v0] Signature save request received:", { hasSignatureData: !!body.signature_data, hasUserId: !!body.userId })
    
    // Support both payload shapes from different callers
    const signatureDataUrl = body.signatureDataUrl || body.signature_data

    if (!signatureDataUrl) {
      console.error("[v0] No signature data provided in request")
      return NextResponse.json({ error: "No signature provided" }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      console.error("[v0] No authenticated user found")
      return NextResponse.json({ error: "Unauthorized - no user session" }, { status: 401 })
    }

    if (body.userId && body.userId !== user.id) {
      return NextResponse.json({ error: "You can only save your own signature" }, { status: 403 })
    }

    const admin = await createAdminClient()
    const userId = user.id

    console.log("[v0] Attempting to save signature for user:", userId)

    // Check if signature already exists for this user
    const { data: existingSignature, error: checkError } = await admin
      .from("approval_signature_registry")
      .select("id")
      .eq("user_id", userId)
      .eq("workflow_domain", "leave")
      .maybeSingle()

    if (checkError && checkError.code !== "PGRST116") {
      // PGRST116 = no rows returned, which is expected for new users
      console.error("[v0] Error checking for existing signature:", checkError)
      throw checkError
    }

    let result

    if (existingSignature) {
      console.log("[v0] Updating existing signature for user:", userId)
      // Update existing signature
      const { data, error } = await admin
        .from("approval_signature_registry")
        .update({
          signature_data_url: signatureDataUrl,
          is_active: true,
          updated_at: new Date().toISOString(),
          workflow_domain: "leave",
          approval_stage: "hr_approval"
        })
        .eq("id", existingSignature.id)
        .select()
        .single()

      if (error) {
        console.error("[v0] Error updating signature:", error)
        throw error
      }
      result = data
    } else {
      console.log("[v0] Inserting new signature for user:", userId)
      // Insert new signature
      const { data, error } = await admin
        .from("approval_signature_registry")
        .insert({
          user_id: userId,
          signature_data_url: signatureDataUrl,
          signature_mode: "uploaded",
          is_active: true,
          workflow_domain: "leave",
          approval_stage: "hr_approval"
        })
        .select()
        .single()

      if (error) {
        console.error("[v0] Error inserting signature:", error)
        throw error
      }
      result = data
    }

    console.log("[v0] HR signature saved successfully for user:", userId)

    return NextResponse.json({
      success: true,
      message: "Signature saved successfully",
      data: result
    })
  } catch (error) {
    console.error("[v0] Error in hr-signature-save endpoint:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { error: `Failed to save signature: ${errorMessage}` },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("userId")

    if (!userId) {
      return NextResponse.json({ error: "userId parameter required" }, { status: 400 })
    }

    const admin = await createAdminClient()

    const { data: signature, error } = await admin
      .from("approval_signature_registry")
      .select("*")
      .eq("user_id", userId)
      .eq("workflow_domain", "leave")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows returned
      throw error
    }

    return NextResponse.json({
      success: true,
      signature: signature || null
    })
  } catch (error) {
    console.error("[v0] Error fetching signature:", error)
    return NextResponse.json(
      { error: `Failed to fetch signature: ${error instanceof Error ? error.message : "Unknown error"}` },
      { status: 500 }
    )
  }
}
