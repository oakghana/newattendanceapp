"use client"

import { useEffect, useRef, useState } from "react"
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
  Bell,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { LeaveNotificationCard, type LeaveNotification } from "@/components/leave/leave-notification-card"
import { LeaveRequestDialog, type LeaveRequestData } from "@/components/leave/leave-request-dialog"
import { useToast } from "@/hooks/use-toast"

export function LeaveNotificationsClient() {
  const { toast } = useToast()
  const [userRole, setUserRole] = useState<string | null>(null)
  const [notifications, setNotifications] = useState<LeaveNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState("")
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [selectedNotifId, setSelectedNotifId] = useState<string | null>(null)
  const [newLeaveOpen, setNewLeaveOpen] = useState(false)
  const supabase = createClient()
  const previousPendingCountRef = useRef<number | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)

  const allowedRequestRoles = ["staff", "nsp", "intern", "it-admin", "regional_manager"]

  const handleLeaveSubmit = async (data: LeaveRequestData) => {
    const m = new FormData()
    m.append('start_date', data.startDate.toISOString().split('T')[0])
    m.append('end_date', data.endDate.toISOString().split('T')[0])
    m.append('reason', data.reason)
    m.append('leave_type', data.leaveType)
    if (data.documentFile) m.append('document', data.documentFile)
    if (data.isHalfDay) m.append('is_half_day', 'true')
    if (data.halfDayPeriod) m.append('half_day_period', data.halfDayPeriod)
    const resp = await fetch('/api/leave/request-leave', { method: 'POST', body: m })
    if (!resp.ok) {
      const err = await resp.json()
      throw new Error(err.error || 'Failed to submit leave request')
    }
    toast({ title: "Leave request submitted", description: "Your request was sent successfully. You can edit it before reviewer action starts." })
    await fetchNotifications()
  }

  useEffect(() => {
    fetchNotifications()
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      void fetchNotifications()
    }, 15000)
    return () => window.clearInterval(timer)
  }, [])

  const canRequestLeave = (role: string | null) => {
    const allowed = ["staff", "nsp", "intern", "it-admin", "regional_manager"]
    return role ? allowed.includes(role) : false
  }

  const fetchNotifications = async () => {
    const serialize = (v: any) => {
      try {
        return JSON.stringify(v)
      } catch {
        return String(v)
      }
    }

    try {
      setLoading(true)

      const userRes = await supabase.auth.getUser()
      const user = userRes?.data?.user
      if (userRes?.error) console.warn("supabase.auth.getUser error:", serialize(userRes.error))

      if (!user) {
        console.warn("No authenticated user returned from supabase.auth.getUser")
        setUserRole(null)
        setNotifications([])
        return
      }

      // Get user profile to determine role
      const profileRes = await supabase
        .from("user_profiles")
        .select("role")
        .eq("id", user.id)
        .single()

      if (profileRes?.error) console.warn("profile fetch error:", serialize(profileRes.error))
      const profile = profileRes?.data
      setUserRole(profile?.role || null)

      // Build query for leave requests
      // NOTE: DB column is `approved_by` so the FK constraint is `leave_requests_approved_by_fkey`.
      // The previous name `leave_requests_approver_id_fkey` caused schema-cache misses in PostgREST/Supabase.
      let query = supabase
        .from("leave_requests")
        .select(`
          *,
          user:user_profiles!user_id (
            first_name,
            last_name,
            employee_id,
            departments (
              name
            )
          ),
          approver:user_profiles!approved_by (
            first_name,
            last_name
          )
        `)
        .order("created_at", { ascending: false })

      if (profile?.role === "staff") {
        query = query.eq("user_id", user.id)
      } else if (profile?.role === "department_head") {
        // Department heads see requests from their department.
        // Step 1: resolve the department_id for this HOD.
        const deptRes = await supabase
          .from("user_profiles")
          .select("department_id")
          .eq("id", user.id)
          .single()

        if (deptRes?.error) console.warn("deptProfile fetch error:", serialize(deptRes.error))
        const deptProfile = deptRes?.data

        if (deptProfile?.department_id) {
          // Step 2: get all staff user IDs in that department, then filter leave_requests.
          // Filtering directly on the embedded join alias (e.g. "user.department_id")
          // triggers PGRST108 when PostgREST cannot resolve it, so we use .in() instead.
          const { data: deptUsers, error: deptUsersErr } = await supabase
            .from("user_profiles")
            .select("id")
            .eq("department_id", deptProfile.department_id)

          if (deptUsersErr) console.warn("deptUsers fetch error:", serialize(deptUsersErr))

          const deptUserIds = (deptUsers || []).map((u: { id: string }) => u.id)
          if (deptUserIds.length > 0) {
            query = query.in("user_id", deptUserIds)
          } else {
            // No staff in this department — return empty result
            setNotifications([])
            return
          }
        }
      }

      const { data, error } = await query
      if (error) {
        console.error("Supabase leave_requests query error:", serialize(error))

        const msg = (error && (error.message || error.details)) || ''
        const isMissingRelation = (error && (error.code === 'PGRST200')) || /Could not find a relationship/i.test(msg) || /Could not find the '\w+' column/i.test(msg)

        if (isMissingRelation) {
          // Fallback: query leave_requests without nested FK selections
          try {
            const { data: simpleData, error: simpleErr } = await supabase
              .from('leave_requests')
              .select('*')
              .order('created_at', { ascending: false })

            if (simpleErr) {
              console.error('Fallback simple leave_requests query failed:', serialize(simpleErr))
              throw simpleErr
            }

            setNotifications(simpleData || [])
            return
          } catch (fallbackError) {
            console.error('Fallback query also failed:', serialize(fallbackError))
            throw fallbackError
          }
        }

        throw error
      }

      const rows = data || []
      const pendingCount = rows.filter((row: any) => String(row?.status || "") === "pending").length
      const managerRole = ["admin", "regional_manager", "department_head"].includes(String(profile?.role || ""))

      if (
        managerRole &&
        previousPendingCountRef.current !== null &&
        pendingCount > Number(previousPendingCountRef.current)
      ) {
        try {
          if (!audioContextRef.current) audioContextRef.current = new AudioContext()
          const audioContext = audioContextRef.current
          const now = audioContext.currentTime
          const oscillator = audioContext.createOscillator()
          const gain = audioContext.createGain()

          oscillator.type = "triangle"
          oscillator.frequency.setValueAtTime(720, now)
          oscillator.frequency.exponentialRampToValueAtTime(960, now + 0.16)
          gain.gain.setValueAtTime(0.0001, now)
          gain.gain.exponentialRampToValueAtTime(0.1, now + 0.02)
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24)

          oscillator.connect(gain)
          gain.connect(audioContext.destination)
          oscillator.start(now)
          oscillator.stop(now + 0.26)
        } catch {
          // Ignore browser autoplay restrictions.
        }

        toast({
          title: "New Leave Request Alert",
          description: "A new leave request is pending your review.",
        })
      }

      previousPendingCountRef.current = pendingCount
      setNotifications(rows)
    } catch (err) {
      // provide richer console output for debugging
      if (err instanceof Error) {
        console.error("Error fetching notifications:", err.message, err.stack)
      } else {
        try {
          console.error("Error fetching notifications (non-Error):", JSON.stringify(err))
        } catch {
          console.error("Error fetching notifications (non-Error):", String(err))
        }
      }
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (id: string) => {
    setProcessingId(id)
    try {
      const { error } = await supabase
        .from("leave_requests")
        .update({
          status: "approved",
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)

      if (error) throw error

      // Refresh notifications
      await fetchNotifications()
    } catch (error) {
      console.error("Error approving request:", error)
    } finally {
      setProcessingId(null)
    }
  }

  const handleReject = async () => {
    if (!selectedNotifId || !rejectionReason.trim()) return

    setProcessingId(selectedNotifId)
    try {
      const { error } = await supabase
        .from("leave_requests")
        .update({
          status: "rejected",
          rejection_reason: rejectionReason,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedNotifId)

      if (error) throw error

      setShowRejectDialog(false)
      setRejectionReason("")
      setSelectedNotifId(null)

      // Refresh notifications
      await fetchNotifications()
    } catch (error) {
      console.error("Error rejecting request:", error)
    } finally {
      setProcessingId(null)
    }
  }

  const pendingCount = notifications.filter(n => n.status === "pending").length
  const approvedCount = notifications.filter(n => n.status === "approved").length
  const rejectedCount = notifications.filter(n => n.status === "rejected").length

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Single Request Leave button — only for eligible roles */}
      {allowedRequestRoles.includes(userRole || "") && (
        <div className="flex justify-end">
          <Button
            onClick={() => setNewLeaveOpen(true)}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 shadow-sm"
          >
            <Calendar className="h-4 w-4" />
            Request Leave
          </Button>
          <LeaveRequestDialog
            open={newLeaveOpen}
            onOpenChange={setNewLeaveOpen}
            staffName="Staff Member"
            onSubmit={handleLeaveSubmit}
          />
        </div>
      )}

      {userRole !== "staff" && pendingCount > 0 && (
        <Alert className="border-primary/20 bg-primary/5 shadow-sm">
          <AlertCircle className="h-5 w-5 text-primary" />
          <AlertDescription className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-primary font-semibold text-base">
              {pendingCount} leave request{pendingCount > 1 ? "s" : ""} awaiting approval
            </span>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{pendingCount}</div>
            <p className="text-xs text-muted-foreground">Awaiting approval</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{approvedCount}</div>
            <p className="text-xs text-muted-foreground">Approved requests</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rejected</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{rejectedCount}</div>
            <p className="text-xs text-muted-foreground">Rejected requests</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="all" className="space-y-4">
        <TabsList className="flex h-auto w-full gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 p-1.5 shadow-sm">
          <TabsTrigger
            value="all"
            className="flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition-all data-[state=active]:bg-slate-800 data-[state=active]:text-white data-[state=inactive]:text-slate-600"
          >
            All ({notifications.length})
          </TabsTrigger>
          <TabsTrigger
            value="pending"
            className="flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition-all data-[state=active]:bg-amber-500 data-[state=active]:text-white data-[state=inactive]:text-amber-700"
          >
            Pending ({pendingCount})
          </TabsTrigger>
          <TabsTrigger
            value="approved"
            className="flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition-all data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=inactive]:text-emerald-700"
          >
            Approved ({approvedCount})
          </TabsTrigger>
          <TabsTrigger
            value="rejected"
            className="flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition-all data-[state=active]:bg-red-500 data-[state=active]:text-white data-[state=inactive]:text-red-600"
          >
            Rejected ({rejectedCount})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          {notifications.length === 0 ? (
            <Card className="text-center py-12">
              <CardContent>
                <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg font-medium text-muted-foreground">No leave notifications</p>
                <p className="text-sm text-muted-foreground">Leave requests will appear here</p>
              </CardContent>
            </Card>
          ) : (
            notifications.map((notification) => (
              <LeaveNotificationCard
                key={notification.id}
                notification={notification}
                userRole={userRole}
                onApprove={handleApprove}
                onReject={(id) => {
                  setSelectedNotifId(id)
                  setShowRejectDialog(true)
                }}
                processingId={processingId}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="pending" className="space-y-4">
          {notifications.filter(n => n.status === "pending").length === 0 ? (
            <Card className="text-center py-12">
              <CardContent>
                <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg font-medium text-muted-foreground">No pending requests</p>
              </CardContent>
            </Card>
          ) : (
            notifications
              .filter(n => n.status === "pending")
              .map((notification) => (
                <LeaveNotificationCard
                  key={notification.id}
                  notification={notification}
                  userRole={userRole}
                  onApprove={handleApprove}
                  onReject={(id) => {
                    setSelectedNotifId(id)
                    setShowRejectDialog(true)
                  }}
                  processingId={processingId}
                />
              ))
          )}
        </TabsContent>

        <TabsContent value="approved" className="space-y-4">
          {notifications.filter(n => n.status === "approved").length === 0 ? (
            <Card className="text-center py-12">
              <CardContent>
                <CheckCircle2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg font-medium text-muted-foreground">No approved requests</p>
              </CardContent>
            </Card>
          ) : (
            notifications
              .filter(n => n.status === "approved")
              .map((notification) => (
                <LeaveNotificationCard
                  key={notification.id}
                  notification={notification}
                  userRole={userRole}
                  onApprove={handleApprove}
                  onReject={(id) => {
                    setSelectedNotifId(id)
                    setShowRejectDialog(true)
                  }}
                  processingId={processingId}
                />
              ))
          )}
        </TabsContent>

        <TabsContent value="rejected" className="space-y-4">
          {notifications.filter(n => n.status === "rejected").length === 0 ? (
            <Card className="text-center py-12">
              <CardContent>
                <XCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg font-medium text-muted-foreground">No rejected requests</p>
              </CardContent>
            </Card>
          ) : (
            notifications
              .filter(n => n.status === "rejected")
              .map((notification) => (
                <LeaveNotificationCard
                  key={notification.id}
                  notification={notification}
                  userRole={userRole}
                  onApprove={handleApprove}
                  onReject={(id) => {
                    setSelectedNotifId(id)
                    setShowRejectDialog(true)
                  }}
                  processingId={processingId}
                />
              ))
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Leave Request</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this leave request.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="Reason for rejection..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleReject}
                disabled={!rejectionReason.trim() || processingId === selectedNotifId}
              >
                {processingId === selectedNotifId ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Reject Request
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
