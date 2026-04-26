"use client"

import React from "react"
import { format } from "date-fns"
import { useEffect, useState } from "react"
import { createClient } from "@/utils/supabase/client"
import { Smartphone, Laptop, Monitor, Clock, MapPin, ArrowRight } from "lucide-react"

interface AttendanceActivity {
  id: string
  check_in_time: string
  check_out_time: string | null
  check_in_location_name: string
  check_out_location_name: string | null
  work_hours: number | null
  device_session: {
    device_type: string
    device_name: string
    device_id: string
    browser_info: string
  } | null
}

interface DeviceActivityHistoryProps {
  userId?: string
}

export function DeviceActivityHistory({ userId }: DeviceActivityHistoryProps) {
  const [activities, setActivities] = useState<AttendanceActivity[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    if (!userId) return

    const fetchRecentActivity = async () => {
      try {
        // Get attendance records from the last 2 days
        const twoDaysAgo = new Date()
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
        twoDaysAgo.setHours(0, 0, 0, 0)

        const { data, error } = await supabase
          .from("attendance_records")
          .select(`
            id,
            check_in_time,
            check_out_time,
            check_in_location_name,
            check_out_location_name,
            work_hours,
            device_sessions!attendance_records_device_session_id_fkey (
              device_type,
              device_name,
              device_id,
              browser_info
            )
          `)
          .eq("user_id", userId)
          .gte("check_in_time", twoDaysAgo.toISOString())
          .order("check_in_time", { ascending: false })
          .limit(10)

        if (error) {
          console.error("[v0] Error fetching activity history:", error)
          return
        }

        // Transform the data to handle the device_sessions relationship
        const transformedData = (data || []).map((record) => ({
          ...record,
          device_session: Array.isArray(record.device_sessions) 
            ? record.device_sessions[0] 
            : record.device_sessions
        }))

        setActivities(transformedData)
      } catch (err) {
        console.error("[v0] Error in fetchRecentActivity:", err)
      } finally {
        setLoading(false)
      }
    }

    fetchRecentActivity()
  }, [userId, supabase])

  const getDeviceIcon = (deviceType: string) => {
    const type = deviceType?.toLowerCase() || ""
    if (type.includes("mobile") || type.includes("phone")) {
      return <Smartphone className="h-4 w-4" />
    }
    if (type.includes("laptop")) {
      return <Laptop className="h-4 w-4" />
    }
    return <Monitor className="h-4 w-4" />
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border p-4 animate-pulse">
            <div className="h-4 bg-muted rounded w-3/4 mb-2" />
            <div className="h-3 bg-muted rounded w-1/2" />
          </div>
        ))}
      </div>
    )
  }

  if (activities.length === 0) {
    return (
      <div className="rounded-lg border p-8 text-center">
        <Clock className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
        <p className="text-sm text-muted-foreground">No recent activity in the last 2 days</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {activities.map((activity) => {
        const checkInDate = new Date(activity.check_in_time)
        const isToday = new Date().toDateString() === checkInDate.toDateString()
        const isYesterday = 
          new Date(new Date().setDate(new Date().getDate() - 1)).toDateString() === 
          checkInDate.toDateString()

        let dateLabel = checkInDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        if (isToday) dateLabel = "Today"
        if (isYesterday) dateLabel = "Yesterday"

        return (
          <div
            key={activity.id}
            className="rounded-lg border bg-card p-4 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="rounded-full bg-primary/10 p-2">
                  {getDeviceIcon(activity.device_session?.device_type || "")}
                </div>
                <div>
                  <p className="text-sm font-semibold">{dateLabel}</p>
                  <p className="text-xs text-muted-foreground">
                    {activity.device_session?.device_name || "Unknown Device"}
                  </p>
                </div>
              </div>
              {activity.work_hours !== null && (
                <Badge variant="outline" className="text-xs">
                  {activity.work_hours.toFixed(1)}h
                </Badge>
              )}
            </div>

            <div className="space-y-2">
              {/* Check-in Info */}
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                <span className="text-xs text-muted-foreground">Check-in:</span>
                <span className="font-medium">{checkInDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}</span>
                <span className="text-xs text-muted-foreground">at</span>
                <span className="font-medium truncate">{activity.check_in_location_name}</span>
              </div>

              {/* Check-out Info */}
              {activity.check_out_time ? (
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                  <span className="text-xs text-muted-foreground">Check-out:</span>
                  <span className="font-medium">{new Date(activity.check_out_time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}</span>
                  <span className="text-xs text-muted-foreground">at</span>
                  <span className="font-medium truncate">{activity.check_out_location_name}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                  <Clock className="h-3.5 w-3.5" />
                  <span className="text-xs">Still on duty</span>
                </div>
              )}

              {/* Device Details */}
              {activity.device_session && (
                <div className="mt-3 pt-3 border-t flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Device ID:</span>
                    <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded">
                      {activity.device_session.device_id.substring(0, 17)}...
                    </code>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {activity.device_session.browser_info?.split(" ")[0] || "Unknown Browser"}
                  </span>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Badge({ 
  children, 
  variant = "default",
  className = ""
}: { 
  children: React.ReactNode
  variant?: "default" | "outline" | "secondary"
  className?: string
}) {
  const variantStyles = {
    default: "bg-primary text-primary-foreground",
    outline: "border border-border bg-background",
    secondary: "bg-secondary text-secondary-foreground"
  }
  
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${variantStyles[variant]} ${className}`}>
      {children}
    </span>
  )
}
