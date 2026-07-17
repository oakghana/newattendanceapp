"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  CheckCircle2, FileText, TrendingUp, Clock, Users, ArrowRight,
  CheckCircle, BarChart3, AlertCircle, CalendarDays, BookOpen,
} from "lucide-react"
import { HrLeaveAnalyticsPanel } from "./hr-leave-analytics-panel"
import { HRExecutiveMemoDashboard } from "@/components/leave/hr-executive-memo-dashboard"
import { LeaveManagementClient } from "./leave-management-client"

// ── Tab type ─────────────────────────────────────────────────────────────────
type Tab = "overview" | "leave-approvals" | "payment-advice" | "analytics"

// ── Quick-stat card ───────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color, description }: {
  icon: any; label: string; value: string | number; color: string; description?: string
}) {
  return (
    <Card className="border shadow-sm">
      <CardContent className="pt-5 pb-4 px-5">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${color} shrink-0`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide leading-none">{label}</p>
            <p className="text-2xl font-bold mt-1 text-foreground leading-none">{value}</p>
            {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Quick-action card ─────────────────────────────────────────────────────────
function ActionCard({ icon: Icon, title, description, badge, badgeVariant = "secondary", onClick }: {
  icon: any; title: string; description: string; badge?: string | number; badgeVariant?: "secondary" | "destructive" | "outline"; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-4 rounded-xl border bg-card hover:bg-muted/40 hover:border-primary/30 transition-all duration-200 group"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-muted group-hover:bg-background transition-colors shrink-0">
            <Icon className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
          </div>
          <div>
            <p className="font-medium text-sm text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {badge !== undefined && badge !== 0 && (
            <Badge variant={badgeVariant} className="text-xs">{badge}</Badge>
          )}
          <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
        </div>
      </div>
    </button>
  )
}

// ── Overview panel ────────────────────────────────────────────────────────────
function OverviewPanel({ onNavigate, userId }: { onNavigate: (tab: Tab) => void; userId: string }) {
  const [stats, setStats] = useState({ pendingLeave: 0, pendingMemos: 0, approvedThisMonth: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [leaveRes, memoRes] = await Promise.all([
          fetch("/api/leave/requests?status=pending_hr&limit=1"),
          fetch("/api/leave/payment-advice/pending-memos"),
        ])
        const [leaveJson, memoJson] = await Promise.all([
          leaveRes.ok ? leaveRes.json() : null,
          memoRes.ok ? memoRes.json() : null,
        ])
        setStats({
          pendingLeave: leaveJson?.total ?? leaveJson?.count ?? 0,
          pendingMemos: memoJson?.count ?? memoJson?.total ?? 0,
          approvedThisMonth: 0,
        })
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
  }, [])

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard icon={Clock} label="Pending Leave" value={loading ? "…" : stats.pendingLeave}
          color="bg-amber-50 text-amber-600" description="Awaiting your decision" />
        <StatCard icon={FileText} label="Pending Memos" value={loading ? "…" : stats.pendingMemos}
          color="bg-blue-50 text-blue-600" description="Payment advice to approve" />
        <StatCard icon={CheckCircle2} label="Your Queue" value={loading ? "…" : stats.pendingLeave + stats.pendingMemos}
          color="bg-green-50 text-green-600" description="Total items to action" />
      </div>

      {/* Quick actions */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Quick Actions</h3>
        <div className="space-y-2">
          <ActionCard
            icon={CheckCircle}
            title="Review Leave Requests"
            description="Approve or reject pending staff leave applications"
            badge={stats.pendingLeave || undefined}
            badgeVariant={stats.pendingLeave > 0 ? "destructive" : "secondary"}
            onClick={() => onNavigate("leave-approvals")}
          />
          <ActionCard
            icon={FileText}
            title="Payment Advice Memos"
            description="Approve and download leave allowance payment memos"
            badge={stats.pendingMemos || undefined}
            badgeVariant={stats.pendingMemos > 0 ? "destructive" : "secondary"}
            onClick={() => onNavigate("payment-advice")}
          />
          <ActionCard
            icon={BarChart3}
            title="Leave Analytics"
            description="View leave trends, statistics and department summaries"
            onClick={() => onNavigate("analytics")}
          />
        </div>
      </div>
    </div>
  )
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

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: "overview", label: "Overview", icon: BookOpen },
  { id: "leave-approvals", label: "Leave Approvals", icon: CheckCircle },
  { id: "payment-advice", label: "Payment Advice", icon: FileText },
  { id: "analytics", label: "Analytics", icon: TrendingUp },
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
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={[
              "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap flex-1 justify-center",
              activeTab === id
                ? "bg-background text-foreground shadow-sm border"
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
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <h2 className="text-base font-semibold">Leave Approvals</h2>
                <p className="text-xs text-muted-foreground">Review and action pending leave requests</p>
              </div>
            </div>
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
          </div>
        )}

        {activeTab === "payment-advice" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              <div>
                <h2 className="text-base font-semibold">Payment Advice Memos</h2>
                <p className="text-xs text-muted-foreground">Approve pending memos and download approved payment advice</p>
              </div>
            </div>
            <HRExecutiveMemoDashboard userId={userId} />
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
