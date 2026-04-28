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
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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

export function LeaveNotificationsClient() {
  const [userRole, setUserRole] = useState<string | null>(null)
  const [notifications, setNotifications] = useState<LeaveNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState("")
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [selectedNotifId, setSelectedNotifId] = useState<string | null>(null)
  const [newLeaveOpen, setNewLeaveOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [formData, setFormData] = useState({
    start_date: "",
    end_date: "",
    leave_type: "annual",
    reason: "",
  })
  const supabase = createClient()

  const allowedRequestRoles = ["staff", "nsp", "intern", "it-admin", "regional_manager"]

  const submitNewLeave = async () => {
    if (!formData.start_date || !formData.end_date || !formData.reason) {
      alert("Please fill in all required fields")
      return
    }
    if (new Date(formData.start_date) >= new Date(formData.end_date)) {
      alert("End date must be after start date")
      return
    }

    setSubmitting(true)
    try {
      const m = new FormData()
      m.append('start_date', formData.start_date)
      m.append('end_date', formData.end_date)
      m.append('reason', formData.reason)
      m.append('leave_type', formData.leave_type)
      if (uploadedFile) m.append('document', uploadedFile)

      const resp = await fetch('/api/leave/request-leave', { method: 'POST', body: m })
      if (resp.ok) {
        setFormData({ start_date: '', end_date: '', leave_type: 'annual', reason: '' })
        setUploadedFile(null)
        setNewLeaveOpen(false)
        await fetchNotifications()
      } else {
        const err = await resp.json()
        alert(err.error || 'Failed to submit leave request')
      }
    } catch (e) {
      console.error('Error submitting leave:', e)
      alert('Failed to submit leave request')
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(() => {
    fetchNotifications()
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

      setNotifications(data || [])
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
      <>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
        {canRequestLeave(userRole) && (
          <div className="flex items-center justify-end mt-2">
            <Dialog open={newLeaveOpen} onOpenChange={setNewLeaveOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Calendar className="h-4 w-4" />
                  Request Leave
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Request Leave</DialogTitle>
                  <DialogDescription>Submit a new leave request for approval by your manager</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="leave_type">Leave Type</Label>
                    <Select value={formData.leave_type} onValueChange={(value) => setFormData({ ...formData, leave_type: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="annual">Annual Leave</SelectItem>
                        <SelectItem value="sick">Sick Leave</SelectItem>
                        <SelectItem value="maternity">Maternity Leave</SelectItem>
                        <SelectItem value="paternity">Paternity Leave</SelectItem>
                        <SelectItem value="unpaid">Unpaid Leave</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="start_date">Start Date</Label>
                    <Input id="start_date" type="date" value={formData.start_date} onChange={(e) => setFormData({ ...formData, start_date: e.target.value })} />
                  </div>

                  <div>
                    <Label htmlFor="end_date">End Date</Label>
                    <Input id="end_date" type="date" value={formData.end_date} onChange={(e) => setFormData({ ...formData, end_date: e.target.value })} />
                  </div>

                  <div>
                    <Label htmlFor="reason">Reason</Label>
                    <Textarea id="reason" placeholder="Provide a reason for your leave request..." value={formData.reason} onChange={(e) => setFormData({ ...formData, reason: e.target.value })} rows={4} />
                  </div>

                  <div>
                    <Label htmlFor="document">Attachment (Optional)</Label>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Input id="document" type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            if (file.size > 5 * 1024 * 1024) {
                              alert("File size must be less than 5MB")
                              return
                            }
                            setUploadedFile(file)
                          }
                        }} className="hidden" />
                        <Button type="button" variant="outline" onClick={() => document.getElementById("document")?.click()} className="w-full gap-2">
                          Upload Document
                        </Button>
                      </div>
                      {uploadedFile && (
                        <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                          <span className="text-sm text-muted-foreground flex-1 truncate">{uploadedFile.name}</span>
                          <Button type="button" variant="ghost" size="sm" onClick={() => setUploadedFile(null)} className="h-6 w-6 p-0">X</Button>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">Upload supporting documents (Max 5MB)</p>
                    </div>
                  </div>

                  <Button onClick={async () => {
                    if (!formData.start_date || !formData.end_date || !formData.reason) {
                      alert("Please fill in all required fields")
                      return
                    }
                    if (new Date(formData.start_date) >= new Date(formData.end_date)) {
                      alert("End date must be after start date")
                      return
                    }
                    setSubmitting(true)
                    try {
                      const m = new FormData()
                      m.append('start_date', formData.start_date)
                      m.append('end_date', formData.end_date)
                      m.append('reason', formData.reason)
                      m.append('leave_type', formData.leave_type)
                      if (uploadedFile) m.append('document', uploadedFile)

                      const resp = await fetch('/api/leave/request-leave', { method: 'POST', body: m })
                      if (resp.ok) {
                        setFormData({ start_date: '', end_date: '', leave_type: 'annual', reason: '' })
                        setUploadedFile(null)
                        setNewLeaveOpen(false)
                        await fetchNotifications()
                      } else {
                        const err = await resp.json()
                        alert(err.error || 'Failed to submit leave request')
                      }
                    } catch (e) {
                      console.error('Error submitting leave:', e)
                      alert('Failed to submit leave request')
                    } finally {
                      setSubmitting(false)
                    }
                  }} disabled={submitting} className="w-full gap-2">
                    {submitting ? (<Loader2 className="h-4 w-4 animate-spin" />) : 'Submit Request'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </>
    )
  }

  return (
      <div className="space-y-8">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Bell className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl sm:text-4xl font-heading font-bold text-foreground tracking-tight">
              Leave Notifications
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground font-medium">
              Manage leave requests and notifications
            </p>
          </div>
              {allowedRequestRoles.includes(userRole || "") && (
                <div className="ml-auto">
                  <Dialog open={newLeaveOpen} onOpenChange={setNewLeaveOpen}>
                    <DialogTrigger asChild>
                      <Button className="gap-2">
                        <Calendar className="h-4 w-4" />
                        Request Leave
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Request Leave</DialogTitle>
                        <DialogDescription>Submit a new leave request for approval by your manager</DialogDescription>
                      </DialogHeader>

                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="leave_type">Leave Type</Label>
                          <Select value={formData.leave_type} onValueChange={(value) => setFormData({ ...formData, leave_type: value })}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="annual">Annual Leave</SelectItem>
                              <SelectItem value="sick">Sick Leave</SelectItem>
                              <SelectItem value="maternity">Maternity Leave</SelectItem>
                              <SelectItem value="paternity">Paternity Leave</SelectItem>
                              <SelectItem value="unpaid">Unpaid Leave</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label htmlFor="start_date">Start Date</Label>
                          <Input id="start_date" type="date" value={formData.start_date} onChange={(e) => setFormData({ ...formData, start_date: e.target.value })} />
                        </div>

                        <div>
                          <Label htmlFor="end_date">End Date</Label>
                          <Input id="end_date" type="date" value={formData.end_date} onChange={(e) => setFormData({ ...formData, end_date: e.target.value })} />
                        </div>

                        <div>
                          <Label htmlFor="reason">Reason</Label>
                          <Textarea id="reason" placeholder="Provide a reason for your leave request..." value={formData.reason} onChange={(e) => setFormData({ ...formData, reason: e.target.value })} rows={4} />
                        </div>

                        <div>
                          <Label htmlFor="document">Attachment (Optional)</Label>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Input id="document" type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (file) {
                                  if (file.size > 5 * 1024 * 1024) {
                                    alert("File size must be less than 5MB")
                                    return
                                  }
                                  setUploadedFile(file)
                                }
                              }} className="hidden" />
                              <Button type="button" variant="outline" onClick={() => document.getElementById("document")?.click()} className="w-full gap-2">Upload Document</Button>
                            </div>
                            {uploadedFile && (
                              <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                                <span className="text-sm text-muted-foreground flex-1 truncate">{uploadedFile.name}</span>
                                <Button type="button" variant="ghost" size="sm" onClick={() => setUploadedFile(null)} className="h-6 w-6 p-0">X</Button>
                              </div>
                            )}
                            <p className="text-xs text-muted-foreground">Upload supporting documents (Max 5MB)</p>
                          </div>
                        </div>

                        <Button onClick={submitNewLeave} disabled={submitting} className="w-full gap-2">
                          {submitting ? (<Loader2 className="h-4 w-4 animate-spin" />) : 'Submit Request'}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              )}
            {canRequestLeave(userRole) && (
              <div className="ml-auto">
                <Dialog open={newLeaveOpen} onOpenChange={setNewLeaveOpen}>
                  <DialogTrigger asChild>
                    <Button className="gap-2">
                      <Calendar className="h-4 w-4" />
                      Request Leave
                    </Button>
                  </DialogTrigger>
                </Dialog>
              </div>
            )}
        </div>
      </div>

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

      <Tabs defaultValue="all" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 h-12 p-1 bg-muted/50 rounded-xl">
          <TabsTrigger value="all" className="font-semibold">
            All ({notifications.length})
          </TabsTrigger>
          <TabsTrigger value="pending" className="font-semibold">
            Pending ({pendingCount})
          </TabsTrigger>
          <TabsTrigger value="approved" className="font-semibold">
            Approved ({approvedCount})
          </TabsTrigger>
          <TabsTrigger value="rejected" className="font-semibold">
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