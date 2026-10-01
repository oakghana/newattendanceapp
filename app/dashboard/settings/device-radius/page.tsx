
import { DeviceRadiusSettings } from "@/components/admin/device-radius-settings"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export const metadata = {
  title: "Device Radius Settings | QCC Electronic Attendance",
  description: "Configure device-specific proximity radiuses for attendance check-in and check-out",
}

export default async function DeviceRadiusPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  // Check if user is admin
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (!["admin", "administrator"].includes(String(profile?.role).toLowerCase())) {
    redirect("/dashboard")
  }

  // Fetch current device radius settings
  const { data: deviceSettings } = await supabase
    .from("device_radius_settings")
    .select("*")
    .eq("is_active", true)
    .order("device_type")

  return (
    <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-heading font-bold text-foreground">Device Radius Settings</h1>
          <p className="text-muted-foreground mt-2">
            Configure proximity radiuses for different device types. These settings control how far users can be from a
            location to check in or check out.
          </p>
        </div>

        <DeviceRadiusSettings initialSettings={deviceSettings || []} />
      </div>
  )
}
