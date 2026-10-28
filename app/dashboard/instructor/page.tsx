import { StatsCard } from "@/components/dashboard/stats-card"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server"
import {
  Users,
  Clock,
  Calendar,
  TrendingUp,
  FileText,
  CheckCircle,
  XCircle,
  QrCode,
  BarChart3,
  UserCheck,
  Activity,
  MapPin,
} from "lucide-react"
import { redirect } from "next/navigation"
import Link from "next/link"

export default async function InstructorDashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  // Get user profile with error handling
  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select(`
      *,
      departments (
        id,
        name,
        code
      )
    `)
    .eq("id", user.id)
    .maybeSingle()

  if (!profile && !profileError) {
    redirect("/dashboard")
  }

  // Ensure user has instructor/department_head role
  if (profile?.role !== "department_head" && profile?.role !== "admin") {
    redirect("/dashboard")
  }

  const today = new Date().toISOString().split("T")[0]
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

  // Get department staff count
  const { count: totalStaff } = await supabase
    .from("user_profiles")
    .select("*", { count: "exact", head: true })
    .eq("department_id", profile.department_id)
    .eq("role", "staff")

  // Get today's attendance for department
  const { count: todayAttendance } = await supabase
    .from("attendance_records")
    .select(
      `
      *,
      user_profiles!inner (
        department_id
      )
    `,
      { count: "exact", head: true },
    )
    .eq("user_profiles.department_id", profile.department_id)
    .gte("check_in_time", `${today}T00:00:00`)
    .lt("check_in_time", `${today}T23:59:59`)

  // Get pending excuse duty requests
  const { count: pendingExcuses } = await supabase
    .from("excuse_duty_requests")
    .select(
      `
      *,
      user_profiles!inner (
        department_id
      )
    `,
      { count: "exact", head: true },
    )
    .eq("user_profiles.department_id", profile.department_id)
    .eq("status", "pending")

  // Get this month's attendance rate
  const { count: monthlyAttendance } = await supabase
    .from("attendance_records")
    .select(
      `
      *,
      user_profiles!inner (
        department_id
      )
    `,
      { count: "exact", head: true },
    )
    .eq("user_profiles.department_id", profile.department_id)
    .gte("check_in_time", startOfMonth)

  // Get recent excuse duty requests for review
  const { data: recentExcuses } = await supabase
    .from("excuse_duty_requests")
    .select(`
      *,
      user_profiles (
        first_name,
        last_name,
        employee_id
      )
    `)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(5)

  // Get active QR events
  const { data: activeEvents } = await supabase
    .from("qr_events")
    .select(`
      *,
      geofence_locations (
        name,
        address
      )
    `)
    .eq("is_active", true)
    .gte("event_date", today)
    .order("event_date", { ascending: true })
    .limit(3)

  // Get recent attendance records for department
  const { data: recentAttendance } = await supabase
    .from("attendance_records")
    .select(`
      *,
      user_profiles (
        first_name,
        last_name,
        employee_id
      )
    `)
    .order("check_in_time", { ascending: false })
    .limit(8)

  // Calculate attendance rate
  const currentDate = new Date().getDate()
  const expectedAttendance = (totalStaff || 0) * currentDate
  const attendanceRate = expectedAttendance > 0 ? Math.round(((monthlyAttendance || 0) / expectedAttendance) * 100) : 0

  return (
    <div className="space-y-8">
        <div className="space-y-2">
          <h1 className="text-4xl font-heading font-bold text-foreground tracking-tight">Instructor Dashboard</h1>
          <p className="text-lg text-muted-foreground font-medium">
            Welcome back,{" "}
            <span className="text-primary font-semibold">{profile?.first_name || user.email?.split("@")[0]}</span>{" "}
            {profile?.last_name || ""} • {profile?.departments?.name || "Department"}
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Total Staff"
            value={totalStaff || 0}
            description="In your department"
            icon={Users}
            variant="default"
          />

          <StatsCard
            title="Today's Attendance"
            value={`${todayAttendance || 0}/${totalStaff || 0}`}
            description="Staff present"
            icon={UserCheck}
            variant={todayAttendance && totalStaff && todayAttendance >= totalStaff * 0.8 ? "success" : "default"}
          />

          <StatsCard
            title="Pending Reviews"
            value={pendingExcuses || 0}
            description="Excuse duty requests"
            icon={FileText}
            variant={pendingExcuses && pendingExcuses > 0 ? "destructive" : "success"}
          />

          <StatsCard
            title="Monthly Rate"
            value={`${attendanceRate}%`}
            description="Department attendance"
            icon={TrendingUp}
            variant={attendanceRate >= 80 ? "success" : attendanceRate >= 60 ? "default" : "destructive"}
          />
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Quick Actions */}
          <div className="lg:col-span-1">
            <Card className="glass-effect shadow-lg border-border/50">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl font-heading font-semibold flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  Quick Actions
                </CardTitle>
                <CardDescription className="text-base">Instructor management tools</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button asChild className="w-full justify-start h-12 bg-transparent" variant="outline">
                  <Link href="/dashboard/excuse-duty-review">
                    <FileText className="h-4 w-4 mr-3" />
                    Review Excuses
                    {pendingExcuses && pendingExcuses > 0 && (
                      <Badge variant="destructive" className="ml-auto">
                        {pendingExcuses}
                      </Badge>
                    )}
                  </Link>
                </Button>
                <Button asChild className="w-full justify-start h-12 bg-transparent" variant="outline">
                  <Link href="/dashboard/qr-events">
                    <QrCode className="h-4 w-4 mr-3" />
                    Manage QR Events
                  </Link>
                </Button>
                <Button asChild className="w-full justify-start h-12 bg-transparent" variant="outline">
                  <Link href="/dashboard/reports">
                    <BarChart3 className="h-4 w-4 mr-3" />
                    View Reports
                  </Link>
                </Button>
                <Button asChild className="w-full justify-start h-12 bg-transparent" variant="outline">
                  <Link href="/dashboard/schedule">
                    <Calendar className="h-4 w-4 mr-3" />
                    Manage Schedule
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Pending Reviews */}
          <div className="lg:col-span-2">
            <Card className="glass-effect shadow-lg border-border/50">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl font-heading font-semibold flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  Pending Reviews
                  {pendingExcuses && pendingExcuses > 0 && (
                    <Badge variant="destructive" className="ml-2">
                      {pendingExcuses}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription className="text-base">Excuse duty requests awaiting approval</CardDescription>
              </CardHeader>
              <CardContent>
                {recentExcuses && recentExcuses.length > 0 ? (
                  <div className="space-y-4">
                    {recentExcuses.map((excuse) => (
                      <div
                        key={excuse.id}
                        className="flex items-center gap-4 p-4 bg-muted/30 rounded-xl border border-border/50"
                      >
                        <div className="w-3 h-3 rounded-full bg-accent animate-pulse"></div>
                        <div className="flex-1">
                          <p className="font-semibold text-foreground">
                            {excuse.user_profiles?.first_name} {excuse.user_profiles?.last_name}
                          </p>
                          <p className="text-sm text-muted-foreground font-medium">
                            {excuse.excuse_type} • {new Date(excuse.excuse_date).toLocaleDateString()}
                          </p>
                          <p className="text-xs text-muted-foreground line-clamp-2">{excuse.reason}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="h-8 px-3 bg-transparent">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Approve
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 px-3 bg-transparent">
                            <XCircle className="h-3 w-3 mr-1" />
                            Deny
                          </Button>
                        </div>
                      </div>
                    ))}
                    <div className="text-center pt-4">
                      <Button asChild variant="outline">
                        <Link href="/dashboard/excuse-duty-review">View All Reviews</Link>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-muted/30 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircle className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="text-lg font-medium text-muted-foreground">No pending reviews</p>
                    <p className="text-sm text-muted-foreground mt-2">All excuse duty requests have been processed</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Active Events and Recent Activity */}
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Active QR Events */}
          <Card className="glass-effect shadow-lg border-border/50">
            <CardHeader className="pb-6">
              <CardTitle className="text-xl font-heading font-semibold flex items-center gap-2">
                <QrCode className="h-5 w-5 text-primary" />
                Active QR Events
              </CardTitle>
              <CardDescription className="text-base">Current and upcoming events</CardDescription>
            </CardHeader>
            <CardContent>
              {activeEvents && activeEvents.length > 0 ? (
                <div className="space-y-4">
                  {activeEvents.map((event) => (
                    <div
                      key={event.id}
                      className="p-4 bg-gradient-to-br from-primary/5 to-primary/10 rounded-xl border border-primary/10"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <h3 className="font-semibold text-foreground">{event.name}</h3>
                        <Badge variant="secondary" className="bg-primary/10 text-primary">
                          Active
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">{event.description}</p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(event.event_date).toLocaleDateString()}
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {event.start_time} - {event.end_time}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        <MapPin className="h-3 w-3" />
                        {event.geofence_locations?.name || "Location TBD"}
                      </div>
                    </div>
                  ))}
                  <div className="text-center pt-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href="/dashboard/qr-events">Manage All Events</Link>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-muted/30 rounded-full flex items-center justify-center mx-auto mb-4">
                    <QrCode className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-lg font-medium text-muted-foreground">No active events</p>
                  <p className="text-sm text-muted-foreground mt-2">Create QR events for staff attendance</p>
                  <Button asChild className="mt-4" size="sm">
                    <Link href="/dashboard/qr-events">Create Event</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Department Activity */}
          <Card className="glass-effect shadow-lg border-border/50">
            <CardHeader className="pb-6">
              <CardTitle className="text-xl font-heading font-semibold flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Recent Activity
              </CardTitle>
              <CardDescription className="text-base">Latest attendance records in your department</CardDescription>
            </CardHeader>
            <CardContent>
              {recentAttendance && recentAttendance.length > 0 ? (
                <div className="space-y-4">
                  {recentAttendance.slice(0, 6).map((record) => (
                    <div
                      key={record.id}
                      className="flex items-center gap-4 p-3 bg-muted/30 rounded-lg border border-border/50"
                    >
                      <div
                        className={`w-2 h-2 rounded-full ${record.check_out_time ? "bg-primary" : "bg-accent animate-pulse"}`}
                      ></div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate">
                          {record.user_profiles?.first_name} {record.user_profiles?.last_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(record.check_in_time).toLocaleDateString()} •{" "}
                          {new Date(record.check_in_time).toLocaleTimeString()}
                        </p>
                      </div>
                      <div className={`p-1 rounded ${record.check_out_time ? "bg-primary/10" : "bg-accent/10"}`}>
                        {record.check_out_time ? (
                          <CheckCircle className="h-3 w-3 text-primary" />
                        ) : (
                          <Clock className="h-3 w-3 text-accent" />
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="text-center pt-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href="/dashboard/reports">View All Records</Link>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-muted/30 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Activity className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-lg font-medium text-muted-foreground">No recent activity</p>
                  <p className="text-sm text-muted-foreground mt-2">Staff attendance will appear here</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Department Overview */}
        <Card className="glass-effect shadow-lg border-border/50">
          <CardHeader className="pb-6">
            <CardTitle className="text-xl font-heading font-semibold flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Department Overview
            </CardTitle>
            <CardDescription className="text-base">Key metrics and performance indicators</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-4">
              <div className="text-center p-6 bg-gradient-to-br from-primary/5 to-primary/10 rounded-xl border border-primary/10">
                <div className="text-3xl font-heading font-bold text-primary mb-2">{totalStaff || 0}</div>
                <div className="text-sm font-medium text-muted-foreground">Total Staff</div>
              </div>
              <div className="text-center p-6 bg-gradient-to-br from-chart-2/5 to-chart-2/10 rounded-xl border border-chart-2/10">
                <div className="text-3xl font-heading font-bold text-chart-2 mb-2">{todayAttendance || 0}</div>
                <div className="text-sm font-medium text-muted-foreground">Present Today</div>
              </div>
              <div className="text-center p-6 bg-gradient-to-br from-chart-3/5 to-chart-3/10 rounded-xl border border-chart-3/10">
                <div className="text-3xl font-heading font-bold text-chart-3 mb-2">{attendanceRate}%</div>
                <div className="text-sm font-medium text-muted-foreground">Monthly Rate</div>
              </div>
              <div className="text-center p-6 bg-gradient-to-br from-chart-5/5 to-chart-5/10 rounded-xl border border-chart-5/10">
                <div className="text-3xl font-heading font-bold text-chart-5 mb-2">{pendingExcuses || 0}</div>
                <div className="text-sm font-medium text-muted-foreground">Pending Reviews</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
  )
}
