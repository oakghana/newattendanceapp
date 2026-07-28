import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { MdApprovalsClient } from "./md-approvals-client"

export default async function MdApprovalsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    console.error("[v0] MD Approvals Page - No authenticated user found")
    redirect("/auth/login")
  }

  console.log("[v0] MD Approvals Page - User authenticated:", { userId: user.id, email: user.email })

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("id, role, first_name, last_name, rank_position, profile_image_url, md_signature_url, departments(name)")
    .eq("id", user.id)
    .maybeSingle()

  if (profileError) {
    console.error("[v0] MD Approvals Page - Profile fetch error:", profileError)
  }

  console.log("[v0] MD Approvals Page - Profile fetch result:", {
    profileExists: !!profile,
    userRole: profile?.role,
    userId: profile?.id
  })

  // The proxy has already validated the role — just render the client without redirects
  if (!profile) {
    console.error("[v0] MD Approvals Page - User profile not found, redirecting to login")
    redirect("/auth/login")
  }

  return <MdApprovalsClient profile={profile} />
}
