"use client"

import type React from "react"
import { memo, useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Sidebar } from "./sidebar"
import { OfflineIndicator } from "@/components/ui/offline-indicator"
import { PWAUpdateNotification } from "@/components/ui/pwa-update-notification"
import { FloatingHomeButton } from "./floating-home-button"
import { MobileBottomNav } from "./mobile-bottom-nav"
import { toast } from "@/hooks/use-toast"
import { ToastAction } from "@/components/ui/toast"

const POLL_INTERVAL_MS = 120_000
const SESSION_REFRESH_INTERVAL_MS = 5 * 60 * 1000


interface DashboardLayoutProps {
  children: React.ReactNode
}

function DashboardLayout({ children }: DashboardLayoutProps) {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [isAssignedHod, setIsAssignedHod] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const lastSeenIdRef = useRef<string | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!user) return

    const supabase = createClient()
    const refreshSession = () => {
      if (!document.hidden && navigator.onLine) {
        void supabase.auth.refreshSession()
      }
    }

    const sessionRefreshTimer = window.setInterval(refreshSession, SESSION_REFRESH_INTERVAL_MS)
    window.addEventListener("focus", refreshSession)

    return () => {
      window.clearInterval(sessionRefreshTimer)
      window.removeEventListener("focus", refreshSession)
    }
  }, [user])

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createClient()

        let { data, error } = await supabase.auth.getUser()
        if (error || !data?.user) {
          // Navigation can briefly race Supabase's browser token refresh. Retry once
          // before treating the session as expired and sending the user to login.
          const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession()
          if (!refreshError && refreshed.session?.user) {
            data = { user: refreshed.session.user }
            error = null
          }
        }
        if (error || !data?.user) {
          setUser(null)
          setProfile(null)
          setLoading(true)
          router.replace("/auth/login")
          return
        }

        setUser(data.user)

        // Get user profile with department info - optimized query with specific fields
        const { data: profileData, error: profileError } = await supabase
          .from("user_profiles")
          .select(`
            id,
            first_name,
            last_name,
            employee_id,
            role,
            profile_image_url,
            region_id,
            assigned_location_id,
            assigned_location:geofence_locations!user_profiles_assigned_location_id_fkey (
              id,
              name,
              location_type
            ),
            departments (
              name,
              code
            )
          `)
          .eq("id", data.user.id)
          .single()

        if (profileError) {
          console.error("[v0] Profile fetch error:", profileError)
          // Set default profile so dashboard still loads
          setProfile({
            id: data.user.id,
            first_name: data.user.user_metadata?.first_name || "User",
            last_name: data.user.user_metadata?.last_name || "",
            role: "staff",
          })
        } else {
          setProfile(profileData)
        }

        const { data: hodLink } = await supabase
          .from("loan_hod_linkages")
          .select("id")
          .eq("hod_user_id", data.user.id)
          .limit(1)
          .maybeSingle()
        setIsAssignedHod(Boolean(hodLink))

        setLoading(false)
      } catch (err) {
        console.error("[v0] Auth check error:", err)
        setUser(null)
        setProfile(null)
        setLoading(true)
        router.replace("/auth/login")
      }
    }

    // Do not use a fixed loading timeout here. Each module mounts this layout
    // during navigation, and a slow profile query must not be mistaken for an
    // expired session and redirect an active user to login.
    void checkAuth()
  }, [router])



  // Poll for new notifications and show modern flash toasts.
  useEffect(() => {
    if (!profile) return

    const checkNewNotifications = async () => {
      if (document.hidden || !navigator.onLine) return
      try {
        const res = await fetch("/api/staff/notifications", { cache: "no-store" })
        const json = await res.json()
        if (!json.success || !Array.isArray(json.data)) return

        const relevant = json.data.filter((n: any) => !n.is_read)
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

        // Show a toast for each new notification (up to 3) and keep it visible for 30s.
        newOnes.slice(0, 3).forEach((n: any) => {
          const defaultLink = n?.type?.startsWith("loan_")
            ? "/dashboard/loan-app"
            : n?.type?.startsWith("leave_")
              ? "/dashboard/leave-management"
              : n?.type?.includes("offpremises")
                ? "/offpremises-approvals"
                : "/dashboard"
          const link = n.link || defaultLink

          toast({
            title: n.title || "New update",
            description: n.message || "You have a new workflow update.",
            duration: 30_000,
            action: (
              <ToastAction asChild altText="Open update">
                <a href={link}>Open</a>
              </ToastAction>
            ),
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

  if (loading || !user || !profile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background/98 to-muted/10 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" role="status" aria-label="Loading dashboard" />
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background/98 to-muted/10">
      <Sidebar user={user} profile={profile} isAssignedHod={isAssignedHod} isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />
      <div className={`min-w-0 w-full overflow-x-hidden transition-all duration-300 ease-in-out ${isCollapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <main className="mx-auto min-w-0 w-full max-w-[min(100%-1rem,96rem)] overflow-x-hidden px-4 pb-28 pt-4 sm:px-5 sm:pb-32 sm:pt-5 lg:px-8 lg:pb-12 lg:pt-8 xl:px-10">
          <div className="relative">
            <div key={pathname}>{children}</div>
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

export const MemoizedDashboardLayout = memo(DashboardLayout)
export { MemoizedDashboardLayout as DashboardLayout }
export default MemoizedDashboardLayout
