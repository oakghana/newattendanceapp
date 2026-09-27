import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({ publicKey: process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY || null })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await request.json()
  const endpoint = String(body?.endpoint || "")
  const p256dh = String(body?.keys?.p256dh || "")
  const auth = String(body?.keys?.auth || "")
  if (!endpoint || !p256dh || !auth) return NextResponse.json({ error: "Invalid push subscription" }, { status: 400 })
  const { error } = await supabase.from("push_subscriptions").upsert({
    user_id: user.id,
    endpoint,
    p256dh,
    auth,
    user_agent: request.headers.get("user-agent"),
    last_seen_at: new Date().toISOString(),
  }, { onConflict: "user_id,endpoint" })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { endpoint } = await request.json()
  await supabase.from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", endpoint)
  return NextResponse.json({ success: true })
}
