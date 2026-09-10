import { NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { canEditDriverLicenses } from "@/lib/role-capabilities"

/** Transport Manager / Chief Driver / admin prompt drivers in their scope who have not uploaded a license yet. */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: profile } = await supabase.from("user_profiles").select("role, is_active").eq("id", user.id).maybeSingle()
  if (!profile?.is_active || !canEditDriverLicenses(profile.role)) return NextResponse.json({ error: "Access denied." }, { status: 403 })

  const body = await request.json().catch(() => null)
  const profileIds = Array.isArray(body?.profile_ids) ? body.profile_ids.filter((id: unknown) => typeof id === "string" && id) : []
  if (!profileIds.length) return NextResponse.json({ error: "No drivers selected." }, { status: 400 })

  const admin = await createAdminClient()
  const payload = profileIds.map((profileId: string) => ({
    user_id: profileId,
    message: "Please upload your driver's license details and document in the app to remain compliant.",
    type: "driver_license_reminder",
    reference_id: "driver-license-upload",
    is_read: false,
    created_at: new Date().toISOString(),
  }))
  const { error } = await admin.from("staff_notifications").insert(payload)
  if (error) return NextResponse.json({ error: "Unable to send reminder." }, { status: 500 })
  return NextResponse.json({ ok: true, profile_ids: profileIds })
}
