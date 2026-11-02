import { NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const admin = await createAdminClient()
  const { data: requester } = await admin.from("user_profiles").select("role").eq("id", user.id).maybeSingle()
  if (!requester || !["admin", "administrator"].includes(requester.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const userId = new URL(request.url).searchParams.get("userId")
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 })
  const { data: target } = await admin.from("user_profiles").select("assigned_location_id, region_id").eq("id", userId).maybeSingle()
  if (!target) return NextResponse.json({ error: "Staff profile not found" }, { status: 404 })

  const { data: profiles } = await admin.from("user_profiles").select("id, email, first_name, last_name, role, it_admin_scope, assigned_location_id, region_id, is_active").neq("id", userId)
  const normalize = (value: unknown) => String(value || "").toLowerCase().replace(/[ _-]/g, "")
  const isIt = (profile: any) => profile.is_active !== false && (normalize(profile.role).includes("itadmin") || ["regional_it_admin", "head_office_it_admin"].map(normalize).includes(normalize(profile.it_admin_scope)))
  const itProfiles = (profiles || []).filter(isIt)
  const regional = itProfiles.filter((profile: any) => profile.it_admin_scope === "head_office_it_admin" || profile.region_id === target.region_id || profile.assigned_location_id === target.assigned_location_id)
  const headOffice = itProfiles.filter((profile: any) => profile.it_admin_scope === "head_office_it_admin" || (!profile.region_id && !profile.assigned_location_id))
  const format = (profile: any, category: string) => ({ id: profile.id, email: profile.email, name: [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.email, category })
  return NextResponse.json({ success: true, regional: regional.filter((p: any) => p.email).map((p: any) => format(p, "Regional IT Admin")), headOffice: headOffice.filter((p: any) => p.email).map((p: any) => format(p, "Head Office IT Admin")) })
}
