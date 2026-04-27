import { StatsCard } from "@/components/dashboard/stats-card"
import { QuickActions } from "@/components/dashboard/quick-actions"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import {
  Clock,
  Calendar,
  Users,
  TrendingUp,
  UserCheck,
  AlertCircle,
  Activity,
  Home,
  Target,
  Award,
  Timer,
  CheckCircle2,
  BarChart3,
  Zap,
  Star
} from "lucide-react"
import Link from "next/link"
import RequestLeaveButtonWrapper from "@/components/leave/request-leave-button-client"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { GPSStatusBanner } from "@/components/attendance/gps-status-banner"
import { SecurityHealthCard } from "@/components/admin/security-health-card"

export const metadata = {
  title: "Dashboard | QCC Electronic Attendance",
  description: "Your modern dashboard with comprehensive attendance metrics and insights",
}

// This route uses `cookies()` via `createClient()` and therefore must be
// server-rendered dynamically. Explicitly force dynamic rendering so the
// build step does not attempt static prerendering.
export const dynamic = "force-dynamic"
export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  try {
    // Get current date info
    const today = new Date()
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    const startOfYear = new Date(today.getFullYear(), 0, 1)
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
    const currentDay = today.getDate()

    // Parallel fetch for better performance
    const [
      profileResult,
      todayAttendanceResult,
      monthlyAttendanceResult,
      yearlyAttendanceResult,
      leaveRequestsResult,
      notificationsResult
    ] = await Promise.all([
      supabase
        .from("user_profiles")
        .select(`id, first_name, last_name, role, departments (name, code)`)
        .eq("id", user.id)
        .single(),
      supabase
        .from("attendance_records")
        .select("id, check_in_time, check_out_time, work_hours, status")
        .eq("user_id", user.id)
        .gte("check_in_time", `${today.toISOString().split("T")[0]}T00:00:00`)
        .lt("check_in_time", `${today.toISOString().split("T")[0]}T23:59:59`)
        .maybeSingle(),
      supabase
        .from("attendance_records")
        .select("work_hours, status, check_in_time")
        .eq("user_id", user.id)
        .gte("check_in_time", startOfMonth.toISOString()),
      supabase
        .from("attendance_records")
        .select("work_hours, status, check_in_time")
        .eq("user_id", user.id)
        .gte("check_in_time", startOfYear.toISOString()),
      supabase
        .from("leave_requests")
        .select("id, status, start_date, end_date")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("staff_notifications")
        .select("id, title, message, is_read, created_at")
        .eq("user_id", user.id)
        .eq("is_read", false)
        .order("created_at", { ascending: false })
        .limit(3)
    ])

    const profile = profileResult.data
    const todayAttendance = todayAttendanceResult.data
    const monthlyAttendance = monthlyAttendanceResult.data || []
    const yearlyAttendance = yearlyAttendanceResult.data || []
    const leaveRequests = leaveRequestsResult.data || []
    const notifications = notificationsResult.data || []

    // Calculate comprehensive metrics
    const monthlyStats = {
      totalDays: monthlyAttendance.length,
      presentDays: monthlyAttendance.filter(r => r.status === 'present').length,
      lateDays: monthlyAttendance.filter(r => r.status === 'late').length,
      totalHours: monthlyAttendance.reduce((sum, r) => sum + (r.work_hours || 0), 0),
      avgHours: monthlyAttendance.length > 0 ? monthlyAttendance.reduce((sum, r) => sum + (r.work_hours || 0), 0) / monthlyAttendance.length : 0
    }

    const yearlyStats = {
      totalDays: yearlyAttendance.length,
      presentDays: yearlyAttendance.filter(r => r.status === 'present').length,
      totalHours: yearlyAttendance.reduce((sum, r) => sum + (r.work_hours || 0), 0),
      avgHours: yearlyAttendance.length > 0 ? yearlyAttendance.reduce((sum, r) => sum + (r.work_hours || 0), 0) / yearlyAttendance.length : 0
    }

    const attendanceRate = currentDay > 0 ? Math.round((monthlyStats.presentDays / currentDay) * 100) : 0
    const monthlyTarget = Math.round((daysInMonth * 0.95)) // 95% attendance target
    const progressToTarget = Math.min((monthlyStats.presentDays / monthlyTarget) * 100, 100)

    // Only fetch pending approvals for admins
    let pendingApprovals = 0
    if (profile?.role === "admin") {
      const { count } = await supabase
        .from("user_profiles")
        .select("*", { count: "exact", head: true })
        .eq("is_active", false)
      pendingApprovals = count || 0
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
        <div className="space-y-8 p-6 lg:p-8">
          {/* Welcome Header */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-white/80 via-white/60 to-white/40 dark:from-slate-900/80 dark:via-slate-800/60 dark:to-slate-700/40 backdrop-blur-xl border border-white/20 dark:border-slate-700/20 shadow-2xl">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-purple-500/5 to-pink-500/5"></div>
            <div className="relative p-8 lg:p-12">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="p-4 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-2xl border border-blue-500/20">
                      <Home className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <h1 className="text-4xl lg:text-5xl font-bold bg-gradient-to-r from-slate-900 via-slate-700 to-slate-600 dark:from-white dark:via-slate-200 dark:to-slate-400 bg-clip-text text-transparent">
                        Welcome back
                      </h1>
                      <p className="text-xl text-slate-600 dark:text-slate-300 font-medium">
                        {profile?.first_name || user?.email?.split("@")[0]} {profile?.last_name || ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <div className="flex items-center gap-2 px-4 py-2 bg-white/60 dark:bg-slate-800/60 rounded-full border border-white/40 dark:border-slate-700/40 backdrop-blur-sm">
                      <Users className="h-4 w-4 text-blue-600" />
                      <span className="font-medium">{profile?.departments?.name || "No Department"}</span>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2 bg-white/60 dark:bg-slate-800/60 rounded-full border border-white/40 dark:border-slate-700/40 backdrop-blur-sm">
                      <Star className="h-4 w-4 text-purple-600" />
                      <span className="font-medium capitalize">{profile?.role || "Staff"}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="text-right">
                    <div className="text-3xl font-bold text-slate-900 dark:text-white">
                      {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </div>
                    <div className="text-slate-600 dark:text-slate-400">
                      {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* GPS Status Banner */}
          <GPSStatusBanner />

          {/* Admin Security Health */}
          {profile?.role === "admin" && (
            <div className="max-w-sm">
              <SecurityHealthCard />
            </div>
          )}

          {/* Admin Alert */}
          {profile?.role === "admin" && pendingApprovals > 0 && (
            <Alert className="rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/50 dark:to-orange-950/50 border-amber-200 dark:border-amber-800 shadow-lg backdrop-blur-sm">
              <AlertCircle className="h-6 w-6 text-amber-600" />
              <AlertDescription className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <span className="text-amber-800 dark:text-amber-200 font-semibold text-lg">
                    {pendingApprovals} user{pendingApprovals > 1 ? "s" : ""} awaiting approval
                  </span>
                  <p className="text-amber-700 dark:text-amber-300 mt-1">Review and activate new user accounts</p>
                </div>
                <Button asChild size="lg" className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-lg hover:shadow-xl transition-all duration-300">
                  <Link href="/dashboard/user-approvals">
                    <UserCheck className="h-5 w-5 mr-2" />
                    Review Now
                  </Link>
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Key Metrics Grid */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <StatsCard
              title="Today's Status"
              value={todayAttendance ? "Checked In" : "Not Checked In"}
              description={
                todayAttendance
                  ? `At ${new Date(todayAttendance.check_in_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
                  : "Ready to check in"
              }
              icon={todayAttendance ? CheckCircle2 : Clock}
              variant={todayAttendance ? "success" : "default"}
              className="bg-gradient-to-br from-white/80 to-white/40 dark:from-slate-900/80 dark:to-slate-800/40 backdrop-blur-xl border-white/20 dark:border-slate-700/20"
            />

            <StatsCard
              title="Monthly Attendance"
              value={`${monthlyStats.presentDays}/${currentDay}`}
              description={`${attendanceRate}% attendance rate`}
              icon={Target}
              variant={attendanceRate >= 95 ? "success" : attendanceRate >= 85 ? "warning" : "error"}
              trend={{ value: attendanceRate, isPositive: attendanceRate >= 85 }}
              className="bg-gradient-to-br from-white/80 to-white/40 dark:from-slate-900/80 dark:to-slate-800/40 backdrop-blur-xl border-white/20 dark:border-slate-700/20"
            />

            <StatsCard
              title="Working Hours"
              value={`${monthlyStats.totalHours.toFixed(1)}h`}
              description={`Avg: ${monthlyStats.avgHours.toFixed(1)}h/day`}
              icon={Timer}
              variant="default"
              className="bg-gradient-to-br from-white/80 to-white/40 dark:from-slate-900/80 dark:to-slate-800/40 backdrop-blur-xl border-white/20 dark:border-slate-700/20"
            />

            <StatsCard
              title="Department"
              value={profile?.departments?.code || "N/A"}
              description={profile?.departments?.name || "Not assigned"}
              icon={Users}
              variant="default"
              className="bg-gradient-to-br from-white/80 to-white/40 dark:from-slate-900/80 dark:to-slate-800/40 backdrop-blur-xl border-white/20 dark:border-slate-700/20"
            />
          </div>

          {/* Progress & Analytics Section */}
          <div className="grid gap-8 lg:grid-cols-3">
            {/* Monthly Progress */}
            <Card className="lg:col-span-2 bg-gradient-to-br from-white/90 to-white/50 dark:from-slate-900/90 dark:to-slate-800/50 backdrop-blur-xl border-white/20 dark:border-slate-700/20 shadow-2xl">
              <CardHeader className="pb-6">
                <CardTitle className="text-2xl font-bold flex items-center gap-3">
                  <BarChart3 className="h-7 w-7 text-blue-600" />
                  Monthly Progress
                </CardTitle>
                <CardDescription className="text-lg">Track your attendance performance this month</CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-semibold">Attendance Target (95%)</span>
                    <span className="text-2xl font-bold text-blue-600">{Math.round(progressToTarget)}%</span>
                  </div>
                  <Progress value={progressToTarget} className="h-4 bg-slate-200 dark:bg-slate-700" />
                  <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                    <span>{monthlyStats.presentDays} days present</span>
                    <span>Target: {monthlyTarget} days</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="text-center p-6 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/50 dark:to-blue-900/50 rounded-2xl border border-blue-200/50 dark:border-blue-800/50">
                    <div className="text-3xl font-bold text-blue-600 mb-2">{monthlyStats.presentDays}</div>
                    <div className="text-sm font-medium text-blue-700 dark:text-blue-300">Present Days</div>
                  </div>
                  <div className="text-center p-6 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950/50 dark:to-green-900/50 rounded-2xl border border-green-200/50 dark:border-green-800/50">
                    <div className="text-3xl font-bold text-green-600 mb-2">{monthlyStats.lateDays}</div>
                    <div className="text-sm font-medium text-green-700 dark:text-green-300">Late Days</div>
                  </div>
                  <div className="text-center p-6 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950/50 dark:to-purple-900/50 rounded-2xl border border-purple-200/50 dark:border-purple-800/50">
                    <div className="text-3xl font-bold text-purple-600 mb-2">{monthlyStats.totalHours.toFixed(1)}h</div>
                    <div className="text-sm font-medium text-purple-700 dark:text-purple-300">Total Hours</div>
                  </div>
                  <div className="text-center p-6 bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950/50 dark:to-orange-900/50 rounded-2xl border border-orange-200/50 dark:border-orange-800/50">
                    <div className="text-3xl font-bold text-orange-600 mb-2">{monthlyStats.avgHours.toFixed(1)}h</div>
                    <div className="text-sm font-medium text-orange-700 dark:text-orange-300">Avg/Day</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <div className="space-y-6">
              <QuickActions userRole={profile?.role} />

              {/* Recent Activity */}
              <Card className="bg-gradient-to-br from-white/90 to-white/50 dark:from-slate-900/90 dark:to-slate-800/50 backdrop-blur-xl border-white/20 dark:border-slate-700/20 shadow-xl">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <Activity className="h-5 w-5 text-green-600" />
                    Recent Activity
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {todayAttendance && (
                    <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-950/50 rounded-xl border border-green-200/50 dark:border-green-800/50">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      <div>
                        <p className="font-medium text-green-800 dark:text-green-200">Checked In Today</p>
                        <p className="text-sm text-green-600 dark:text-green-400">
                          {new Date(todayAttendance.check_in_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  )}

                  {leaveRequests.length > 0 && (
                    <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-950/50 rounded-xl border border-blue-200/50 dark:border-blue-800/50">
                      <Calendar className="h-5 w-5 text-blue-600" />
                      <div>
                        <p className="font-medium text-blue-800 dark:text-blue-200">Leave Request</p>
                        <p className="text-sm text-blue-600 dark:text-blue-400">
                          {leaveRequests[0].status === 'pending' ? 'Pending approval' : leaveRequests[0].status}
                        </p>
                      </div>
                    </div>
                  )}

                  {notifications.length > 0 && (
                    <div className="flex items-center gap-3 p-3 bg-purple-50 dark:bg-purple-950/50 rounded-xl border border-purple-200/50 dark:border-purple-800/50">
                      <AlertCircle className="h-5 w-5 text-purple-600" />
                      <div>
                        <p className="font-medium text-purple-800 dark:text-purple-200">New Notification</p>
                        <p className="text-sm text-purple-600 dark:text-purple-400">
                          {notifications.length} unread message{notifications.length > 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                  )}

                  {!todayAttendance && !leaveRequests.length && !notifications.length && (
                    <div className="text-center py-8">
                      <Activity className="h-12 w-12 text-slate-400 mx-auto mb-3" />
                      <p className="text-slate-600 dark:text-slate-400">No recent activity</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Leave & Notifications Section */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Leave Management */}
            <Card className="bg-gradient-to-br from-white/90 to-white/50 dark:from-slate-900/90 dark:to-slate-800/50 backdrop-blur-xl border-white/20 dark:border-slate-700/20 shadow-xl">
              <CardHeader className="pb-6">
                <CardTitle className="text-xl font-bold flex items-center gap-3">
                  <Calendar className="h-6 w-6 text-orange-600" />
                  Leave Management
                </CardTitle>
                <CardDescription className="text-lg">Manage your leave requests and notifications</CardDescription>
              </CardHeader>
              <CardContent>
                {profile?.role !== "staff" ? (
                  <div className="text-center py-12">
                    <div className="w-20 h-20 bg-gradient-to-br from-orange-100 to-orange-200 dark:from-orange-950/50 dark:to-orange-900/50 rounded-full flex items-center justify-center mx-auto mb-6 border border-orange-200/50 dark:border-orange-800/50">
                      <Calendar className="h-10 w-10 text-orange-600" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Leave Administration</h3>
                    <p className="text-slate-600 dark:text-slate-400 mb-6 max-w-sm mx-auto">
                      View and manage all leave requests from your team members
                    </p>
                    <Button asChild size="lg" className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 shadow-lg hover:shadow-xl transition-all duration-300">
                      <Link href="/dashboard/leave-management">
                        <Users className="h-5 w-5 mr-2" />
                        Manage Leave Requests
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-950/50 dark:to-blue-900/50 rounded-full flex items-center justify-center mx-auto mb-6 border border-blue-200/50 dark:border-blue-800/50">
                      <Calendar className="h-10 w-10 text-blue-600" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Leave Requests</h3>
                    <p className="text-slate-600 dark:text-slate-400 mb-6 max-w-sm mx-auto">
                      Submit leave requests for approval by your manager
                    </p>
                    <div className="flex items-center justify-center">
                      <RequestLeaveButtonWrapper />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Performance Insights */}
            <Card className="bg-gradient-to-br from-white/90 to-white/50 dark:from-slate-900/90 dark:to-slate-800/50 backdrop-blur-xl border-white/20 dark:border-slate-700/20 shadow-xl">
              <CardHeader className="pb-6">
                <CardTitle className="text-xl font-bold flex items-center gap-3">
                  <TrendingUp className="h-6 w-6 text-green-600" />
                  Performance Insights
                </CardTitle>
                <CardDescription className="text-lg">Your attendance statistics and achievements</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-6 bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950/50 dark:to-emerald-900/50 rounded-2xl border border-emerald-200/50 dark:border-emerald-800/50">
                    <Award className="h-8 w-8 text-emerald-600 mx-auto mb-2" />
                    <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{yearlyStats.totalDays}</div>
                    <div className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Yearly Attendance</div>
                  </div>
                  <div className="text-center p-6 bg-gradient-to-br from-cyan-50 to-cyan-100 dark:from-cyan-950/50 dark:to-cyan-900/50 rounded-2xl border border-cyan-200/50 dark:border-cyan-800/50">
                    <Timer className="h-8 w-8 text-cyan-600 mx-auto mb-2" />
                    <div className="text-2xl font-bold text-cyan-700 dark:text-cyan-300">{yearlyStats.totalHours.toFixed(0)}h</div>
                    <div className="text-sm font-medium text-cyan-600 dark:text-cyan-400">Total Hours</div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Consistency Score</span>
                    <span className="text-lg font-bold text-slate-900 dark:text-white">
                      {attendanceRate >= 95 ? 'Excellent' : attendanceRate >= 85 ? 'Good' : 'Needs Improvement'}
                    </span>
                  </div>
                  <Progress value={attendanceRate} className="h-3 bg-slate-200 dark:bg-slate-700" />
                  <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                    <span>Current: {attendanceRate}%</span>
                    <span>Target: 95%</span>
                  </div>
                </div>

                {attendanceRate >= 95 && (
                  <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-950/50 dark:to-amber-950/50 rounded-xl border border-yellow-200/50 dark:border-yellow-800/50">
                    <Award className="h-6 w-6 text-yellow-600" />
                    <div>
                      <p className="font-semibold text-yellow-800 dark:text-yellow-200">Achievement Unlocked!</p>
                      <p className="text-sm text-yellow-700 dark:text-yellow-300">95%+ attendance this month</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  } catch (error) {
    console.error("[v0] Dashboard error:", error)
    redirect("/auth/login")
  }
}
