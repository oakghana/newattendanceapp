"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { AlertTriangle, ArrowLeft, Clock, MapPin, RefreshCw, Shield, ShieldOff, Trash2 } from "lucide-react"

interface UserProfile {
  id: string
  first_name: string
  last_name: string
  email: string
  employee_id: string
  department_id?: string
  assigned_location_id?: string | null
  assigned_location_name?: string
}

interface Violation {
  id: string
  device_id: string
  ip_address: string | null
  attempted_user_id: string
  bound_user_id: string
  attempted_user?: UserProfile
  bound_user?: UserProfile
  violation_type: string
  created_at: string
  department_notified: boolean
}

interface ConfirmDialogState {
  type: "single" | "user" | "all"
  violationId?: string
  userId?: string
  userName?: string
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
  const [refreshing, setRefreshing] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null)
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; msg: string } | null>(null)
  const router = useRouter()

  useEffect(() => {
    void fetchViolations()
  }, [])

  const fetchViolations = async () => {
    try {
      setRefreshing(true)
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
          setViolations([])
          return
        }
        throw error
      }

      if (!data || data.length === 0) {
        setViolations([])
        return
      }

      const userIds = [...new Set([...data.map((v: any) => v.attempted_user_id), ...data.map((v: any) => v.bound_user_id)])]

      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("id, first_name, last_name, email, employee_id, department_id, assigned_location_id")
        .in("id", userIds)

      const locationIds = [
        ...new Set((profiles || []).map((profile: any) => profile.assigned_location_id).filter(Boolean)),
      ]

      let locationNameMap = new Map<string, string>()
      if (locationIds.length > 0) {
        const { data: locations } = await supabase
          .from("geofence_locations")
          .select("id, name")
          .in("id", locationIds as string[])

        locationNameMap = new Map((locations || []).map((location: any) => [location.id, location.name]))
      }

      const profileMap = new Map(
        (profiles || []).map((profile: any) => [
          profile.id,
          {
            ...profile,
            assigned_location_name: profile.assigned_location_id
              ? locationNameMap.get(profile.assigned_location_id) || "Unknown"
              : "Unassigned",
          },
        ]),
      )

      const enrichedViolations: Violation[] = (data as any[])
        .map((violation: any) => ({
          ...violation,
          attempted_user: profileMap.get(violation.attempted_user_id),
          bound_user: profileMap.get(violation.bound_user_id),
        }))
        .filter((violation) => violation.attempted_user && violation.bound_user)

      if (userRole === "department_head" && departmentId) {
        setViolations(
          enrichedViolations.filter((violation) => violation.attempted_user?.department_id === departmentId),
        )
      } else {
        setViolations(enrichedViolations)
      }
    } catch (error) {
      console.error("Error fetching violations:", error)
      setViolations([])
      setFeedback({ kind: "error", msg: "Failed to load device violations." })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const confirmAndDelete = async () => {
    if (!confirmDialog) return

    const key =
      confirmDialog.type === "single"
        ? confirmDialog.violationId || ""
        : confirmDialog.type === "user"
          ? `user:${confirmDialog.userId}`
          : "all"

    setDeleting(key)
    setConfirmDialog(null)

    try {
      const payload =
        confirmDialog.type === "single"
          ? { violation_id: confirmDialog.violationId }
          : confirmDialog.type === "user"
            ? { user_id: confirmDialog.userId }
            : { delete_all: true }

      const response = await fetch("/api/admin/device-violations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || "Delete failed")
      }

      const result = await response.json()
      setFeedback({ kind: "success", msg: `Deleted ${result.deleted} violation record(s).` })
      await fetchViolations()
    } catch (error) {
      setFeedback({
        kind: "error",
        msg: error instanceof Error ? error.message : "Failed to delete violation records.",
      })
    } finally {
      setDeleting(null)
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-destructive" />
          <div>
            <h1 className="text-3xl font-bold">Device Security Violations</h1>
            <p className="text-muted-foreground">Monitor and investigate device sharing attempts</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void fetchViolations()} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {violations.length > 0 && userRole === "admin" && (
            <Button
              variant="destructive"
              size="sm"
              disabled={deleting === "all"}
              onClick={() => setConfirmDialog({ type: "all" })}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {deleting === "all" ? "Clearing..." : "Clear All Device Data"}
            </Button>
          )}
        </div>
      </div>

      {feedback && (
        <Alert variant={feedback.kind === "error" ? "destructive" : "default"}>
          <AlertDescription>{feedback.msg}</AlertDescription>
        </Alert>
      )}

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
                <div className="flex items-start justify-between gap-3">
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
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        Location: {violation.attempted_user?.assigned_location_name || "Unassigned"}
                      </p>
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
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        Location: {violation.bound_user?.assigned_location_name || "Unassigned"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-4 border-t">
                  <div className="flex justify-between text-sm gap-2">
                    <span className="text-muted-foreground">Device ID:</span>
                    <span className="font-mono text-xs break-all text-right">{violation.device_id}</span>
                  </div>
                  {violation.ip_address && (
                    <div className="flex justify-between text-sm gap-2">
                      <span className="text-muted-foreground">IP Address:</span>
                      <span className="font-mono text-xs break-all text-right">{violation.ip_address}</span>
                    </div>
                  )}
                </div>

                {userRole === "admin" && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
                      disabled={deleting === violation.id}
                      onClick={() => setConfirmDialog({ type: "single", violationId: violation.id })}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      {deleting === violation.id ? "Deleting..." : "Delete This Record"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
                      disabled={deleting === `user:${violation.attempted_user_id}`}
                      onClick={() =>
                        setConfirmDialog({
                          type: "user",
                          userId: violation.attempted_user_id,
                          userName: `${violation.attempted_user?.first_name} ${violation.attempted_user?.last_name}`,
                        })
                      }
                    >
                      <ShieldOff className="h-3.5 w-3.5 mr-1.5" />
                      {deleting === `user:${violation.attempted_user_id}`
                        ? "Deleting..."
                        : `Delete All for ${violation.attempted_user?.first_name}`}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!confirmDialog} onOpenChange={(open) => !open && setConfirmDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Confirm Deletion
            </DialogTitle>
            <DialogDescription>
              {confirmDialog?.type === "single" && "This will permanently delete this violation record."}
              {confirmDialog?.type === "user" &&
                `This will permanently delete ALL violation records for ${confirmDialog.userName}.`}
              {confirmDialog?.type === "all" &&
                "This will permanently delete ALL violation records in the system. This cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmAndDelete}>
              Yes, Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
