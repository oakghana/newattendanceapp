import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { MdApprovalsClient } from "./md-approvals-client"

export default async function MdApprovalsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("id, role, first_name, last_name, rank_position, profile_image_url, md_signature_url, departments(name)")
    .eq("id", user.id)
    .maybeSingle()

  // The proxy has already validated the role — just render the client without redirects
  if (!profile) redirect("/auth/login")

  return <MdApprovalsClient profile={profile} />
}
