"use client"

import { StatsCard } from "@/components/dashboard/stats-card"
import { QuickActions } from "@/components/dashboard/quick-actions"
import { LeaveNotificationsCard } from "@/components/leave/leave-notifications-card"
import ActiveLocationsCard from "@/components/admin/active-locations-card"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Clock, Calendar, Users, TrendingUp, UserCheck, AlertCircle, Activity, Loader } from "lucide-react"
import Link from "next/link"
import { MobileAppDownload } from "@/components/ui/mobile-app-download"
import { PWAInstallToast } from "@/components/pwa/pwa-install-toast"

interface DashboardOverviewClientProps {
  user: any
  profile: any
  todayAttendance: any
  monthlyAttendance: number
  pendingApprovals: number
}

export function DashboardOverviewClient({
  user,
  profile,
  todayAttendance,
  monthlyAttendance,
  pendingApprovals,
}: DashboardOverviewClientProps) {
  return (
    <div className="space-y-7">
        {/* PWA Install notification - shows for 5 seconds */}
        <PWAInstallToast />

        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/70 backdrop-blur px-6 py-5 shadow-sm">
          <div className="space-y-1.5">
            <h1 className="text-3xl md:text-4xl font-heading font-bold text-foreground tracking-tight">Dashboard</h1>
            <p className="text-base md:text-lg text-muted-foreground">
              Welcome back, {" "}
              <span className="text-primary font-semibold">{profile?.first_name || user?.email?.split("@")[0]}</span>{" "}
              {profile?.last_name || ""}
            </p>
          </div>
        </div>

        {profile?.role === "admin" && pendingApprovals > 0 && (
          <Alert className="border-primary/30 bg-primary/5 shadow-sm rounded-xl">
            <AlertCircle className="h-5 w-5 text-primary" />
            <AlertDescription className="flex items-center justify-between">
              <span className="text-primary font-semibold text-base">
                {pendingApprovals} user{pendingApprovals > 1 ? "s" : ""} awaiting approval
              </span>
              <Button asChild size="sm" className="ml-4 shadow-sm hover:shadow-md transition-shadow">
                <Link href="/dashboard/user-approvals">
                  <UserCheck className="h-4 w-4 mr-2" />
                  Review Now
                </Link>
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <StatsCard
            title="Today's Status"
            value={todayAttendance ? "Checked In" : "Not Checked In"}
            description={
              todayAttendance
                ? `At ${new Date(todayAttendance.check_in_time).toLocaleTimeString()}`
                : "Click to check in"
            }
            icon={Clock}
            variant={todayAttendance ? "success" : "default"}
          />

          <StatsCard
            title="This Month"
            value={monthlyAttendance || 0}
            description="Days attended"
            icon={Calendar}
            trend={{ value: 5, isPositive: true }}
          />

          <StatsCard
            title="Department"
            value={profile?.departments?.code || "N/A"}
            description={profile?.departments?.name || "No department assigned"}
            icon={Users}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <QuickActions userRole={profile?.role} />
          </div>

          <div className="lg:col-span-3">
            <LeaveNotificationsCard />
          </div>
        </div>

        {profile?.role === "admin" && (
          <div className="mt-6">
            <ActiveLocationsCard />
          </div>
        )}

        <Card className="shadow-sm border border-slate-200/80 dark:border-slate-800/90 bg-white/95 dark:bg-slate-900/95">
          <CardHeader className="pb-5">
            <CardTitle className="text-xl font-heading font-semibold flex items-center gap-2.5">
              <TrendingUp className="h-5 w-5 text-primary" />
              Performance Overview
            </CardTitle>
            <CardDescription className="text-sm">Your attendance statistics and trends</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="text-center p-5 rounded-xl border border-primary/20 bg-primary/5">
                <div className="text-3xl font-heading font-bold text-primary mb-1.5">{monthlyAttendance || 0}</div>
                <div className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">Days This Month</div>
              </div>
              <div className="text-center p-5 rounded-xl border border-emerald-200/70 dark:border-emerald-900/70 bg-emerald-50/70 dark:bg-emerald-950/20">
                <div className="text-3xl font-heading font-bold text-emerald-700 dark:text-emerald-400 mb-1.5">
                  {monthlyAttendance ? Math.round((monthlyAttendance / new Date().getDate()) * 100) : 0}%
                </div>
                <div className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">Attendance Rate</div>
              </div>
              <div className="text-center p-5 rounded-xl border border-indigo-200/70 dark:border-indigo-900/70 bg-indigo-50/70 dark:bg-indigo-950/20">
                <div className="text-lg font-heading font-bold text-indigo-700 dark:text-indigo-400 mb-1.5">
                  {profile?.role === "admin" ? "Administrator" : profile?.role === "department_head" ? "Department Head" : "Staff"}
                </div>
                <div className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">Role</div>
              </div>
            </div>
          </CardContent>
        </Card>
    </div>
  )
}