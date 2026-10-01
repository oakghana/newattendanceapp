import { redirect } from "next/navigation"
import { ClipboardList, Construction } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export default async function WeeklyReturnsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/auth/login")

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role, departments(code, name)")
    .eq("id", user.id)
    .maybeSingle()

  const role = String(profile?.role || "").trim().toLowerCase().replace(/[\s-]+/g, "_")
  const department = Array.isArray(profile?.departments) ? profile.departments[0] : profile?.departments
  const departmentValue = `${department?.code || ""} ${department?.name || ""}`.toLowerCase()
  const isOperational = departmentValue.includes("operation") || departmentValue.includes("operational")

  if (role !== "staff" || !isOperational) redirect("/dashboard/overview")

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex items-start gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ClipboardList className="size-6" aria-hidden="true" />
        </div>
        <div className="flex flex-col gap-2">
          <Badge variant="secondary" className="w-fit">Operational Department</Badge>
          <h1 className="text-3xl font-semibold tracking-tight text-balance">Weekly Returns</h1>
          <p className="text-muted-foreground leading-6">
            A workspace for operational daily, weekly, monthly, and quarterly returns to management.
          </p>
        </div>
      </div>

      <Card className="border-dashed">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Construction className="size-5 text-primary" aria-hidden="true" />
            <CardTitle>Page under construction</CardTitle>
          </div>
          <CardDescription>
            This page is being prepared to support the Operational Department&apos;s reporting workflow.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-6 text-muted-foreground">
            The daily, weekly, monthly, and quarterly return forms will be added as the reporting requirements are confirmed.
          </p>
        </CardContent>
      </Card>
    </main>
  )
}

export const metadata = {
  title: "Weekly Returns | QCC Attendance",
  description: "Operational department weekly returns workspace.",
}

export const dynamic = "force-dynamic"
