"use client"

import { useState, useEffect, useCallback, memo, useMemo } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { createClient } from "@/lib/supabase/client"
import { clearAppCache } from "@/lib/cache-manager"
import {
  Home,
  Clock,
  FileText,
  BarChart3,
  MapPin,
  Users,
  UserCheck,
  Upload,
  Shield,
  Settings,
  X,
  Menu,
  ChevronRight,
  ChevronDown,
  User,
  LogOut,
  RefreshCw,
  AlertCircle,
  Archive,
  ShieldAlert,
  TrendingUp,
  Calendar,
  Bell,
  AlertTriangle,
  CheckCircle2,
  Banknote,
  Mail,
  Stamp,
  ScrollText,
  Bus,
} from "lucide-react"
import Image from "next/image"
import { canAccessMemoConsole, isAttendanceOnlyRole, normalizeAppRole } from "@/lib/role-capabilities"

interface SidebarProps {
  user: {
    id: string
    email: string
  }
  profile: {
    first_name: string
    last_name: string
    employee_id: string
    profile_image_url?: string | null
    role: string
    departments?: {
      name: string
      code: string
    }
  } | null
  isCollapsed: boolean
  setIsCollapsed: (value: boolean) => void
}

const EXEC_ROLES = ["managing_director", "secretary"] as const
const ALL_STAFF_ROLES = [
  "admin", "it-admin", "driver", "transport_manager", "regional_manager", "regional_hr", "regional_hr_office", "regional_hr_officer", "regional_hr_leave_office", "regional_leave_office", "department_head",
  "staff", "loan_office", "hr_loan_office", "accounts_loan_office", "accounts", "director_hr", "manager_hr",
  "hr_office", "hr_leave_office", "audit_staff", "nsp", "intern",
  "contract", "managing_director", "secretary", "hr_records", "hr_records_officer", "hr_records_manager",
]

