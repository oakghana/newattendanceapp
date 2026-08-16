"use client"

import { Info, CalendarRange, Download } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LeaveManagementClient } from "./leave-management-client"
import { LeavePlanningClient } from "../leave-planning/leave-planning-client"
import { LoanOfficePaymentAdviceTab } from "@/components/leave/loan-office-payment-advice-tab"

interface LoanOfficeLeaveModuleProps {
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

export function LoanOfficeLeaveModule({
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
}: LoanOfficeLeaveModuleProps) {
  return (
    <div className="space-y-6 w-full">
      <Tabs defaultValue="info" className="space-y-4 w-full">
        <TabsList className="flex h-auto w-full flex-wrap gap-2 rounded-3xl border border-slate-200 bg-slate-100/80 p-2 shadow-sm overflow-x-auto sm:overflow-visible">
          {/* Info Tab */}
          <TabsTrigger value="info" className="relative gap-1 sm:gap-2 rounded-2xl border-2 border-slate-200 bg-white px-3 sm:px-5 py-2 sm:py-3 text-xs sm:text-sm text-slate-600 hover:bg-slate-50 hover:border-emerald-300 transition-all duration-300 ease-out data-[state=active]:border-emerald-600 data-[state=active]:bg-gradient-to-br data-[state=active]:from-emerald-500 data-[state=active]:to-emerald-700 data-[state=active]:text-white data-[state=active]:shadow-[0_4px_20px_rgba(16,185,129,0.5)] data-[state=active]:scale-105 data-[state=active]:font-bold data-[state=active]:-translate-y-0.5 min-w-fit group">
            <Info className="h-3 w-3 sm:h-4 sm:w-4 transition-transform duration-300 group-data-[state=active]:animate-pulse" /> 
            <span className="hidden sm:inline">Info</span>
            <span className="sm:hidden">Info</span>
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-0 h-1 bg-emerald-500 rounded-full transition-all duration-300 group-data-[state=active]:w-3/4" />
          </TabsTrigger>

          {/* Leave Center Tab */}
          <TabsTrigger value="leave-center" className="relative gap-1 sm:gap-2 rounded-2xl border-2 border-slate-200 bg-white px-3 sm:px-5 py-2 sm:py-3 text-xs sm:text-sm text-slate-600 hover:bg-slate-50 hover:border-blue-300 transition-all duration-300 ease-out data-[state=active]:border-blue-600 data-[state=active]:bg-gradient-to-br data-[state=active]:from-blue-500 data-[state=active]:to-blue-700 data-[state=active]:text-white data-[state=active]:shadow-[0_4px_20px_rgba(59,130,246,0.5)] data-[state=active]:scale-105 data-[state=active]:font-bold data-[state=active]:-translate-y-0.5 min-w-fit group">
            <CalendarRange className="h-3 w-3 sm:h-4 sm:w-4 transition-transform duration-300 group-data-[state=active]:animate-pulse" /> 
            <span className="hidden sm:inline">Leave Center</span>
            <span className="sm:hidden">Center</span>
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-0 h-1 bg-blue-500 rounded-full transition-all duration-300 group-data-[state=active]:w-3/4" />
          </TabsTrigger>

          {/* Payment & Download Tab */}
          <TabsTrigger value="payment-download" className="relative gap-1 sm:gap-2 rounded-2xl border-2 border-slate-200 bg-white px-3 sm:px-5 py-2 sm:py-3 text-xs sm:text-sm text-slate-600 hover:bg-slate-50 hover:border-orange-300 transition-all duration-300 ease-out data-[state=active]:border-orange-600 data-[state=active]:bg-gradient-to-br data-[state=active]:from-orange-500 data-[state=active]:to-orange-700 data-[state=active]:text-white data-[state=active]:shadow-[0_4px_20px_rgba(249,115,22,0.5)] data-[state=active]:scale-105 data-[state=active]:font-bold data-[state=active]:-translate-y-0.5 min-w-fit group">
            <Download className="h-3 w-3 sm:h-4 sm:w-4 transition-transform duration-300 group-data-[state=active]:animate-pulse" /> 
            <span className="hidden sm:inline">Payment & Download</span>
            <span className="sm:hidden">Payment</span>
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-0 h-1 bg-orange-500 rounded-full transition-all duration-300 group-data-[state=active]:w-3/4" />
          </TabsTrigger>
        </TabsList>

        {/* Info Tab Content */}
        <TabsContent value="info" className="space-y-4 sm:space-y-6 w-full">
          <LeaveManagementClient
            userId={userId}
            userRole={userRole ?? ""}
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

        {/* Leave Center Tab Content */}
        <TabsContent value="leave-center" className="space-y-4 sm:space-y-6 w-full">
          <LeavePlanningClient
            profile={{
              id: userId,
              role: userRole ?? "loan_office",
              departmentName: userDepartmentName,
              departmentCode: userDepartmentCode,
            }}
          />
        </TabsContent>

        {/* Payment & Download Tab Content */}
        <TabsContent value="payment-download" className="space-y-4 sm:space-y-6 w-full">
          <LoanOfficePaymentAdviceTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
