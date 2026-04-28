"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Clock, Calendar, Zap, ArrowRight, ShieldAlert, ToggleLeft } from "lucide-react"
import Link from "next/link"

interface QuickActionsProps {
  userRole?: string | null
}

export function QuickActions({ userRole }: QuickActionsProps) {
  const actions = [
    {
      title: "Check In/Out",
      description: "Mark attendance quickly with secure location check",
      href: "/dashboard/attendance",
      icon: Clock,
      tag: "Daily",
    },
    {
      title: "Leave Hub",
      description: "Apply for leave and track updates from your manager",
      href: "/dashboard/leave-management",
      icon: Calendar,
      tag: "Request",
    },
    {
      title: "View Schedule",
      description: "See upcoming shifts, events, and important dates",
      href: "/dashboard/schedule",
      icon: Calendar,
      tag: "Plan",
    },
  ]

  const adminActions =
    userRole === "admin"
      ? [
          {
            title: "Device Sharing",
            description: "Review weekly sharing and clear wrongly flagged users",
            href: "/dashboard/weekly-device-sharing",
            icon: ShieldAlert,
            tag: "Admin",
          },
          {
            title: "Runtime Controls",
            description: "Set lateness reason deadline and checkout cutoff",
            href: "/dashboard/settings/runtime-controls",
            icon: ToggleLeft,
            tag: "Admin",
          },
        ]
      : []

  const allActions = [...actions, ...adminActions]

  return (
    <Card className="bg-white/95 dark:bg-slate-900/95 border-slate-200/80 dark:border-slate-800/90 shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-semibold flex items-center gap-2.5 text-slate-900 dark:text-slate-100">
          <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
            <Zap className="h-4.5 w-4.5 text-primary" />
          </div>
          Quick Actions ⚡
        </CardTitle>
        <CardDescription className="text-sm text-slate-600 dark:text-slate-400">Your everyday tools, all in one place</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {allActions.map((action) => {
          const Icon = action.icon
          return (
            <Button
              key={action.href}
              asChild
              className="h-auto w-full flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/70 transition-all duration-200 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:border-primary/40 touch-manipulation group"
              variant="outline"
            >
              <Link href={action.href}>
                <div className="flex-shrink-0 p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 group-hover:border-primary/40">
                  <Icon className="h-5 w-5 text-slate-700 dark:text-slate-200" />
                </div>

                <div className="flex-1 text-left space-y-0.5 min-w-0">
                  <div className="font-semibold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
                    {action.title}
                    <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-all duration-200 group-hover:translate-x-0.5 text-slate-500" />
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 truncate">{action.description}</div>
                </div>

                {action.tag ? (
                  <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md bg-primary/10 text-primary border border-primary/20">
                    {action.tag}
                  </span>
                ) : null}
              </Link>
            </Button>
          )
        })}
      </CardContent>
    </Card>
  )
}
