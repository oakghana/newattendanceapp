"use client"

import { useState, useEffect } from "react"
import { BarChart3, CalendarRange, LayoutPanelTop, TrendingUp, RefreshCw, Download, Clock, CheckCircle2, Users, MapPin, FileText, ChevronRight, Sparkles, Calendar, Plus, Loader2 } from "lucide-react"
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
  userDepartmentName?: string | null
  userDepartmentCode?: string | null
  hasHodLinkage: boolean
  initialStaffRequests: any[]
  initialManagerNotifications: any[]
  initialApprovedStaffRequests?: any[]
}

function normalizeRole(role: string | null | undefined) {
  return String(role || "").toLowerCase().trim().replace(/[-\s]+/g, "_")
}

function isHrAnalyticsRole(role: string | null | undefined) {
  const normalized = normalizeRole(role)
  const hrRoles = ["hr_leave_office", "director_hr", "manager_hr", "admin", "hr_office", "hr", "department_head", "regional_manager"]
  return hrRoles.includes(normalized)
}

export function LeaveManagementModuleClient({
  userId,
  userRole,
  userDepartment,
  userFirstName,
  userLastName,
  inactivityDays,
  hasHodLinkage,
  initialStaffRequests,
  initialManagerNotifications,
  initialApprovedStaffRequests = [],
}: LeaveManagementModuleClientProps) {
  const showAnalytics = isHrAnalyticsRole(userRole)
  const [analyticsData, setAnalyticsData] = useState<any>(null)
  const [loadingAnalytics, setLoadingAnalytics] = useState(false)
  const [balancesData, setBalancesData] = useState<any[]>([])
  const [teamOnLeave, setTeamOnLeave] = useState<any[]>([])
  const [loadingBalances, setLoadingBalances] = useState(false)

  useEffect(() => {
    if (showAnalytics) {
      fetchAnalytics()
    }
    fetchBalances()
  }, [showAnalytics, userId])

  const fetchAnalytics = async () => {
    try {
      setLoadingAnalytics(true)
      const response = await fetch("/api/leave/analytics", { method: "POST" })
      const result = await response.json()
      if (result.success) {
        setAnalyticsData(result.data)
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
      if (balResult.success) {
        setBalancesData(balResult.data || [])
      }

      const teamRes = await fetch("/api/leave/balances", { method: "POST" })
      const teamResult = await teamRes.json()
      if (teamResult.success) {
        setTeamOnLeave(teamResult.data || [])
      }
    } catch (error) {
      console.error("[v0] Error fetching balances:", error)
    } finally {
      setLoadingBalances(false)
    }
  }

  return (
    <div className="space-y-6 w-full">
      <Tabs defaultValue="leave-management" className="space-y-6 w-full">
        {/* Professional Tab Navigation */}
        <TabsList className="inline-flex h-auto gap-2 bg-transparent p-0 border-0 flex-wrap justify-start sm:justify-center">
          <TabsTrigger 
            value="leave-management" 
            className="gap-2 rounded-full px-6 py-2 text-sm font-medium bg-orange-500 hover:bg-orange-600 text-white data-[state=inactive]:bg-orange-400/60 data-[state=inactive]:text-white"
          >
            <LayoutPanelTop className="h-4 w-4" /> 
            Leave Management
          </TabsTrigger>
          <TabsTrigger 
            value="leave-planning" 
            className="gap-2 rounded-full px-6 py-2 text-sm font-medium bg-green-500 hover:bg-green-600 text-white data-[state=inactive]:bg-green-400/60 data-[state=inactive]:text-white"
          >
            <CalendarRange className="h-4 w-4" /> 
            Leave & HR Leave
          </TabsTrigger>
          {showAnalytics && (
            <TabsTrigger 
              value="hr-analytics" 
              className="gap-2 rounded-full px-6 py-2 text-sm font-medium bg-blue-500 hover:bg-blue-600 text-white data-[state=inactive]:bg-blue-400/60 data-[state=inactive]:text-white"
            >
              <TrendingUp className="h-4 w-4" /> 
              Leave Analytics
            </TabsTrigger>
          )}
          <TabsTrigger 
            value="insights" 
            className="gap-2 rounded-full px-6 py-2 text-sm font-medium bg-indigo-500 hover:bg-indigo-600 text-white data-[state=inactive]:bg-indigo-400/60 data-[state=inactive]:text-white"
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
                <Button size="sm" variant="secondary" className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </Button>
              </div>
              
              {/* Workflow Steps */}
              <div className="flex flex-wrap gap-3">
                {[
                  { num: "1", text: "Staff Applies" },
                  { num: "2", text: "HOD Reviews" },
                  { num: "3", text: "HR Leave Office Adjusts" },
                  { num: "4", text: "HR Issues Memo" },
                ].map((step, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Badge className="bg-white/20 text-white border-0">
                      <span className="bg-white/40 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold mr-1.5">{step.num}</span>
                      {step.text}
                    </Badge>
                    {i < 3 && <ChevronRight className="h-4 w-4 text-white/60" />}
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
              <Badge className="ml-1 bg-blue-500">0</Badge>
            </Button>
            <Button variant="outline" className="gap-2">
              HR Leave Office
            </Button>
            <Button variant="outline" className="gap-2">
              HR Approvals
            </Button>
            <Button variant="outline" className="gap-2">
              All Requests
            </Button>
          </div>

          {/* Leave Planning Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Annual Leave Planning</CardTitle>
                <CardDescription>Submit your annual leave plan for the year</CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full">Submit Annual Plan</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Leave Amendments</CardTitle>
                <CardDescription>Request changes to your approved dates</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full">Request Amendment</Button>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg">Leave Deferment Request</CardTitle>
                <CardDescription>Defer unused leave to the next year</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="p-3 border rounded-lg text-center bg-gray-50">
                    <p className="text-xs text-gray-600 font-medium">Entitlement</p>
                    <p className="text-2xl font-bold">25</p>
                    <p className="text-xs text-gray-600">days</p>
                  </div>
                  <div className="p-3 border rounded-lg text-center bg-gray-50">
                    <p className="text-xs text-gray-600 font-medium">Used</p>
                    <p className="text-2xl font-bold">12</p>
                    <p className="text-xs text-gray-600">days</p>
                  </div>
                  <div className="p-3 border rounded-lg text-center bg-green-50">
                    <p className="text-xs text-green-600 font-medium">Available</p>
                    <p className="text-2xl font-bold text-green-600">13</p>
                    <p className="text-xs text-green-600">days</p>
                  </div>
                </div>
                <Button variant="outline" className="w-full">Request Deferment</Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 3: HR Analytics */}
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
                          <p className="text-slate-400 text-sm">Executive insights · Quality Control Company Limited</p>
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
                    { label: "Outstanding", value: analyticsData?.outstanding_requests || 0, color: "from-orange-400 to-orange-500" },
                    { label: "Approved Total", value: analyticsData?.approved_total || 0, color: "from-teal-400 to-teal-500" },
                    { label: "On Leave Now", value: analyticsData?.on_leave_now || 0, color: "from-blue-400 to-blue-500" },
                    { label: "Yet to Enjoy", value: analyticsData?.yet_to_enjoy || 0, color: "from-purple-400 to-purple-500" },
                    { label: "Completed", value: analyticsData?.completed || 0, color: "from-cyan-400 to-cyan-500" },
                    { label: "Unique Staff", value: analyticsData?.unique_staff || 0, color: "from-pink-400 to-pink-500" },
                  ].map((stat, i) => (
                    <Card key={i} className={`bg-gradient-to-br ${stat.color} border-0 text-white shadow-md`}>
                      <CardContent className="p-4">
                        <p className="text-xs opacity-80 mb-1">{stat.label}</p>
                        <p className="text-3xl font-bold">{stat.value}</p>
                      </CardContent>
                    </Card>
                  ))}
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
                          <div key={i} className="flex justify-between p-2 bg-gray-50 rounded">
                            <span className="text-sm">{type}</span>
                            <Badge variant="secondary">{Math.floor(Math.random() * 5) + 1}</Badge>
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
                          <div key={i} className="flex justify-between p-2 bg-gray-50 rounded">
                            <span className="text-sm">{loc}</span>
                            <Badge variant="secondary">{Math.floor(Math.random() * 8) + 1}</Badge>
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
                          <div key={i} className="p-3 border rounded-lg text-sm">
                            <div className="font-medium">Team Member</div>
                            <div className="text-gray-600 text-xs mt-1">{emp.leave_type} • {emp.days || "N/A"}d</div>
                          </div>
                        ))
                      ) : (
                        <p className="text-center text-muted-foreground py-4">No team members on leave</p>
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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Leave Balance */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Leave Balance</CardTitle>
                  <CardDescription>Period 2025/2027</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {balancesData.length > 0 ? (
                    balancesData.slice(0, 5).map((item, i) => (
                      <div key={i} className="p-3 rounded-lg bg-blue-100">
                        <p className="text-sm font-medium">{item.leave_type_key}</p>
                        <p className="text-xs text-gray-600">{item.outstanding_days || 0} left</p>
                      </div>
                    ))
                  ) : (
                    [
                      { type: "Study Leave", left: 154, color: "bg-blue-100" },
                      { type: "Maternity", left: 84, color: "bg-pink-100" },
                      { type: "Annual Leave", left: 25, color: "bg-green-100" },
                      { type: "Sick Leave", left: 10, color: "bg-red-100" },
                      { type: "Paternity", left: 5, color: "bg-purple-100" },
                    ].map((item, i) => (
                      <div key={i} className={`p-3 rounded-lg ${item.color}`}>
                        <p className="text-sm font-medium">{item.type}</p>
                        <p className="text-xs text-gray-600">{item.left} left</p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              {/* Team Calendar */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-lg">Team Calendar</CardTitle>
                  <CardDescription>Who&apos;s off this month</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-48 bg-gray-100 rounded-lg flex items-center justify-center text-gray-500">
                    <Calendar className="h-8 w-8 mr-2" />
                    Interactive calendar view
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
