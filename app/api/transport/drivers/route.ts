import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { canManageTransport, isRegionalHrRole } from "@/lib/role-capabilities"

async function actor() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, profile: null }
  const { data: profile } = await supabase.from("user_profiles").select("role, is_active").eq("id", user.id).single()
  return { supabase, user, profile }
}

export async function GET() {
  const { supabase, user, profile } = await actor()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!profile?.is_active || !canManageTransport(profile.role)) return NextResponse.json({ error: "Transport access denied." }, { status: 403 })
  const { data, error } = await supabase.from("transport_drivers").select("*").order("expiry_date")
  if (error) return NextResponse.json({ error: "Unable to load driver licenses." }, { status: 500 })
  return NextResponse.json({ drivers: data ?? [], canVerify: isRegionalHrRole(profile.role) })
}

export async function PATCH(request: Request) {
  const { supabase, user, profile } = await actor()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!profile?.is_active || !isRegionalHrRole(profile.role)) return NextResponse.json({ error: "Only Regional HR Office users can verify or edit licenses." }, { status: 403 })
  const body = await request.json()
  const id = String(body.id ?? "")
  const verificationStatus = String(body.verification_status ?? "")
  if (!id || !["pending", "verified", "needs_correction"].includes(verificationStatus)) return NextResponse.json({ error: "Invalid verification request." }, { status: 400 })
  const updates = { full_name: String(body.full_name ?? "").trim(), license_number: String(body.license_number ?? "").trim(), license_type: String(body.license_type ?? "").trim() || null, expiry_date: String(body.expiry_date ?? ""), notes: String(body.notes ?? "").trim() || null, verification_status: verificationStatus, verified_by: verificationStatus === "verified" ? user.id : null, verified_at: verificationStatus === "verified" ? new Date().toISOString() : null, correction_note: String(body.correction_note ?? "").trim() || null, updated_at: new Date().toISOString() }
  if (!updates.full_name || !updates.license_number || !updates.expiry_date) return NextResponse.json({ error: "Name, license number, and expiry date are required." }, { status: 400 })
  const { error } = await supabase.from("transport_drivers").update(updates).eq("id", id)
  if (error) return NextResponse.json({ error: "Unable to update license details." }, { status: 500 })
  return NextResponse.json({ ok: true })
}
