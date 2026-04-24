import { RuntimeFeatureControls } from "@/components/admin/runtime-feature-controls"
import { createClient } from "@/lib/supabase/server"
import { DEFAULT_RUNTIME_FLAGS, parseRuntimeFlags } from "@/lib/runtime-flags"
import { redirect } from "next/navigation"

export const metadata = {
  title: "Runtime Feature Controls | QCC Electronic Attendance",
  description: "Enable or disable runtime features like password enforcement and automatic checkout",
}

export default async function RuntimeControlsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", user.id).single()

  if (profile?.role !== "admin") {
    redirect("/dashboard")
  }

  const { data: systemSettings } = await supabase.from("system_settings").select("settings").maybeSingle()
  const flags = parseRuntimeFlags(systemSettings?.settings)

  return (
    <RuntimeFeatureControls
      initialFlags={flags || DEFAULT_RUNTIME_FLAGS}
      initialSystemSettings={(systemSettings?.settings || {}) as Record<string, unknown>}
    />
  )
}
