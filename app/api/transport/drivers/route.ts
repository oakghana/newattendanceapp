import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { canEditDriverLicenses, canManageTransport, hasNationwideFleetScope, isChiefDriverRole, isRegionalHrRole, isRegionalManagerRole } from "@/lib/role-capabilities"
import { isNonRegionalLocation } from "@/lib/location-mappings"
import { resolveOwnedLocationIdsForRegionalOffice } from "@/lib/regional-manager-scope"

async function actor() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, profile: null }
  const { data: profile } = await supabase.from("user_profiles").select("role, is_active, region_id, assigned_location_id").eq("id", user.id).single()
  return { supabase, user, profile }
}

export async function GET() {
  const { supabase, user, profile } = await actor()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!profile?.is_active || !canManageTransport(profile.role)) return NextResponse.json({ error: "Transport access denied." }, { status: 403 })
  const hasNationwideScope = hasNationwideFleetScope(profile.role)
  const isRegionalScope = isChiefDriverRole(profile.role) || isRegionalHrRole(profile.role) || isRegionalManagerRole(profile.role)
  const ownedLocationIds = isRegionalScope
    ? await resolveOwnedLocationIdsForRegionalOffice(supabase, profile.assigned_location_id, profile.region_id)
    : []
  const { data: driverProfiles, error: profileError } = await supabase
    .from("user_profiles")
    .select("id, region_id, assigned_location_id, geofence_locations!user_profiles_assigned_location_id_fkey(name, districts(region_id))")
    .in("role", ["driver", "regional_driver", "regional_drivers", "chief_driver", "regional_chief_driver"])
    .eq("is_active", true)
  if (profileError) return NextResponse.json({ error: "Unable to resolve driver locations." }, { status: 500 })
  const scopedProfileIds = (driverProfiles ?? []).filter((driver: any) => {
    if (hasNationwideScope) return true
    if (isRegionalScope) return ownedLocationIds.includes(driver.assigned_location_id)
    return Boolean(profile.assigned_location_id) && driver.assigned_location_id === profile.assigned_location_id && isNonRegionalLocation(driver.geofence_locations?.name)
  }).map((driver: any) => driver.id)
  if (!hasNationwideScope && !scopedProfileIds.length) return NextResponse.json({ drivers: [], canVerify: false })
  let query = supabase.from("transport_drivers").select("*").order("expiry_date")
  if (!hasNationwideScope) query = query.in("profile_id", scopedProfileIds)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: "Unable to load driver licenses." }, { status: 500 })
  return NextResponse.json({ drivers: data ?? [], canVerify: canEditDriverLicenses(profile.role) })
}

