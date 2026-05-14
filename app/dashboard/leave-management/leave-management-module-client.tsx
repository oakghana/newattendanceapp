"use client"

import { BarChart3, CalendarRange, LayoutPanelTop, TrendingUp } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { LeaveManagementClient } from "./leave-management-client"
import { isHrLeaveOfficeRole } from "@/lib/leave-planning"

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

  return (
    <div className="space-y-6 w-full">
      <Tabs defaultValue="leave-management" className="space-y-4 w-full">
        <TabsList className="inline-flex h-auto gap-2 rounded-full border-0 bg-transparent p-0 overflow-x-auto sm:overflow-visible flex-wrap sm:flex-nowrap justify-start sm:justify-center">
          <TabsTrigger value="leave-management" className="gap-2 rounded-full border-0 bg-orange-500 hover:bg-orange-600 px-6 py-2 text-white font-medium data-[state=inactive]:bg-orange-400/70 data-[state=inactive]:text-white data-[state=active]:bg-orange-600">
            <LayoutPanelTop className="h-4 w-4" /> 
            Leave Management
          </TabsTrigger>
          <TabsTrigger value="leave-planning" className="gap-2 rounded-full border-0 bg-green-500 hover:bg-green-600 px-6 py-2 text-white font-medium data-[state=inactive]:bg-green-400/70 data-[state=inactive]:text-white data-[state=active]:bg-green-600">
            <CalendarRange className="h-4 w-4" /> 
            Leave & HR Leave
          </TabsTrigger>
          {showAnalytics && (
            <TabsTrigger value="hr-analytics" className="gap-2 rounded-full border-0 bg-blue-500 hover:bg-blue-600 px-6 py-2 text-white font-medium data-[state=inactive]:bg-blue-400/70 data-[state=inactive]:text-white data-[state=active]:bg-blue-600">
              <TrendingUp className="h-4 w-4" /> 
              Leave Analytics
            </TabsTrigger>
          )}
          <TabsTrigger value="insights" className="gap-2 rounded-full border-0 bg-indigo-500 hover:bg-indigo-600 px-6 py-2 text-white font-medium data-[state=inactive]:bg-indigo-400/70 data-[state=inactive]:text-white data-[state=active]:bg-indigo-600">
            <BarChart3 className="h-4 w-4" /> 
            Balance & Calendar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="leave-management" className="space-y-4 sm:space-y-6 w-full">
          <LeaveManagementClient
            userId={userId}
            userRole={userRole}
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

        <TabsContent value="leave-planning" className="space-y-4 sm:space-y-6 w-full">
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Annual Leave Planning</CardTitle>
                <CardDescription>Submit your annual leave plan for the year</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium">2024/2025 Leave Plan</p>
                  <p className="text-sm text-muted-foreground">
                    Submit your preferred leave dates for the upcoming year. Your head of department and HR office will review your plan.
                  </p>
                </div>
                <Button className="w-full">Submit Annual Plan</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Leave Amendments</CardTitle>
                <CardDescription>Request changes to approved leave dates</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Modify Your Leave</p>
                  <p className="text-sm text-muted-foreground">
                    Request postponement or changes to your approved leave dates due to operational needs or personal circumstances.
                  </p>
                </div>
                <Button variant="outline" className="w-full">Request Amendment</Button>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg">Leave Deferment Request</CardTitle>
                <CardDescription>Defer unused leave to the next year</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 grid-cols-3">
                  <div className="p-3 border rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Entitlement</p>
                    <p className="text-2xl font-bold">25</p>
                    <p className="text-xs text-muted-foreground">days</p>
                  </div>
                  <div className="p-3 border rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Used</p>
                    <p className="text-2xl font-bold">12</p>
                    <p className="text-xs text-muted-foreground">days</p>
                  </div>
                  <div className="p-3 border rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Available</p>
                    <p className="text-2xl font-bold text-green-600">13</p>
                    <p className="text-xs text-muted-foreground">days</p>
                  </div>
                </div>
                <Button variant="outline" className="w-full">Request Deferment</Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {showAnalytics && (
          <TabsContent value="hr-analytics" className="space-y-4 sm:space-y-6 w-full">
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">24</div>
                  <p className="text-xs text-muted-foreground mt-1">Awaiting your review</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Approved This Month</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-green-600">156</div>
                  <p className="text-xs text-muted-foreground mt-1">Leave days</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Staff on Leave</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-blue-600">42</div>
                  <p className="text-xs text-muted-foreground mt-1">Currently</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Requests This Year</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">1,247</div>
                  <p className="text-xs text-muted-foreground mt-1">Total processed</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Recent Approvals</CardTitle>
                <CardDescription>Latest leave requests processed by your team</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium text-sm">John Doe - Annual Leave</p>
                      <p className="text-xs text-muted-foreground">5 days • 2024-12-20 to 2024-12-24</p>
                    </div>
                    <span className="text-xs font-medium text-green-600">Approved</span>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium text-sm">Jane Smith - Sick Leave</p>
                      <p className="text-xs text-muted-foreground">2 days • 2024-12-19 to 2024-12-20</p>
                    </div>
                    <span className="text-xs font-medium text-green-600">Approved</span>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium text-sm">Mike Johnson - Emergency Leave</p>
                      <p className="text-xs text-muted-foreground">1 day • 2024-12-18</p>
                    </div>
                    <span className="text-xs font-medium text-green-600">Approved</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="insights" className="space-y-4 sm:space-y-6 w-full">
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
            {/* Leave Balance */}
            <Card>
              <CardHeader>
                <CardTitle>Leave Balance 2024/2025</CardTitle>
                <CardDescription>Current leave entitlements</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium">Annual Leave</span>
                      <span className="text-sm font-bold text-blue-600">13/25 days</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2">
                      <div className="bg-blue-600 h-2 rounded-full" style={{width: '52%'}}></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium">Sick Leave</span>
                      <span className="text-sm font-bold text-red-600">8/10 days</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2">
                      <div className="bg-red-600 h-2 rounded-full" style={{width: '80%'}}></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium">Maternity Leave</span>
                      <span className="text-sm font-bold text-pink-600">60/90 days</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2">
                      <div className="bg-pink-600 h-2 rounded-full" style={{width: '67%'}}></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium">Carryover Balance</span>
                      <span className="text-sm font-bold text-green-600">3 days</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Can carry over up to 5 days</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Team Calendar */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Team Leave Calendar</CardTitle>
                <CardDescription>See who's on leave this month</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="p-3 border rounded-lg bg-blue-50 dark:bg-blue-900/20">
                    <p className="text-sm font-medium">December 2024</p>
                    <div className="grid grid-cols-7 gap-1 mt-2 text-xs">
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                        <div key={day} className="text-center font-medium text-muted-foreground">{day}</div>
                      ))}
                      {/* Sample calendar dates */}
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31].map(date => (
                        <div 
                          key={date} 
                          className={`h-8 flex items-center justify-center rounded text-xs font-medium ${
                            [20, 21, 22, 23, 24].includes(date) 
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {date}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2 space-y-2">
                    <p className="text-sm font-medium">Team Members on Leave</p>
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center justify-between p-2 border rounded">
                        <span>John Doe</span>
                        <span className="text-xs text-muted-foreground">Dec 20-24</span>
                      </div>
                      <div className="flex items-center justify-between p-2 border rounded">
                        <span>Sarah Johnson</span>
                        <span className="text-xs text-muted-foreground">Dec 23-27</span>
                      </div>
                      <div className="flex items-center justify-between p-2 border rounded">
                        <span>Mike Chen</span>
                        <span className="text-xs text-muted-foreground">Dec 18-19</span>
                      </div>
                    </div>
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
