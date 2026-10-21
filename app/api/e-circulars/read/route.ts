import { NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  const { circularId } = await request.json()
  const admin = await createAdminClient()
  const { data: profile } = await admin.from("user_profiles").select("role,assigned_location_id").eq("id", user.id).maybeSingle()
  const { error } = await admin.from("e_circular_reads").upsert({ circular_id: circularId, user_id: user.id, last_opened_at: new Date().toISOString(), location_id: profile?.assigned_location_id || null, role: profile?.role || null, user_agent: request.headers.get("user-agent") || null }, { onConflict: "circular_id,user_id", ignoreDuplicates: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
