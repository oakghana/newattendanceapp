"use client"

import { BarChart3, CalendarRange, LayoutPanelTop, TrendingUp, Gift } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LeaveManagementClient } from "./leave-management-client"
import { LeavePlanningClient } from "../leave-planning/leave-planning-client"
import { LeaveBalanceWidget } from "@/components/leave/leave-balance-widget"
import { TeamCalendarView } from "@/components/leave/team-calendar-view"
import { HrLeaveAnalyticsPanel } from "./hr-leave-analytics-panel"
import { OutstandingLeavePanel } from "./outstanding-leave-panel"
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
        <TabsList className="flex h-auto w-full flex-wrap gap-2 rounded-3xl border border-blue-100 bg-blue-50/60 p-2 shadow-sm overflow-x-auto sm:overflow-visible">
          <TabsTrigger value="leave-management" className="gap-1 sm:gap-2 rounded-2xl border border-blue-200 bg-white px-3 sm:px-5 py-2 sm:py-3 text-xs sm:text-sm text-blue-800 hover:bg-blue-50 data-[state=active]:border-emerald-600 data-[state=active]:bg-emerald-600 data-[state=active]:text-white min-w-fit">
            <LayoutPanelTop className="h-3 w-3 sm:h-4 sm:w-4" /> 
            <span className="hidden sm:inline">Leave Management</span>
            <span className="sm:hidden">Requests</span>
          </TabsTrigger>
          <TabsTrigger value="leave-planning" className="gap-1 sm:gap-2 rounded-2xl border border-blue-200 bg-white px-3 sm:px-5 py-2 sm:py-3 text-xs sm:text-sm text-blue-800 hover:bg-blue-50 data-[state=active]:border-emerald-600 data-[state=active]:bg-emerald-600 data-[state=active]:text-white min-w-fit">
            <CalendarRange className="h-3 w-3 sm:h-4 sm:w-4" /> 
            <span className="hidden sm:inline">Leave & HR Leave</span>
            <span className="sm:hidden">Planning</span>
          </TabsTrigger>
          {isHrLeaveOfficeRole(userRole) && (
            <TabsTrigger value="outstanding-leave" className="gap-1 sm:gap-2 rounded-2xl border border-green-200 bg-white px-3 sm:px-5 py-2 sm:py-3 text-xs sm:text-sm text-green-800 hover:bg-green-50 data-[state=active]:border-green-600 data-[state=active]:bg-green-600 data-[state=active]:text-white min-w-fit">
              <Gift className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Outstanding Leave</span>
              <span className="sm:hidden">Outstanding</span>
            </TabsTrigger>
          )}
          {showAnalytics && (
            <TabsTrigger value="hr-analytics" className="gap-1 sm:gap-2 rounded-2xl border border-purple-200 bg-white px-3 sm:px-5 py-2 sm:py-3 text-xs sm:text-sm text-purple-800 hover:bg-purple-50 data-[state=active]:border-purple-600 data-[state=active]:bg-purple-600 data-[state=active]:text-white min-w-fit">
              <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4" /> 
              <span className="hidden sm:inline">Leave Analytics</span>
              <span className="sm:hidden">Analytics</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="insights" className="gap-1 sm:gap-2 rounded-2xl border border-blue-200 bg-white px-3 sm:px-5 py-2 sm:py-3 text-xs sm:text-sm text-blue-800 hover:bg-blue-50 data-[state=active]:border-emerald-600 data-[state=active]:bg-emerald-600 data-[state=active]:text-white min-w-fit">
            <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4" /> 
            <span className="hidden sm:inline">Balance & Calendar</span>
            <span className="sm:hidden">Balance</span>
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
          <LeavePlanningClient
            profile={{
              role: userRole,
              departmentName: userDepartmentName,
              departmentCode: userDepartmentCode,
            }}
          />
        </TabsContent>

        {isHrLeaveOfficeRole(userRole) && (
          <TabsContent value="outstanding-leave" className="space-y-4 sm:space-y-6 w-full">
            <OutstandingLeavePanel />
          </TabsContent>
        )}

        {showAnalytics && (
          <TabsContent value="hr-analytics" className="space-y-4 sm:space-y-6 w-full">
            <HrLeaveAnalyticsPanel />
          </TabsContent>
        )}

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
