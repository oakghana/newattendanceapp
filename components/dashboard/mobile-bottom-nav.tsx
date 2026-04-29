"use client"

import { memo, useMemo } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Clock, FileText, BarChart3, Settings, UserCheck, Users } from "lucide-react"
import { cn } from "@/lib/utils"

interface NavItem {
  href: string
  icon: typeof Home
  label: string
}

interface MobileBottomNavProps {
  profile?: {
    role?: string | null
  } | null
}

const staffNavItems: NavItem[] = [
  { href: "/dashboard/overview", icon: Home, label: "Home" },
  { href: "/dashboard/attendance", icon: Clock, label: "Attendance" },
  { href: "/dashboard/excuse-duty", icon: FileText, label: "Excuse" },
  { href: "/dashboard/reports", icon: BarChart3, label: "Reports" },
  { href: "/dashboard/profile", icon: Settings, label: "Profile" },
]

const approvalsNavItems: NavItem[] = [
  { href: "/dashboard/overview", icon: Home, label: "Home" },
  { href: "/dashboard/attendance", icon: Clock, label: "Attendance" },
  { href: "/offpremises-approvals", icon: UserCheck, label: "Approve" },
  { href: "/dashboard/reports", icon: BarChart3, label: "Reports" },
  { href: "/dashboard/settings", icon: Settings, label: "Settings" },
]

const adminNavItems: NavItem[] = [
  { href: "/dashboard/overview", icon: Home, label: "Home" },
  { href: "/dashboard/attendance", icon: Clock, label: "Attendance" },
  { href: "/offpremises-approvals", icon: UserCheck, label: "Approve" },
  { href: "/dashboard/staff", icon: Users, label: "Staff" },
  { href: "/dashboard/settings", icon: Settings, label: "Settings" },
]

function normalizeRole(role?: string | null): string {
  return (role || "").toString().trim().toLowerCase().replace(/[\s-]+/g, "_")
}

export const MobileBottomNav = memo(function MobileBottomNav({ profile }: MobileBottomNavProps) {
  const pathname = usePathname()

  const items = useMemo(() => {
    const role = normalizeRole(profile?.role)

    if (["admin", "super_admin", "it_admin", "god"].includes(role)) {
      return adminNavItems
    }

    if (["department_head", "head_of_department", "regional_manager"].includes(role)) {
      return approvalsNavItems
    }

    return staffNavItems
  }, [profile?.role])

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border/60 bg-background/95 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="mx-auto grid h-auto max-w-2xl grid-cols-5 items-center gap-0.5 px-1 py-2 sm:gap-1 sm:px-2 sm:py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        {items.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href ||
            (item.href === "/dashboard/overview" && pathname === "/dashboard")

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={true}
              className={cn(
                "relative flex min-h-[56px] min-w-0 flex-col items-center justify-center rounded-xl px-1 py-3 sm:px-2 sm:py-3 transition-all duration-200 touch-manipulation active:scale-[0.95] sm:active:scale-[0.98]",
                isActive
                  ? "bg-primary/10 text-primary shadow-sm"
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon
                className={cn(
                  "mb-1 h-5 w-5 sm:h-6 sm:w-6 transition-transform duration-200 flex-shrink-0",
                  isActive && "scale-110"
                )}
              />
              <span className={cn(
                "max-w-full truncate text-[10px] sm:text-[11px] font-medium leading-tight",
                isActive && "font-semibold"
              )}>
                {item.label}
              </span>
              {isActive && (
                <div className="absolute inset-x-2 sm:inset-x-3 top-0 h-0.5 rounded-full bg-primary" />
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
})
