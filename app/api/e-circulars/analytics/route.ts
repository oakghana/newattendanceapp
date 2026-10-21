import { NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
const ROLES = new Set(["admin", "administrator", "department_head", "regional_manager", "regional_hr_office", "regional_hr_officer", "hr_records", "hr_records_officer", "hr_records_manager", "managing_director"])
export async function GET(request: Request) {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  const admin = await createAdminClient(); const { data: profile } = await admin.from("user_profiles").select("role").eq("id", user.id).maybeSingle(); if (!ROLES.has(String(profile?.role))) return NextResponse.json({ error: "Not authorized" }, { status: 403 })
  const id = new URL(request.url).searchParams.get("circularId"); let query = admin.from("e_circular_reads").select("circular_id,user_id,opened_at,last_opened_at,open_count,role,location_id").order("last_opened_at", { ascending: false }); if (id) query = query.eq("circular_id", id)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const reads = data || []
  const userIds = Array.from(new Set(reads.map((read: any) => read.user_id).filter(Boolean)))
  const locationIds = Array.from(new Set(reads.map((read: any) => read.location_id).filter(Boolean)))
  const [{ data: profiles }, { data: locations }] = await Promise.all([
    userIds.length ? admin.from("user_profiles").select("id,position,role,assigned_location_id").in("id", userIds) : Promise.resolve({ data: [] }),
    locationIds.length ? admin.from("geofence_locations").select("id,name").in("id", locationIds) : Promise.resolve({ data: [] }),
  ])
  const profileMap = new Map((profiles || []).map((profile: any) => [profile.id, profile]))
  const locationMap = new Map((locations || []).map((location: any) => [location.id, location.name]))
  const countBy = (values: string[]) => Object.entries(values.reduce<Record<string, number>>((result, value) => { const key = value || "Not specified"; result[key] = (result[key] || 0) + 1; return result }, {})).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
  const enrichedReads = reads.map((read: any) => {
    const profile = profileMap.get(read.user_id)
    return { ...read, location: locationMap.get(read.location_id) || "Not specified", rank: profile?.position || "Not specified", role: profile?.role || read.role || "Not specified" }
  })
  return NextResponse.json({ reads: enrichedReads, summary: { totalReads: reads.length, uniqueReaders: userIds.length, byLocation: countBy(enrichedReads.map((read: any) => read.location)), byRank: countBy(enrichedReads.map((read: any) => read.rank)), byRole: countBy(enrichedReads.map((read: any) => read.role)) } })
}
