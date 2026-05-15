import { WarningsArchive } from "@/components/admin/warnings-archive"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"

export default async function WarningsArchivePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, department_id")
    .eq("id", user.id)
    .single()

  if (!profile || !["admin", "regional_manager", "department_head", "director_hr", "manager_hr"].includes(profile.role)) {
    redirect("/dashboard")
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>
      </div>
      <div>
        <h1 className="text-3xl font-bold">Warnings Archive</h1>
        <p className="text-muted-foreground mt-2">
          View all formal warnings sent to staff for attendance non-compliance
        </p>
      </div>
      <WarningsArchive userRole={profile.role} departmentId={profile.department_id} userId={user.id} />
    </div>
  )
}
