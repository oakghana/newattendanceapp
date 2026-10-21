import { NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
const ROLES = new Set(["admin", "administrator", "department_head", "regional_manager", "regional_hr_office", "regional_hr_officer", "hr_records", "hr_records_officer", "hr_records_manager", "managing_director"])
export async function GET(request: Request) {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  const admin = await createAdminClient(); const { data: profile } = await admin.from("user_profiles").select("role").eq("id", user.id).maybeSingle(); if (!ROLES.has(String(profile?.role))) return NextResponse.json({ error: "Not authorized" }, { status: 403 })
  const id = new URL(request.url).searchParams.get("circularId"); let query = admin.from("e_circular_reads").select("circular_id,user_id,opened_at,last_opened_at,open_count,role,location_id").order("last_opened_at", { ascending: false }); if (id) query = query.eq("circular_id", id)
  const { data, error } = await query; if (error) return NextResponse.json({ error: error.message }, { status: 500 }); return NextResponse.json({ reads: data || [] })
}
