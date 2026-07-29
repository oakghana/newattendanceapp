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

  // Get user profile - use maybeSingle to handle non-existent profiles gracefully
  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select(`
      *,
      departments (
        id,
        name,
        code
      ),
      assigned_location:assigned_location_id (
        id,
        name,
        address,
        district_id,
        districts (
          id,
          name
        )
      )
    `)
    .eq("id", user.id)
    .maybeSingle()

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
      .select(`
        *,
        departments (
          id,
          name,
          code
        ),
        assigned_location:assigned_location_id (
          id,
          name,
          address,
          district_id,
          districts (
            id,
            name
          )
        )
      `)
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
