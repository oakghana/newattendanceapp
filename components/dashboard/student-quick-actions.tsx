"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Clock, QrCode, Award, Zap, ArrowRight, BookOpen, Calendar } from "lucide-react"
import Link from "next/link"

export function StudentQuickActions() {
  const actions = [
    {
      title: "Check In/Out",
      description: "Record attendance",
      href: "/dashboard/attendance",
      icon: Clock,
      gradient: "from-primary/5 via-primary/8 to-primary/12",
      hoverGradient: "hover:from-primary/10 hover:via-primary/15 hover:to-primary/20",
      border: "border-primary/20 hover:border-primary/30",
      iconBg: "bg-gradient-to-br from-primary/10 to-primary/20",
      iconColor: "text-primary",
    },
    {
      title: "Scan QR Code",
      description: "Event attendance",
      href: "/scan",
      icon: QrCode,
      gradient: "from-chart-3/5 via-chart-3/8 to-chart-3/12",
      hoverGradient: "hover:from-chart-3/10 hover:via-chart-3/15 hover:to-chart-3/20",
      border: "border-chart-3/20 hover:border-chart-3/30",
      iconBg: "bg-gradient-to-br from-chart-3/10 to-chart-3/20",
      iconColor: "text-chart-3",
    },
    {
      title: "Submit Excuse",
      description: "Absence request",
      href: "/dashboard/excuse-duty",
      icon: Award,
      gradient: "from-chart-4/5 via-chart-4/8 to-chart-4/12",
      hoverGradient: "hover:from-chart-4/10 hover:via-chart-4/15 hover:to-chart-4/20",
      border: "border-chart-4/20 hover:border-chart-4/30",
      iconBg: "bg-gradient-to-br from-chart-4/10 to-chart-4/20",
      iconColor: "text-chart-4",
    },
    {
      title: "My Schedule",
      description: "View timetable",
      href: "/dashboard/schedule",
      icon: Calendar,
      gradient: "from-accent/5 via-accent/8 to-accent/12",
      hoverGradient: "hover:from-accent/10 hover:via-accent/15 hover:to-accent/20",
      border: "border-accent/20 hover:border-accent/30",
      iconBg: "bg-gradient-to-br from-accent/10 to-accent/20",
      iconColor: "text-accent",
    },
    {
      title: "Study Resources",
      description: "Course materials",
      href: "/dashboard/resources",
      icon: BookOpen,
      gradient: "from-chart-2/5 via-chart-2/8 to-chart-2/12",
      hoverGradient: "hover:from-chart-2/10 hover:via-chart-2/15 hover:to-chart-2/20",
      border: "border-chart-2/20 hover:border-chart-2/30",
      iconBg: "bg-gradient-to-br from-chart-2/10 to-chart-2/20",
      iconColor: "text-chart-2",
    },
  ]

  return (
    <Card className="glass-effect shadow-lg hover:shadow-xl transition-all duration-300 border-border/50">
      <CardHeader className="pb-6">
        <CardTitle className="text-xl font-heading font-bold flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-primary/10 to-primary/20 rounded-xl shadow-sm">
            <Zap className="h-5 w-5 text-primary" />
          </div>
          Student Actions
        </CardTitle>
        <CardDescription className="text-base font-medium">Quick access to student services and tools</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {actions.map((action) => {
          const Icon = action.icon
          return (
            <Button
              key={action.href}
              asChild
              className={`h-auto flex-col gap-4 p-6 bg-gradient-to-br ${action.gradient} ${action.hoverGradient} border ${action.border} transition-all duration-300 hover:shadow-lg hover:-translate-y-2 hover:scale-[1.02] touch-manipulation group relative overflow-hidden min-h-[120px] sm:min-h-[140px]`}
              variant="outline"
            >
              <Link href={action.href}>
                <div
                  className={`p-4 sm:p-5 ${action.iconBg} rounded-2xl shadow-sm transition-all duration-300 group-hover:shadow-md group-hover:scale-110`}
                >
                  <Icon
                    className={`h-6 w-6 sm:h-7 sm:w-7 ${action.iconColor} transition-transform duration-300 group-hover:rotate-3`}
                  />
                </div>
                <div className="text-center space-y-2">
                  <div className="font-bold text-foreground text-base sm:text-lg flex items-center gap-2 justify-center">
                    {action.title}
                    <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:translate-x-1" />
                  </div>
                  <div className="text-sm sm:text-base text-muted-foreground font-medium">{action.description}</div>
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </Link>
            </Button>
          )
        })}
      </CardContent>
    </Card>
  )
}
