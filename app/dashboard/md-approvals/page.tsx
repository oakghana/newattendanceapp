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

  if (!profile || !["managing_director", "admin"].includes(profile.role)) {
    redirect("/dashboard/overview")
  }

  return <MdApprovalsClient profile={profile} />
}
