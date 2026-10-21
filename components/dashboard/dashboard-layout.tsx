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
import { LeaveReminderModal } from "@/components/leave/leave-reminder-modal"
import { toast } from "@/hooks/use-toast"
import { ToastAction } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"

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
  const circularNoticeShownRef = useRef(false)
  const [priorityCircular, setPriorityCircular] = useState<any>(null)

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



  // Put official circulars first after the authenticated dashboard becomes available.
  useEffect(() => {
    if (!profile || circularNoticeShownRef.current) return
    circularNoticeShownRef.current = true

    const loadPriorityCircular = async (attempt = 0) => {
      try {
        const response = await fetch("/api/e-circulars", { cache: "no-store" })
        const data = await response.json()
        if (response.ok && Array.isArray(data.circulars) && data.circulars.length > 0) {
          // Always lead with the latest official notice after dashboard entry.
          // The read endpoint still records accountability when the user opens it.
          setPriorityCircular(data.circulars[0])
          return
        }
        if (attempt < 1) {
          window.setTimeout(() => void loadPriorityCircular(attempt + 1), 750)
        }
      } catch {
        if (attempt < 1) {
          window.setTimeout(() => void loadPriorityCircular(attempt + 1), 750)
        }
        // A notice should never block dashboard access.
      }
    }

    void loadPriorityCircular()
  }, [profile])

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
      <LeaveReminderModal />
      <OfflineIndicator />

      {priorityCircular && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="priority-circular-title">
          <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-cyan-400/30 bg-slate-950 text-white shadow-2xl shadow-cyan-950/40">
            <div className="relative aspect-[16/7] overflow-hidden bg-slate-900">
              {priorityCircular.mime_type === "application/pdf" ? <iframe src={priorityCircular.file_url} title={priorityCircular.title} className="h-full w-full" /> : <img src={priorityCircular.file_url} alt="Preview of official circular" className="h-full w-full object-cover" />}
              <div className="absolute left-4 top-4 rounded-full bg-cyan-400 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-950">Official notice</div>
            </div>
            <div className="space-y-4 p-6">
              <div><p className="text-sm font-medium text-cyan-300">Please stay informed</p><h2 id="priority-circular-title" className="mt-1 text-2xl font-semibold tracking-tight">{priorityCircular.title}</h2></div>
              <p className="text-sm leading-6 text-slate-300">{priorityCircular.commentary || "Please take a moment to read this official QCC announcement."}</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end"><Button variant="ghost" onClick={() => setPriorityCircular(null)} className="text-slate-300 hover:bg-slate-800 hover:text-white">Remind me later</Button><Button onClick={async () => { await fetch("/api/e-circulars/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ circularId: priorityCircular.id }) }); setPriorityCircular(null) }} className="bg-cyan-400 text-slate-950 hover:bg-cyan-300">Read official notice</Button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export const MemoizedDashboardLayout = memo(DashboardLayout)
export { MemoizedDashboardLayout as DashboardLayout }
export default MemoizedDashboardLayout
