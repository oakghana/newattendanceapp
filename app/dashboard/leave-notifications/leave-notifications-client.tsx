"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import {
  Calendar,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Users,
  Bell,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { LeaveNotificationCard, type LeaveNotification } from "@/components/leave/leave-notification-card"

interface LeaveNotificationsClientProps {
  userRole: string | null
}

export function LeaveNotificationsClient({ userRole }: LeaveNotificationsClientProps) {
  const [notifications, setNotifications] = useState<LeaveNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState("")
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [selectedNotifId, setSelectedNotifId] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    fetchNotifications()
  }, [])

  const fetchNotifications = async () => {
    try {
      console.log("Fetching notifications...")

      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser()

      if (userError) {
        console.error("Auth error:", userError)
        throw new Error(`Authentication error: ${userError.message}`)
      }

      if (!user) {
        console.log("No authenticated user found")
        return
      }

      // First try a simple query to check if table access works
      const { data: simpleData, error: simpleError } = await supabase
        .from("leave_notifications")
        .select("id, created_at")
        .limit(1)

      if (simpleError) {
        console.error("Simple query error:", simpleError)
        // Avoid throwing here to prevent client chunk/runtime failures.
        // Log and bail out gracefully so the page can render an informative UI.
        setLoading(false)
        return
      }

      console.log("Simple query successful, found", simpleData?.length || 0, "notifications")

      const { data, error } = await supabase
        .from("leave_notifications")
        .select(`
          *,
          leave_request:leave_requests (
            id,
            start_date,
            end_date,
            reason,
            status,
            created_at,
            user:user_profiles (
              id,
              first_name,
              last_name,
              employee_id,
              departments (
                name
              )
            )
          )
        `)
        .order("created_at", { ascending: false })

      if (error) {
        // Log raw object (may appear empty in console for certain prototypes)
        try { console.error("Database query error (raw):", error) } catch {}

        // Build a robust dump including non-enumerable and prototype keys
        const dump: Record<string, unknown> = {}
        try {
          const seen = new Set<any>()
          let obj: any = error
          while (obj && obj !== Object.prototype && !seen.has(obj)) {
            seen.add(obj)
            Reflect.ownKeys(obj).forEach((key) => {
              const k = String(key)
              if (k in dump) return
              try {
                const v = (error as any)[key]
                dump[k] = (v === undefined || typeof v === 'function') ? String(v) : v
              } catch {
                dump[k] = 'unreadable'
              }
            })
            obj = Object.getPrototypeOf(obj)
          }
        } catch (e) {
          try { dump._dump_error = String(e) } catch {}
        }

        try { console.error("Database query error (dump):", dump) } catch {}
        try { console.error("Database query error (string):", String(error)) } catch {}

        // Bail out gracefully so UI can render; developer can inspect the console dump above.
        setLoading(false)
        return
      }

      console.log("Fetched notifications:", data?.length || 0, "items")
      setNotifications(data || [])
    } catch (error) {
      const details = error instanceof Error
        ? { message: error.message, stack: error.stack }
        : (() => {
            try { return JSON.parse(JSON.stringify(error, Object.getOwnPropertyNames(error))) } catch { return String(error) }
          })()

      console.error("Error fetching notifications:", details)
      // Continue without throwing to avoid breaking the client UI
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (notificationId: string) => {
    setProcessingId(notificationId)
    try {
      const response = await fetch("/api/leave/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          notificationId,
        }),
      })

      if (response.ok) {
        await fetchNotifications()
      }
    } catch (error) {
      console.error("Error approving leave:", error)
    } finally {
      setProcessingId(null)
    }
  }

  const handleReject = async () => {
    if (!selectedNotifId) return

    if (!rejectionReason.trim()) {
      return
    }

    setProcessingId(selectedNotifId)
    try {
      const response = await fetch("/api/leave/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject",
          notificationId: selectedNotifId,
          reason: rejectionReason.trim(),
        }),
      })

      if (response.ok) {
        await fetchNotifications()
        setShowRejectDialog(false)
        setRejectionReason("")
        setSelectedNotifId(null)
      }
    } catch (error) {
      console.error("Error rejecting leave:", error)
    } finally {
      setProcessingId(null)
    }
  }

  const handleDismiss = async (notificationId: string) => {
    setProcessingId(notificationId)
    try {
      const response = await fetch("/api/leave/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "dismiss",
          notificationId,
        }),
      })

      if (response.ok) {
        await fetchNotifications()
      }
    } catch (error) {
      console.error("Error dismissing notification:", error)
    } finally {
      setProcessingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading leave notifications...</p>
        </div>
      </div>
    )
  }

  if (!["admin", "regional_manager", "department_head"].includes(userRole || "")) {
    return (
      <Alert className="border-amber-200 bg-amber-50">
        <AlertCircle className="h-5 w-5 text-amber-600" />
        <AlertDescription className="text-amber-800">
          You don't have permission to manage leave notifications. Only admins, regional managers, and department heads can access this page.
        </AlertDescription>
      </Alert>
    )
  }

  const pendingNotifications = notifications.filter(n => n.status === "pending")
  const approvedNotifications = notifications.filter(n => n.status === "approved")
  const rejectedNotifications = notifications.filter(n => n.status === "rejected")

  const roleBadge = {
    admin: { label: "Administrator", color: "bg-red-100 text-red-800 border-red-200" },
    regional_manager: { label: "Regional Manager", color: "bg-blue-100 text-blue-800 border-blue-200" },
    department_head: { label: "Department Head", color: "bg-green-100 text-green-800 border-green-200" },
  }

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Bell className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-4xl font-heading font-bold text-foreground tracking-tight">
              Leave Notifications
            </h1>
            <p className="text-lg text-muted-foreground font-medium mt-1">
              Manage leave requests from your team
            </p>
          </div>
          <Badge className={`ml-auto ${roleBadge[userRole as keyof typeof roleBadge]?.color || ""} border font-semibold`}>
            {roleBadge[userRole as keyof typeof roleBadge]?.label}
          </Badge>
        </div>
      </div>

      {notifications.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-12 pb-12">
              <div className="text-center">
                <div className="w-16 h-16 bg-muted/30 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Bell className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-lg font-medium text-muted-foreground">No leave notifications</p>
                <p className="text-sm text-muted-foreground mt-2">
                  All leave requests have been processed or there are currently no pending requests.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="pending" className="w-full">
            <TabsList className="grid w-full grid-cols-3 lg:w-fit">
              <TabsTrigger className="flex items-center gap-2" value="pending">
                <Clock className="h-4 w-4" />
                <span className="hidden sm:inline">Pending</span>
                {pendingNotifications.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {pendingNotifications.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger className="flex items-center gap-2" value="approved">
                <CheckCircle2 className="h-4 w-4" />
                <span className="hidden sm:inline">Approved</span>
                {approvedNotifications.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {approvedNotifications.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger className="flex items-center gap-2" value="rejected">
                <XCircle className="h-4 w-4" />
                <span className="hidden sm:inline">Rejected</span>
                {rejectedNotifications.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {rejectedNotifications.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <div className="mt-6">
              <TabsContent value="pending" className="space-y-4">
                {pendingNotifications.length === 0 ? (
                  <Card className="border-0 shadow-sm">
                    <CardContent className="pt-12 pb-12">
                      <div className="text-center">
                        <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground">No pending leave requests</p>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4">
                    {pendingNotifications.map((notif) => (
                      <LeaveNotificationCard
                        key={notif.id}
                        notification={notif}
                        isManager={true}
                        onApprove={() => handleApprove(notif.id)}
                        onReject={() => {
                          setSelectedNotifId(notif.id)
                          setShowRejectDialog(true)
                        }}
                        onDismiss={handleDismiss}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="approved" className="space-y-4">
                {approvedNotifications.length === 0 ? (
                  <Card className="border-0 shadow-sm">
                    <CardContent className="pt-12 pb-12">
                      <div className="text-center">
                        <CheckCircle2 className="h-8 w-8 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground">No approved leave requests</p>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4">
                    {approvedNotifications.map((notif) => (
                      <LeaveNotificationCard
                        key={notif.id}
                        notification={notif}
                        isManager={true}
                        onDismiss={handleDismiss}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="rejected" className="space-y-4">
                {rejectedNotifications.length === 0 ? (
                  <Card className="border-0 shadow-sm">
                    <CardContent className="pt-12 pb-12">
                      <div className="text-center">
                        <XCircle className="h-8 w-8 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground">No rejected leave requests</p>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4">
                    {rejectedNotifications.map((notif) => (
                      <LeaveNotificationCard
                        key={notif.id}
                        notification={notif}
                        isManager={true}
                        onDismiss={handleDismiss}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>
        )}

      <Dialog
        open={showRejectDialog}
        onOpenChange={(open) => {
          setShowRejectDialog(open)
          if (!open) {
            setSelectedNotifId(null)
            setRejectionReason("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Leave Request</DialogTitle>
            <DialogDescription>
              Provide a clear reason so the staff member can correct and resubmit if needed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Enter rejection reason"
              rows={4}
            />
            {!rejectionReason.trim() ? (
              <p className="text-xs text-amber-700">Rejection reason is required.</p>
            ) : null}
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowRejectDialog(false)
                setSelectedNotifId(null)
                setRejectionReason("")
              }}
              disabled={!!processingId}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleReject()}
              disabled={!!processingId || !rejectionReason.trim()}
            >
              {processingId ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reject Request"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}