const navigationItems = [
  {
    title: "Home Dashboard",
    href: "/dashboard/overview",
    icon: Home,
    roles: ALL_STAFF_ROLES,
    category: "main",
  },
  {
    title: "E-Circulars",
    href: "https://engage.cloud.microsoft/main/org/qccgh.onmicrosoft.com/users/eyJfdHlwZSI6IlVzZXIiLCJpZCI6IjUwMjc4NTE1NTA3MyJ9/storyline",
    icon: Mail,
    roles: ALL_STAFF_ROLES,
    category: "main",
    external: true,
  },
  {
    title: "Attendance Check",
    href: "/dashboard/attendance",
    icon: Clock,
    roles: ALL_STAFF_ROLES,
    category: "main",
  },
  {
    title: "Off-Premises Approvals",
    href: "/offpremises-approvals",
    icon: MapPin,
    roles: ["admin", "regional_manager", "department_head"],
    category: "main",
  },

  {
    title: "Excuse Duty",
    href: "/dashboard/excuse-duty",
    icon: FileText,
    roles: ALL_STAFF_ROLES,
    category: "main",
  },
  {
    title: "Leave Administration",
    href: "/dashboard/leave-management",
    icon: Calendar,
    roles: ALL_STAFF_ROLES,
    category: "admin",
  },
  {
    title: "Excuse Duty Review",
    href: "/dashboard/excuse-duty-review",
    icon: FileText,
    roles: ["admin", "it-admin", "regional_manager", "department_head", "director_hr", "manager_hr"],
    category: "admin",
  },


  {
    title: "Loan Administration",
    href: "/dashboard/loan-app",
    icon: Banknote,
    roles: ALL_STAFF_ROLES,
    category: "main",
  },
  // ── MD oversight ──────────────────────────────────────────────────────────
  {
    title: "MD Approval Hub",
    href: "/dashboard/md-approvals",
    icon: Stamp,
    roles: ["managing_director", "admin"],
    category: "main",
    executive: true,
  },
  // ── Secretary oversight ──────────────────────────────────────────────────
  {
    title: "HR Records",
    href: "/dashboard/hr-records",
    icon: ScrollText,
    roles: ["hr_records", "hr_records_officer", "hr_records_manager"],
    category: "admin",
    executive: true,
  },
  {
    title: "Memo Console",
    href: "/dashboard/secretary-memos",
    icon: ScrollText,
    roles: ["secretary", "hr_records", "hr_records_officer", "hr_records_manager", "regional_hr", "regional_hr_leave_office", "regional_leave_office", "admin"],
    category: "main",
    executive: true,
  },
  // ── Accounts/Loan Office disbursement confirmation ────────────────────────
  {
    title: "Disbursement Confirmation",
    href: "/dashboard/disbursement-confirmation",
    icon: CheckCircle2,
    roles: ["accounts", "loan_office", "hr_loan_office", "accounts_loan_office", "admin"],
    category: "main",
  },
  {
    title: "Reports & Trends",
    href: "/dashboard/reports",
    icon: BarChart3,
    roles: ["admin", "it-admin", "regional_manager", "regional_hr", "regional_hr_office", "regional_hr_officer", "regional_hr_leave_office", "regional_leave_office", "hr_office", "hr_leave_office", "department_head", "director_hr", "manager_hr"],
    category: "admin",
  },
  {
    title: "Locations",
    href: "/dashboard/locations",
    icon: MapPin,
    roles: ["admin", "it-admin"],
    category: "admin",
  },
  {
    title: "Transport Management",
    href: "/dashboard/transport",
    icon: Bus,
    roles: ["admin", "administrator", "it-admin", "it_admin", "driver", "transport_manager", "regional_hr", "regional_hr_office", "regional_hr_officer", "regional_hr_leave_office", "regional_leave_office", "regional_manager", "hr_records", "hr_records_officer", "hr_records_manager", "managing_director", "department_head", "hr_executive", "hr_executive_officer", "director_hr", "manager_hr"],
    category: "admin",
    subItems: [
      { title: "Requests", href: "/dashboard/transport" },
      { title: "My Approvals", href: "/dashboard/transport/requests" },
      { title: "Driver Licenses", href: "/dashboard/transport/drivers" },
      { title: "Non-regional requisitions", href: "/dashboard/transport/nonregional" },
    ],
  },

  {
    title: "Defaulters",
    href: "/dashboard/defaulters",
    icon: AlertCircle,
    roles: ["admin", "department_head"],
    category: "admin",
  },
  {
    title: "Warnings Archive",
    href: "/dashboard/warnings-archive",
    icon: Archive,
    roles: ["admin", "it-admin", "regional_manager", "department_head", "director_hr", "manager_hr"],
    category: "admin",
  },
  {
    title: "Department Summaries",
    href: "/dashboard/department-summaries",
    icon: TrendingUp,
    roles: ["admin", "it-admin", "regional_manager", "department_head", "director_hr", "manager_hr"],
    category: "admin",
  },
  {
    title: "Device Monitoring",
    href: "/dashboard/device-violations",
    icon: ShieldAlert,
    roles: ["admin", "it-admin"],
    category: "admin",
    subItems: [
      {
        title: "Security Violations",
        href: "/dashboard/device-violations",
      },
      {
        title: "Weekly Sharing",
        href: "/dashboard/weekly-device-sharing",
      },
      {
        title: "Device Policy Toggle",
        href: "/dashboard/settings/runtime-controls",
      },
    ],
  },
  {
    title: "Weekly Device Sharing",
    href: "/dashboard/weekly-device-sharing",
    icon: ShieldAlert,
    roles: ["admin", "it-admin"],
    category: "admin",
  },
  {
    title: "Staff Management",
    href: "/dashboard/staff",
    icon: Users,
    roles: ["admin", "it-admin"],
    category: "admin",
  },
  {
    title: "Staff Activation",
    href: "/dashboard/staff-activation",
    icon: UserCheck,
    roles: ["admin", "regional_manager"],
    category: "admin",
  },
  {
    title: "Data Management",
    href: "/dashboard/data-management",
    icon: Upload,
    roles: ["admin", "it-admin"],
    category: "admin",
  },
  {
    title: "Audit Logs",
    href: "/dashboard/audit-logs",
    icon: Shield,
    roles: ["admin", "audit_staff"],
    category: "admin",
  },
  {
    title: "Check-In Failures",
    href: "/dashboard/checkin-failures",
    icon: AlertTriangle,
    roles: ["admin", "it-admin"],
    category: "admin",
  },
  {
    title: "Emergency Admin",
    href: "/dashboard/emergency-admin",
    icon: AlertTriangle,
    roles: ["admin", "it-admin"],
    category: "admin",
  },
  {
    title: "Diagnostics",
    href: "/dashboard/diagnostics",
    icon: Settings,
    roles: ["admin", "it-admin"],
    category: "admin",
  },
  {
    title: "Settings",
    href: "/dashboard/settings",
    icon: Settings,
    roles: ALL_STAFF_ROLES,
    category: "settings",
  },
]

