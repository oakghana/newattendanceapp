"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  CheckCircle2, TrendingUp, Users,
  BookOpen, Calendar, BarChart,
} from "lucide-react"
import { HrLeaveAnalyticsPanel } from "./hr-leave-analytics-panel"
import { LeaveBalanceWidget } from "@/components/leave/leave-balance-widget"
import { TeamCalendarView } from "@/components/leave/team-calendar-view"
import { HrExecutiveOverviewPanel } from "@/components/leave/hr-executive-overview-panel"
import { LeaveCenterWithTabs } from "@/components/leave/leave-center-with-tabs"

// ── Tab type ─────────────────────────────────────────────────────────────────
type Tab = "overview" | "leave-approvals" | "analytics" | "balance-calendar"

// ── Overview panel ────────────────────────────────────────────────────────────
function OverviewPanel({ onNavigate, userId }: { onNavigate: (tab: Tab) => void; userId: string }) {
  return <HrExecutiveOverviewPanel />
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

  return (
    <div className="space-y-4">
      {/* Clean horizontal tab bar */}
      <div className="flex gap-1 p-1 bg-muted rounded-xl w-full overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon, activeClass }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={[
              "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap flex-1 justify-center",
              activeTab === id
                ? activeClass
                : "text-muted-foreground hover:text-foreground hover:bg-background/60",
            ].join(" ")}
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
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <BarChart className="h-5 w-5 text-teal-600" />
              <div>
                <h2 className="text-base font-semibold">Balance & Calendar</h2>
                <p className="text-xs text-muted-foreground">Staff leave balances and team calendar overview</p>
              </div>
            </div>
            <LeaveBalanceWidget />
            <TeamCalendarView />
          </div>
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
