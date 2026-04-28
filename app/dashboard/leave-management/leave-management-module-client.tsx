"use client"

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
    <div className="space-y-4">
      <Tabs defaultValue="leave-management" className="space-y-4">
        <TabsList>
          <TabsTrigger value="leave-management">Leave Management</TabsTrigger>
          <TabsTrigger value="leave-planning">Leave Planning</TabsTrigger>
        </TabsList>

        <TabsContent value="leave-management">
          <LeaveManagementClient
            userRole={userRole}
            userDepartment={userDepartment}
            initialStaffRequests={initialStaffRequests}
            initialManagerNotifications={initialManagerNotifications}
          />
        </TabsContent>

        <TabsContent value="leave-planning">
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
