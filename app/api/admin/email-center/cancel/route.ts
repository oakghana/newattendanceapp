import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { cancelEmailBroadcast } from "@/lib/email-broadcast-control"

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", user.id).maybeSingle()
  if (!profile || !["admin", "administrator"].includes(String(profile.role || "").toLowerCase())) return NextResponse.json({ error: "Administrator access required" }, { status: 403 })
  const { broadcastId } = await request.json().catch(() => ({}))
  if (!broadcastId || !cancelEmailBroadcast(String(broadcastId))) return NextResponse.json({ error: "This broadcast is no longer active" }, { status: 404 })
  return NextResponse.json({ success: true, message: "Cancellation requested. Messages already accepted by the provider cannot be recalled." })
}
