"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Sidebar } from "./sidebar"
import { OfflineIndicator } from "@/components/ui/offline-indicator"
import { PWAUpdateNotification } from "@/components/ui/pwa-update-notification"
import { FloatingHomeButton } from "./floating-home-button"
import { MobileBottomNav } from "./mobile-bottom-nav"
import { toast } from "@/hooks/use-toast"

const APPROVAL_ROLES = ["admin", "department_head", "regional_manager"]
const POLL_INTERVAL_MS = 30_000 // 30 seconds

interface DashboardLayoutProps {
  children: React.ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const router = useRouter()
  const lastSeenIdRef = useRef<string | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient()

      const { data, error } = await supabase.auth.getUser()
      if (error || !data?.user) {
        router.push("/auth/login")
        return
      }

      setUser(data.user)

      // Get user profile with department info - optimized query with specific fields
      const { data: profileData } = await supabase
        .from("user_profiles")
        .select(`
          id,
          first_name,
          last_name,
          employee_id,
          role,
          profile_image_url,
          departments (
            name,
            code
          )
        `)
        .eq("id", data.user.id)
        .single()

      setProfile(profileData)
      setLoading(false)
    }

    checkAuth()
  }, [router])

  // Poll for new approval notifications for privileged roles and show toast
  useEffect(() => {
    if (!profile || !APPROVAL_ROLES.includes(profile.role)) return

    const checkNewNotifications = async () => {
      try {
        const res = await fetch("/api/staff/notifications")
        const json = await res.json()
        if (!json.success || !Array.isArray(json.data)) return

        // Only care about off-premises and excuse duty requests that are unread
        const actionableTypes = ["offpremises_checkin_request", "excuse_duty_request"]
        const relevant = json.data.filter(
          (n: any) => actionableTypes.includes(n.type) && !n.is_read
        )
        if (relevant.length === 0) return

        // On first poll, just record the latest id as baseline (don't toast existing ones)
        if (lastSeenIdRef.current === null) {
          lastSeenIdRef.current = relevant[0]?.id ?? ""
          return
        }

        // Find notifications newer than the last seen
        const lastIdx = relevant.findIndex((n: any) => n.id === lastSeenIdRef.current)
        const newOnes = lastIdx === -1 ? relevant : relevant.slice(0, lastIdx)

        if (newOnes.length === 0) return

        // Update baseline
        lastSeenIdRef.current = newOnes[0].id

        // Show a toast for each new notification (up to 3)
        newOnes.slice(0, 3).forEach((n: any) => {
          const isOffPremises = n.type === "offpremises_checkin_request"
          toast({
            title: isOffPremises ? "Off-Premises Check-In Request" : "Excuse Duty Submission",
            description: n.message,
            duration: 10000,
          })
        })
      } catch {
        // silently ignore polling errors
      }
    }

    // Kick off first check after a short delay to avoid running before auth settles
    const firstCheckTimer = setTimeout(checkNewNotifications, 3000)
    pollTimerRef.current = setInterval(checkNewNotifications, POLL_INTERVAL_MS)

    return () => {
      clearTimeout(firstCheckTimer)
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [profile])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background/98 to-muted/10 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background/98 to-muted/10">
      <Sidebar user={user} profile={profile} isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />
      <div className={`transition-all duration-300 ease-in-out ${isCollapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <main className="mx-auto w-full max-w-7xl px-4 pb-28 pt-4 sm:px-5 sm:pb-32 sm:pt-5 lg:px-12 lg:pb-12 lg:pt-12">
          <div className="relative">
            {children}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.02] via-transparent to-accent/[0.02] pointer-events-none -z-10 rounded-3xl" />
          </div>
        </main>
      </div>

      {/* Floating Home Button for quick navigation */}
      <FloatingHomeButton />

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav profile={profile} />

      <PWAUpdateNotification />
      <OfflineIndicator />
    </div>
  )
}

export default DashboardLayout
