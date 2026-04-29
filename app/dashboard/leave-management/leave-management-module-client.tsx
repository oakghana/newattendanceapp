"use client"

import { CalendarRange, LayoutPanelTop } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LeaveManagementClient } from "./leave-management-client"
import { LeavePlanningClient } from "../leave-planning/leave-planning-client"

interface LeaveManagementModuleClientProps {
  userRole: string
  userDepartment: string | null
  userDepartmentName: string | null
  userDepartmentCode: string | null
  initialStaffRequests: any[]
  initialManagerNotifications: any[]
}

export function LeaveManagementModuleClient({
  userRole,
  userDepartment,
  userDepartmentName,
  userDepartmentCode,
  initialStaffRequests,
  initialManagerNotifications,
}: LeaveManagementModuleClientProps) {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="leave-management" className="space-y-6">
        <TabsList className="flex h-auto w-full flex-wrap gap-2 rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,_rgba(255,255,255,0.96)_0%,_rgba(248,250,252,0.92)_100%)] p-2 shadow-sm">
          <TabsTrigger value="leave-management" className="gap-2 rounded-2xl px-5 py-3 data-[state=active]:bg-slate-900 data-[state=active]:text-white">
            <LayoutPanelTop className="h-4 w-4" /> Leave Management
          </TabsTrigger>
          <TabsTrigger value="leave-planning" className="gap-2 rounded-2xl px-5 py-3 data-[state=active]:bg-slate-900 data-[state=active]:text-white">
            <CalendarRange className="h-4 w-4" /> Leave Planning
          </TabsTrigger>
        </TabsList>

        <TabsContent value="leave-management" className="space-y-6">
          <LeaveManagementClient
            userRole={userRole}
            userDepartment={userDepartment}
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
      </Tabs>
    </div>
  )
}
