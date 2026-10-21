import { NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { createAdminClient, createClient } from "@/lib/supabase/server"

const PUBLISHERS = new Set(["admin", "administrator", "hr_records", "hr_records_officer", "hr_records_manager"])
const ANALYSTS = new Set(["admin", "administrator", "hod", "department_head", "regional_manager", "regional_hr_office", "regional_hr_officer", "hr_records", "hr_records_officer", "hr_records_manager", "managing_director"])

async function actor() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = await createAdminClient()
  const { data: profile } = await admin.from("user_profiles").select("id, role, assigned_location_id").eq("id", user.id).maybeSingle()
  return profile ? { user, profile, admin } : null
}

export async function GET() {
  const current = await actor()
  if (!current) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  const { data, error } = await current.admin.from("e_circulars").select("id,title,commentary,file_url,file_name,mime_type,audience_roles,published_at,published_by").eq("is_published", true).order("published_at", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const role = String(current.profile.role)
  const visible = (data || []).filter((item: any) => !item.audience_roles?.length || item.audience_roles.includes(role))
  const { data: reads } = await current.admin.from("e_circular_reads").select("circular_id").eq("user_id", current.user.id).in("circular_id", visible.map((item: any) => item.id))
  return NextResponse.json({ circulars: visible, readCircularIds: (reads || []).map((read: any) => read.circular_id), canPublish: PUBLISHERS.has(role), canViewAnalytics: ANALYSTS.has(role) })
}

export async function POST(request: Request) {
  const current = await actor()
  if (!current) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  if (!PUBLISHERS.has(String(current.profile.role))) return NextResponse.json({ error: "Only HR Records users can publish circulars" }, { status: 403 })
  const form = await request.formData()
  const title = String(form.get("title") || "").trim()
  const commentary = String(form.get("commentary") || "").trim()
  const audienceRoles = JSON.parse(String(form.get("audienceRoles") || "[]"))
  const file = form.get("file")
  if (!title || !(file instanceof File)) return NextResponse.json({ error: "Title and circular file are required" }, { status: 400 })
  const allowed = ["application/pdf", "image/png", "image/jpeg", "image/webp"]
  if (!allowed.includes(file.type)) return NextResponse.json({ error: "Upload a PDF, PNG, JPG, or WEBP file" }, { status: 400 })
  if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "Files must be 15MB or smaller" }, { status: 400 })
  const blob = await put(`e-circulars/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`, file, { access: "public", addRandomSuffix: true })
  const { data, error } = await current.admin.from("e_circulars").insert({ title, commentary: commentary || null, file_url: blob.url, file_name: file.name, mime_type: file.type, audience_roles: Array.isArray(audienceRoles) ? audienceRoles : [], published_by: current.user.id }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ circular: data }, { status: 201 })
}
