"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  CheckCircle2, TrendingUp, Users,
  BookOpen, Calendar, BarChart, Plus, CheckSquare,
} from "lucide-react"
import { HrLeaveAnalyticsPanel } from "./hr-leave-analytics-panel"
import { LeaveBalanceWidget } from "@/components/leave/leave-balance-widget"
import { TeamCalendarView } from "@/components/leave/team-calendar-view"
import { HrExecutiveOverviewPanel } from "@/components/leave/hr-executive-overview-panel"
import { LeaveCenterWithTabs } from "@/components/leave/leave-center-with-tabs"
import { LeavePlanningClient } from "../leave-planning/leave-planning-client"
import { LeaveManagementClient } from "./leave-management-client"

// ── Tab type ─────────────────────────────────────────────────────────────────
type Tab = "overview" | "leave-approvals" | "analytics" | "balance-calendar" | "apply-leave" | "my-requests"

// ── Overview panel ────────────────────────────────────────────────────────────
function OverviewPanel({ onNavigate, userId }: { onNavigate: (tab: Tab) => void; userId: string }) {
  return <HrExecutiveOverviewPanel onNavigateToTab={onNavigate} />
}

// ── Main module ───────────────────────────────────────────────────────────────
interface HrExecutiveLeaveModuleProps {
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
  initialApprovedStaffRequests: any[]
}

const TABS: { id: Tab; label: string; icon: any; activeClass: string }[] = [
  { id: "overview",        label: "Overview",           icon: BookOpen,  activeClass: "bg-orange-500 text-white shadow-md border-orange-600" },
  { id: "apply-leave",     label: "Apply for Leave",    icon: Plus,      activeClass: "bg-orange-500 text-white shadow-md border-orange-600" },
  { id: "my-requests",     label: "My Requests",        icon: CheckSquare, activeClass: "bg-orange-500 text-white shadow-md border-orange-600" },
  { id: "leave-approvals", label: "Leave Center",       icon: Calendar,  activeClass: "bg-orange-500 text-white shadow-md border-orange-600" },
  { id: "balance-calendar",label: "Balance & Calendar", icon: BarChart,  activeClass: "bg-orange-500 text-white shadow-md border-orange-600" },
  { id: "analytics",       label: "Analytics",          icon: TrendingUp,activeClass: "bg-orange-500 text-white shadow-md border-orange-600" },
]

export function HrExecutiveLeaveModule({
  userId, userRole, userDepartment, userFirstName, userLastName,
  inactivityDays, userDepartmentName, userDepartmentCode, userLocationName,
  hasHodLinkage, initialStaffRequests, initialManagerNotifications, initialApprovedStaffRequests,
}: HrExecutiveLeaveModuleProps) {
  const [activeTab, setActiveTab] = useState<Tab>("overview")
  const [balanceView, setBalanceView] = useState<"balances" | "calendar">("balances")

  return (
    <div className="space-y-4">
      {/* Top nav tab bar — white container so inactive tabs are clearly distinct */}
      <div className="flex gap-1 p-1 rounded-xl w-full overflow-x-auto shadow-sm border border-slate-200" style={{ background: "white" }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            style={
              activeTab === id
                ? { background: "#f97316", color: "white", boxShadow: "0 2px 8px rgba(249,115,22,0.35)" }
                : { background: "transparent", color: "#64748b" }
            }
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap flex-1 justify-center hover:bg-slate-100"
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="w-full">
        {activeTab === "overview" && (
          <OverviewPanel onNavigate={setActiveTab} userId={userId} />
        )}

        {activeTab === "leave-approvals" && (
          <LeaveCenterWithTabs
            userDepartmentId={userDepartment ?? ""}
            userName={userFirstName && userLastName ? `${userFirstName} ${userLastName}` : undefined}
          />
        )}

        {activeTab === "balance-calendar" && (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-center gap-2">
                <BarChart className="h-5 w-5 text-teal-600" />
                <div>
                  <h2 className="text-base font-semibold">Leave Availability</h2>
                  <p className="text-xs text-muted-foreground">Review leave balances or check the team calendar.</p>
                </div>
              </div>
              <div className="flex w-full rounded-md border border-slate-200 bg-slate-50 p-1 sm:w-auto">
                <button
                  type="button"
                  onClick={() => setBalanceView("balances")}
                  className={`flex-1 rounded px-3 py-1.5 text-xs font-medium sm:flex-none ${balanceView === "balances" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500"}`}
                >
                  Balances
                </button>
                <button
                  type="button"
                  onClick={() => setBalanceView("calendar")}
                  className={`flex-1 rounded px-3 py-1.5 text-xs font-medium sm:flex-none ${balanceView === "calendar" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500"}`}
                >
                  Team calendar
                </button>
              </div>
            </div>
            {balanceView === "balances" ? <LeaveBalanceWidget /> : <TeamCalendarView isHrOffice />}
          </div>
        )}

        {activeTab === "apply-leave" && (
          <LeavePlanningClient
            profile={{
              id: userId,
              role: userRole || "hr_executive",
              firstName: userFirstName || "",
              lastName: userLastName || "",
              departmentName: userDepartmentName,
              departmentCode: userDepartmentCode,
            }}
          />
        )}

        {activeTab === "my-requests" && (
          <LeaveManagementClient
            userId={userId}
            userRole={userRole || "staff"}
            userDepartment={userDepartment || ""}
            userFirstName={userFirstName || ""}
            userLastName={userLastName || ""}
            hasHodLinkage={hasHodLinkage}
            inactivityDays={inactivityDays}
            initialStaffRequests={initialStaffRequests}
            initialManagerNotifications={initialManagerNotifications}
            initialApprovedStaffRequests={initialApprovedStaffRequests}
          />
        )}

        {activeTab === "analytics" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-purple-600" />
              <div>
                <h2 className="text-base font-semibold">Leave Analytics</h2>
                <p className="text-xs text-muted-foreground">Trends, statistics and department summaries</p>
              </div>
            </div>
            <HrLeaveAnalyticsPanel />
          </div>
        )}
      </div>
    </div>
  )
}
