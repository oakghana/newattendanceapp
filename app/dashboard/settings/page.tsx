import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Settings2, MapPin, Users, Bell, Shield, Smartphone, Database, ToggleLeft } from "lucide-react"
import Link from "next/link"

export default async function SettingsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("id, role, first_name, last_name")
    .eq("id", user.id)
    .single()

  const settingsSections = [
    {
      title: "Device Proximity Settings",
      description: "Configure check-in and check-out radius for different device types",
      icon: Smartphone,
      href: "/dashboard/settings/device-radius",
      roles: ["admin"],
      badge: "System-wide",
    },
    {
      title: "Database Backup & Restore",
      description: "Create backups and restore system data",
      icon: Database,
      href: "/dashboard/settings/backup",
      roles: ["admin"],
      badge: "Critical",
    },
    {
      title: "Runtime Feature Controls",
      description: "Enable or disable password enforcement and automatic checkout live",
      icon: ToggleLeft,
      href: "/dashboard/settings/runtime-controls",
      roles: ["admin"],
      badge: "Live Controls",
    },
    {
      title: "Location Management",
      description: "Manage QCC locations and geofences",
      icon: MapPin,
      href: "/dashboard/locations",
      roles: ["admin"],
    },
    {
      title: "User Management",
      description: "Manage staff accounts and permissions",
      icon: Users,
      href: "/dashboard/staff",
      roles: ["admin"],
    },
    {
      title: "Notification Settings",
      description: "Configure system notifications and alerts",
      icon: Bell,
      href: "/dashboard/settings/notifications",
      roles: ["admin", "department_head", "staff"],
    },
    {
      title: "Security Settings",
      description: "Manage security policies and access controls",
      icon: Shield,
      href: "/dashboard/audit-logs",
      roles: ["admin"],
    },
  ]

  const availableSettings = settingsSections.filter((section) => section.roles.includes(profile?.role || "staff"))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-2">Manage system configuration and preferences</p>
      </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {availableSettings.map((section) => {
            const Icon = section.icon
            return (
              <Link key={section.href} href={section.href}>
                <Card className="hover:shadow-lg transition-all duration-200 hover:border-primary/50 cursor-pointer h-full">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Icon className="h-6 w-6 text-primary" />
                      </div>
                      {section.badge && (
                        <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full font-medium">
                          {section.badge}
                        </span>
                      )}
                    </div>
                    <CardTitle className="mt-4">{section.title}</CardTitle>
                    <CardDescription>{section.description}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            )
          })}
        </div>
    </div>
  )
}
