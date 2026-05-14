"use client"

import React, { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AlertCircle, Calendar, Gift, TrendingUp } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export interface LeaveBalance {
  currentYearEntitlement: number
  currentYearUsed: number
  currentYearRemaining: number
  previousYearCarryover: number
  totalAvailable: number
  usedFromCarryover: number
}

interface OutstandingLeaveWidgetProps {
  userId?: string
  leaveYearPeriod?: string
  leaveType?: string
  onBalanceUpdate?: (balance: LeaveBalance) => void
  compact?: boolean
}

export function OutstandingLeaveWidget({
  userId,
  leaveYearPeriod = "2026",
  leaveType = "annual_leave",
  onBalanceUpdate,
  compact = false,
}: OutstandingLeaveWidgetProps) {
  const [balance, setBalance] = useState<LeaveBalance | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchBalance = async () => {
      if (!userId) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const response = await fetch(
          `/api/leave/balance?userId=${userId}&leaveYearPeriod=${leaveYearPeriod}&leaveType=${leaveType}`
        )
        
        if (!response.ok) {
          throw new Error("Failed to fetch leave balance")
        }

        const data = await response.json()
        setBalance(data.balance)
        onBalanceUpdate?.(data.balance)
        setError(null)
      } catch (err) {
        console.error("[v0] Error fetching leave balance:", err)
        setError(err instanceof Error ? err.message : "Failed to load balance")
      } finally {
        setLoading(false)
      }
    }

    fetchBalance()
  }, [userId, leaveYearPeriod, leaveType, onBalanceUpdate])

  if (loading) {
    return (
      <Card className="border-0 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-32 mt-2" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (error || !balance) {
    return (
      <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20">
        <CardHeader>
          <CardTitle className="text-red-700 dark:text-red-300">Leave Balance</CardTitle>
        </CardHeader>
        <CardContent className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error || "Unable to load leave balance"}</span>
        </CardContent>
      </Card>
    )
  }

  const percentageUsed = Math.round(
    (balance.currentYearUsed / balance.currentYearEntitlement) * 100
  )
  const hasCarryover = balance.previousYearCarryover > 0

  if (compact) {
    return (
      <div className="flex items-center justify-between p-3 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/30">
        <div className="flex-1">
          <p className="text-xs font-semibold text-blue-900 dark:text-blue-200">Annual Leave</p>
          <p className="text-lg font-bold text-blue-700 dark:text-blue-300 mt-1">
            {balance.currentYearRemaining} / {balance.currentYearEntitlement} days
          </p>
        </div>
        {hasCarryover && (
          <Badge variant="outline" className="bg-green-50 border-green-300 text-green-700 dark:bg-green-900/30 dark:border-green-700 dark:text-green-300">
            +{balance.previousYearCarryover} carryover
          </Badge>
        )}
      </div>
    )
  }

  return (
    <Card className="border-0 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              Leave Balance
            </CardTitle>
            <CardDescription className="text-blue-700 dark:text-blue-300">
              {leaveYearPeriod} Leave Year
            </CardDescription>
          </div>
          {percentageUsed > 80 && (
            <Badge className="bg-amber-500 hover:bg-amber-600">Running Low</Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Current Year Balance */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              This Year
            </span>
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {balance.currentYearRemaining} / {balance.currentYearEntitlement} days
            </span>
          </div>
          <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                percentageUsed <= 50 ? "bg-green-500" :
                percentageUsed <= 80 ? "bg-amber-500" :
                "bg-red-500"
              )}
              style={{ width: `${percentageUsed}%` }}
            />
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {balance.currentYearUsed} used · {percentageUsed}% utilization
          </p>
        </div>

        {/* Carryover Balance */}
        {hasCarryover && (
          <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3 space-y-1">
            <div className="flex items-center gap-2">
              <Gift className="h-4 w-4 text-green-600 dark:text-green-400" />
              <span className="text-sm font-medium text-green-900 dark:text-green-100">
                Previous Year Carryover
              </span>
            </div>
            <p className="text-2xl font-bold text-green-700 dark:text-green-300">
              {balance.previousYearCarryover} days
            </p>
            <p className="text-xs text-green-700 dark:text-green-400">
              From {parseInt(leaveYearPeriod) - 1} leave year
            </p>
          </div>
        )}

        {/* Total Available */}
        <div className="rounded-lg bg-slate-100 dark:bg-slate-800 p-3 space-y-1">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-slate-600 dark:text-slate-400" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Total Available
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {balance.totalAvailable} days
          </p>
        </div>

        {/* Legend */}
        <div className="pt-2 border-t border-blue-200 dark:border-blue-800 space-y-1 text-xs text-slate-600 dark:text-slate-400">
          <p>
            <span className="font-medium">Green zone:</span> {balance.currentYearEntitlement} days (comfortable)
          </p>
          <p>
            <span className="font-medium">Amber zone:</span> Running low (less than 20% remaining)
          </p>
          <p>
            <span className="font-medium">Red zone:</span> Critical (less than 10% remaining)
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
