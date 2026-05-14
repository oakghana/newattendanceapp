"use client"

import { useState, useEffect } from "react"
import { createClient } from "@supabase/supabase-js"
import { 
  BarChart3, 
  CalendarRange, 
  LayoutPanelTop, 
  TrendingUp,
  RefreshCw,
  Download,
  Clock,
  CheckCircle2,
  Users,
  MapPin,
  FileText,
  ChevronLeft,
  ChevronRight,
  Sparkles
} from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { LeaveManagementClient } from "./leave-management-client"
import { isHrLeaveOfficeRole } from "@/lib/leave-planning"
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, getDay, addMonths, subMonths } from "date-fns"

const HR_ANALYTICS_ROLES = ["hr_leave_office", "director_hr", "manager_hr", "admin", "hr_office", "hr", "department_head", "regional_manager"]

function normalizeRole(role: string | null | undefined) {
  return String(role || "").toLowerCase().trim().replace(/[-\s]+/g, "_")
}

function isHrAnalyticsRole(role: string | null | undefined) {
  const normalized = normalizeRole(role)
  return HR_ANALYTICS_ROLES.includes(normalized)
}

interface LeaveManagementModuleClientProps {
  userId: string
  userRole: string | null
  userDepartment: string | null
  userFirstName: string | null
  userLastName: string | null
  inactivityDays: number
  userDepartmentName: string | null
  userDepartmentCode: string | null
  hasHodLinkage: boolean
  initialStaffRequests: any[]
  initialManagerNotifications: any[]
  initialApprovedStaffRequests?: any[]
}

interface AnalyticsData {
  outstanding: number
  approvedTotal: number
  onLeaveNow: number
  yetToEnjoy: number
  completed: number
  uniqueStaff: number
  leaveByType: { type: string; count: number }[]
  leaveByLocation: { location: string; count: number }[]
  currentlyOnLeave: any[]
  allLeaveRecords: any[]
}

