"use client"

import { BarChart3, CalendarRange, LayoutPanelTop } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LeaveManagementClient } from "./leave-management-client"
import { LeavePlanningClient } from "../leave-planning/leave-planning-client"
import { LeaveBalanceWidget } from "@/components/leave/leave-balance-widget"
import { TeamCalendarView } from "@/components/leave/team-calendar-view"

interface LeaveManagementModuleClientProps {
  userRole: string
  userDepartment: string | null
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
  inactivityDays,
  userDepartmentName,
  userDepartmentCode,
  hasHodLinkage,
  initialStaffRequests,
  initialManagerNotifications,
}: LeaveManagementModuleClientProps) {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="leave-management" className="space-y-6">
        <TabsList className="flex h-auto w-full flex-wrap gap-2 rounded-3xl border border-blue-100 bg-blue-50/60 p-2 shadow-sm">
          <TabsTrigger value="leave-management" className="gap-2 rounded-2xl border border-blue-200 bg-white px-5 py-3 text-blue-800 hover:bg-blue-50 data-[state=active]:border-emerald-600 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
            <LayoutPanelTop className="h-4 w-4" /> Leave Management
          </TabsTrigger>
          <TabsTrigger value="leave-planning" className="gap-2 rounded-2xl border border-blue-200 bg-white px-5 py-3 text-blue-800 hover:bg-blue-50 data-[state=active]:border-emerald-600 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
            <CalendarRange className="h-4 w-4" /> Leave Planning
          </TabsTrigger>
          <TabsTrigger value="insights" className="gap-2 rounded-2xl border border-blue-200 bg-white px-5 py-3 text-blue-800 hover:bg-blue-50 data-[state=active]:border-emerald-600 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
            <BarChart3 className="h-4 w-4" /> Balance & Calendar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="leave-management" className="space-y-6">
          <LeaveManagementClient
            userRole={userRole}
            userDepartment={userDepartment}
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

        <TabsContent value="insights" className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-2">
            <LeaveBalanceWidget />
            <TeamCalendarView />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