export function Sidebar({ user, profile, isCollapsed, setIsCollapsed }: SidebarProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isClearingCache, setIsClearingCache] = useState(false)
  const [openAdminGroups, setOpenAdminGroups] = useState<string[]>([])
  const pathname = usePathname()
  const [ghanaTime, setGhanaTime] = useState<string>("")

  useEffect(() => {
    let baseServerMs = 0
    let basePerfMs = 0

    const formatAccraTime = (utcMs: number) => {
      return new Date(utcMs).toLocaleTimeString("en-GH", {
        timeZone: "Africa/Accra",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      })
    }

    const syncServerTime = async () => {
      try {
        const response = await fetch("/api/system-time", { cache: "no-store" })
        if (!response.ok) return

        const data = (await response.json()) as { utcEpochMs?: number }
        if (!data.utcEpochMs) return

        baseServerMs = data.utcEpochMs
        basePerfMs = performance.now()
        setGhanaTime(formatAccraTime(baseServerMs))
      } catch {
        // Keep previous time if sync fails, next poll will retry.
      }
    }

    const tick = () => {
      if (!baseServerMs) return
      const elapsedMs = performance.now() - basePerfMs
      setGhanaTime(formatAccraTime(baseServerMs + elapsedMs))
    }

    void syncServerTime()
    const tickId = setInterval(tick, 1000)
    const syncId = setInterval(() => {
      void syncServerTime()
    }, 60_000)

    return () => {
      clearInterval(tickId)
      clearInterval(syncId)
    }
  }, [])

  const handleSignOut = async () => {
    const supabase = createClient()

    try {
      await clearAppCache()

      await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      })
    } catch (error) {
      console.error("Failed to log logout action:", error)
    }

    await supabase.auth.signOut()

    window.location.href = "/auth/login"
  }

  const handleClearCache = async () => {
    setIsClearingCache(true)
    try {
      const supabase = createClient()

      // Log the action
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      }).catch(console.error)

      // Sign out from Supabase
      await supabase.auth.signOut()

      // Clear all data, cache, cookies, and storage
      const { clearAllDataAndLogout } = await import("@/lib/cache-manager")
      await clearAllDataAndLogout()

      // Force redirect to login with a clean slate
      window.location.href = "/auth/login"
    } catch (error) {
      console.error("[v0] Failed to clear cache:", error)
      setIsClearingCache(false)
    }
  }

  const departmentNameLower = (profile?.departments?.name || "").toLowerCase()
  const departmentCodeLower = (profile?.departments?.code || "").toLowerCase()

  const isHRDepartmentHead =
    profile?.role === "department_head" &&
    (departmentNameLower.includes("hr") ||
      departmentNameLower.includes("human resource") ||
      departmentCodeLower === "hr")

  const shouldShowHRPortal = profile?.role === "admin" || isHRDepartmentHead

  const allNavigationItems = shouldShowHRPortal
    ? [
        ...navigationItems,
        {
          title: "HR Excuse Duty Portal",
          href: "/dashboard/hr-excuse-duty",
          icon: UserCheck,
          roles: ["admin", "department_head"],
          category: "admin" as const,
        },
      ]
    : navigationItems

  // Normalize both the profile role and each menu item's allowed roles through
  // the shared helper so values such as "it admin", "IT-ADMIN", and "it_admin"
  // resolve to the same effective role.
  const normalizedRole = normalizeAppRole(profile?.role)
  const isProtectedAdministrator = String(user?.email || "").trim().toLowerCase() === "ohemengappiah@qccgh.com"
  const effectiveRole = isProtectedAdministrator ? "admin" : normalizedRole === "audit_staff" ? "staff" : normalizedRole
  const isItAdmin = effectiveRole === "it-admin"
  const isAttendanceOnly = isAttendanceOnlyRole(effectiveRole)

  // A handful of "main" category items are intentionally restricted to specific
  // roles (e.g. Disbursement Confirmation is only for Accounts/Loan Office staff,
  // not HR Records or HR Leave Office). The blanket "main" bypass below must not
  // apply to these — they always need to go through the roles check.
  const ROLE_RESTRICTED_MAIN_HREFS = new Set([
    "/dashboard/disbursement-confirmation",
    "/offpremises-approvals",
  ])

  const HR_RECORDS_SIDEBAR_ROLES = new Set(["hr_records", "hr_records_officer", "hr_records_manager"])
  const HR_LEAVE_OFFICE_SIDEBAR_ROLES = new Set(["hr_leave_office", "hr_office", "director_hr", "manager_hr", "regional_hr"])
  const isRegionalHr = effectiveRole === "regional_hr"
  const isHrRecordsOrLeaveOffice =
    HR_RECORDS_SIDEBAR_ROLES.has(effectiveRole) || HR_LEAVE_OFFICE_SIDEBAR_ROLES.has(effectiveRole)

  const REGIONAL_HR_HIDDEN_HREFS = new Set([
    "/dashboard/disbursement-confirmation",
    "/dashboard/hr-records",
  ])

  const filteredNavItems = allNavigationItems.filter((item) => {
    if (isAttendanceOnly) return item.href === "/dashboard/attendance"
    // Disbursement confirmation belongs only to Accounts/Loan Office workflows.
    // Explicitly deny it for HR Records and HR Leave Office even if a legacy
    // "main" navigation fallback would otherwise make it visible.
    if (
      (item.href === "/dashboard/disbursement-confirmation" && isHrRecordsOrLeaveOffice) ||
      (isRegionalHr && REGIONAL_HR_HIDDEN_HREFS.has(item.href))
    ) {
      return false
    }
    if (isItAdmin && item.category === "admin") {
      return ["/dashboard/leave-management", "/dashboard/staff"].includes(item.href)
    }
    if (["driver", "transport_manager"].includes(effectiveRole) && ["/dashboard/leave-management", "/dashboard/loan-app", "/dashboard/transport"].includes(item.href)) {
      return true
    }
    if (item.href === "/dashboard/device-violations") {
      return effectiveRole === "admin"
    }
  if (item.href === "/dashboard/hr-records") {
    return HR_RECORDS_SIDEBAR_ROLES.has(effectiveRole)
  }
  if (item.href === "/dashboard/secretary-memos") {
    return canAccessMemoConsole(effectiveRole)
  }

    // Core navigation should remain available to every authenticated staff member.
    // Page-level authorization still protects restricted destinations, but a role
    // label from legacy records must not make the sidebar appear empty.
    if (item.category === "main" && !item.executive && !ROLE_RESTRICTED_MAIN_HREFS.has(item.href)) return true

    if (isItAdmin && ["/dashboard/leave-management", "/dashboard/staff"].includes(item.href)) {
      return true
    }

    return item.roles.some((role) => normalizeAppRole(role) === effectiveRole)
  })

  const mainItems = filteredNavItems.filter((item) => item.category === "main")
  const adminItems = filteredNavItems.filter((item) => item.category === "admin")
  const adminGroupDefinitions = [
    {
      title: "Leave & Reviews",
      icon: Calendar,
      hrefs: ["/dashboard/leave-management", "/dashboard/excuse-duty-review", "/dashboard/hr-excuse-duty", "/dashboard/hr-records"],
    },
    {
      title: "Reports & Monitoring",
      icon: BarChart3,
      hrefs: ["/dashboard/reports", "/dashboard/department-summaries", "/dashboard/warnings-archive", "/dashboard/defaulters", "/dashboard/device-violations", "/dashboard/weekly-device-sharing"],
    },
    {
      title: "Staff & Access",
      icon: Users,
      hrefs: ["/dashboard/staff", "/dashboard/staff-activation", "/dashboard/data-management", "/dashboard/locations"],
    },
    {
      title: "Transport Management",
      icon: Bus,
      hrefs: ["/dashboard/transport", "/dashboard/transport/requests", "/dashboard/transport/drivers", "/dashboard/transport/nonregional"],
    },
    {
      title: "Security & System",
      icon: Shield,
      hrefs: ["/dashboard/audit-logs", "/dashboard/checkin-failures", "/dashboard/emergency-admin", "/dashboard/diagnostics"],
    },
  ].map((group) => ({
    ...group,
    items: adminItems.filter((item) => group.hrefs.includes(item.href)),
  }))
  const groupedAdminHrefs = new Set(adminGroupDefinitions.flatMap((group) => group.items.map((item) => item.href)))
  const adminStandaloneItems = adminItems.filter((item) => !groupedAdminHrefs.has(item.href))
  const settingsItems = filteredNavItems.filter((item) => item.category === "settings")

  const firstInitial = profile?.first_name?.trim()?.[0] || ""
  const lastInitial = profile?.last_name?.trim()?.[0] || ""
  const userInitials = (firstInitial + lastInitial).toUpperCase() || "U"

  return (
    <>
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="h-12 w-12 bg-background/95 backdrop-blur-xl shadow-xl border-border/50 hover:bg-background hover:shadow-2xl transition-all duration-300 touch-manipulation"
        >
          {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      <div
        className={cn(
          "fixed inset-y-0 left-0 z-[100] pointer-events-auto bg-sidebar/95 backdrop-blur border-r border-sidebar-border shadow-lg transform transition-all duration-300 ease-out",
          isCollapsed ? "w-16" : "w-56",
          "lg:translate-x-0",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-3 p-4 border-b border-sidebar-border bg-sidebar relative">
            {!isCollapsed && (
              <>
                <div className="relative p-2 bg-primary/10 rounded-lg">
                  <Image src="/images/qcc-logo.png" alt="QCC Logo" width={36} height={36} className="rounded-lg" />
                </div>
                <div className="flex-1">
                  <h2 className="font-semibold text-sidebar-foreground text-base tracking-tight">QCC Attendance</h2>
                  <p className="text-xs text-muted-foreground">Electronic System</p>
                </div>
              </>
            )}
            {isCollapsed && (
              <div className="relative p-2 bg-primary/10 rounded-lg mx-auto">
                <Image src="/images/qcc-logo.png" alt="QCC Logo" width={32} height={32} className="rounded-lg" />
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="hidden lg:flex absolute -right-3 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-background border border-border shadow-lg hover:bg-muted hover:scale-110 transition-all duration-200 z-50"
            >
              <ChevronRight className={cn("h-4 w-4 transition-transform duration-300", isCollapsed ? "" : "rotate-180")} />
            </Button>
          </div>

          <nav className="flex-1 p-2.5 space-y-4 overflow-y-auto">
            <div className="space-y-1.5">
              {!isCollapsed && (
                <div className="px-3 mb-2">
                  <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">Main</h3>
                </div>
              )}
              {mainItems.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href
                const isExternal = (item as any).external
                const isExecutive = (item as any).executive
                const isMdExec = isExecutive && item.href === "/dashboard/md-approvals"
                const isSecExec = isExecutive && item.href === "/dashboard/secretary-memos"
                
                if (isExternal) {
                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={isCollapsed ? item.title : undefined}
                      className={cn(
                      "group flex items-center rounded-lg text-sm font-medium transition-all duration-200 relative touch-manipulation min-h-[38px] border",
                      isCollapsed ? "gap-0 px-0 py-2 justify-center" : "gap-2.5 px-3 py-2",
                        "border-transparent text-sidebar-foreground hover:bg-muted/60 hover:border-border hover:text-foreground",
                      )}
                      onClick={() => {
                        setIsMobileMenuOpen(false)
                      }}
                    >
                      <Icon className="h-4.5 w-4.5 flex-shrink-0" />
                      {!isCollapsed && <span className="flex-1">{item.title}</span>}
                    </a>
                  )
                }
                
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={isCollapsed ? item.title : undefined}
                    className={cn(
                    "group flex items-center rounded-lg text-sm font-medium transition-all duration-200 relative touch-manipulation min-h-[38px] border",
                    isCollapsed ? "gap-0 px-0 py-2 justify-center" : "gap-2.5 px-3 py-2",
                      isActive && isMdExec
                        ? "bg-amber-500/15 border-amber-400/40 text-amber-700 dark:text-amber-400"
                        : isActive && isSecExec
                        ? "bg-teal-500/15 border-teal-400/40 text-teal-700 dark:text-teal-400"
                        : isActive
                        ? "bg-primary/12 border-primary/30 text-primary"
                        : isMdExec
                        ? "border-amber-200/50 text-amber-700 dark:text-amber-400 hover:bg-amber-50/60 dark:hover:bg-amber-900/20 hover:border-amber-300"
                        : isSecExec
                        ? "border-teal-200/50 text-teal-700 dark:text-teal-400 hover:bg-teal-50/60 dark:hover:bg-teal-900/20 hover:border-teal-300"
                        : "border-transparent text-sidebar-foreground hover:bg-muted/60 hover:border-border hover:text-foreground",
                    )}
                    onClick={() => {
                      setIsMobileMenuOpen(false)
                    }}
                  >
                    <Icon
                      className={cn(
                        "h-4.5 w-4.5 flex-shrink-0",
                        isMdExec && !isActive && "text-amber-600 dark:text-amber-400",
                        isSecExec && !isActive && "text-teal-600 dark:text-teal-400",
                      )}
                    />
                    {!isCollapsed && (
                      <>
                        <span className="flex-1">{item.title}</span>
                        {isActive && <ChevronRight className="h-4 w-4 opacity-70" />}
                      </>
                    )}
                  </Link>
                )
              })}
            </div>

            {adminItems.length > 0 && (
              <div className="space-y-1.5">
                {!isCollapsed && (
                  <div className="px-3 mb-2 flex items-center justify-between">
                    <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">
                      Administration
                    </h3>
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary border-primary/20"
                    >
                      Admin
                    </Badge>
                  </div>
                )}
                {adminGroupDefinitions.map((group) => {
                  if (group.items.length === 0) return null

                  // A group only earns a dropdown when it actually has more than one
                  // item to disclose. With a single item, show that item directly in
                  // the group's place — no extra click needed to reach it.
                  if (group.items.length === 1) {
                    const onlyItem = group.items[0]
                    const OnlyItemIcon = onlyItem.icon
                    const isActive = pathname === onlyItem.href
                    return (
                      <Link
                        key={onlyItem.href}
                        href={onlyItem.href}
                        title={isCollapsed ? onlyItem.title : undefined}
                        className={cn(
                          "group flex items-center rounded-lg text-sm font-medium transition-all duration-200 relative touch-manipulation min-h-[38px] border",
                          isCollapsed ? "gap-0 px-0 py-2 justify-center" : "gap-2.5 px-3 py-2",
                          isActive
                            ? "bg-primary/12 border-primary/30 text-primary"
                            : "border-transparent text-sidebar-foreground hover:bg-muted/60 hover:border-border hover:text-foreground",
                        )}
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        <OnlyItemIcon className="h-4.5 w-4.5 flex-shrink-0" />
                        {!isCollapsed && (
                          <>
                            <span className="flex-1">{onlyItem.title}</span>
                            {isActive && <ChevronRight className="h-4 w-4 opacity-70" />}
                          </>
                        )}
                      </Link>
                    )
                  }

                  const GroupIcon = group.icon
                  const isOpen = isCollapsed || openAdminGroups.includes(group.title)
                  const hasActiveItem = group.items.some((item) => pathname === item.href)

                  return (
                    <div key={group.title} className="space-y-1">
                      <button
                        type="button"
                        title={isCollapsed ? group.title : undefined}
                        aria-expanded={!isCollapsed && isOpen}
                        aria-controls={`admin-group-${group.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}
                        onClick={() => {
                          if (isCollapsed) {
                            setIsCollapsed(false)
                            return
                          }
                          setOpenAdminGroups((current) => current.includes(group.title)
                            ? current.filter((title) => title !== group.title)
                            : [...current, group.title])
                        }}
                        className={cn(
                          "w-full flex items-center rounded-lg text-sm font-medium transition-all min-h-[38px] border",
                          isCollapsed ? "justify-center px-0 py-2" : "gap-2.5 px-3 py-2",
                          hasActiveItem
                            ? "bg-primary/10 border-primary/25 text-primary"
                            : "border-transparent text-sidebar-foreground hover:bg-muted/60 hover:border-border",
                        )}
                      >
                        <GroupIcon className="h-4.5 w-4.5 flex-shrink-0" />
                        {!isCollapsed && (
                          <>
                            <span className="flex-1 text-left">{group.title}</span>
                            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                          </>
                        )}
                      </button>
                      {!isCollapsed && isOpen && (
                        <div id={`admin-group-${group.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`} className="ml-3 space-y-1 border-l border-border/60 pl-2">
                          {group.items.map((item) => {
                            const ItemIcon = item.icon
                            const isActive = pathname === item.href
                            return (
                              <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-xs font-medium transition-colors min-h-[36px]",
                                  isActive ? "bg-primary/12 text-primary" : "text-sidebar-foreground hover:bg-muted/60 hover:text-foreground",
                                )}
                                onClick={() => setIsMobileMenuOpen(false)}
                              >
                                <ItemIcon className="h-3.5 w-3.5 flex-shrink-0" />
                                <span className="flex-1">{item.title}</span>
                                {isActive && <ChevronRight className="h-3.5 w-3.5 opacity-70" />}
                              </Link>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
                {adminStandaloneItems.map((item) => {
                  const Icon = item.icon
                  const isActive = pathname === item.href || item.subItems?.some((subItem) => pathname === subItem.href)

                  if (item.subItems) {
                    // Items with subItems use dropdown menu
                    return (
                      <DropdownMenu key={item.href}>
                        <DropdownMenuTrigger asChild>
                          <button
                            title={isCollapsed ? item.title : undefined}
                            className={cn(
                              "w-full group flex items-center rounded-lg text-sm font-medium transition-all duration-200 touch-manipulation min-h-[38px] border",
                              isCollapsed ? "gap-0 px-0 py-2 justify-center" : "gap-2.5 px-3 py-2",
                              isActive
                                ? "bg-primary/12 border-primary/30 text-primary"
                                : "border-transparent text-sidebar-foreground hover:bg-muted/60 hover:border-border",
                            )}
                          >
                            <Icon className="h-4.5 w-4.5 flex-shrink-0" />
                            {!isCollapsed && (
                              <>
                                <span className="flex-1 font-medium text-left">{item.title}</span>
                                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform duration-300 group-hover:translate-x-1" />
                              </>
                            )}
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="w-64 shadow-lg border-border bg-background"
                        >
                          {item.subItems.map((subItem) => (
                            <DropdownMenuItem asChild key={subItem.href}>
                              <Link
                                href={subItem.href}
                                className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted rounded-md transition-all duration-150 touch-manipulation min-h-[40px]"
                                onClick={() => setIsMobileMenuOpen(false)}
                              >
                                <span className="font-medium">{subItem.title}</span>
                              </Link>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )
                  }

                  // Regular items without subItems use Link
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={isCollapsed ? item.title : undefined}
                      className={cn(
                        "group flex items-center rounded-lg text-sm font-medium transition-all duration-200 relative touch-manipulation min-h-[38px] border",
                        isCollapsed ? "gap-0 px-0 py-2 justify-center" : "gap-2.5 px-3 py-2",
                        isActive
                          ? "bg-primary/12 border-primary/30 text-primary"
                          : "border-transparent hover:bg-muted/60 hover:border-border text-sidebar-foreground",
                      )}
                      onClick={() => {
                        setIsMobileMenuOpen(false)
                      }}
                    >
                      <Icon
                        className={cn(
                          "h-4.5 w-4.5 flex-shrink-0",
                        )}
                      />
                      {!isCollapsed && (
                        <>
                          <span className="flex-1">{item.title}</span>
                          {isActive && <ChevronRight className="h-4 w-4 opacity-70" />}
                        </>
                      )}
                    </Link>
                  )
                })}
              </div>
            )}

            <div className="space-y-1.5">
              {!isCollapsed && (
                <div className="px-3 mb-2">
                  <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">Settings</h3>
                </div>
              )}
              {settingsItems.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={isCollapsed ? item.title : undefined}
                    className={cn(
                      "group flex items-center rounded-lg text-sm font-medium transition-all duration-200 relative touch-manipulation min-h-[38px] border",
                      isCollapsed ? "gap-0 px-0 py-2 justify-center" : "gap-2.5 px-3 py-2",
                      isActive
                        ? "bg-primary/12 border-primary/30 text-primary"
                        : "border-transparent text-sidebar-foreground hover:bg-muted/60 hover:border-border hover:text-foreground",
                    )}
                    onClick={() => {
                      setIsMobileMenuOpen(false)
                    }}
                  >
                    <Icon
                      className={cn(
                        "h-4.5 w-4.5 flex-shrink-0",
                      )}
                    />
                    {!isCollapsed && (
                      <>
                        <span className="flex-1">{item.title}</span>
                        {isActive && <ChevronRight className="h-4 w-4 opacity-70" />}
                      </>
                    )}
                  </Link>
                )
              })}
              <button
                onClick={handleClearCache}
                disabled={isClearingCache}
                title={isCollapsed ? "Clear Cache" : undefined}
                className={cn(
                  "group flex items-center rounded-lg text-sm font-medium transition-all duration-200 relative touch-manipulation min-h-[38px] w-full text-sidebar-foreground border border-transparent hover:bg-muted/60 hover:border-border disabled:opacity-50 disabled:cursor-not-allowed",
                  isCollapsed ? "gap-0 px-0 py-2 justify-center" : "gap-2.5 px-3 py-2"
                )}
              >
                <RefreshCw
                  className={cn(
                    "h-4.5 w-4.5 flex-shrink-0",
                    isClearingCache && "animate-spin",
                  )}
                />
                {!isCollapsed && <span className="flex-1 text-left">{isClearingCache ? "Clearing..." : "Clear Cache"}</span>}
              </button>
              <button
                onClick={handleSignOut}
                title={isCollapsed ? "Sign Out" : undefined}
                className={cn(
                  "group flex items-center rounded-lg text-sm font-medium transition-all duration-200 relative touch-manipulation min-h-[38px] w-full text-destructive border border-transparent hover:bg-destructive/10 hover:border-destructive/20",
                  isCollapsed ? "gap-0 px-0 py-2 justify-center" : "gap-2.5 px-3 py-2"
                )}
              >
                <LogOut className="h-4.5 w-4.5 flex-shrink-0" />
                {!isCollapsed && <span className="flex-1 text-left">Sign Out</span>}
              </button>
            </div>
          </nav>

          <div className="p-2.5 border-t border-sidebar-border bg-sidebar/80">
            {isCollapsed ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-full h-11 hover:bg-muted rounded-lg transition-all duration-150 touch-manipulation"
                  >
                    <div className="relative">
                      <Avatar className="h-8 w-8 ring-2 ring-primary/20">
                        <AvatarImage src={profile?.profile_image_url || "/placeholder.svg"} />
                        <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                          {userInitials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-sidebar shadow-sm" />
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="right"
                  align="end"
                  sideOffset={10}
                  collisionPadding={12}
                  className="z-[200] w-64 shadow-lg border-border bg-background"
                >
                  <DropdownMenuLabel className="font-semibold">
                    {profile ? `${profile.first_name} ${profile.last_name}` : "Loading..."}
                    <p className="text-xs text-muted-foreground font-normal mt-1">
                      {profile?.departments?.name || "No department"}
                    </p>
                    <p className="text-xs text-primary font-mono mt-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {ghanaTime} (GMT)
                    </p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-border/50" />
                  <DropdownMenuItem asChild>
                    <Link
                      href="/dashboard/profile"
                      className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted rounded-md transition-all duration-150 touch-manipulation min-h-[40px]"
                    >
                      <User className="h-4 w-4" />
                      <span className="font-medium">Profile Settings</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link
                      href="/dashboard/settings"
                      className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted rounded-md transition-all duration-150 touch-manipulation min-h-[40px]"
                    >
                      <Settings className="h-4 w-4" />
                      <span className="font-medium">Preferences</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-border/50" />
                  <DropdownMenuItem
                    onClick={handleSignOut}
                    className="text-destructive focus:text-destructive focus:bg-destructive/10 flex items-center gap-3 px-3 py-2.5 cursor-pointer rounded-md transition-all duration-150 touch-manipulation min-h-[40px]"
                  >
                    <LogOut className="h-4 w-4" />
                    <span className="font-medium">Sign Out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-2.5 h-auto p-2.5 hover:bg-muted rounded-lg transition-all duration-150 touch-manipulation min-h-[46px]"
                >
                  <div className="relative">
                    <Avatar className="h-9 w-9 ring-2 ring-primary/20">
                      <AvatarImage src={profile?.profile_image_url || "/placeholder.svg"} />
                      <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                        {userInitials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-sidebar shadow-sm" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-semibold text-sidebar-foreground leading-tight">
                      {profile ? `${profile.first_name} ${profile.last_name}` : "Loading..."}
                    </p>
                    {profile?.role === "managing_director" ? (
                      <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">Managing Director</p>
                    ) : profile?.role === "secretary" ? (
                      <p className="text-xs font-semibold text-teal-600 dark:text-teal-400">Secretary</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {profile?.departments?.name || "No department"}
                      </p>
                    )}
                    <p className="text-xs text-primary font-mono flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {ghanaTime} (GMT)
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-64 shadow-lg border-border bg-background"
              >
                <DropdownMenuLabel className="font-semibold">My Account</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-border/50" />
                <DropdownMenuItem asChild>
                  <Link
                    href="/dashboard/profile"
                    className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted rounded-md transition-all duration-150 touch-manipulation min-h-[40px]"
                  >
                    <User className="h-4 w-4" />
                    <span className="font-medium">Profile Settings</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link
                    href="/dashboard/settings"
                    className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted rounded-md transition-all duration-150 touch-manipulation min-h-[40px]"
                  >
                    <Settings className="h-4 w-4" />
                    <span className="font-medium">Preferences</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-border/50" />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="text-destructive focus:text-destructive focus:bg-destructive/10 flex items-center gap-3 px-3 py-2.5 cursor-pointer rounded-md transition-all duration-150 touch-manipulation min-h-[40px]"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="font-medium">Sign Out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            )}
          </div>
        </div>
      </div>

      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden transition-all duration-300 touch-manipulation"
          onClick={() => setIsMobileMenuOpen(false)}
          onTouchStart={() => setIsMobileMenuOpen(false)}
        />
      )}
    </>
  )
}
