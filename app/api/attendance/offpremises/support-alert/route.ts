import { NextRequest, NextResponse } from "next/server"
import { createAdminClient, createClient } from "@/lib/supabase/server"
import { emailService } from "@/lib/email-service"

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const admin = await createAdminClient()
  const { data: actor } = await admin.from("user_profiles").select("role").eq("id", user.id).maybeSingle()
  if (!actor || !["admin", "administrator"].includes(String(actor.role || "").toLowerCase())) return NextResponse.json({ error: "Only administrators can send support alerts" }, { status: 403 })
  const { request_id } = await request.json()
  if (!request_id) return NextResponse.json({ error: "Request ID is required" }, { status: 400 })

  const { data: item, error } = await admin.from("pending_offpremises_checkins").select("id, user_id, current_location_name, google_maps_name, latitude, longitude, accuracy, reason, request_type, user_profiles!pending_offpremises_checkins_user_id_fkey(id, employee_id, first_name, last_name, email, department_id, region_id, assigned_location_id)").eq("id", request_id).single()
  if (error || !item) return NextResponse.json({ error: "Off-premises request not found" }, { status: 404 })
  const staff = Array.isArray(item.user_profiles) ? item.user_profiles[0] : item.user_profiles
  const { data: department } = staff?.department_id ? await admin.from("departments").select("name").eq("id", staff.department_id).maybeSingle() : { data: null }
  const { data: recipients } = await admin.from("user_profiles").select("id, email, first_name, last_name, it_admin_scope, region_id, assigned_location_id").eq("is_active", true).in("it_admin_scope", ["regional_it_admin", "head_office_it_admin"])
  const selected = (recipients || []).filter((recipient: any) => recipient.it_admin_scope === "head_office_it_admin" || recipient.region_id === staff?.region_id || recipient.assigned_location_id === staff?.assigned_location_id).filter((recipient: any) => recipient.email)
  if (!selected.length) return NextResponse.json({ error: "No active Regional or Head Office IT Admin is configured for this staff member" }, { status: 422 })

  const name = `${staff?.first_name || ""} ${staff?.last_name || ""}`.trim() || "Staff member"
  const location = item.google_maps_name || item.current_location_name || "Location unavailable"
  const gps = `${Number(item.latitude).toFixed(6)}, ${Number(item.longitude).toFixed(6)}`
  const maps = `https://www.google.com/maps?q=${encodeURIComponent(`${item.latitude},${item.longitude}`)}`
  const subject = `IT Support Alert: ${name} needs help with off-premises login`
  const html = `<p>An administrator has requested technical assistance for a staff member who is having difficulty completing an off-premises attendance request.</p><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:20px 0"><tr><td style="padding:10px 0;color:#64748b;width:34%">Staff member</td><td style="padding:10px 0;font-weight:700">${name}</td></tr><tr><td style="padding:10px 0;color:#64748b">Department</td><td style="padding:10px 0">${department?.name || "Not available"}</td></tr><tr><td style="padding:10px 0;color:#64748b">Employee ID</td><td style="padding:10px 0">${staff?.employee_id || staff?.id || "Not available"}</td></tr><tr><td style="padding:10px 0;color:#64748b">GPS location</td><td style="padding:10px 0"><a href="${maps}">${location}</a><br><span style="font-size:12px;color:#64748b">${gps} · accuracy ±${Number(item.accuracy || 0).toFixed(0)}m</span></td></tr><tr><td style="padding:10px 0;color:#64748b">Reason</td><td style="padding:10px 0">${item.reason || "Not provided"}</td></tr></table><p>Please contact the staff member and help resolve the login, device, GPS, or location issue. This alert does not approve or reject the request.</p>`
  const results = await Promise.allSettled(selected.map((recipient: any) => emailService.sendEmail(String(recipient.email).trim(), { subject, html, text: `IT Support Alert\n\nStaff: ${name}\nDepartment: ${department?.name || "Not available"}\nEmployee ID: ${staff?.employee_id || staff?.id || "Not available"}\nLocation: ${location}\nGPS: ${gps}\nReason: ${item.reason || "Not provided"}\n\nPlease contact the staff member and help resolve the issue.` }, { recipientUserId: recipient.id, emailModule: "off_premises", emailEvent: "manual_it_support_alert", idempotencyKey: `offpremises-manual-support/${item.id}/${recipient.id}/${Date.now()}` })))
  const sent = results.filter((result) => result.status === "fulfilled").length
  return NextResponse.json({ success: sent > 0, sent, attempted: selected.length })
}
