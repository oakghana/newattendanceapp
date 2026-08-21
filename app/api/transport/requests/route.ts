import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()
  const purpose = String(body.purpose ?? "").trim()
  const origin = String(body.origin ?? "").trim()
  const destination = String(body.destination ?? "").trim()
  const eventDate = String(body.eventDate ?? "").trim()
  const passengerCount = Number(body.passengerCount)

  if (!purpose || !origin || !destination || !eventDate || !Number.isInteger(passengerCount) || passengerCount < 1) {
    return NextResponse.json({ error: "Complete all required request details." }, { status: 400 })
  }

  const { data, error } = await supabase.from("transport_requests").insert({
    requester_id: user.id,
    purpose,
    origin,
    destination,
    event_date: eventDate,
    passenger_count: passengerCount,
    status: "submitted",
    workflow_stage: "regional_hr_review",
  }).select("id").single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: data.id }, { status: 201 })
}
