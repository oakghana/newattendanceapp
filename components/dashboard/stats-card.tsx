import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { LucideIcon } from "lucide-react"
import { TrendingUp, TrendingDown } from "lucide-react"

interface StatsCardProps {
  title: string
  value: string | number
  description?: string
  icon: LucideIcon
  variant?: "default" | "success" | "warning" | "error"
  trend?: {
    value: number
    isPositive: boolean
  }
  className?: string
}

export function StatsCard({ title, value, description, icon: Icon, variant = "default", trend, className }: StatsCardProps) {
  const variantStyles = {
    default: "bg-white/95 dark:bg-slate-900/95 border-slate-200/80 dark:border-slate-800/90",
    success: "bg-emerald-50/70 dark:bg-emerald-950/25 border-emerald-200/80 dark:border-emerald-800/70",
    warning: "bg-amber-50/70 dark:bg-amber-950/25 border-amber-200/80 dark:border-amber-800/70",
    error: "bg-red-50/70 dark:bg-red-950/25 border-red-200/80 dark:border-red-800/70",
  }

  const iconStyles = {
    default: "text-slate-600 dark:text-slate-300",
    success: "text-emerald-600 dark:text-emerald-400",
    warning: "text-amber-600 dark:text-amber-400",
    error: "text-red-600 dark:text-red-400",
  }

  const iconBgStyles = {
    default: "bg-slate-100 dark:bg-slate-800",
    success: "bg-emerald-100 dark:bg-emerald-900/60",
    warning: "bg-amber-100 dark:bg-amber-900/60",
    error: "bg-red-100 dark:bg-red-900/60",
  }

  return (
    <Card className={`border shadow-sm transition-all duration-200 hover:shadow-md hover:border-primary/30 ${variantStyles[variant]} ${className || ""} group`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
        <CardTitle className="text-[10px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 tracking-[0.08em] uppercase">{title}</CardTitle>
        <div className={`p-2 sm:p-2.5 rounded-xl transition-colors flex-shrink-0 ${iconBgStyles[variant]}`}>
          <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${iconStyles[variant]}`} />
        </div>
      </CardHeader>
      <CardContent className="space-y-2 px-3 sm:px-6 pb-3 sm:pb-6">
        <div className="text-xl sm:text-2xl md:text-[1.95rem] font-semibold leading-tight text-slate-900 dark:text-slate-100 text-balance">
          {value}
        </div>
        {description && (
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
            {description}
          </p>
        )}
        {trend && (
          <div className="flex items-center gap-1.5 text-[10px] sm:text-xs pt-1">
            {trend.isPositive ? (
              <TrendingUp className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-emerald-600 flex-shrink-0" />
            ) : (
              <TrendingDown className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-red-600 flex-shrink-0" />
            )}
            <span className={`font-medium ${trend.isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
              {trend.value > 0 ? '+' : ''}{trend.value}%
            </span>
            <span className="text-slate-500 dark:text-slate-400 hidden sm:inline">vs last month</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
