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
    // Support both payload shapes from different callers
    const signatureDataUrl = body.signatureDataUrl || body.signature_data

    if (!signatureDataUrl) {
      return NextResponse.json({ error: "No signature provided" }, { status: 400 })
    }

    const admin = await createAdminClient()

    // Resolve userId - prefer explicit, fall back to session user
    let userId = body.userId
    if (!userId) {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        return NextResponse.json({ error: "Unauthorized - no user session" }, { status: 401 })
      }
      userId = user.id
    }

    // Check if signature already exists for this user
    const { data: existingSignature } = await admin
      .from("approval_signature_registry")
      .select("id")
      .eq("user_id", userId)
      .single()

    let result

    if (existingSignature) {
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
        .eq("user_id", userId)
        .select()
        .single()

      if (error) throw error
      result = data
    } else {
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

      if (error) throw error
      result = data
    }

    console.log("[v0] HR signature saved successfully:", userId)

    return NextResponse.json({
      success: true,
      message: "Signature saved successfully",
      data: result
    })
  } catch (error) {
    console.error("[v0] Error saving HR signature:", error)
    return NextResponse.json(
      { error: `Failed to save signature: ${error instanceof Error ? error.message : "Unknown error"}` },
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
      .eq("is_active", true)
      .single()

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
