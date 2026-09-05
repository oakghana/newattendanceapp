import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"

/**
 * GET: Auto-populate signature for memo approval
 * Fetches the user's saved signature from user_profiles.signature_data_url
 * This endpoint is called when a signer needs to approve any memo (payment advice, loan, leave, etc.)
 */
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

    const scope = request.nextUrl.searchParams.get("scope") || "auto"
    // scope=self → always the signed-in user (non-regional staff must NOT inherit HOD signature)
    // scope=auto → legacy memo behaviour may use linked HOD when requester is not department_head
    console.log("[v0] Auto-populating signature. User:", user.id, "scope:", scope)

    // Fetch signature from user_profiles (primary source)
    const { data: profile, error: profileError } = await admin
      .from("user_profiles")
      .select("role, signature_data_url, signature_mode, first_name, last_name, position, assigned_location_id, departments(name), geofence_locations!user_profiles_assigned_location_id_fkey(name)")
      .eq("id", user.id)
      .single()

    if (profileError) {
      console.error("[v0] Error fetching user_profiles:", profileError)
      throw new Error(`Failed to fetch profile: ${profileError.message}`)
    }

    const normalizedRole = String(profile?.role ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_")
    const isDepartmentHead =
      normalizedRole === "department_head" || normalizedRole === "head_of_department"
    const canSelfAuthorize =
      isDepartmentHead ||
      ["admin", "administrator", "hr_executive", "hr_executive_officer", "manager_hr", "director_hr", "it_admin", "it-admin"].includes(
        normalizedRole,
      )

    let hodId: string | null = null
    {
      const { data: linkage, error: linkageError } = await admin
        .from("user_profiles")
        .select("hod_id")
        .eq("id", user.id)
        .maybeSingle()
      hodId = linkageError?.code === "42703" ? null : linkage?.hod_id ?? null
      if (linkageError && linkageError.code !== "42703") {
        throw new Error(`Failed to load Head of Department linkage: ${linkageError.message}`)
      }
    }

    // scope=self never inherits the HOD signature (non-regional staff leave authorization blank).
    const shouldUseLinkedHod = scope !== "self" && Boolean(hodId && !isDepartmentHead)
    const { data: signerProfile, error: signerError } = shouldUseLinkedHod
      ? await admin
          .from("user_profiles")
          .select("signature_data_url, signature_mode, first_name, last_name, position, departments(name)")
          .eq("id", hodId)
          .maybeSingle()
      : { data: profile, error: null }

    if (signerError) {
      throw new Error(`Failed to load the linked Head of Department: ${signerError.message}`)
    }

    const signer = signerProfile ?? profile
    const signerName = `${signer?.first_name ?? ""} ${signer?.last_name ?? ""}`.trim()
    const signerDepartment = (signer?.departments as { name?: string | null } | null)?.name ?? null
    const requesterName = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim()
    const requesterDepartment = (profile?.departments as { name?: string | null } | null)?.name ?? null
    const assignedLocation = (profile?.geofence_locations as { name?: string | null } | null)?.name ?? null

    let signatureDataUrl = String(signer?.signature_data_url || "").trim() || null
    let signatureMode = String(signer?.signature_mode || "").trim() || "draw"
    if (!signatureDataUrl) {
      const { data: registeredSignature, error: registryError } = await admin
        .from("approval_signature_registry")
        .select("signature_data_url, signature_mode")
        .eq("user_id", shouldUseLinkedHod ? hodId : user.id)
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (registryError && registryError.code !== "PGRST116") {
        throw new Error(`Failed to load saved signature: ${registryError.message}`)
      }
      signatureDataUrl = String(registeredSignature?.signature_data_url || "").trim() || null
      signatureMode = String(registeredSignature?.signature_mode || signatureMode).trim() || "draw"
    }

    if (!signatureDataUrl) {
      console.log("[v0] No authorization signature found for user:", shouldUseLinkedHod ? hodId : user.id)
      return NextResponse.json({
        success: true,
        hasSignature: false,
        role: normalizedRole,
        isDepartmentHead,
        canSelfAuthorize,
        hodId,
        assignedLocation,
        signature: {
          signer_name: scope === "self" ? requesterName : signerName,
          signer_position: (scope === "self" ? profile?.position : signer?.position) ?? null,
          signer_department: scope === "self" ? requesterDepartment : signerDepartment,
        },
        message:
          scope === "self"
            ? "No saved signature found on your profile."
            : shouldUseLinkedHod
              ? "Your linked Head of Department has not saved a signature."
              : "No saved signature found.",
      })
    }

    console.log("[v0] Signature found, auto-populating for memo approval")

    return NextResponse.json({
      success: true,
      hasSignature: true,
      role: normalizedRole,
      isDepartmentHead,
      canSelfAuthorize,
      hodId,
      assignedLocation,
      signature: {
        signature_data_url: signatureDataUrl,
        signature_mode: signatureMode,
        signer_name: scope === "self" ? requesterName : signerName,
        signer_position: (scope === "self" ? profile?.position : signer?.position) ?? null,
        signer_department: scope === "self" ? requesterDepartment : signerDepartment,
      },
      message:
        scope === "self"
          ? "Signature auto-populated from your profile"
          : shouldUseLinkedHod
            ? "Authorization auto-populated from the linked Head of Department profile"
            : "Signature auto-populated from profile",
    })
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error("[v0] Error auto-populating signature:", error)
    return NextResponse.json({ error: `Failed to auto-populate signature: ${error}` }, { status: 500 })
  }
}
