"use client"

import { BarChart3, CalendarRange, LayoutPanelTop, TrendingUp, Gift, Info, FileText } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LeaveManagementClient } from "./leave-management-client"
import { LeavePlanningClient } from "../leave-planning/leave-planning-client"
import { LeaveBalanceWidget } from "@/components/leave/leave-balance-widget"
import { TeamCalendarView } from "@/components/leave/team-calendar-view"
import { HrLeaveAnalyticsPanel } from "./hr-leave-analytics-panel"
import { OutstandingLeavePanel } from "./outstanding-leave-panel"
import { LeaveCenterInfo } from "./leave-center-info"
import { RegionalLeaveReportPanel } from "./regional-leave-report-panel"
import { isHrLeaveOfficeRole, isRegionalHrOfficerRole } from "@/lib/leave-planning"

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
  userLocationId: string | null
  userLocationName: string | null
  userRegionName: string | null
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
  userLocationId,
  userLocationName,
  userRegionName,
  hasHodLinkage,
  initialStaffRequests,
  initialManagerNotifications,
  initialApprovedStaffRequests = [],
}: LeaveManagementModuleClientProps) {
  const showAnalytics = isHrAnalyticsRole(userRole)
  const normalizedRole = normalizeRole(userRole)
  const isHrOffice = isHrLeaveOfficeRole(normalizedRole)
  const isRegionalHR = isRegionalHrOfficerRole(normalizedRole)

  // Regional HR Officers get view-only access to all tabs
  const isViewOnly = isRegionalHR

  return (
    <div className="space-y-6 w-full">
      <Tabs defaultValue={isRegionalHR ? "regional-reports" : "leave-management"} className="space-y-4 w-full">
        <TabsList className="flex h-auto w-full flex-wrap gap-2 rounded-3xl border border-blue-100 bg-blue-50/60 p-2 shadow-sm overflow-x-auto sm:overflow-visible">
          {/* Info Tab — always visible */}
          <TabsTrigger value="info" className="gap-1 sm:gap-2 rounded-2xl border border-slate-200 bg-white px-3 sm:px-5 py-2 sm:py-3 text-xs sm:text-sm text-slate-700 hover:bg-slate-50 data-[state=active]:border-blue-600 data-[state=active]:bg-blue-600 data-[state=active]:text-white min-w-fit">
            <Info className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Info</span>
            <span className="sm:hidden">Info</span>
          </TabsTrigger>

          {/* Leave Center Tab — view-only for regional HR */}
          <TabsTrigger value="leave-management" className="gap-1 sm:gap-2 rounded-2xl border border-blue-200 bg-white px-3 sm:px-5 py-2 sm:py-3 text-xs sm:text-sm text-blue-800 hover:bg-blue-50 data-[state=active]:border-emerald-600 data-[state=active]:bg-emerald-600 data-[state=active]:text-white min-w-fit">
            <LayoutPanelTop className="h-3 w-3 sm:h-4 sm:w-4" /> 
            <span className="hidden sm:inline">Leave Center</span>
            <span className="sm:hidden">Center</span>
          </TabsTrigger>

          {/* Leave Planning Tab — view-only for regional HR */}
          <TabsTrigger value="leave-planning" className="gap-1 sm:gap-2 rounded-2xl border border-blue-200 bg-white px-3 sm:px-5 py-2 sm:py-3 text-xs sm:text-sm text-blue-800 hover:bg-blue-50 data-[state=active]:border-emerald-600 data-[state=active]:bg-emerald-600 data-[state=active]:text-white min-w-fit">
            <CalendarRange className="h-3 w-3 sm:h-4 sm:w-4" /> 
            <span className="hidden sm:inline">Leave Center</span>
            <span className="sm:hidden">Planning</span>
          </TabsTrigger>

          {/* Outstanding Leave Tab — for HR Leave Office */}
          {(isHrLeaveOfficeRole(userRole) || isRegionalHR) && (
            <TabsTrigger value="outstanding-leave" className="gap-1 sm:gap-2 rounded-2xl border border-green-200 bg-white px-3 sm:px-5 py-2 sm:py-3 text-xs sm:text-sm text-green-800 hover:bg-green-50 data-[state=active]:border-green-600 data-[state=active]:bg-green-600 data-[state=active]:text-white min-w-fit">
              <Gift className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Outstanding Leave</span>
              <span className="sm:hidden">Outstanding</span>
            </TabsTrigger>
          )}

          {/* Leave Analytics Tab — view-only for regional HR */}
          {(showAnalytics || isRegionalHR) && (
            <TabsTrigger value="hr-analytics" className="gap-1 sm:gap-2 rounded-2xl border border-purple-200 bg-white px-3 sm:px-5 py-2 sm:py-3 text-xs sm:text-sm text-purple-800 hover:bg-purple-50 data-[state=active]:border-purple-600 data-[state=active]:bg-purple-600 data-[state=active]:text-white min-w-fit">
              <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4" /> 
              <span className="hidden sm:inline">Leave Analytics</span>
              <span className="sm:hidden">Analytics</span>
            </TabsTrigger>
          )}

          {/* Balance & Calendar Tab — view-only for regional HR */}
          <TabsTrigger value="insights" className="gap-1 sm:gap-2 rounded-2xl border border-blue-200 bg-white px-3 sm:px-5 py-2 sm:py-3 text-xs sm:text-sm text-blue-800 hover:bg-blue-50 data-[state=active]:border-emerald-600 data-[state=active]:bg-emerald-600 data-[state=active]:text-white min-w-fit">
            <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4" /> 
            <span className="hidden sm:inline">Balance & Calendar</span>
            <span className="sm:hidden">Balance</span>
          </TabsTrigger>

          {/* Regional Reports Tab — for Regional HR Officer (generate) and HR Leave Office (view all) */}
          {(isRegionalHR || isHrOffice) && (
            <TabsTrigger value="regional-reports" className="gap-1 sm:gap-2 rounded-2xl border border-indigo-200 bg-white px-3 sm:px-5 py-2 sm:py-3 text-xs sm:text-sm text-indigo-800 hover:bg-indigo-50 data-[state=active]:border-indigo-600 data-[state=active]:bg-indigo-600 data-[state=active]:text-white min-w-fit">
              <FileText className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Regional Reports</span>
              <span className="sm:hidden">Reports</span>
            </TabsTrigger>
          )}
        </TabsList>

        {/* Info Tab */}
        <TabsContent value="info" className="space-y-4 sm:space-y-6 w-full">
          <LeaveCenterInfo
            userRole={userRole}
            userDepartmentName={userDepartmentName}
            isViewOnly={isViewOnly}
          />
        </TabsContent>

        {/* Leave Management Tab */}
        <TabsContent value="leave-management" className="space-y-4 sm:space-y-6 w-full">
          {isViewOnly && (
            <div className="mb-4 p-3 rounded-lg bg-amber-900/30 border border-amber-700 text-amber-300 text-sm">
              <strong>View-Only Mode:</strong> You have read-only access to this section. Contact HR Leave Office for any actions.
            </div>
          )}
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
            isViewOnly={isViewOnly}
            userLocationId={userLocationId}
          />
        </TabsContent>

        {/* Leave Planning Tab */}
        <TabsContent value="leave-planning" className="space-y-4 sm:space-y-6 w-full">
          {isViewOnly && (
            <div className="mb-4 p-3 rounded-lg bg-amber-900/30 border border-amber-700 text-amber-300 text-sm">
              <strong>View-Only Mode:</strong> You have read-only access to this section. Contact HR Leave Office for any actions.
            </div>
          )}
          <LeavePlanningClient
            profile={{
              role: userRole,
              departmentName: userDepartmentName,
              departmentCode: userDepartmentCode,
            }}
            isViewOnly={isViewOnly}
            userLocationId={userLocationId}
          />
        </TabsContent>

        {/* Outstanding Leave Tab */}
        {(isHrLeaveOfficeRole(userRole) || isRegionalHR) && (
          <TabsContent value="outstanding-leave" className="space-y-4 sm:space-y-6 w-full">
            {isViewOnly && (
              <div className="mb-4 p-3 rounded-lg bg-amber-900/30 border border-amber-700 text-amber-300 text-sm">
                <strong>View-Only Mode:</strong> You have read-only access to this section.
              </div>
            )}
            <OutstandingLeavePanel isViewOnly={isViewOnly} userLocationId={userLocationId} />
          </TabsContent>
        )}

        {/* Leave Analytics Tab */}
        {(showAnalytics || isRegionalHR) && (
          <TabsContent value="hr-analytics" className="space-y-4 sm:space-y-6 w-full">
            {isViewOnly && (
              <div className="mb-4 p-3 rounded-lg bg-amber-900/30 border border-amber-700 text-amber-300 text-sm">
                <strong>View-Only Mode:</strong> You have read-only access to this section.
              </div>
            )}
            <HrLeaveAnalyticsPanel isViewOnly={isViewOnly} userLocationId={userLocationId} />
          </TabsContent>
        )}

        {/* Balance & Calendar Tab */}
        <TabsContent value="insights" className="space-y-4 sm:space-y-6 w-full">
          {isViewOnly && (
            <div className="mb-4 p-3 rounded-lg bg-amber-900/30 border border-amber-700 text-amber-300 text-sm">
              <strong>View-Only Mode:</strong> You have read-only access to this section.
            </div>
          )}
          <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2 w-full">
            <div className="w-full">
              <LeaveBalanceWidget />
            </div>
            <div className="w-full">
              <TeamCalendarView isHrOffice={isHrOffice} userLocationId={userLocationId} />
            </div>
          </div>
        </TabsContent>

        {/* Regional Reports Tab */}
        {(isRegionalHR || isHrOffice) && (
          <TabsContent value="regional-reports" className="space-y-4 sm:space-y-6 w-full">
            <RegionalLeaveReportPanel
              userId={userId}
              userName={`${userFirstName || ""} ${userLastName || ""}`.trim()}
              locationId={userLocationId}
              locationName={userLocationName}
              regionName={userRegionName}
              isViewOnly={isHrOffice && !isRegionalHR}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
