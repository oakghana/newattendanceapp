import { createClient, createAdminClient } from "@/lib/supabase/server"

/**
 * Check if the current user is an Admin and should bypass RLS restrictions
 * Admins have unrestricted access to all data and all modules
 */
export async function isUserAdmin(): Promise<boolean> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return false

    // Fetch user profile to check role
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile?.role) return false

    const roleNorm = String(profile.role || "").toLowerCase().replace(/[\s-]+/g, "_")
    const adminRoles = ["admin", "administrator", "super_admin", "god"]

    return adminRoles.includes(roleNorm)
  } catch (err) {
    console.error("[v0] Error checking admin status:", err)
    return false
  }
}

/**
 * Get the appropriate Supabase client based on user role
 * - Returns admin client if user is admin (bypasses RLS)
 * - Returns authenticated client otherwise
 */
export async function getClientForUser() {
  const admin = await isUserAdmin()
  if (admin) {
    return { client: await createAdminClient(), isAdmin: true }
  }
  return { client: await createClient(), isAdmin: false }
}
