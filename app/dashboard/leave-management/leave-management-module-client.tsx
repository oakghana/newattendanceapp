"use client"

import { BarChart3, CalendarRange, LayoutPanelTop, TrendingUp, Settings } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LeaveManagementClient } from "./leave-management-client"
import { LeavePlanningClient } from "../leave-planning/leave-planning-client"
import { LeaveBalanceWidget } from "@/components/leave/leave-balance-widget"
import { TeamCalendarView } from "@/components/leave/team-calendar-view"
import { HrLeaveAnalyticsPanel } from "./hr-leave-analytics-panel"
import { LeaveCalendarSettingsClient } from "@/components/leave/leave-calendar-settings-client"
import { isHrLeaveOfficeRole } from "@/lib/leave-planning"

const HR_ANALYTICS_ROLES = ["leave_admin", "admin", "hr_office", "hr"]
const HOLIDAY_MANAGEMENT_ROLES = ["admin", "leave_admin", "hr_office", "director_hr", "manager_hr"]

function normalizeRole(role: string | null | undefined) {
  return String(role || "").toLowerCase().trim().replace(/[-\s]+/g, "_")
}

function isHrAnalyticsRole(role: string | null | undefined) {
  const normalized = normalizeRole(role)
  return HR_ANALYTICS_ROLES.includes(normalized)
}

function canManageHolidays(role: string | null | undefined) {
  const normalized = normalizeRole(role)
  return HOLIDAY_MANAGEMENT_ROLES.includes(normalized)
}

interface LeaveManagementModuleClientProps {
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
}

export function LeaveManagementModuleClient({
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
}: LeaveManagementModuleClientProps) {
  const showAnalytics = isHrAnalyticsRole(userRole)
  const showHolidayManagement = canManageHolidays(userRole)
  const normalizedRole = normalizeRole(userRole)
  const isHrOffice = isHrLeaveOfficeRole(normalizedRole)

  return (
    <div className="space-y-6">
      <Tabs defaultValue="leave-management" className="space-y-6">
        <TabsList className="flex h-auto w-full flex-nowrap gap-2 overflow-x-auto rounded-3xl border border-blue-100 bg-blue-50/60 p-2 shadow-sm">
          <TabsTrigger value="leave-management" className="gap-2 rounded-2xl border border-blue-200 bg-white px-5 py-3 text-blue-800 hover:bg-blue-50 data-[state=active]:border-emerald-600 data-[state=active]:bg-emerald-600 data-[state=active]:text-white shrink-0">
            <LayoutPanelTop className="h-4 w-4" /> Leave Management
          </TabsTrigger>
          <TabsTrigger value="leave-planning" className="gap-2 rounded-2xl border border-blue-200 bg-white px-5 py-3 text-blue-800 hover:bg-blue-50 data-[state=active]:border-emerald-600 data-[state=active]:bg-emerald-600 data-[state=active]:text-white shrink-0">
            <CalendarRange className="h-4 w-4" /> Leave & HR Leave
          </TabsTrigger>
          {showAnalytics && (
            <TabsTrigger value="hr-analytics" className="gap-2 rounded-2xl border border-purple-200 bg-white px-5 py-3 text-purple-800 hover:bg-purple-50 data-[state=active]:border-purple-600 data-[state=active]:bg-purple-600 data-[state=active]:text-white shrink-0">
              <TrendingUp className="h-4 w-4" /> Leave Analytics
            </TabsTrigger>
          )}
          <TabsTrigger value="insights" className="gap-2 rounded-2xl border border-blue-200 bg-white px-5 py-3 text-blue-800 hover:bg-blue-50 data-[state=active]:border-emerald-600 data-[state=active]:bg-emerald-600 data-[state=active]:text-white shrink-0">
            <BarChart3 className="h-4 w-4" /> Balance & Calendar
          </TabsTrigger>
          {showHolidayManagement && (
            <TabsTrigger value="holiday-management" className="gap-2 rounded-2xl border border-orange-200 bg-white px-5 py-3 text-orange-800 hover:bg-orange-50 data-[state=active]:border-orange-600 data-[state=active]:bg-orange-600 data-[state=active]:text-white shrink-0">
              <Settings className="h-4 w-4" /> Holiday Management
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="leave-management" className="space-y-6">
          <LeaveManagementClient
            userRole={userRole}
            userDepartment={userDepartment}
            userFirstName={userFirstName}
            userLastName={userLastName}
            hasHodLinkage={hasHodLinkage}
            inactivityDays={inactivityDays}
            initialStaffRequests={initialStaffRequests}
            initialManagerNotifications={initialManagerNotifications}
          />
        </TabsContent>

        <TabsContent value="leave-planning" className="space-y-6">
          <LeavePlanningClient
            profile={{
              role: userRole,
              departmentName: userDepartmentName,
              departmentCode: userDepartmentCode,
            }}
          />
        </TabsContent>

        {showAnalytics && (
          <TabsContent value="hr-analytics" className="space-y-6">
            <HrLeaveAnalyticsPanel />
          </TabsContent>
        )}

        <TabsContent value="insights" className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-2">
            <LeaveBalanceWidget />
            <TeamCalendarView isHrOffice={isHrOffice} />
          </div>
        </TabsContent>

        {showHolidayManagement && (
          <TabsContent value="holiday-management" className="space-y-6">
            <LeaveCalendarSettingsClient />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
