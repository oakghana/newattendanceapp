import { createAdminClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// Helper: Pick best signature from registry (proven pattern also used by leave admin)
function pickBestSignature(rows: any[]): any | null {
  if (!Array.isArray(rows) || rows.length === 0) return null
  const active = rows.filter((row) => row?.is_active !== false)
  const pool = active.length > 0 ? active : rows

  const score = (row: any) => {
    const mode = String(row?.signature_mode || "").toLowerCase()
    const hasImage = (mode === "draw" || mode === "upload") && String(row?.signature_data_url || "").trim().length > 0
    const hasTyped = mode === "typed" && String(row?.signature_text || "").trim().length > 0
    return hasImage ? 100 : hasTyped ? 10 : 0
  }

  return [...pool].sort((a, b) => score(b) - score(a))[0] || null
}

/**
 * GET: Fetch a user's saved signature.
 * Resolution order (same principle used across leave admin): user_profiles.signature_data_url
 * first (set via Profile Settings > Signature), then approval_signature_registry as a fallback.
 * Used when rendering approved memos (payment advice, transport, etc.) to include the signer's signature.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      )
    }

    const admin = await createAdminClient()

    // Priority 1: user_profiles.signature_data_url
    const { data: profile } = await admin
      .from("user_profiles")
      .select("signature_data_url, updated_at")
      .eq("id", userId)
      .maybeSingle()

    let signatureImageUrl = String(profile?.signature_data_url || "").trim() || null
    let resolvedCreatedAt: string | null = profile?.updated_at ?? null

    // Priority 2: approval_signature_registry fallback (no domain/stage filter, ranked by pickBestSignature)
    if (!signatureImageUrl) {
      const { data: registryRows } = await admin
        .from("approval_signature_registry")
        .select("id, signature_mode, signature_text, signature_data_url, is_active, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })

      const bestSig = pickBestSignature(registryRows || [])
      signatureImageUrl = String(bestSig?.signature_data_url || "").trim() || null
      resolvedCreatedAt = bestSig?.created_at ?? null
    }

    if (!signatureImageUrl) {
      console.log("[v0] No stored signature found for user:", userId)
      return NextResponse.json(
        {
          success: false,
          message: "No stored signature found for this user",
          signature_image_url: null,
        },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      signature_image_url: signatureImageUrl,
      userId,
      createdAt: resolvedCreatedAt,
    })
  } catch (err: any) {
    console.error("[v0] Error fetching user signature:", err.message || err)
    return NextResponse.json(
      { error: "Internal server error", details: err.message || "Unknown error" },
      { status: 500 }
    )
  }
}
