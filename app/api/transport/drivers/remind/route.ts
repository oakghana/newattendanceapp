import { NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { canEditDriverLicenses, hasNationwideFleetScope, isChiefDriverRole, isRegionalHrRole, isRegionalManagerRole } from "@/lib/role-capabilities"
import { resolveOwnedLocationIdsForRegionalOffice } from "@/lib/regional-manager-scope"

/** Transport Manager / Chief Driver / admin prompt drivers in their scope who have not uploaded a license yet. */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: profile } = await supabase.from("user_profiles").select("role, is_active, region_id, assigned_location_id").eq("id", user.id).maybeSingle()
  if (!profile?.is_active || !canEditDriverLicenses(profile.role)) return NextResponse.json({ error: "Access denied." }, { status: 403 })

  const body = await request.json().catch(() => null)
  const profileIds = Array.isArray(body?.profile_ids) ? body.profile_ids.filter((id: unknown) => typeof id === "string" && id) : []
  if (!profileIds.length) return NextResponse.json({ error: "No drivers selected." }, { status: 400 })

  const admin = await createAdminClient()
  const hasNationwideScope = hasNationwideFleetScope(profile.role)
  const isRegionalScope = isChiefDriverRole(profile.role) || isRegionalHrRole(profile.role) || isRegionalManagerRole(profile.role)
  const ownedLocationIds = isRegionalScope ? await resolveOwnedLocationIdsForRegionalOffice(admin, profile.assigned_location_id, profile.region_id) : []
  const { data: recipients } = await admin.from("user_profiles").select("id, assigned_location_id").in("id", profileIds).eq("is_active", true)
  const allowedIds = (recipients ?? []).filter((recipient: any) => hasNationwideScope || (isRegionalScope && ownedLocationIds.includes(recipient.assigned_location_id))).map((recipient: any) => recipient.id)
  if (!allowedIds.length) return NextResponse.json({ error: "No eligible drivers were found in your assigned scope." }, { status: 400 })
  const now = new Date().toISOString()
  const payload = allowedIds.map((recipientId: string) => ({
    recipient_id: recipientId,
    sender_id: user.id,
    sender_role: String(profile.role),
    sender_label: "Transport Management",
    message: "Please upload your driver's license details and document in the app to remain compliant.",
    notification_type: "driver_license_reminder",
    is_read: false,
    created_at: now,
  }))
  const { error } = await admin.from("staff_notifications").insert(payload)
  if (error) return NextResponse.json({ error: "Unable to send reminder." }, { status: 500 })
  return NextResponse.json({ ok: true, profile_ids: allowedIds })
}
