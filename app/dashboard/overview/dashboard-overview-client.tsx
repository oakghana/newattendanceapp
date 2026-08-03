"use client"

import { StatsCard } from "@/components/dashboard/stats-card"
import { QuickActions } from "@/components/dashboard/quick-actions"
import { LeaveNotificationsCard } from "@/components/leave/leave-notifications-card"
import ActiveLocationsCard from "@/components/admin/active-locations-card"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Clock, Calendar, Users, TrendingUp, UserCheck, AlertCircle, Banknote, FileText, ArrowRight, Stamp, Star } from "lucide-react"
import Link from "next/link"
import { MobileAppDownload } from "@/components/ui/mobile-app-download"
import { PWAInstallToast } from "@/components/pwa/pwa-install-toast"

interface DashboardOverviewClientProps {
  user: any
  profile: any
  todayAttendance: any
  monthlyAttendance: number
  pendingApprovals: number
  pendingMdApprovals?: number
}

// ── MD Executive Dashboard ────────────────────────────────────────────────────
function MdExecutiveDashboard({ profile, pendingMdApprovals = 0 }: { profile: any; pendingMdApprovals: number }) {
  const fullName = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim()
  const initials = [(profile?.first_name ?? "")[0], (profile?.last_name ?? "")[0]].join("").toUpperCase()
  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"

  return (
    <div className="space-y-6">
      <PWAInstallToast />

      {/* Executive hero banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white shadow-xl">
        {/* Decorative shimmer */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-amber-400/10 blur-3xl" />
          <div className="absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-amber-500/8 blur-2xl" />
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />
        </div>

        <div className="relative px-8 py-8 flex items-start justify-between gap-6 flex-wrap">
          <div className="flex items-center gap-5">
            <div className="relative">
              <Avatar className="h-16 w-16 ring-4 ring-amber-400/50 shadow-xl">
                <AvatarImage src={profile?.profile_image_url || ""} />
                <AvatarFallback className="bg-amber-500 text-white text-xl font-black">{initials}</AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-1 -right-1 bg-amber-400 rounded-full p-1 shadow-lg">
                <Star className="h-3 w-3 text-slate-900 fill-slate-900" />
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold tracking-[0.18em] uppercase text-amber-400 mb-1">Managing Director</p>
              <h1 className="text-2xl font-bold tracking-tight">{greeting}, {profile?.first_name}</h1>
              <p className="text-slate-400 text-sm mt-0.5">{profile?.departments?.name || "QCC Head Office"}</p>
            </div>
          </div>

          {/* Pending count */}
          <div className="flex items-center gap-4">
            {pendingMdApprovals > 0 && (
              <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-6 py-4 text-center">
                <div className="text-4xl font-black text-amber-400 tabular-nums">{pendingMdApprovals}</div>
                <div className="text-xs text-slate-400 mt-1 font-medium">Awaiting Your Approval</div>
              </div>
            )}
            {pendingMdApprovals === 0 && (
              <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-6 py-4 text-center">
                <div className="text-4xl font-black text-emerald-400 tabular-nums">0</div>
                <div className="text-xs text-slate-400 mt-1 font-medium">All Clear</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Primary CTA — go approve */}
      {pendingMdApprovals > 0 && (
        <Link href="/dashboard/md-approvals">
          <div className="group relative overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 px-6 py-5 shadow-sm hover:shadow-md hover:border-amber-300 transition-all cursor-pointer">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center h-12 w-12 rounded-2xl bg-amber-500 shadow-lg group-hover:scale-105 transition-transform">
                  <Stamp className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="font-bold text-slate-900 text-base">
                    {pendingMdApprovals} loan memo{pendingMdApprovals > 1 ? "s" : ""} need{pendingMdApprovals === 1 ? "s" : ""} your signature
                  </p>
                  <p className="text-sm text-slate-500 mt-0.5">
                    HR Executive has approved these — your stamp is the final step
                  </p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-amber-600 group-hover:translate-x-1 transition-transform flex-shrink-0" />
            </div>
          </div>
        </Link>
      )}

      {pendingMdApprovals === 0 && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-5">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center h-12 w-12 rounded-2xl bg-emerald-500 shadow-sm">
              <Stamp className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="font-bold text-emerald-900">No pending approvals</p>
              <p className="text-sm text-emerald-700 mt-0.5">All HR Executive approved loan memos have been processed.</p>
            </div>
          </div>
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link href="/dashboard/md-approvals">
          <div className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 hover:border-amber-200 hover:shadow-sm transition-all">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-slate-100 group-hover:bg-amber-100 transition-colors">
              <Stamp className="h-5 w-5 text-slate-600 group-hover:text-amber-700" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-slate-900 text-sm">MD Approval Hub</p>
              <p className="text-xs text-slate-500 mt-0.5">Review and stamp loan memos</p>
            </div>
            <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-amber-500 group-hover:translate-x-0.5 transition-all" />
          </div>
        </Link>
        <Link href="/dashboard/loan-app">
          <div className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 hover:border-slate-300 hover:shadow-sm transition-all">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-slate-100 group-hover:bg-slate-200 transition-colors">
              <Banknote className="h-5 w-5 text-slate-600" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-slate-900 text-sm">Loan Administration</p>
              <p className="text-xs text-slate-500 mt-0.5">Full loan workflow view</p>
            </div>
            <ArrowRight className="h-4 w-4 text-slate-300 group-hover:translate-x-0.5 transition-all" />
          </div>
        </Link>
      </div>
    </div>
  )
}

// ── Secretary Dashboard ───────────────────────────────────────────────────────
function SecretaryDashboard({ profile, loanCount = 0, leaveCount = 0 }: { profile: any; loanCount?: number; leaveCount?: number }) {
  const fullName = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim()
  const initials = [(profile?.first_name ?? "")[0], (profile?.last_name ?? "")[0]].join("").toUpperCase()
  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"

  return (
    <div className="space-y-6">
      <PWAInstallToast />

      {/* Secretary hero banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-teal-900 via-slate-800 to-teal-900 text-white shadow-xl">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-teal-400/10 blur-3xl" />
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-teal-400/40 to-transparent" />
        </div>
        <div className="relative px-8 py-8 flex items-start justify-between gap-6 flex-wrap">
          <div className="flex items-center gap-5">
            <div className="relative">
              <Avatar className="h-14 w-14 ring-4 ring-teal-400/50 shadow-xl">
                <AvatarImage src={profile?.profile_image_url || ""} />
                <AvatarFallback className="bg-teal-500 text-white text-lg font-black">{initials}</AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-1 -right-1 bg-teal-400 rounded-full p-1">
                <Star className="h-3 w-3 text-teal-900 fill-teal-900" />
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold tracking-[0.18em] uppercase text-teal-400 mb-1">Secretary</p>
              <h1 className="text-xl font-bold tracking-tight">{greeting}, {profile?.first_name}</h1>
              <p className="text-slate-400 text-sm mt-0.5">{profile?.departments?.name || "QCC Head Office"} &mdash; Memo Review Console</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-teal-400/30 bg-teal-500/10 px-5 py-3 text-center">
              <div className="text-3xl font-black text-teal-300 tabular-nums">{loanCount}</div>
              <div className="text-xs text-slate-400 mt-0.5 font-medium">Loan Memos</div>
            </div>
            <div className="rounded-xl border border-teal-400/30 bg-teal-500/10 px-5 py-3 text-center">
              <div className="text-3xl font-black text-teal-300 tabular-nums">{leaveCount}</div>
              <div className="text-xs text-slate-400 mt-0.5 font-medium">Leave Memos</div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick access */}
      <Link href="/dashboard/secretary-memos">
        <div className="group relative overflow-hidden rounded-2xl border border-teal-200 bg-teal-50 px-6 py-5 shadow-sm hover:shadow-md hover:border-teal-300 transition-all cursor-pointer">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center h-12 w-12 rounded-2xl bg-teal-600 shadow-lg group-hover:scale-105 transition-transform">
                <FileText className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="font-bold text-slate-900 text-base">View All Approved Memos</p>
                <p className="text-sm text-slate-500 mt-0.5">
                  {loanCount + leaveCount} approved memo{loanCount + leaveCount !== 1 ? "s" : ""} across loans and leave
                </p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-teal-600 group-hover:translate-x-1 transition-transform flex-shrink-0" />
          </div>
        </div>
      </Link>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link href="/dashboard/secretary-memos">
          <div className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 hover:border-teal-200 hover:shadow-sm transition-all">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-slate-100 group-hover:bg-teal-50 transition-colors">
              <Banknote className="h-5 w-5 text-slate-600 group-hover:text-teal-700" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-slate-900 text-sm">Loan Memos</p>
              <p className="text-xs text-slate-500 mt-0.5">{loanCount} approved</p>
            </div>
            <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-teal-500 transition-all" />
          </div>
        </Link>
        <Link href="/dashboard/secretary-memos">
          <div className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 hover:border-teal-200 hover:shadow-sm transition-all">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-slate-100 group-hover:bg-teal-50 transition-colors">
              <Calendar className="h-5 w-5 text-slate-600 group-hover:text-teal-700" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-slate-900 text-sm">Leave Memos</p>
              <p className="text-xs text-slate-500 mt-0.5">{leaveCount} approved</p>
            </div>
            <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-teal-500 transition-all" />
          </div>
        </Link>
      </div>
    </div>
  )
}

export function DashboardOverviewClient({
  user,
  profile,
  todayAttendance,
  monthlyAttendance,
  pendingApprovals,
  pendingMdApprovals = 0,
}: DashboardOverviewClientProps) {
  // MD gets their own executive hub
  if (profile?.role === "managing_director") {
    return <MdExecutiveDashboard profile={profile} pendingMdApprovals={pendingMdApprovals} />
  }

  // Secretary gets their own memo console
  if (profile?.role === "secretary") {
    return <SecretaryDashboard profile={profile} />
  }

  return (
    <div className="space-y-6">
      {/* PWA Install notification */}
      <PWAInstallToast />

      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-blue-500 to-purple-600 text-white shadow-xl">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-20 -right-20 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-16 -left-16 h-72 w-72 rounded-full bg-purple-300/5 blur-3xl" />
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        </div>

        <div className="relative px-8 py-10 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-semibold tracking-wide uppercase text-blue-100 mb-2">Welcome back</p>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                {profile?.first_name || user?.email?.split("@")[0]} {profile?.last_name || ""}
              </h1>
              <p className="text-blue-100 mt-2">{profile?.departments?.name || "QCC Head Office"}</p>
            </div>
            <Avatar className="h-16 w-16 ring-4 ring-white/30 shadow-xl">
              <AvatarImage src={profile?.profile_image_url || ""} />
              <AvatarFallback className="bg-white/20 text-white font-bold">
                {(profile?.first_name || "")[0]}{(profile?.last_name || "")[0]}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>
      </div>

      {profile?.role === "admin" && pendingApprovals > 0 && (
        <Alert className="border-primary/30 bg-primary/5 shadow-sm rounded-xl">
          <AlertCircle className="h-5 w-5 text-primary" />
          <AlertDescription className="flex items-center justify-between">
            <span className="text-primary font-semibold text-base">
              {pendingApprovals} user{pendingApprovals > 1 ? "s" : ""} waiting for approval
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

      {/* Key Metrics Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Today's Attendance */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-slate-600 uppercase tracking-wide">Today&apos;s Status</p>
            <Clock className="h-5 w-5 text-blue-500" />
          </div>
          <div className="text-3xl font-bold text-slate-900 mb-1">
            {todayAttendance ? "✓" : "○"}
          </div>
          <p className="text-sm text-slate-600">
            {todayAttendance
              ? `Checked in at ${new Date(todayAttendance.check_in_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
              : "Ready for check-in"}
          </p>
        </div>

        {/* Monthly Attendance */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-slate-600 uppercase tracking-wide">This Month</p>
            <Calendar className="h-5 w-5 text-green-500" />
          </div>
          <div className="text-3xl font-bold text-slate-900 mb-1">{monthlyAttendance}</div>
          <p className="text-sm text-slate-600">Days present</p>
        </div>

        {/* Attendance Rate */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-slate-600 uppercase tracking-wide">Rate</p>
            <TrendingUp className="h-5 w-5 text-emerald-500" />
          </div>
          <div className="text-3xl font-bold text-slate-900 mb-1">
            {monthlyAttendance ? Math.round((monthlyAttendance / new Date().getDate()) * 100) : 0}%
          </div>
          <p className="text-sm text-slate-600">Attendance rate</p>
        </div>

        {/* Department */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-slate-600 uppercase tracking-wide">Department</p>
            <Users className="h-5 w-5 text-purple-500" />
          </div>
          <div className="text-3xl font-bold text-slate-900 mb-1">{profile?.departments?.code || "—"}</div>
          <p className="text-sm text-slate-600">{profile?.departments?.name || "N/A"}</p>
        </div>
      </div>

      {/* Action Sections */}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <QuickActions userRole={profile?.role} />
        </div>
        <div className="lg:col-span-3">
          <LeaveNotificationsCard />
        </div>
      </div>

      {profile?.role === "admin" && (
        <div>
          <ActiveLocationsCard />
        </div>
      )}
    </div>
  )
}