export function LeaveManagementModuleClient({
  userId,
  userRole,
  userDepartment,
  userFirstName,
  userLastName,
  inactivityDays,
  userDepartmentName,
  userDepartmentCode,
  hasHodLinkage,
  initialStaffRequests,
  initialManagerNotifications,
  initialApprovedStaffRequests = [],
}: LeaveManagementModuleClientProps) {
  const showAnalytics = isHrAnalyticsRole(userRole)
  const normalizedRole = normalizeRole(userRole)
  const isHrOffice = isHrLeaveOfficeRole(normalizedRole)

  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState(new Date())
  const [leaveBalances, setLeaveBalances] = useState<any[]>([])
  const [teamOnLeave, setTeamOnLeave] = useState<any[]>([])

  useEffect(() => {
    if (showAnalytics) {
      fetchAnalyticsData()
    }
    fetchLeaveBalances()
    fetchTeamOnLeave()
  }, [showAnalytics])

  const fetchAnalyticsData = async () => {
    try {
      setAnalyticsLoading(true)
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      if (!supabaseUrl || !supabaseAnonKey) return

      const supabase = createClient(supabaseUrl, supabaseAnonKey)

      // Fetch all leave requests for analytics
      const { data: leaves, error } = await supabase
        .from("leave_requests")
        .select("*, users(first_name, last_name, department, location, staff_id)")
        .order("created_at", { ascending: false })

      if (error) {
        console.error("[v0] Error fetching analytics:", error)
        return
      }

      const today = new Date()
      const outstanding = leaves?.filter(l => l.status === "pending").length || 0
      const approvedTotal = leaves?.filter(l => ["approved", "hr_approved"].includes(l.status?.toLowerCase())).length || 0
      const onLeaveNow = leaves?.filter(l => {
        if (!["approved", "hr_approved"].includes(l.status?.toLowerCase())) return false
        const start = new Date(l.start_date)
        const end = new Date(l.end_date)
        return today >= start && today <= end
      }).length || 0

      const completed = leaves?.filter(l => {
        if (!["approved", "hr_approved"].includes(l.status?.toLowerCase())) return false
        return new Date(l.end_date) < today
      }).length || 0

      const uniqueStaff = new Set(leaves?.map(l => l.user_id)).size

      // Leave by type
      const typeCount: Record<string, number> = {}
      leaves?.forEach(l => {
        const type = l.leave_type || "Annual Leave"
        typeCount[type] = (typeCount[type] || 0) + 1
      })
      const leaveByType = Object.entries(typeCount).map(([type, count]) => ({ type, count }))

      // Leave by location
      const locationCount: Record<string, number> = {}
      leaves?.forEach(l => {
        const location = l.users?.location || l.location || "Unknown"
        locationCount[location] = (locationCount[location] || 0) + 1
      })
      const leaveByLocation = Object.entries(locationCount).map(([location, count]) => ({ location, count }))

      // Currently on leave
      const currentlyOnLeave = leaves?.filter(l => {
        if (!["approved", "hr_approved"].includes(l.status?.toLowerCase())) return false
        const start = new Date(l.start_date)
        const end = new Date(l.end_date)
        return today >= start && today <= end
      }) || []

      setAnalyticsData({
        outstanding,
        approvedTotal,
        onLeaveNow,
        yetToEnjoy: approvedTotal - completed - onLeaveNow,
        completed,
        uniqueStaff,
        leaveByType,
        leaveByLocation,
        currentlyOnLeave,
        allLeaveRecords: leaves || [],
      })
    } catch (error) {
      console.error("[v0] Analytics error:", error)
    } finally {
      setAnalyticsLoading(false)
    }
  }

  const fetchLeaveBalances = async () => {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      if (!supabaseUrl || !supabaseAnonKey) return

      const supabase = createClient(supabaseUrl, supabaseAnonKey)

      const { data, error } = await supabase
        .from("outstanding_leave_balances")
        .select("*")
        .eq("user_id", userId)

      if (!error && data) {
        setLeaveBalances(data)
      }
    } catch (error) {
      console.error("[v0] Balance error:", error)
    }
  }

  const fetchTeamOnLeave = async () => {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      if (!supabaseUrl || !supabaseAnonKey) return

      const supabase = createClient(supabaseUrl, supabaseAnonKey)
      const today = new Date().toISOString().split("T")[0]

      const { data, error } = await supabase
        .from("leave_requests")
        .select("*, users(first_name, last_name, department)")
        .lte("start_date", today)
        .gte("end_date", today)
        .in("status", ["approved", "hr_approved"])
        .limit(10)

      if (!error && data) {
        setTeamOnLeave(data)
      }
    } catch (error) {
      console.error("[v0] Team leave error:", error)
    }
  }

  // Calendar logic
  const monthStart = startOfMonth(calendarMonth)
  const monthEnd = endOfMonth(calendarMonth)
  const calendarDays = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const startDayOfWeek = getDay(monthStart)

  return (
    <div className="space-y-6 w-full">
      <Tabs defaultValue="leave-management" className="space-y-6 w-full">
        {/* Professional Tab Navigation */}
        <TabsList className="inline-flex h-auto gap-2 bg-transparent p-0 flex-wrap justify-center">
          <TabsTrigger 
            value="leave-management" 
            className="gap-2 rounded-full px-6 py-2.5 text-sm font-medium transition-all
              data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow-lg
              data-[state=inactive]:bg-orange-100 data-[state=inactive]:text-orange-700 data-[state=inactive]:hover:bg-orange-200"
          >
            <LayoutPanelTop className="h-4 w-4" /> 
            Leave Management
          </TabsTrigger>
          <TabsTrigger 
            value="leave-planning" 
            className="gap-2 rounded-full px-6 py-2.5 text-sm font-medium transition-all
              data-[state=active]:bg-green-500 data-[state=active]:text-white data-[state=active]:shadow-lg
              data-[state=inactive]:bg-green-100 data-[state=inactive]:text-green-700 data-[state=inactive]:hover:bg-green-200"
          >
            <CalendarRange className="h-4 w-4" /> 
            Leave & HR Leave
          </TabsTrigger>
          {showAnalytics && (
            <TabsTrigger 
              value="hr-analytics" 
              className="gap-2 rounded-full px-6 py-2.5 text-sm font-medium transition-all
                data-[state=active]:bg-blue-500 data-[state=active]:text-white data-[state=active]:shadow-lg
                data-[state=inactive]:bg-blue-100 data-[state=inactive]:text-blue-700 data-[state=inactive]:hover:bg-blue-200"
            >
              <TrendingUp className="h-4 w-4" /> 
              Leave Analytics
            </TabsTrigger>
          )}
          <TabsTrigger 
            value="insights" 
            className="gap-2 rounded-full px-6 py-2.5 text-sm font-medium transition-all
              data-[state=active]:bg-indigo-500 data-[state=active]:text-white data-[state=active]:shadow-lg
              data-[state=inactive]:bg-indigo-100 data-[state=inactive]:text-indigo-700 data-[state=inactive]:hover:bg-indigo-200"
          >
            <BarChart3 className="h-4 w-4" /> 
            Balance & Calendar
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Leave Management */}
        <TabsContent value="leave-management" className="space-y-6 w-full">
          <LeaveManagementClient
            userId={userId}
            userRole={userRole || "staff"}
            userDepartment={userDepartment}
            userFirstName={userFirstName}
            userLastName={userLastName}
            hasHodLinkage={hasHodLinkage}
            inactivityDays={inactivityDays}
            initialStaffRequests={initialStaffRequests}
            initialManagerNotifications={initialManagerNotifications}
            initialApprovedStaffRequests={initialApprovedStaffRequests}
          />
        </TabsContent>

        {/* Tab 2: Leave & HR Leave (Planning) */}
        <TabsContent value="leave-planning" className="space-y-6 w-full">
          {/* HR Leave Header */}
          <Card className="bg-gradient-to-br from-emerald-800 via-emerald-700 to-teal-700 border-0 shadow-xl">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center">
                    <CalendarRange className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Leave Management</h2>
                    <p className="text-emerald-100 text-sm">2025/2026 Leave Year · Quality Control Company Limited</p>
                  </div>
                </div>
                <Button variant="secondary" size="sm" className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </Button>
              </div>
              {/* Workflow Steps */}
              <div className="flex flex-wrap gap-2 mt-4">
                {[
                  { step: "1", label: "Staff Applies" },
                  { step: "2", label: "HOD Reviews" },
                  { step: "3", label: "HR Leave Office Adjusts" },
                  { step: "4", label: "HR Issues Memo" },
                ].map((item, i) => (
                  <Badge key={i} className="bg-white/20 text-white border-0 gap-1">
                    <span className="bg-white/30 rounded-full w-5 h-5 flex items-center justify-center text-xs">{item.step}</span>
                    {item.label}
                    {i < 3 && <ChevronRight className="h-3 w-3 ml-1" />}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Action Tabs */}
          <div className="flex flex-wrap gap-2">
            <Button className="bg-orange-100 text-orange-700 hover:bg-orange-200 gap-2">
              <FileText className="h-4 w-4" />
              Request
            </Button>
            <Button className="bg-green-500 text-white hover:bg-green-600 gap-2">
              <CheckCircle2 className="h-4 w-4" />
              + Apply
            </Button>
            <Button className="bg-yellow-100 text-yellow-700 hover:bg-yellow-200 gap-2">
              <Users className="h-4 w-4" />
              HOD Review
              <Badge className="ml-1 bg-blue-500 text-white text-xs">0</Badge>
            </Button>
          </div>

          {/* Leave Application Placeholder */}
          <Card>
            <CardContent className="py-16 text-center">
              <Calendar className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-30" />
              <p className="text-lg font-medium text-muted-foreground">No leave requests yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Use &quot;Apply&quot; to submit your first request.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: HR Analytics */}
        {showAnalytics && (
          <TabsContent value="hr-analytics" className="space-y-6 w-full">
            {/* Analytics Header */}
            <Card className="bg-gradient-to-br from-slate-800 via-slate-700 to-slate-600 border-0 shadow-xl overflow-hidden">
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                      <TrendingUp className="h-5 w-5 text-blue-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-yellow-400" />
                        <span className="text-xs font-medium text-yellow-400 uppercase tracking-wider">HR Leave Intelligence</span>
                      </div>
                      <h2 className="text-xl font-bold text-white">Leave Analytics Dashboard</h2>
                      <p className="text-slate-300 text-sm">Executive insights · Quality Control Company Limited</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={fetchAnalyticsData}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh
                    </Button>
                    <Button variant="secondary" size="sm">
                      <Download className="h-4 w-4 mr-2" />
                      CSV
                    </Button>
                    <Button variant="secondary" size="sm">
                      <FileText className="h-4 w-4 mr-2" />
                      PDF
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 6 Colorful Metric Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {[
                { label: "Outstanding", value: analyticsData?.outstanding || 0, color: "from-orange-400 to-orange-500", icon: Clock },
                { label: "Approved Total", value: analyticsData?.approvedTotal || 0, color: "from-teal-400 to-teal-500", icon: CheckCircle2 },
                { label: "On Leave Now", value: analyticsData?.onLeaveNow || 0, color: "from-blue-400 to-blue-500", icon: Users },
                { label: "Yet to Enjoy", value: analyticsData?.yetToEnjoy || 0, color: "from-purple-400 to-purple-500", icon: CalendarRange },
                { label: "Completed", value: analyticsData?.completed || 0, color: "from-cyan-400 to-cyan-500", icon: CheckCircle2 },
                { label: "Unique Staff", value: analyticsData?.uniqueStaff || 0, color: "from-pink-400 to-pink-500", icon: Users },
              ].map((stat, i) => (
                <Card key={i} className={`bg-gradient-to-br ${stat.color} border-0 shadow-lg`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-white/80 uppercase tracking-wide font-medium">{stat.label}</span>
                      <stat.icon className="h-4 w-4 text-white/60" />
                    </div>
                    <p className="text-3xl font-bold text-white">{stat.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Leave by Type and Location */}
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-orange-500" />
                    <CardTitle className="text-base">Leave by Type</CardTitle>
                  </div>
                  <CardDescription>{analyticsData?.leaveByType?.length || 0} leave categories</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {analyticsData?.leaveByType?.slice(0, 5).map((item, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                        <span className="text-sm">{item.type}</span>
                        <Badge variant="secondary">{item.count}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-green-500" />
                    <CardTitle className="text-base">Leave by Location</CardTitle>
                  </div>
                  <CardDescription>{analyticsData?.leaveByLocation?.length || 0} locations</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {analyticsData?.leaveByLocation?.slice(0, 5).map((item, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                        <span className="text-sm">{item.location}</span>
                        <Badge variant="secondary">{item.count}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Currently on Leave Table */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-blue-500" />
                    <CardTitle>Currently on Leave</CardTitle>
                  </div>
                  <Badge className="bg-blue-100 text-blue-700">{analyticsData?.onLeaveNow || 0}</Badge>
                </div>
                <CardDescription>Active approved leave today</CardDescription>
              </CardHeader>
              <CardContent>
                {analyticsData?.currentlyOnLeave?.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No staff currently on leave</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 font-medium">Staff</th>
                          <th className="text-left py-2 font-medium">ID</th>
                          <th className="text-left py-2 font-medium">Department</th>
                          <th className="text-left py-2 font-medium">Leave Type</th>
                          <th className="text-left py-2 font-medium">Period</th>
                          <th className="text-right py-2 font-medium">Days</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analyticsData?.currentlyOnLeave?.slice(0, 10).map((leave, i) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="py-3">{leave.users?.first_name} {leave.users?.last_name}</td>
                            <td className="py-3 text-muted-foreground">{leave.users?.staff_id || "N/A"}</td>
                            <td className="py-3">{leave.users?.department || "IT"}</td>
                            <td className="py-3">
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                {leave.leave_type || "Annual Leave"}
                              </Badge>
                            </td>
                            <td className="py-3 text-muted-foreground">
                              {format(new Date(leave.start_date), "yyyy-MM-dd")} → {format(new Date(leave.end_date), "yyyy-MM-dd")}
                            </td>
                            <td className="py-3 text-right font-medium">
                              {Math.ceil((new Date(leave.end_date).getTime() - new Date(leave.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1}d
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Tab 4: Balance & Calendar */}
        <TabsContent value="insights" className="space-y-6 w-full">
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Leave Balance */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center">
                    <TrendingUp className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <CardTitle>Leave Balance</CardTitle>
                    <CardDescription>Period 2026/2027</CardDescription>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-blue-600">0</p>
                  <p className="text-sm text-muted-foreground">of 412 days used</p>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { type: "Study Leave (Without Pay)", days: "180d left", color: "bg-blue-100 text-blue-700", icon: "📖" },
                    { type: "Maternity Leave", days: "84d left", color: "bg-pink-100 text-pink-700", icon: "👶" },
                    { type: "Annual Leave", days: "36d left", color: "bg-orange-100 text-orange-700", icon: "🌴" },
                    { type: "Sick Leave", days: "30d left", color: "bg-red-100 text-red-700", icon: "🏥" },
                    { type: "Study Leave (With Pay)", days: "30d left", color: "bg-purple-100 text-purple-700", icon: "📚" },
                    { type: "Special / Leave Without Pay", days: "30d left", color: "bg-gray-100 text-gray-700", icon: "⚡" },
                    { type: "Casual Leave", days: "10d left", color: "bg-yellow-100 text-yellow-700", icon: "🏠" },
                    { type: "Compassionate Leave", days: "7d left", color: "bg-indigo-100 text-indigo-700", icon: "💐" },
                    { type: "Paternity Leave", days: "5d left", color: "bg-cyan-100 text-cyan-700", icon: "👨‍👧" },
                  ].map((item, i) => (
                    <Card key={i} className={`${item.color} border-0`}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span>{item.icon}</span>
                            <span className="text-xs font-medium">{item.type}</span>
                          </div>
                          <Badge variant="secondary" className="text-xs">{item.days}</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Team Calendar */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center">
                      <Users className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <CardTitle>Team Calendar</CardTitle>
                      <CardDescription>Who&apos;s off this month</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm font-medium min-w-[100px] text-center">
                      {format(calendarMonth, "MMMM yyyy")}
                    </span>
                    <Button variant="ghost" size="icon" onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Calendar Grid */}
                <div className="grid grid-cols-7 gap-1 mb-4">
                  {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map(day => (
                    <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
                      {day}
                    </div>
                  ))}
                  {/* Empty cells for days before month starts */}
                  {Array.from({ length: startDayOfWeek }).map((_, i) => (
                    <div key={`empty-${i}`} className="h-10" />
                  ))}
                  {/* Calendar days */}
                  {calendarDays.map(day => {
                    const hasLeave = teamOnLeave.some(l => {
                      const start = new Date(l.start_date)
                      const end = new Date(l.end_date)
                      return day >= start && day <= end
                    })
                    return (
                      <div
                        key={day.toISOString()}
                        className={`h-10 flex items-center justify-center rounded-lg text-sm font-medium
                          ${isToday(day) ? "bg-blue-500 text-white" : ""}
                          ${hasLeave && !isToday(day) ? "bg-orange-100 text-orange-700" : ""}
                          ${!hasLeave && !isToday(day) ? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300" : ""}
                        `}
                      >
                        {format(day, "d")}
                        {hasLeave && <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-orange-500" />}
                      </div>
                    )
                  })}
                </div>

                {/* Team on Leave List */}
                <div className="space-y-2 mt-4 pt-4 border-t">
                  <p className="text-sm font-medium">Staff on Leave</p>
                  {teamOnLeave.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No team members on leave this month</p>
                  ) : (
                    teamOnLeave.slice(0, 5).map((leave, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-medium text-xs">
                            {leave.users?.first_name?.[0]}{leave.users?.last_name?.[0]}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{leave.users?.first_name} {leave.users?.last_name}</p>
                            <p className="text-xs text-muted-foreground">{leave.users?.department}</p>
                          </div>
                        </div>
                        <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                          {leave.leave_type || "Annual"}
                        </Badge>
                      </div>
                    ))
                  )}
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t text-xs">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-blue-500" />
                    <span>Annual</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-red-500" />
                    <span>Sick</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-pink-500" />
                    <span>Maternity</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-cyan-500" />
                    <span>Paternity</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-yellow-500" />
                    <span>Casual</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
