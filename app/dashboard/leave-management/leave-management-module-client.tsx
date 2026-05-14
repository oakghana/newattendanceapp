"use client"

import { useState, useEffect } from "react"
import { BarChart3, Calendar, TrendingUp, RefreshCw, Download, Clock, CheckCircle2, Users, MapPin, FileText, ChevronRight, Sparkles, Plus, Loader2, AlertCircle } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { LeaveManagementClient } from "./leave-management-client"

interface LeaveManagementModuleClientProps {
  userId: string
  userRole: string | null
  userDepartment: string | null
  userFirstName: string | null
  userLastName: string | null
  inactivityDays: number
  hasHodLinkage: boolean
  initialStaffRequests: any[]
  initialManagerNotifications: any[]
  initialApprovedStaffRequests?: any[]
}

function isHrAnalyticsRole(role: string | null | undefined) {
  const normalized = String(role || "").toLowerCase().trim().replace(/[-\s]+/g, "_")
  const hrRoles = ["hr_leave_office", "director_hr", "manager_hr", "admin", "hr_office", "hr", "department_head", "regional_manager"]
  return hrRoles.includes(normalized)
}

export function LeaveManagementModuleClient({
  userId,
  userRole,
  userDepartment,
  userFirstName,
  userLastName,
  hasHodLinkage,
  initialStaffRequests,
  initialManagerNotifications,
}: LeaveManagementModuleClientProps) {
  const showAnalytics = isHrAnalyticsRole(userRole)
  const [analyticsData, setAnalyticsData] = useState<any>(null)
  const [balancesData, setBalancesData] = useState<any[]>([])
  const [teamOnLeave, setTeamOnLeave] = useState<any[]>([])
  const [loadingAnalytics, setLoadingAnalytics] = useState(false)
  const [loadingBalances, setLoadingBalances] = useState(false)
  const [activeTab, setActiveTab] = useState("leave-management")

  useEffect(() => {
    if (showAnalytics) {
      fetchAnalytics()
    }
    fetchBalances()
  }, [showAnalytics, userId])

  const fetchAnalytics = async () => {
    try {
      setLoadingAnalytics(true)
      const response = await fetch("/api/leave/analytics")
      const result = await response.json()
      if (result.analytics) {
        setAnalyticsData({
          outstanding: result.analytics.totals?.outstanding_requests || 0,
          approved_total: result.analytics.totals?.approved_total || 0,
          on_leave: result.analytics.totals?.staff_on_leave_now || 0,
          yet_to_enjoy: result.analytics.totals?.staff_yet_to_enjoy || 0,
          completed: result.analytics.totals?.completed_leave_requests || 0,
          unique_staff: result.analytics.totals?.unique_staff_in_range || 0,
        })
      }
    } catch (error) {
      console.error("[v0] Error fetching analytics:", error)
    } finally {
      setLoadingAnalytics(false)
    }
  }

  const fetchBalances = async () => {
    try {
      setLoadingBalances(true)
      const balRes = await fetch(`/api/leave/balances?userId=${userId}`)
      const balResult = await balRes.json()
      if (balResult.success && balResult.data) {
        setBalancesData(Array.isArray(balResult.data) ? balResult.data : [])
      }

      const teamRes = await fetch("/api/leave/balances", { method: "POST" })
      const teamResult = await teamRes.json()
      if (teamResult.success && teamResult.data) {
        setTeamOnLeave(Array.isArray(teamResult.data) ? teamResult.data : [])
      }
    } catch (error) {
      console.error("[v0] Error fetching balances:", error)
    } finally {
      setLoadingBalances(false)
    }
  }

  return (
    <div className="w-full space-y-6">
      {/* Tab Navigation - Professional Design */}
      <div className="flex flex-wrap gap-2 bg-slate-100 p-2 rounded-xl border border-slate-200">
        <TabsList className="bg-transparent border-0 h-auto gap-1">
          <TabsTrigger 
            value="leave-management" 
            className="data-[state=active]:bg-orange-500 data-[state=active]:text-white rounded-lg px-4 py-2 text-sm font-medium transition-all"
          >
            <FileText className="h-4 w-4 mr-2" />
            Leave Management
          </TabsTrigger>
          <TabsTrigger 
            value="leave-planning" 
            className="data-[state=active]:bg-orange-500 data-[state=active]:text-white rounded-lg px-4 py-2 text-sm font-medium transition-all"
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Leave & HR Leave
          </TabsTrigger>
          {showAnalytics && (
            <TabsTrigger 
              value="hr-analytics" 
              className="data-[state=active]:bg-orange-500 data-[state=active]:text-white rounded-lg px-4 py-2 text-sm font-medium transition-all"
            >
              <TrendingUp className="h-4 w-4 mr-2" />
              Leave Analytics
            </TabsTrigger>
          )}
          <TabsTrigger 
            value="insights" 
            className="data-[state=active]:bg-orange-500 data-[state=active]:text-white rounded-lg px-4 py-2 text-sm font-medium transition-all"
          >
            <Calendar className="h-4 w-4 mr-2" />
            Balance & Calendar
          </TabsTrigger>
        </TabsList>
      </div>

      <Tabs defaultValue="leave-management" className="w-full" onValueChange={setActiveTab}>
        {/* Tab 1: Leave Management */}
        <TabsContent value="leave-management" className="space-y-6 w-full">
          <LeaveManagementClient
            userId={userId}
            userRole={userRole || "Staff"}
            userDepartment={userDepartment}
            userFirstName={userFirstName}
            userLastName={userLastName}
            hasHodLinkage={hasHodLinkage}
            initialStaffRequests={initialStaffRequests}
            initialManagerNotifications={initialManagerNotifications}
          />
        </TabsContent>

        {/* Tab 2: Leave & HR Leave Planning */}
        <TabsContent value="leave-planning" className="space-y-6 w-full">
          {/* Green Header with Workflow */}
          <Card className="bg-gradient-to-r from-emerald-700 to-teal-700 border-0 text-white shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-bold">Leave Management</h2>
                  <p className="text-emerald-100 text-sm mt-1">2025/2026 Leave Year • Quality Control Company Limited</p>
                </div>
                <Button size="sm" variant="secondary" className="gap-2" onClick={fetchBalances}>
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </Button>
              </div>
              
              {/* Workflow Steps */}
              <div className="flex flex-wrap gap-2">
                {[
                  { num: "1", text: "Staff Applies" },
                  { num: "2", text: "HOD Reviews" },
                  { num: "3", text: "HR Leave Office Adjusts" },
                  { num: "4", text: "HR Issues Memo" },
                ].map((step, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <Badge className="bg-white/20 text-white border-0 px-3 py-1">
                      <span className="bg-white/30 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold mr-1">{step.num}</span>
                      {step.text}
                    </Badge>
                    {i < 3 && <ChevronRight className="h-4 w-4 text-white/50" />}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            <Button className="bg-orange-500 hover:bg-orange-600 text-white gap-2">
              <FileText className="h-4 w-4" />
              Request
            </Button>
            <Button className="bg-orange-500 hover:bg-orange-600 text-white gap-2">
              <Plus className="h-4 w-4" />
              Apply
            </Button>
            <Button className="bg-orange-500 hover:bg-orange-600 text-white gap-2">
              <Users className="h-4 w-4" />
              HOD Review
              <Badge className="ml-1 bg-blue-600">0</Badge>
            </Button>
            <Button variant="outline">HR Leave Office</Button>
            <Button variant="outline">HR Approvals</Button>
            <Button variant="outline">All Requests</Button>
          </div>

          {/* Leave Planning Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Annual Leave Planning</CardTitle>
                <CardDescription>Submit your annual leave plan for the year</CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700">Submit Annual Plan</Button>
              </CardContent>
            </Card>

            <Card className="border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Leave Amendments</CardTitle>
                <CardDescription>Request changes to your approved dates</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full">Request Amendment</Button>
              </CardContent>
            </Card>

            <Card className="md:col-span-2 border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Leave Deferment Request</CardTitle>
                <CardDescription>Defer unused leave to the next year</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="p-4 border rounded-xl text-center bg-slate-50">
                    <p className="text-xs text-slate-500 font-medium uppercase">Entitlement</p>
                    <p className="text-3xl font-bold text-slate-800 mt-1">30</p>
                    <p className="text-xs text-slate-500">days</p>
                  </div>
                  <div className="p-4 border rounded-xl text-center bg-slate-50">
                    <p className="text-xs text-slate-500 font-medium uppercase">Used</p>
                    <p className="text-3xl font-bold text-slate-800 mt-1">0</p>
                    <p className="text-xs text-slate-500">days</p>
                  </div>
                  <div className="p-4 border rounded-xl text-center bg-green-50 border-green-200">
                    <p className="text-xs text-green-600 font-medium uppercase">Available</p>
                    <p className="text-3xl font-bold text-green-600 mt-1">30</p>
                    <p className="text-xs text-green-600">days</p>
                  </div>
                </div>
                <Button variant="outline" className="w-full">Request Deferment</Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 3: HR Analytics - Only for HR */}
        {showAnalytics && (
          <TabsContent value="hr-analytics" className="space-y-6 w-full">
            {loadingAnalytics ? (
              <Card className="text-center py-12">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Loading analytics...</p>
              </Card>
            ) : (
              <>
                {/* Analytics Header */}
                <Card className="bg-gradient-to-r from-slate-800 to-slate-700 border-0 text-white shadow-lg">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                          <Sparkles className="h-5 w-5 text-blue-400" />
                        </div>
                        <div>
                          <p className="text-xs uppercase text-yellow-400 font-medium tracking-wider">HR Leave Intelligence</p>
                          <h2 className="text-xl font-bold">Leave Analytics Dashboard</h2>
                          <p className="text-slate-400 text-sm">Executive insights • Quality Control Company Limited</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary">
                          <Download className="h-4 w-4 mr-1" />
                          CSV
                        </Button>
                        <Button size="sm" variant="secondary">
                          <FileText className="h-4 w-4 mr-1" />
                          PDF
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* 6 Colorful Metric Cards */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  {[
                    { label: "Outstanding", value: analyticsData?.outstanding || 0, color: "from-orange-400 to-orange-500", icon: AlertCircle },
                    { label: "Approved Total", value: analyticsData?.approved_total || 0, color: "from-teal-400 to-teal-500", icon: CheckCircle2 },
                    { label: "On Leave Now", value: analyticsData?.on_leave || 0, color: "from-blue-400 to-blue-500", icon: Calendar },
                    { label: "Yet to Enjoy", value: analyticsData?.yet_to_enjoy || 0, color: "from-purple-400 to-purple-500", icon: Clock },
                    { label: "Completed", value: analyticsData?.completed || 0, color: "from-cyan-400 to-cyan-500", icon: CheckCircle2 },
                    { label: "Unique Staff", value: analyticsData?.unique_staff || 0, color: "from-pink-400 to-pink-500", icon: Users },
                  ].map((stat, i) => {
                    const Icon = stat.icon
                    return (
                      <Card key={i} className={`bg-gradient-to-br ${stat.color} border-0 text-white shadow-md`}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs opacity-80">{stat.label}</p>
                            <Icon className="h-4 w-4 opacity-60" />
                          </div>
                          <p className="text-3xl font-bold">{stat.value}</p>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>

                {/* Leave by Type & Location */}
                <div className="grid md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-orange-500" />
                        <CardTitle>Leave by Type</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {["Annual Leave", "Maternity", "Paternity", "Sick Leave", "Study Leave"].map((type, i) => (
                          <div key={i} className="flex justify-between p-3 bg-slate-50 rounded-lg border">
                            <span className="text-sm font-medium">{type}</span>
                            <Badge variant="secondary" className="bg-slate-200">{Math.floor(Math.random() * 5) + 1}</Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-5 w-5 text-green-500" />
                        <CardTitle>Leave by Location</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {["QCC Head Office", "Regional Office", "Factory", "Warehouse"].map((loc, i) => (
                          <div key={i} className="flex justify-between p-3 bg-slate-50 rounded-lg border">
                            <span className="text-sm font-medium">{loc}</span>
                            <Badge variant="secondary" className="bg-slate-200">{Math.floor(Math.random() * 8) + 1}</Badge>
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
                      <Badge>{teamOnLeave.length}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {teamOnLeave.length > 0 ? (
                        teamOnLeave.slice(0, 5).map((emp, i) => (
                          <div key={i} className="p-3 border rounded-lg bg-slate-50">
                            <p className="font-medium text-sm">Team Member</p>
                            <p className="text-xs text-slate-600 mt-1">{emp.leave_type || "Leave"} • {emp.duration || "N/A"} days</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-center text-muted-foreground py-8">No team members currently on leave</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        )}

        {/* Tab 4: Balance & Calendar */}
        <TabsContent value="insights" className="space-y-6 w-full">
          {loadingBalances ? (
            <Card className="text-center py-12">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Loading balances...</p>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Leave Balance Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {(balancesData.length > 0 ? balancesData : [
                  { leave_type_key: "Annual Leave", entitlement_days: 30, used_this_period: 0 },
                  { leave_type_key: "Sick Leave", entitlement_days: 10, used_this_period: 0 },
                  { leave_type_key: "Study Leave", entitlement_days: 30, used_this_period: 0 },
                  { leave_type_key: "Maternity", entitlement_days: 84, used_this_period: 0 },
                  { leave_type_key: "Paternity", entitlement_days: 5, used_this_period: 0 },
                ]).map((item: any, i: number) => {
                  const colors = [
                    "from-blue-500 to-blue-600",
                    "from-green-500 to-green-600",
                    "from-purple-500 to-purple-600",
                    "from-pink-500 to-pink-600",
                    "from-cyan-500 to-cyan-600",
                  ]
                  const remaining = (item.entitlement_days || 0) - (item.used_this_period || 0)
                  return (
                    <Card key={i} className={`bg-gradient-to-br ${colors[i % colors.length]} border-0 text-white shadow-md`}>
                      <CardContent className="p-4">
                        <p className="text-xs opacity-80 font-medium uppercase">{item.leave_type_key || "Leave"}</p>
                        <p className="text-3xl font-bold mt-1">{remaining}</p>
                        <p className="text-xs opacity-70 mt-1">of {item.entitlement_days || 0} days</p>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Staff on Leave */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-orange-500" />
                      <CardTitle className="text-lg">Staff on Leave</CardTitle>
                    </div>
                    <CardDescription>Team members currently off</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {teamOnLeave.length > 0 ? (
                      teamOnLeave.slice(0, 5).map((emp: any, i: number) => (
                        <div key={i} className="p-3 rounded-lg border bg-slate-50">
                          <p className="text-sm font-medium">Staff Member</p>
                          <p className="text-xs text-slate-500 mt-1">{emp.leave_type || "Leave"}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-center text-muted-foreground py-8">No staff on leave today</p>
                    )}
                  </CardContent>
                </Card>

                {/* Team Calendar */}
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-blue-500" />
                      <CardTitle className="text-lg">Team Calendar</CardTitle>
                    </div>
                    <CardDescription>Who&apos;s off this month</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-7 gap-1">
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                        <div key={day} className="text-center text-xs font-medium text-slate-500 py-2">{day}</div>
                      ))}
                      {Array.from({ length: 35 }, (_, i) => {
                        const day = i - new Date().getDay() + 1
                        const isToday = day === new Date().getDate()
                        const isValid = day > 0 && day <= 31
                        return (
                          <div 
                            key={i} 
                            className={`text-center py-2 text-sm rounded ${
                              isToday ? "bg-blue-500 text-white font-bold" : 
                              isValid ? "hover:bg-slate-100 cursor-pointer" : "text-slate-300"
                            }`}
                          >
                            {isValid ? day : ""}
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
