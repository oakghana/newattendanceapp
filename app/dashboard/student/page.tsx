import { StatsCard } from "@/components/dashboard/stats-card"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server"
import {
  Clock,
  Calendar,
  TrendingUp,
  BookOpen,
  Award,
  AlertCircle,
  Activity,
  CheckCircle,
  XCircle,
  MapPin,
  QrCode,
} from "lucide-react"
import { redirect } from "next/navigation"
import Link from "next/link"

export default async function StudentDashboardPage() {
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
        name,
        code
      )
    `)
    .eq("id", user.id)
    .maybeSingle()

  if (!profile && !profileError) {
    redirect("/dashboard")
  }

  // Get today's attendance
  const today = new Date().toISOString().split("T")[0]
  const { data: todayAttendance } = await supabase
    .from("attendance_records")
    .select("*")
    .eq("user_id", user.id)
    .gte("check_in_time", `${today}T00:00:00`)
    .lt("check_in_time", `${today}T23:59:59`)
    .maybeSingle()

  // Get this month's attendance count
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
  const { count: monthlyAttendance } = await supabase
    .from("attendance_records")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("check_in_time", startOfMonth)

  // Get recent attendance records
  const { data: recentAttendance } = await supabase
    .from("attendance_records")
    .select("*")
    .eq("user_id", user.id)
    .order("check_in_time", { ascending: false })
    .limit(5)

  // Get upcoming QR events
  const { data: upcomingEvents } = await supabase
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

  // Calculate attendance rate
  const currentDate = new Date().getDate()
  const attendanceRate = monthlyAttendance ? Math.round((monthlyAttendance / currentDate) * 100) : 0

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-4xl font-heading font-bold text-foreground tracking-tight">Staff Dashboard</h1>
        <p className="text-lg text-muted-foreground font-medium">
          Welcome back,{" "}
          <span className="text-primary font-semibold">{profile?.first_name || user.email?.split("@")[0]}</span>{" "}
          {profile?.last_name || ""}
        </p>
      </div>

      {/* Quick Status Alert */}
      {!todayAttendance && (
        <Alert className="border-accent/20 bg-accent/5 shadow-sm">
          <AlertCircle className="h-5 w-5 text-accent" />
            <AlertDescription className="flex items-center justify-between">
              <span className="text-accent font-semibold text-base">You haven't checked in today yet</span>
              <Button asChild size="sm" className="ml-4 shadow-sm hover:shadow-md transition-shadow">
                <Link href="/dashboard/attendance">
                  <Clock className="h-4 w-4 mr-2" />
                  Check In Now
                </Link>
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Stats Cards */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Today's Status"
            value={todayAttendance ? "Present" : "Not Checked In"}
            description={
              todayAttendance
                ? `Checked in at ${new Date(todayAttendance.check_in_time).toLocaleTimeString()}`
                : "Click to check in"
            }
            icon={todayAttendance ? CheckCircle : XCircle}
            variant={todayAttendance ? "success" : "default"}
          />

          <StatsCard
            title="This Month"
            value={monthlyAttendance || 0}
            description="Days attended"
            icon={Calendar}
            trend={{ value: 5, isPositive: true }}
          />

          <StatsCard
            title="Attendance Rate"
            value={`${attendanceRate}%`}
            description="Monthly average"
            icon={TrendingUp}
            variant={attendanceRate >= 80 ? "success" : attendanceRate >= 60 ? "default" : "destructive"}
          />

          <StatsCard
            title="Department"
            value={profile?.departments?.code || "N/A"}
            description={profile?.departments?.name || "No department assigned"}
            icon={BookOpen}
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
                <CardDescription className="text-base">Common staff tasks</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button asChild className="w-full justify-start h-12 bg-transparent" variant="outline">
                  <Link href="/dashboard/attendance">
                    <Clock className="h-4 w-4 mr-3" />
                    Check In/Out
                  </Link>
                </Button>
                <Button asChild className="w-full justify-start h-12 bg-transparent" variant="outline">
                  <Link href="/scan">
                    <QrCode className="h-4 w-4 mr-3" />
                    Scan QR Code
                  </Link>
                </Button>
                <Button asChild className="w-full justify-start h-12 bg-transparent" variant="outline">
                  <Link href="/dashboard/excuse-duty">
                    <Award className="h-4 w-4 mr-3" />
                    Submit Excuse
                  </Link>
                </Button>
                <Button asChild className="w-full justify-start h-12 bg-transparent" variant="outline">
                  <Link href="/dashboard/reports">
                    <TrendingUp className="h-4 w-4 mr-3" />
                    View Reports
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <div className="lg:col-span-2">
            <Card className="glass-effect shadow-lg border-border/50">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl font-heading font-semibold flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  Recent Attendance
                </CardTitle>
                <CardDescription className="text-base">Your latest attendance records</CardDescription>
              </CardHeader>
              <CardContent>
                {recentAttendance && recentAttendance.length > 0 ? (
                  <div className="space-y-4">
                    {recentAttendance.map((record) => (
                      <div
                        key={record.id}
                        className="flex items-center gap-4 p-4 bg-muted/30 rounded-xl border border-border/50"
                      >
                        <div
                          className={`w-3 h-3 rounded-full ${record.check_out_time ? "bg-primary" : "bg-accent animate-pulse"}`}
                        ></div>
                        <div className="flex-1">
                          <p className="font-semibold text-foreground">
                            {new Date(record.check_in_time).toLocaleDateString()}
                          </p>
                          <p className="text-sm text-muted-foreground font-medium">
                            In: {new Date(record.check_in_time).toLocaleTimeString()}
                            {record.check_out_time && ` • Out: ${new Date(record.check_out_time).toLocaleTimeString()}`}
                          </p>
                          {record.work_hours && (
                            <p className="text-xs text-muted-foreground">Hours: {record.work_hours}</p>
                          )}
                        </div>
                        <div className={`p-2 rounded-lg ${record.check_out_time ? "bg-primary/10" : "bg-accent/10"}`}>
                          {record.check_out_time ? (
                            <CheckCircle className="h-5 w-5 text-primary" />
                          ) : (
                            <Clock className="h-5 w-5 text-accent" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-muted/30 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Clock className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="text-lg font-medium text-muted-foreground">No attendance records yet</p>
                    <p className="text-sm text-muted-foreground mt-2">Start by checking in today</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Upcoming Events */}
        {upcomingEvents && upcomingEvents.length > 0 && (
          <Card className="glass-effect shadow-lg border-border/50">
            <CardHeader className="pb-6">
              <CardTitle className="text-xl font-heading font-semibold flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Upcoming Events
              </CardTitle>
              <CardDescription className="text-base">QR code events you can attend</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {upcomingEvents.map((event) => (
                  <div
                    key={event.id}
                    className="p-4 bg-gradient-to-br from-primary/5 to-primary/10 rounded-xl border border-primary/10"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="font-semibold text-foreground">{event.name}</h3>
                      <QrCode className="h-5 w-5 text-primary flex-shrink-0" />
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">{event.description}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {new Date(event.event_date).toLocaleDateString()}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      <MapPin className="h-3 w-3" />
                      {event.geofence_locations?.name || "Location TBD"}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      <Clock className="h-3 w-3" />
                      {event.start_time} - {event.end_time}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Performance Overview */}
        <Card className="glass-effect shadow-lg border-border/50">
          <CardHeader className="pb-6">
            <CardTitle className="text-xl font-heading font-semibold flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Performance Overview
            </CardTitle>
            <CardDescription className="text-base">Your attendance statistics and achievements</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-4">
              <div className="text-center p-6 bg-gradient-to-br from-primary/5 to-primary/10 rounded-xl border border-primary/10">
                <div className="text-3xl font-heading font-bold text-primary mb-2">{monthlyAttendance || 0}</div>
                <div className="text-sm font-medium text-muted-foreground">Days This Month</div>
              </div>
              <div className="text-center p-6 bg-gradient-to-br from-chart-2/5 to-chart-2/10 rounded-xl border border-chart-2/10">
                <div className="text-3xl font-heading font-bold text-chart-2 mb-2">{attendanceRate}%</div>
                <div className="text-sm font-medium text-muted-foreground">Attendance Rate</div>
              </div>
              <div className="text-center p-6 bg-gradient-to-br from-chart-3/5 to-chart-3/10 rounded-xl border border-chart-3/10">
                <div className="text-3xl font-heading font-bold text-chart-3 mb-2">
                  {todayAttendance?.work_hours ? Math.round(todayAttendance.work_hours) : 0}
                </div>
                <div className="text-sm font-medium text-muted-foreground">Hours Today</div>
              </div>
              <div className="text-center p-6 bg-gradient-to-br from-chart-5/5 to-chart-5/10 rounded-xl border border-chart-5/10">
                <div className="text-lg font-heading font-bold text-chart-5 mb-2">
                  {profile?.role === "staff" ? "Staff" : profile?.role || "N/A"}
                </div>
                <div className="text-sm font-medium text-muted-foreground">Status</div>
              </div>
            </div>
          </CardContent>
        </Card>
    </div>
  )
}
