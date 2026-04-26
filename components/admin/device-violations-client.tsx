"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Shield, Clock, ArrowLeft } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"

interface Violation {
  id: string
  device_id: string
  ip_address: string
  attempted_user_id: string
  bound_user_id: string
  attempted_user?: UserProfile
  bound_user?: UserProfile
  violation_type: string
  created_at: string
  department_notified: boolean
}

interface UserProfile {
  id: string
  first_name: string
  last_name: string
  email: string
  employee_id: string
  department_id?: string
}

export default function DeviceViolationsClient({
  userRole,
  departmentId,
}: {
  userRole: string
  departmentId?: string
}) {
  const [violations, setViolations] = useState<Violation[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    fetchViolations()
  }, [])

  const fetchViolations = async () => {
    try {
      const supabase = createClient()

      const { data, error } = await supabase
        .from("device_security_violations")
        .select("*")
        .order("created_at", { ascending: false })

      if (error) {
        if (
          error.code === "42P01" ||
          error.code === "PGRST204" ||
          error.message.includes("does not exist") ||
          error.message.includes("schema cache")
        ) {
          console.log("[v0] Device security violations table not created yet")
          setViolations([])
          setLoading(false)
          return
        }
        throw error
      }

      // If we have violations, fetch user profiles separately
      if (data && data.length > 0) {
        const userIds = [...new Set([...data.map((v: any) => v.attempted_user_id), ...data.map((v: any) => v.bound_user_id)])]

        const { data: profiles } = await supabase.from("user_profiles").select("*").in("id", userIds)

        const profileMap = new Map((profiles as any[])?.map((p: any) => [p.id, p]) || [])

        const enrichedViolations = (data as any[])
          .map((v: any) => ({
            ...v,
            attempted_user: profileMap.get(v.attempted_user_id),
            bound_user: profileMap.get(v.bound_user_id),
          }))
          .filter((v: any) => v.attempted_user && v.bound_user) // Filter out any missing profiles

        // Filter by department for department heads
        if (userRole === "department_head" && departmentId) {
          setViolations(enrichedViolations.filter((v) => v.attempted_user.department_id === departmentId))
        } else {
          setViolations(enrichedViolations)
        }
      } else {
        setViolations([])
      }
    } catch (error) {
      console.error("Error fetching violations:", error)
      setViolations([])
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="p-6">Loading device security violations...</div>
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Button variant="ghost" className="mb-4" onClick={() => router.push("/dashboard")}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Dashboard
      </Button>

      <div className="flex items-center gap-3">
        <Shield className="h-8 w-8 text-destructive" />
        <div>
          <h1 className="text-3xl font-bold">Device Security Violations</h1>
          <p className="text-muted-foreground">Monitor and investigate device sharing attempts</p>
        </div>
      </div>

      {violations.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center space-y-2">
              <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No device violations detected</p>
              <p className="text-sm text-muted-foreground">
                Device security monitoring is active. Violations will appear here when detected.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {violations.map((violation) => (
            <Card key={violation.id} className="border-destructive/20">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-destructive" />
                      Device Sharing Detected
                    </CardTitle>
                    <CardDescription className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      {new Date(violation.created_at).toLocaleString()}
                    </CardDescription>
                  </div>
                  <Badge
                    variant={
                      violation.violation_type === "checkin_attempt" || violation.violation_type === "checkout_attempt"
                        ? "destructive"
                        : "secondary"
                    }
                  >
                    {violation.violation_type === "checkin_attempt"
                      ? "Check-in Attempt"
                      : violation.violation_type === "checkout_attempt"
                        ? "Check-out Attempt"
                        : "Login Attempt"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Attempted User</p>
                    <div className="space-y-1 text-sm">
                      <p className="font-semibold">
                        {violation.attempted_user?.first_name} {violation.attempted_user?.last_name}
                      </p>
                      <p className="text-muted-foreground">{violation.attempted_user?.email}</p>
                      <p className="text-xs text-muted-foreground">ID: {violation.attempted_user?.employee_id}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Device Registered To</p>
                    <div className="space-y-1 text-sm">
                      <p className="font-semibold">
                        {violation.bound_user?.first_name} {violation.bound_user?.last_name}
                      </p>
                      <p className="text-muted-foreground">{violation.bound_user?.email}</p>
                      <p className="text-xs text-muted-foreground">ID: {violation.bound_user?.employee_id}</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-2 pt-4 border-t">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Device ID:</span>
                    <span className="font-mono text-xs">{violation.device_id}</span>
                  </div>
                  {violation.ip_address && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">IP Address:</span>
                      <span className="font-mono text-xs">{violation.ip_address}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
