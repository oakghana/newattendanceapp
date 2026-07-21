"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { RequestLeaveButton } from "@/components/leave/request-leave-button"
import { CheckCircle2, Clock, Users, AlertCircle, Loader2, Download } from "lucide-react"

interface StaffRequest {
  id: string
  user_id: string
  staff_name: string
  staff_id: string
  department: string
  start_date: string
  end_date: string
  reason: string
  leave_type: string
  status: string
  created_at: string
}

interface Stats {
  pending: number
  approved: number
}

export function HrExecutiveLeaveCenter() {
  const [myRequests, setMyRequests] = useState<StaffRequest[]>([])
  const [staffRequests, setStaffRequests] = useState<StaffRequest[]>([])
  const [stats, setStats] = useState<Stats>({ pending: 0, approved: 0 })
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("staff-requests")

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        // Fetch staff requests needing approval
        const res = await fetch("/api/leave/hr-staff-pending-requests")
        if (res.ok) {
          const data = await res.json()
          setStaffRequests(data.requests || [])
          setStats(data.stats || { pending: 0, approved: 0 })
        }

        // Fetch user's own leave requests
        const myRes = await fetch("/api/leave/staff-requests")
        if (myRes.ok) {
          const myData = await myRes.json()
          setMyRequests(Array.isArray(myData) ? myData : [])
        }
      } catch (error) {
        console.error("[v0] Error fetching leave data:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const calculateDays = (start: string, end: string) => {
    if (!start || !end) return 0
    const s = new Date(start)
    const e = new Date(end)
    const diffTime = Math.abs(e.getTime() - s.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
    return diffDays
  }

  const getStatusBadge = (status: string) => {
    const mapping: Record<string, { variant: any; label: string }> = {
      submitted: { variant: "secondary", label: "Submitted" },
      pending_hod_review: { variant: "outline", label: "Pending HOD Review" },
      pending_hr_decision: { variant: "outline", label: "Pending Your Review" },
      approved: { variant: "default", label: "Approved" },
      rejected: { variant: "destructive", label: "Rejected" },
    }
    const item = mapping[status] || { variant: "secondary", label: status }
    return <Badge variant={item.variant as any}>{item.label}</Badge>
  }

  const getLeaveTypeBadge = (type: string) => {
    const mapping: Record<string, string> = {
      annual: "Annual Leave",
      sick: "Sick Leave",
      compassionate: "Compassionate Leave",
      study: "Study Leave",
      maternity: "Maternity Leave",
      paternity: "Paternity Leave",
    }
    return mapping[type] || type
  }

  return (
    <div className="space-y-6">
      {/* Header with Apply Button */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Leave Center</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your leave requests and approve staff applications
          </p>
        </div>
        <RequestLeaveButton />
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-orange-600" />
              Pending Approvals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.pending}</div>
            <p className="text-xs text-muted-foreground mt-1">Staff requests awaiting decision</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Approved This Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.approved}</div>
            <p className="text-xs text-muted-foreground mt-1">Requests you approved</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-600" />
              My Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{myRequests.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Your leave applications</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="staff-requests" className="gap-2">
            <Users className="h-4 w-4" />
            <span>Staff Requests ({staffRequests.length})</span>
          </TabsTrigger>
          <TabsTrigger value="my-requests" className="gap-2">
            <Clock className="h-4 w-4" />
            <span>My Requests ({myRequests.length})</span>
          </TabsTrigger>
        </TabsList>

        {/* Staff Requests Tab */}
        <TabsContent value="staff-requests" className="space-y-4">
          {loading ? (
            <Card>
              <CardContent className="py-12 flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading staff requests...
              </CardContent>
            </Card>
          ) : staffRequests.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500/30" />
                <p>No pending leave requests from your department</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {staffRequests.map((req) => (
                <Card key={req.id} className="hover:border-primary/50 transition-colors">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <CardTitle className="text-base">{req.staff_name}</CardTitle>
                        <CardDescription className="text-xs">
                          {req.staff_id} • {req.leave_type && getLeaveTypeBadge(req.leave_type)}
                        </CardDescription>
                      </div>
                      {getStatusBadge(req.status)}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">From</p>
                        <p className="font-medium">
                          {new Date(req.start_date).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "2-digit",
                          })}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">To</p>
                        <p className="font-medium">
                          {new Date(req.end_date).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "2-digit",
                          })}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Days</p>
                        <p className="font-medium">{calculateDays(req.start_date, req.end_date)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Submitted</p>
                        <p className="font-medium">
                          {new Date(req.created_at).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                          })}
                        </p>
                      </div>
                    </div>
                    {req.reason && (
                      <div className="bg-muted/30 rounded p-2 text-sm">
                        <p className="text-muted-foreground text-xs mb-1">Reason</p>
                        <p>{req.reason}</p>
                      </div>
                    )}
                    <div className="flex gap-2 pt-2">
                      <Button size="sm" variant="default" className="flex-1">
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                        Approve
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1">
                        Defer
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* My Requests Tab */}
        <TabsContent value="my-requests" className="space-y-4">
          {loading ? (
            <Card>
              <CardContent className="py-12 flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading your requests...
              </CardContent>
            </Card>
          ) : myRequests.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Clock className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
                <p className="text-muted-foreground mb-4">No leave requests yet</p>
                <RequestLeaveButton />
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {myRequests.map((req) => (
                <Card key={req.id} className="hover:border-primary/50 transition-colors">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <CardTitle className="text-base">
                          {req.leave_type && getLeaveTypeBadge(req.leave_type)}
                        </CardTitle>
                        <CardDescription className="text-xs">
                          {new Date(req.start_date).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                          {" — "}
                          {new Date(req.end_date).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </CardDescription>
                      </div>
                      {getStatusBadge(req.status)}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-sm">{calculateDays(req.start_date, req.end_date)} days requested</p>
                    {req.reason && <p className="text-sm text-muted-foreground">{req.reason}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
