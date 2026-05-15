"use client"

import { BarChart3, CalendarRange, TrendingUp, Gift, Info } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LeaveManagementClient } from "./leave-management-client"
import { LeavePlanningClient } from "../leave-planning/leave-planning-client"
import { LeaveBalanceWidget } from "@/components/leave/leave-balance-widget"
import { TeamCalendarView } from "@/components/leave/team-calendar-view"
import { HrLeaveAnalyticsPanel } from "./hr-leave-analytics-panel"
import { OutstandingLeavePanel } from "./outstanding-leave-panel"
import { LeaveCenterInfo } from "./leave-center-info"
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
  userLocationName: string | null
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
  userLocationName,
  hasHodLinkage,
  initialStaffRequests,
  initialManagerNotifications,
  initialApprovedStaffRequests = [],
}: LeaveManagementModuleClientProps) {
  const showAnalytics = isHrAnalyticsRole(userRole)
  const normalizedRole = normalizeRole(userRole)
  const isHrOffice = isHrLeaveOfficeRole(normalizedRole)
  const isRegionalHR = isRegionalHrOfficerRole(normalizedRole)

  return (
    <div className="space-y-6 w-full">
      <Tabs defaultValue="leave-management" className="space-y-4 w-full">
        <TabsList className="flex h-auto w-full flex-wrap gap-2 rounded-3xl border border-slate-200 bg-slate-100/80 p-2 shadow-sm overflow-x-auto sm:overflow-visible">
          {/* Info Tab (renamed from Leave Center) */}
          <TabsTrigger value="leave-management" className="gap-1 sm:gap-2 rounded-2xl border border-slate-200 bg-white px-3 sm:px-5 py-2 sm:py-3 text-xs sm:text-sm text-slate-600 hover:bg-slate-50 transition-all duration-200 data-[state=active]:border-emerald-500 data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-emerald-200 data-[state=active]:scale-[1.02] data-[state=active]:font-semibold min-w-fit">
            <Info className="h-3 w-3 sm:h-4 sm:w-4" /> 
            <span className="hidden sm:inline">Info</span>
            <span className="sm:hidden">Info</span>
          </TabsTrigger>

          {/* Regional HR Officers have view-only access to Leave Center tabs */}
          {!isRegionalHR && (
            <TabsTrigger value="leave-planning" className="gap-1 sm:gap-2 rounded-2xl border border-slate-200 bg-white px-3 sm:px-5 py-2 sm:py-3 text-xs sm:text-sm text-slate-600 hover:bg-slate-50 transition-all duration-200 data-[state=active]:border-blue-500 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-blue-200 data-[state=active]:scale-[1.02] data-[state=active]:font-semibold min-w-fit">
              <CalendarRange className="h-3 w-3 sm:h-4 sm:w-4" /> 
              <span className="hidden sm:inline">Leave Center</span>
              <span className="sm:hidden">Planning</span>
            </TabsTrigger>
          )}

          {isHrLeaveOfficeRole(userRole) && !isRegionalHR && (
            <TabsTrigger value="outstanding-leave" className="gap-1 sm:gap-2 rounded-2xl border border-slate-200 bg-white px-3 sm:px-5 py-2 sm:py-3 text-xs sm:text-sm text-slate-600 hover:bg-slate-50 transition-all duration-200 data-[state=active]:border-green-500 data-[state=active]:bg-green-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-green-200 data-[state=active]:scale-[1.02] data-[state=active]:font-semibold min-w-fit">
              <Gift className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Outstanding Leave</span>
              <span className="sm:hidden">Outstanding</span>
            </TabsTrigger>
          )}

          {showAnalytics && !isRegionalHR && (
            <TabsTrigger value="hr-analytics" className="gap-1 sm:gap-2 rounded-2xl border border-slate-200 bg-white px-3 sm:px-5 py-2 sm:py-3 text-xs sm:text-sm text-slate-600 hover:bg-slate-50 transition-all duration-200 data-[state=active]:border-purple-500 data-[state=active]:bg-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-purple-200 data-[state=active]:scale-[1.02] data-[state=active]:font-semibold min-w-fit">
              <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4" /> 
              <span className="hidden sm:inline">Leave Analytics</span>
              <span className="sm:hidden">Analytics</span>
            </TabsTrigger>
          )}

          <TabsTrigger value="insights" className="gap-1 sm:gap-2 rounded-2xl border border-slate-200 bg-white px-3 sm:px-5 py-2 sm:py-3 text-xs sm:text-sm text-slate-600 hover:bg-slate-50 transition-all duration-200 data-[state=active]:border-amber-500 data-[state=active]:bg-amber-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-amber-200 data-[state=active]:scale-[1.02] data-[state=active]:font-semibold min-w-fit">
            <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4" /> 
            <span className="hidden sm:inline">Balance & Calendar</span>
            <span className="sm:hidden">Balance</span>
          </TabsTrigger>
        </TabsList>

        {/* Info Tab — shows Leave Management overview */}
        <TabsContent value="leave-management" className="space-y-4 sm:space-y-6 w-full">
          {isRegionalHR ? (
            <LeaveCenterInfo userRole={userRole} userDepartmentName={userDepartmentName} />
          ) : (
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
          )}
        </TabsContent>

        {/* Leave Planning Tab */}
        {!isRegionalHR && (
          <TabsContent value="leave-planning" className="space-y-4 sm:space-y-6 w-full">
            <LeavePlanningClient
              profile={{
                role: userRole,
                departmentName: userDepartmentName,
                departmentCode: userDepartmentCode,
              }}
            />
          </TabsContent>
        )}

        {/* Outstanding Leave Tab */}
        {isHrLeaveOfficeRole(userRole) && !isRegionalHR && (
          <TabsContent value="outstanding-leave" className="space-y-4 sm:space-y-6 w-full">
            <OutstandingLeavePanel />
          </TabsContent>
        )}

        {/* Leave Analytics Tab */}
        {showAnalytics && !isRegionalHR && (
          <TabsContent value="hr-analytics" className="space-y-4 sm:space-y-6 w-full">
            <HrLeaveAnalyticsPanel />
          </TabsContent>
        )}

        {/* Balance & Calendar Tab */}
        <TabsContent value="insights" className="space-y-4 sm:space-y-6 w-full">
          <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2 w-full">
            <div className="w-full">
              <LeaveBalanceWidget />
            </div>
            <div className="w-full">
              <TeamCalendarView isHrOffice={isHrOffice} />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
