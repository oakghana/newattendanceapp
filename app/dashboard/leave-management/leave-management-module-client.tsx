"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { BarChart3, CalendarRange, TrendingUp, Gift, Info, FileText, CheckCircle, CalendarDays } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LeaveManagementClient } from "./leave-management-client"
import { LeavePlanningClient } from "../leave-planning/leave-planning-client"
import { LeaveBalanceWidget } from "@/components/leave/leave-balance-widget"
import { TeamCalendarView } from "@/components/leave/team-calendar-view"
import { HrLeaveAnalyticsPanel } from "./hr-leave-analytics-panel"
import { OutstandingLeavePanel } from "./outstanding-leave-panel"
import { CarryoverApprovalDashboard } from "./carryover-approval-dashboard"
import { AuditComplianceDashboard } from "./audit-compliance-dashboard"
import { isHrLeaveOfficeRole, isRegionalHrOfficerRole } from "@/lib/leave-planning"
import { HrExecutiveLeaveModule } from "./hr-executive-leave-module"
import { LoanOfficePaymentAdviceTab } from "@/components/leave/loan-office-payment-advice-tab"
import { LoanOfficeLeaveModule } from "./loan-office-leave-module"
import { ShiftSchedulingPanel } from "@/components/leave/shift-scheduling-panel"

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
  userLocationId: string | null
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
  userLocationId,
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
  const isRegionalHR = isRegionalHrOfficerRole(normalizedRole) || (normalizedRole.includes("regional") && normalizedRole.includes("hr"))
  const isHrExecutive = ['hr_executive', 'hr_director', 'director_hr', 'manager_hr'].includes(normalizedRole)
  const isLoanOffice = normalizedRole === 'loan_office' || normalizedRole === 'hr_loan_office' || normalizedRole === 'accounts_loan_office'
  const searchParams = useSearchParams()
  const defaultTab = isRegionalHR ? "leave-planning" : "leave-management"
  const requestedTab = searchParams.get("tab")
  const shouldOpenApplyForm = requestedTab === "leave-planning"
  const [activeTab, setActiveTab] = useState(() => requestedTab || defaultTab)

  useEffect(() => {
    const requestedTab = searchParams.get("tab")
    if (requestedTab) setActiveTab(requestedTab)
  }, [searchParams])

  // HR Executives get a simplified dedicated module instead of the full tab bar
  if (isHrExecutive) {
    return (
      <HrExecutiveLeaveModule
        userId={userId}
        userRole={userRole ?? ""}
        userDepartment={userDepartment ?? ""}
        userFirstName={userFirstName}
        userLastName={userLastName}
        inactivityDays={inactivityDays}
        userDepartmentName={userDepartmentName ?? ""}
        userDepartmentCode={userDepartmentCode}
        userLocationName={userLocationName}
        hasHodLinkage={hasHodLinkage}
        initialStaffRequests={initialStaffRequests}
        initialManagerNotifications={initialManagerNotifications}
        initialApprovedStaffRequests={initialApprovedStaffRequests}
      />
    )
  }

  // Loan Office gets a dedicated module with limited tabs
  if (isLoanOffice) {
    return (
      <LoanOfficeLeaveModule
        userId={userId}
        userRole={userRole ?? ""}
        userDepartment={userDepartment ?? ""}
        userFirstName={userFirstName}
        userLastName={userLastName}
        inactivityDays={inactivityDays}
        userDepartmentName={userDepartmentName ?? ""}
        userDepartmentCode={userDepartmentCode}
        userLocationName={userLocationName}
        hasHodLinkage={hasHodLinkage}
        initialStaffRequests={initialStaffRequests}
        initialManagerNotifications={initialManagerNotifications}
        initialApprovedStaffRequests={initialApprovedStaffRequests}
      />
    )
  }

  return (
    <div className="space-y-6 w-full">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 w-full">
        <TabsList className="flex h-auto w-full flex-nowrap gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-slate-100/80 p-2 shadow-sm sm:flex-wrap sm:overflow-visible sm:rounded-3xl">
          {/* Regional HR uses this as the operational queue; other roles see the overview. */}
          {!isRegionalHR && <TabsTrigger value="leave-management" className="relative gap-1 sm:gap-2 rounded-2xl border-2 border-slate-200 bg-white px-3 sm:px-5 py-2 sm:py-3 text-xs sm:text-sm text-slate-600 hover:bg-slate-50 hover:border-emerald-300 transition-all duration-300 ease-out data-[state=active]:border-emerald-600 data-[state=active]:bg-gradient-to-br data-[state=active]:from-emerald-500 data-[state=active]:to-emerald-700 data-[state=active]:text-white data-[state=active]:shadow-[0_4px_20px_rgba(16,185,129,0.5)] data-[state=active]:scale-105 data-[state=active]:font-bold data-[state=active]:-translate-y-0.5 min-w-fit group">
            <Info className="h-3 w-3 sm:h-4 sm:w-4 transition-transform duration-300 group-data-[state=active]:animate-pulse" /> 
            <span className="hidden sm:inline">{isRegionalHR ? "Operations" : "Info"}</span>
            <span className="sm:hidden">{isRegionalHR ? "Operations" : "Info"}</span>
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-0 h-1 bg-emerald-500 rounded-full transition-all duration-300 group-data-[state=active]:w-3/4" />
          </TabsTrigger>}

          {/* Regional HR can view Leave Center, but not edit annual policy settings. */}
          <TabsTrigger value="leave-planning" className="relative gap-1 sm:gap-2 rounded-2xl border-2 border-slate-200 bg-white px-3 sm:px-5 py-2 sm:py-3 text-xs sm:text-sm text-slate-600 hover:bg-slate-50 hover:border-blue-300 transition-all duration-300 ease-out data-[state=active]:border-blue-600 data-[state=active]:bg-gradient-to-br data-[state=active]:from-blue-500 data-[state=active]:to-blue-700 data-[state=active]:text-white data-[state=active]:shadow-[0_4px_20px_rgba(59,130,246,0.5)] data-[state=active]:scale-105 data-[state=active]:font-bold data-[state=active]:-translate-y-0.5 min-w-fit group">
              <CalendarRange className="h-3 w-3 sm:h-4 sm:w-4 transition-transform duration-300 group-data-[state=active]:animate-pulse" /> 
              <span className="hidden sm:inline">Leave Center</span>
              <span className="sm:hidden">Planning</span>
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-0 h-1 bg-blue-500 rounded-full transition-all duration-300 group-data-[state=active]:w-3/4" />
            </TabsTrigger>

          <TabsTrigger value="shift-scheduling" className="relative gap-1 sm:gap-2 rounded-2xl border-2 border-slate-200 bg-white px-3 sm:px-5 py-2 sm:py-3 text-xs sm:text-sm text-slate-600 hover:bg-slate-50 hover:border-teal-300 transition-all duration-300 ease-out data-[state=active]:border-teal-600 data-[state=active]:bg-teal-600 data-[state=active]:text-white min-w-fit">
            <CalendarDays className="h-3 w-3 sm:h-4 sm:w-4" />
            <span>Shifts</span>
          </TabsTrigger>

          {isHrLeaveOfficeRole(userRole) && !isRegionalHR && (
            <TabsTrigger value="outstanding-leave" className="relative gap-1 sm:gap-2 rounded-2xl border-2 border-slate-200 bg-white px-3 sm:px-5 py-2 sm:py-3 text-xs sm:text-sm text-slate-600 hover:bg-slate-50 hover:border-green-300 transition-all duration-300 ease-out data-[state=active]:border-green-600 data-[state=active]:bg-gradient-to-br data-[state=active]:from-green-500 data-[state=active]:to-green-700 data-[state=active]:text-white data-[state=active]:shadow-[0_4px_20px_rgba(34,197,94,0.5)] data-[state=active]:scale-105 data-[state=active]:font-bold data-[state=active]:-translate-y-0.5 min-w-fit group">
              <Gift className="h-3 w-3 sm:h-4 sm:w-4 transition-transform duration-300 group-data-[state=active]:animate-pulse" />
              <span className="hidden sm:inline">Outstanding Leave</span>
              <span className="sm:hidden">Outstanding</span>
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-0 h-1 bg-green-500 rounded-full transition-all duration-300 group-data-[state=active]:w-3/4" />
            </TabsTrigger>
          )}

          {showAnalytics && !isRegionalHR && (
            <TabsTrigger value="hr-analytics" className="relative gap-1 sm:gap-2 rounded-2xl border-2 border-slate-200 bg-white px-3 sm:px-5 py-2 sm:py-3 text-xs sm:text-sm text-slate-600 hover:bg-slate-50 hover:border-purple-300 transition-all duration-300 ease-out data-[state=active]:border-purple-600 data-[state=active]:bg-gradient-to-br data-[state=active]:from-purple-500 data-[state=active]:to-purple-700 data-[state=active]:text-white data-[state=active]:shadow-[0_4px_20px_rgba(147,51,234,0.5)] data-[state=active]:scale-105 data-[state=active]:font-bold data-[state=active]:-translate-y-0.5 min-w-fit group">
              <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 transition-transform duration-300 group-data-[state=active]:animate-pulse" /> 
              <span className="hidden sm:inline">Leave Analytics</span>
              <span className="sm:hidden">Analytics</span>
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-0 h-1 bg-purple-500 rounded-full transition-all duration-300 group-data-[state=active]:w-3/4" />
            </TabsTrigger>
          )}



          {/* Carryover & Audit Tab - HR Leave Office only */}
          {isHrLeaveOfficeRole(userRole) && !isRegionalHR && (
            <TabsTrigger value="carryover-audit" className="relative gap-1 sm:gap-2 rounded-2xl border-2 border-slate-200 bg-white px-3 sm:px-5 py-2 sm:py-3 text-xs sm:text-sm text-slate-600 hover:bg-slate-50 hover:border-rose-300 transition-all duration-300 ease-out data-[state=active]:border-rose-600 data-[state=active]:bg-gradient-to-br data-[state=active]:from-rose-500 data-[state=active]:to-rose-700 data-[state=active]:text-white data-[state=active]:shadow-[0_4px_20px_rgba(244,63,94,0.5)] data-[state=active]:scale-105 data-[state=active]:font-bold data-[state=active]:-translate-y-0.5 min-w-fit group">
              <FileText className="h-3 w-3 sm:h-4 sm:w-4 transition-transform duration-300 group-data-[state=active]:animate-pulse" />
              <span className="hidden sm:inline">Carryover & Audit</span>
              <span className="sm:hidden">Audit</span>
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-0 h-1 bg-rose-500 rounded-full transition-all duration-300 group-data-[state=active]:w-3/4" />
            </TabsTrigger>
          )}



          {/* Payment & Download Tab - HR Leave Office only */}
          {isHrLeaveOfficeRole(userRole) && !isRegionalHR && (
            <TabsTrigger value="payment-download" className="relative gap-1 sm:gap-2 rounded-2xl border-2 border-slate-200 bg-white px-3 sm:px-5 py-2 sm:py-3 text-xs sm:text-sm text-slate-600 hover:bg-slate-50 hover:border-teal-300 transition-all duration-300 ease-out data-[state=active]:border-teal-600 data-[state=active]:bg-gradient-to-br data-[state=active]:from-teal-500 data-[state=active]:to-teal-700 data-[state=active]:text-white data-[state=active]:shadow-[0_4px_20px_rgba(20,184,166,0.5)] data-[state=active]:scale-105 data-[state=active]:font-bold data-[state=active]:-translate-y-0.5 min-w-fit group">
              <FileText className="h-3 w-3 sm:h-4 sm:w-4 transition-transform duration-300 group-data-[state=active]:animate-pulse" />
              <span className="hidden sm:inline">Payment & Download</span>
              <span className="sm:hidden">Payment</span>
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-0 h-1 bg-teal-500 rounded-full transition-all duration-300 group-data-[state=active]:w-3/4" />
            </TabsTrigger>
          )}

          <TabsTrigger value="insights" className="relative gap-1 sm:gap-2 rounded-2xl border-2 border-slate-200 bg-white px-3 sm:px-5 py-2 sm:py-3 text-xs sm:text-sm text-slate-600 hover:bg-slate-50 hover:border-amber-300 transition-all duration-300 ease-out data-[state=active]:border-amber-600 data-[state=active]:bg-gradient-to-br data-[state=active]:from-amber-500 data-[state=active]:to-amber-700 data-[state=active]:text-white data-[state=active]:shadow-[0_4px_20px_rgba(245,158,11,0.5)] data-[state=active]:scale-105 data-[state=active]:font-bold data-[state=active]:-translate-y-0.5 min-w-fit group">
            <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4 transition-transform duration-300 group-data-[state=active]:animate-pulse" /> 
            <span className="hidden sm:inline">Balance & Calendar</span>
            <span className="sm:hidden">Balance</span>
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-0 h-1 bg-amber-500 rounded-full transition-all duration-300 group-data-[state=active]:w-3/4" />
          </TabsTrigger>
        </TabsList>

        {/* Info Tab — shows Leave Management overview */}
        <TabsContent value="leave-management" className="space-y-4 sm:space-y-6 w-full">
          <LeaveManagementClient
              userId={userId}
              userRole={userRole ?? ""}
              userDepartment={userDepartment ?? ""}
              userLocationId={userLocationId ?? undefined}
              userFirstName={userFirstName}
              userLastName={userLastName}
              hasHodLinkage={hasHodLinkage}
              inactivityDays={inactivityDays}
              initialStaffRequests={initialStaffRequests}
              initialManagerNotifications={initialManagerNotifications}
              initialApprovedStaffRequests={initialApprovedStaffRequests}
            />
        </TabsContent>

        {/* Regional HR works the scoped queue from Leave Center; other roles use planning. */}
        {isRegionalHR ? (
          <TabsContent value="leave-planning" className="space-y-4 sm:space-y-6 w-full">
            <LeavePlanningClient
              profile={{
                id: userId,
                role: userRole || "regional_hr_leave_office",
                departmentName: userDepartmentName,
                departmentCode: userDepartmentCode,
              }}
              initialActiveTab={shouldOpenApplyForm ? "apply" : "hr-office"}
            />
          </TabsContent>
        ) : (
          <TabsContent value="leave-planning" className="space-y-4 sm:space-y-6 w-full">
            <LeavePlanningClient
              profile={{
                id: userId,
                role: userRole ?? "staff",
                departmentName: userDepartmentName,
                departmentCode: userDepartmentCode,
              }}
              initialActiveTab={shouldOpenApplyForm ? "apply" : undefined}
            />
          </TabsContent>
        )}

        <TabsContent value="shift-scheduling" className="space-y-4 sm:space-y-6 w-full">
          <ShiftSchedulingPanel userId={userId} />
        </TabsContent>

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



        {/* Carryover & Audit Tab */}
        {isHrLeaveOfficeRole(userRole) && !isRegionalHR && (
          <TabsContent value="carryover-audit" className="space-y-4 sm:space-y-6 w-full">
            <div className="space-y-6">
              <CarryoverApprovalDashboard />
              <AuditComplianceDashboard />
            </div>
          </TabsContent>
        )}



        {/* Payment & Download Tab - HR Leave Office only */}
        {isHrLeaveOfficeRole(userRole) && !isRegionalHR && (
          <TabsContent value="payment-download" className="space-y-4 sm:space-y-6 w-full">
            <LoanOfficePaymentAdviceTab isHrLeaveOffice={true} />
          </TabsContent>
        )}

        {/* Balance & Calendar Tab */}
        <TabsContent value="insights" className="space-y-4 sm:space-y-6 w-full">
          <div className="space-y-4 w-full">
            <LeaveBalanceWidget />
            <TeamCalendarView
              isHrOffice={isHrOffice}
              userId={userId}
              userDepartment={userDepartment ?? ""}
userDepartmentName={userDepartmentName ?? ""}
              userRole={userRole ?? ""}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
