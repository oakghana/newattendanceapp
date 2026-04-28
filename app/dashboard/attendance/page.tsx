'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AttendanceRecorder } from "@/components/attendance/attendance-recorder"
import { PersonalAttendanceHistory } from "@/components/attendance/personal-attendance-history"
import { LocationPreviewCard } from "@/components/attendance/location-preview-card"
import { LeaveStatusCard } from "@/components/leave/leave-status-card"
import { StaffStatusBadge } from "@/components/attendance/staff-status-badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Clock, History, ArrowLeft, Home } from "lucide-react"
import Link from "next/link"

export default function AttendancePage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [todayAttendance, setTodayAttendance] = useState<any>(null)
  const [userProfile, setUserProfile] = useState<any>(null)
  const [locations, setLocations] = useState<any[]>([])
  const [previewRangeStatus, setPreviewRangeStatus] = useState<{ resolved: boolean; inRange: boolean | null }>({
    resolved: false,
    inRange: null,
  })

  useEffect(() => {
    let isMounted = true

    const loadAttendanceData = async () => {
      try {
        const supabase = createClient()

        // Check authentication
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

        if (!isMounted) return

        if (authError || !authUser) {
          router.push('/auth/login')
          return
        }

        setUser(authUser)

        // Fetch today's attendance
        const today = new Date().toISOString().split("T")[0]
        const { data: attendance } = await supabase
          .from("attendance_records")
          .select(`
            *,
            geofence_locations!check_in_location_id (
              name
            ),
            checkout_location:geofence_locations!check_out_location_id (
              name
            )
          `)
          .eq("user_id", authUser.id)
          .gte("check_in_time", `${today}T00:00:00`)
          .lt("check_in_time", `${today}T23:59:59`)
          .maybeSingle()

        if (isMounted && attendance) {
          setTodayAttendance({
            ...attendance,
            check_in_location_name: attendance.geofence_locations?.name || attendance.check_in_location_name,
            check_out_location_name: attendance.checkout_location?.name || attendance.check_out_location_name,
          })
        }

        // Fetch user profile
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("assigned_location_id, leave_status, leave_start_date, leave_end_date, leave_reason, first_name, last_name")
          .eq("id", authUser.id)
          .single()

        if (isMounted) {
          setUserProfile(profile)
        }

        // Fetch all locations
        const { data: allLocations } = await supabase
          .from("geofence_locations")
          .select("*")
          .eq("is_active", true)
          .order("name")

        if (isMounted) {
          setLocations(allLocations || [])
        }
      } catch (error) {
        if (isMounted) {
          router.push('/auth/login')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadAttendanceData()

    return () => {
      isMounted = false
    }
  }, [router])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center space-y-4">
          <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
          <h1 className="text-2xl font-bold text-slate-900">Loading dashboard...</h1>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  const assignedLocation = locations.find((loc) => loc.id === userProfile?.assigned_location_id) || null
  const isOnLeave = userProfile?.leave_status === "on_leave" || userProfile?.leave_status === "sick_leave"
  const isCheckedIn = !!todayAttendance && !todayAttendance.check_out_time

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" asChild className="gap-2 hover:bg-primary/5">
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back to Dashboard</span>
            <Home className="h-4 w-4 sm:hidden" />
          </Link>
        </Button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Clock className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-heading font-bold text-foreground tracking-tight">Attendance</h1>
              <p className="text-base sm:text-lg text-muted-foreground font-medium mt-1">
                Record your daily attendance and view your history at QCC locations
              </p>
            </div>
          </div>
          <StaffStatusBadge
            isCheckedIn={isCheckedIn}
            isOnLeave={isOnLeave}
            leaveStatus={userProfile?.leave_status as "active" | "pending" | "approved" | "rejected" | "on_leave" | "sick_leave" | null}
          />
        </div>

        {userProfile?.leave_status && userProfile.leave_status !== "active" && (
          <LeaveStatusCard
            leaveStatus={userProfile.leave_status as "active" | "pending" | "approved" | "rejected" | "on_leave" | "sick_leave" | null}
            leaveStartDate={userProfile.leave_start_date}
            leaveEndDate={userProfile.leave_end_date}
            leaveReason={userProfile.leave_reason}
            onRequestLeave={() => {}}
          />
        )}

        <Tabs defaultValue="today" className="space-y-8">
          <TabsList className="grid w-full grid-cols-2 h-12 p-1 bg-muted/50 rounded-xl">
            <TabsTrigger
              value="today"
              className="flex items-center gap-2 font-semibold data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg"
            >
              <Clock className="h-4 w-4" />
              Today's Attendance
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="flex items-center gap-2 font-semibold data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg"
            >
              <History className="h-4 w-4" />
              Attendance History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="today" className="space-y-6 mt-8">
            <LocationPreviewCard
              assignedLocation={assignedLocation}
              locations={locations}
              rangeMode={isCheckedIn ? "checkout" : "checkin"}
              onRangeStatusChange={setPreviewRangeStatus}
            />
            <AttendanceRecorder
              todayAttendance={todayAttendance}
              userLeaveStatus={userProfile?.leave_status}
              previewRangeResolved={previewRangeStatus.resolved}
              previewInRange={previewRangeStatus.inRange}
            />
          </TabsContent>

          <TabsContent value="history" className="space-y-6 mt-8">
            <PersonalAttendanceHistory />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
