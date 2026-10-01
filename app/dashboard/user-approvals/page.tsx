import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

export default async function UserApprovalsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  // Check if user has admin role - user approvals are admin-only
  const { data: profile } = await supabase.from("user_profiles").select("role").eq("id", user.id).single()

  if (!profile || !["admin", "administrator"].includes(String(profile.role).toLowerCase())) {
    redirect("/dashboard")
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">User Approvals</h1>
        <p className="text-muted-foreground">Manage user account approvals and access requests</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Approval System Disabled</CardTitle>
          <CardDescription>
            User approvals are no longer required for the QCC Electronic Attendance System
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription>
              <strong>System Update:</strong> Self-registration has been disabled and all user accounts are now
              managed directly by administrators through the Staff Management system.
              <br />
              <br />
              New users can only be added by administrators, and they are automatically activated upon creation. No
              approval process is needed.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  )
}
