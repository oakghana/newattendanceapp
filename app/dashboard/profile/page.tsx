import { ProfileClient } from "@/components/profile/profile-client"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export default async function ProfilePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  // Keep the first read to the base row. Optional relationship joins can fail when
  // legacy databases have different foreign-key names and should not blank the page.
  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle()

  if (profile) {
    if (profile.department_id) {
      const { data: department } = await supabase.from("departments").select("id, name, code").eq("id", profile.department_id).maybeSingle()
      if (department) profile.departments = department as any
    }
    if (profile.assigned_location_id) {
      const { data: assignedLocation } = await supabase
        .from("geofence_locations")
        .select("id, name, address, district_id, districts (id, name)")
        .eq("id", profile.assigned_location_id)
        .maybeSingle()
      if (assignedLocation) profile.assigned_location = assignedLocation as any
    }
  }

  // Resolve organization fields independently as a safety net for legacy/ambiguous Supabase relationships.
  if (profile?.assigned_location_id && !profile.assigned_location) {
    const { data: assignedLocation } = await supabase
      .from("geofence_locations")
      .select("id, name, address, district_id, districts (id, name)")
      .eq("id", profile.assigned_location_id)
      .maybeSingle()
    if (assignedLocation) profile.assigned_location = assignedLocation as any
  }

  // Ensure welfare fields are fetched for existing profile
  if (profile && !profile.staff_category && !profile.years_of_service) {
    const { data: welfareData } = await supabase
      .from("user_profiles")
      .select("staff_category, years_of_service, date_of_appointment")
      .eq("id", user.id)
      .maybeSingle()
    if (welfareData) {
      profile.staff_category = welfareData.staff_category
      profile.years_of_service = welfareData.years_of_service
      profile.date_of_appointment = welfareData.date_of_appointment
    }
  }

  // If profile doesn't exist, create it
  let finalProfile = profile
  if (!profile && !profileError) {
    console.log("Creating profile for user:", user.id)
    const { data: newProfile, error: createError } = await supabase
      .from("user_profiles")
      .insert({
        id: user.id,
        email: user.email,
        first_name: user.user_metadata?.first_name || "",
        last_name: user.user_metadata?.last_name || "",
        role: "staff",
        is_active: true,
      })
      .select("*")
      .single()

    // Ensure welfare fields are fetched if they exist
    if (!createError && newProfile) {
      const { data: welfareData } = await supabase
        .from("user_profiles")
        .select("staff_category, years_of_service, date_of_appointment")
        .eq("id", user.id)
        .maybeSingle()
      if (welfareData) {
        newProfile.staff_category = welfareData.staff_category
        newProfile.years_of_service = welfareData.years_of_service
        newProfile.date_of_appointment = welfareData.date_of_appointment
      }
    }

    if (!createError && newProfile) {
      finalProfile = newProfile
    } else {
      console.error("Failed to create profile:", createError)
    }
  }

  return <ProfileClient initialUser={user} initialProfile={finalProfile} />
}