export async function PATCH(request: Request) {
  const { supabase, user, profile } = await actor()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const normalizedRole = String(profile?.role ?? "").toLowerCase().trim().replace(/[\s-]+/g, "_")
  const isDriver = ["driver", "chief_driver", "regional_chief_driver"].includes(normalizedRole)
  if (!profile?.is_active || (!canManageTransport(profile.role) && !isDriver)) return NextResponse.json({ error: "Transport license access denied." }, { status: 403 })
  const body = await request.json()
  if (isDriver) {
    const { data: driver } = await supabase.from("transport_drivers").select("id, profile_id").eq("profile_id", user.id).maybeSingle()
    if (typeof body.license_document_url !== "string" || !body.license_document_url.startsWith("http")) return NextResponse.json({ error: "A valid license document is required." }, { status: 400 })
    const metadataError = !Number.isInteger(Number(body.production_year)) || Number(body.production_year) < 1900 || Number(body.production_year) > new Date().getFullYear() || !Number.isInteger(Number(body.expiry_year)) || Number(body.expiry_year) < new Date().getFullYear() || !String(body.license_type ?? "").trim() || !String(body.issuing_authority ?? "").trim() || !String(body.obtained_at ?? "").trim()
    if (metadataError) return NextResponse.json({ error: "License type, issuing authority, place obtained, production year, and expiry year are required." }, { status: 400 })
    const { data: driverProfile } = await supabase.from("user_profiles").select("id, first_name, last_name, employee_id").eq("id", user.id).maybeSingle()
    if (!driverProfile) return NextResponse.json({ error: "Your user profile could not be found." }, { status: 404 })
    const fullName = [driverProfile.first_name, driverProfile.last_name].filter(Boolean).join(" ") || "Driver"
    if (!driver) {
      const { data: created, error: createError } = await supabase.from("transport_drivers").insert({
        profile_id: user.id,
        full_name: fullName,
        license_number: driverProfile.employee_id || `PENDING-${user.id.slice(0, 8)}`,
        license_type: String(body.license_type).trim(),
        production_year: Number(body.production_year),
        issuing_authority: String(body.issuing_authority).trim(),
        obtained_at: String(body.obtained_at).trim(),
        expiry_date: `${Number(body.expiry_year)}-12-31`,
        status: "active",
        verification_status: "pending",
        license_document_url: body.license_document_url,
      }).select("*").single()
      if (createError) {
        console.error("[v0] Driver license record creation failed:", createError)
        return NextResponse.json({ error: "Unable to create your driver license record." }, { status: 500 })
      }
      return NextResponse.json({ ok: true, driver: created })
    }
    const { data: updated, error } = await supabase.from("transport_drivers").update({ license_document_url: body.license_document_url, license_type: String(body.license_type).trim(), production_year: Number(body.production_year), issuing_authority: String(body.issuing_authority).trim(), obtained_at: String(body.obtained_at).trim(), expiry_date: `${Number(body.expiry_year)}-12-31`, updated_at: new Date().toISOString(), verification_status: "pending" }).eq("id", driver.id).eq("profile_id", user.id).select("*").single()
    if (error) return NextResponse.json({ error: "Unable to save your license document." }, { status: 500 })
    return NextResponse.json({ ok: true, driver: updated })
  }
  const id = String(body.id ?? "")
  const verificationStatus = String(body.verification_status ?? "")
  if (!canEditDriverLicenses(profile.role)) return NextResponse.json({ error: "Your role has read-only access to driver licenses." }, { status: 403 })
  if (!id || !["pending", "verified", "needs_correction"].includes(verificationStatus)) return NextResponse.json({ error: "Invalid verification request." }, { status: 400 })
  const { data: existing } = await supabase
    .from("transport_drivers")
    .select("assigned_region_id, profile_id, profile:user_profiles!profile_id(assigned_location_id)")
    .eq("id", id)
    .single()
  if (!existing) return NextResponse.json({ error: "Driver license record not found." }, { status: 404 })
  if (!hasNationwideFleetScope(profile.role)) {
    const ownedLocationIds = await resolveOwnedLocationIdsForRegionalOffice(supabase, profile.assigned_location_id, profile.region_id)
    const driverLocationId = (existing.profile as { assigned_location_id?: string | null } | null)?.assigned_location_id
    const locationAllowed = Boolean(driverLocationId && ownedLocationIds.includes(driverLocationId))
    const regionAllowed = Boolean(profile.region_id && existing.assigned_region_id === profile.region_id)
    if (!locationAllowed && !regionAllowed) return NextResponse.json({ error: "This driver is outside your assigned location or district." }, { status: 403 })
  }
  const updates = { full_name: String(body.full_name ?? "").trim(), license_number: String(body.license_number ?? "").trim(), license_type: String(body.license_type ?? "").trim() || null, expiry_date: String(body.expiry_date ?? ""), notes: String(body.notes ?? "").trim() || null, verification_status: verificationStatus, verified_by: verificationStatus === "verified" ? user.id : null, verified_at: verificationStatus === "verified" ? new Date().toISOString() : null, correction_note: String(body.correction_note ?? "").trim() || null, updated_at: new Date().toISOString() }
  if (!updates.full_name || !updates.license_number || !updates.expiry_date) return NextResponse.json({ error: "Name, license number, and expiry date are required." }, { status: 400 })
  const { error } = await supabase.from("transport_drivers").update(updates).eq("id", id)
  if (error) return NextResponse.json({ error: "Unable to update license details." }, { status: 500 })
  return NextResponse.json({ ok: true })
}
