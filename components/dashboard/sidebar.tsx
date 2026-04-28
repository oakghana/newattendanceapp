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
  QrCode,
  Users,
  UserCheck,
  Upload,
  Shield,
  Settings,
  X,
  Menu,
  ChevronRight,
  User,
  LogOut,
  HelpCircle,
  RefreshCw,
  AlertCircle,
  Archive,
  ShieldAlert,
  TrendingUp,
  Calendar,
  Bell,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react"
import Image from "next/image"

interface SidebarProps {
  user: {
    id: string
    email: string
  }
  profile: {
    first_name: string
    last_name: string
    employee_id: string
    role: string
    departments?: {
      name: string
      code: string
    }
  } | null
  isCollapsed: boolean
  setIsCollapsed: (value: boolean) => void
}

const navigationItems = [
  {
    title: "Dashboard",
    href: "/dashboard/overview",
    icon: Home,
    roles: ["admin", "it-admin", "regional_manager", "department_head", "staff"],
    category: "main",
  },
  {
    title: "Attendance",
    href: "/dashboard/attendance",
    icon: Clock,
    roles: ["admin", "it-admin", "regional_manager", "department_head", "staff"],
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
    roles: ["admin", "it-admin", "regional_manager", "department_head", "staff"],
    category: "main",
  },
  {
    title: "Leave Management",
    href: "/dashboard/leave-management",
    icon: Calendar,
    roles: ["admin", "regional_manager", "department_head", "staff", "it-admin", "nsp", "intern"],
    category: "admin",
  },
  {
    title: "Excuse Duty Review",
    href: "/dashboard/excuse-duty-review",
    icon: FileText,
    roles: ["admin", "regional_manager", "department_head"],
    category: "admin",
  },
  {
    title: "Schedule",
    href: "/dashboard/schedule",
    icon: Clock,
    roles: ["admin", "regional_manager", "department_head"],
    category: "main",
  },
  {
    title: "Reports",
    href: "/dashboard/reports",
    icon: BarChart3,
    roles: ["admin", "it-admin", "regional_manager", "department_head", "staff"],
    category: "main",
  },
  {
    title: "Help",
    href: "/dashboard/help",
    icon: HelpCircle,
    roles: ["admin", "it-admin", "regional_manager", "department_head", "staff"],
    category: "main",
  },
  {
    title: "Locations",
    href: "/dashboard/locations",
    icon: MapPin,
    roles: ["admin"],
    category: "admin",
  },
  {
    title: "QR Events",
    href: "/dashboard/qr-events",
    icon: QrCode,
    roles: ["admin", "regional_manager", "department_head"],
    category: "admin",
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
    roles: ["admin", "regional_manager", "department_head"],
    category: "admin",
  },
  {
    title: "Department Summaries",
    href: "/dashboard/department-summaries",
    icon: TrendingUp,
    roles: ["admin", "regional_manager", "department_head"],
    category: "admin",
  },
  {
    title: "Device Monitoring",
    href: "/dashboard/device-violations",
    icon: ShieldAlert,
    roles: ["admin"],
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
    roles: ["admin"],
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
    roles: ["admin"],
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
    roles: ["admin"],
    category: "admin",
  },
  {
    title: "Emergency Admin",
    href: "/dashboard/emergency-admin",
    icon: AlertTriangle,
    roles: ["admin"],
    category: "admin",
  },
  {
    title: "Diagnostics",
    href: "/dashboard/diagnostics",
    icon: Settings,
    roles: ["admin"],
    category: "admin",
  },
  {
    title: "Settings",
    href: "/dashboard/settings",
    icon: Settings,
    roles: ["admin", "it-admin", "regional_manager", "department_head", "staff"],
    category: "settings",
  },
]

export function Sidebar({ user, profile, isCollapsed, setIsCollapsed }: SidebarProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isClearingCache, setIsClearingCache] = useState(false)
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

  const isHRDepartmentHead =
    profile?.role === "department_head" &&
    (profile?.departments?.name?.toLowerCase().includes("hr") ||
      profile?.departments?.name?.toLowerCase().includes("human resource") ||
      profile?.departments?.code?.toLowerCase() === "hr")

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

  // Support role hierarchy: map 'audit_staff' to behave like 'staff' for base permissions
  const normalizedRole = (profile?.role || "staff").toLowerCase().trim()
  const effectiveRole = normalizedRole === "audit_staff" ? "staff" : normalizedRole

  const filteredNavItems = allNavigationItems.filter((item) => {
    // Defense-in-depth: keep device monitoring strictly admin-only in the UI.
    if (item.href === "/dashboard/device-violations") {
      return effectiveRole === "admin"
    }

    return item.roles.includes(effectiveRole)
  })

  const mainItems = filteredNavItems.filter((item) => item.category === "main")
  const adminItems = filteredNavItems.filter((item) => item.category === "admin")
  const settingsItems = filteredNavItems.filter((item) => item.category === "settings")

  const userInitials = profile ? `${profile.first_name[0]}${profile.last_name[0]}` : "U"

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
          "fixed inset-y-0 left-0 z-40 bg-sidebar/95 backdrop-blur border-r border-sidebar-border shadow-lg transform transition-all duration-300 ease-out",
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
                {adminItems.map((item) => {
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
                  align="end"
                  className="w-64 shadow-lg border-border bg-background"
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
                    <p className="text-xs text-muted-foreground">
                      {profile?.departments?.name || "No department"}
                    </p>
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
