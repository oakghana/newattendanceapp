"use client"

import type React from "react"
import { clearAttendanceCache } from "@/lib/utils/attendance-cache"
import { clearGeolocationCache } from "@/lib/geolocation"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useRouter } from "next/navigation"
import { useState } from "react"
import Image from "next/image"
import { useNotifications } from "@/components/ui/notification-system"
import { CheckCircle2, Eye, EyeOff, Lock, Mail } from "lucide-react"
import { getPasswordEnforcementMessage, isPasswordChangeRequired } from "@/lib/security"
import { DEFAULT_RUNTIME_FLAGS, type RuntimeFlags } from "@/lib/runtime-flags"

const DEVICE_SHARING_WARNING_STORAGE_KEY = "qcc_pending_device_sharing_warning"

type ApprovalCheck = {
  approved: boolean
  error: string | null
  firstName: string | null
  passwordChangedAt: string | null
  role: string | null
}

export default function LoginPage() {
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const { showFieldError, showSuccess, showError, showWarning } = useNotifications()

  const clearPendingDeviceSharingWarning = () => {
    try {
      window.sessionStorage.removeItem(DEVICE_SHARING_WARNING_STORAGE_KEY)
    } catch {
      // Ignore storage failures and continue login flow.
    }
  }

  const logLoginActivity = async (userId: string, action: string, success: boolean, method: string) => {
    try {
      const response = await fetch("/api/auth/login-log", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          user_id: userId,
          action,
          success,
          method,
          ip_address: null, // Will be captured server-side
          user_agent: navigator.userAgent,
        }),
      })

      if (!response.ok) {
        // Don't throw error - login should continue even if logging fails
        return
      }
    } catch {
      // Don't throw error - login should continue even if logging fails
    }
  }

  const checkUserApproval = async (userId: string): Promise<ApprovalCheck> => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("user_profiles")
        .select("is_active, first_name, last_name, password_changed_at, role")
        .eq("id", userId)
        .single()

      if (error) {
        console.error("Error checking user approval:", error)
        return { approved: false, error: "Failed to verify account status", firstName: null, passwordChangedAt: null, role: null }
      }

      if (!data) {
        return { approved: false, error: "User profile not found. Please contact administrator.", firstName: null, passwordChangedAt: null, role: null }
      }

      return {
        approved: data.is_active,
        firstName: data.first_name || null,
        passwordChangedAt: data.password_changed_at || null,
        role: data.role,
        error: data.is_active ? null : "Your account is pending admin approval. Please wait for activation.",
      }
    } catch {
      return { approved: false, error: "Failed to verify account status", firstName: null, passwordChangedAt: null, role: null }
    }
  }

  const getRuntimeFlags = async (): Promise<RuntimeFlags> => {
    try {
      const response = await fetch("/api/settings/runtime", { cache: "no-store" })
      if (!response.ok) return DEFAULT_RUNTIME_FLAGS

      const data = (await response.json()) as { flags?: RuntimeFlags }
      return data.flags || DEFAULT_RUNTIME_FLAGS
    } catch {
      return DEFAULT_RUNTIME_FLAGS
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    clearPendingDeviceSharingWarning()

    try {
      const supabase = createClient()
      let email = identifier

      // If identifier doesn't contain @, look up email from staff number
      if (!identifier.includes("@")) {
        const response = await fetch("/api/auth/lookup-staff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier }),
        })

        if (!response.ok) {
          const result = await response.json()
          showFieldError("Staff Number", result.error || "Staff number not found")
          return
        }

        const result = await response.json()
        email = result.email
      }

      // Single authentication call with AbortError handling
      let data, error
      try {
        // Debug: log Supabase client config in console (first 8 chars of anon key only)
        try {
          console.debug('[v0] Supabase debug', {
            url: process.env.NEXT_PUBLIC_SUPABASE_URL,
            anonKeyPrefix: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.substr(0, 8) + '...' : false,
          })
        } catch (dbgErr) {
          // ignore
        }

        const result = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        data = result.data
        error = result.error
      } catch (authError: any) {
        // Log detailed error for debugging (don't expose to users)
        console.error('[v0] supabase.auth.signInWithPassword ERROR', authError)

        // Handle AbortError silently - request was cancelled but may have succeeded
        if (authError.name === "AbortError") {
          // Check if we have a valid session despite the abort
          const { data: sessionData } = await supabase.auth.getSession().catch(() => ({ data: null }))
          if (sessionData?.session) {
            // Session exists, treat as successful login
            data = { user: sessionData.session.user, session: sessionData.session }
            error = null
          } else {
            throw new Error("Authentication request was cancelled. Please try again.")
          }
        } else {
          // Re-throw so outer catch shows friendly message
          throw authError
        }
      }

      if (error) {
        // Log failed attempt
        if (data?.user?.id) {
          await logLoginActivity(data.user.id, "login_failed", false, "password")
        }

        // Handle specific error types
        if (error.message.includes("Invalid login credentials")) {
          showFieldError("Credentials", "Invalid credentials. Please check your staff number/email and password.")
        } else if (error.message.includes("Email not confirmed")) {
          showWarning(
            "Please check your email and click the confirmation link before logging in.",
            "Email Confirmation Required",
          )
        } else {
          showError(error.message, "Login Failed")
        }
        return
      }

      // Check user approval status
      if (data?.user?.id) {
        const approvalCheck = await checkUserApproval(data.user.id)

        if (!approvalCheck.approved) {
          logLoginActivity(data.user.id, "login_blocked_unapproved", false, "password")
          await supabase.auth.signOut()
          showWarning(approvalCheck.error || "Account not approved", "Account Approval Required")
          if (approvalCheck.error?.includes("pending admin approval")) {
            router.push("/auth/pending-approval")
          }
          return
        }

        // Run runtime flags (device binding check disabled)
        const runtimeFlags = await getRuntimeFlags()

        // Skip device check - enforcement disabled for all users to login freely
        // const [runtimeFlags, deviceCheckResponse] = await Promise.all([
        //   getRuntimeFlags(),
        //   fetch("/api/auth/check-device-binding", {
        //     method: "POST",
        //     headers: { "Content-Type": "application/json" },
        //     body: JSON.stringify({
        //       device_id: getDeviceInfo().device_id,
        //       device_info: getDeviceInfo(),
        //     }),
        //   }),
        // ])

        const mustChangePassword =
          runtimeFlags.passwordEnforcementEnabled &&
          (Boolean(data.user.user_metadata?.force_password_change) ||
            isPasswordChangeRequired(approvalCheck.passwordChangedAt))

        if (mustChangePassword) {
          logLoginActivity(data.user.id, "login_password_change_required", true, "password")
          clearAttendanceCache()
          clearGeolocationCache()
          showWarning(getPasswordEnforcementMessage(), "Password Change Required")
          setTimeout(() => {
            window.location.href = "/dashboard/profile?forceChange=true&reason=monthly"
          }, 800)
          return
        }

        // Device binding check disabled - users can login freely without device restrictions

        // Fire-and-forget login log — don't await so it doesn't block redirect
        logLoginActivity(data.user.id, "login_success", true, "password")

        // Clear attendance and geolocation cache
        clearAttendanceCache()
        clearGeolocationCache()

        const role = String(approvalCheck.role || "").toLowerCase()
        const isExecutive = role === "managing_director" || role === "secretary"
        if (isExecutive) {
          const name = approvalCheck.firstName || "Executive"
          const title = role === "managing_director" ? "Welcome, Managing Director" : "Welcome, Secretary"
          showSuccess(`${title}, ${name}!`, "Executive Access")
        } else {
          showSuccess("Login successful! Redirecting to dashboard...", "Welcome Back")
        }

        // Confirm the browser client can read the session before navigating. This
        // prevents the redirect from racing Supabase's cookie persistence.
        const dashboardUrl = "/dashboard/attendance"
        const { data: persistedSession } = await supabase.auth.getSession()

        if (!persistedSession.session) {
          showError("Your login succeeded, but the session could not be saved. Please try again.", "Session Error")
          return
        }

        // Use the App Router first, then perform a hard navigation fallback if
        // the preview/browser does not commit the route transition.
        router.replace(dashboardUrl)
        router.refresh()
        window.setTimeout(() => {
          if (window.location.pathname === "/auth/login") {
            window.location.assign(dashboardUrl)
          }
        }, 1200)
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        showError('Network error while contacting authentication service. Check your internet connection, try Incognito, or disable browser extensions that may block requests.', 'Network Error')
      } else {
        showError(msg || 'An error occurred during login', 'Login Error')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-[linear-gradient(135deg,hsl(var(--background))_0%,hsl(var(--background))_45%,hsl(var(--muted))_100%)] p-4 sm:p-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.14),transparent_68%)]" />
      <div className="relative flex min-h-[calc(100vh-2rem)] items-center justify-center sm:min-h-[calc(100vh-3rem)] fade-in">
      <div className="w-full max-w-lg scale-in">
        <Card className="gap-0 overflow-hidden rounded-xl border border-border/70 bg-card/95 py-0 shadow-[0_24px_70px_-28px_hsl(var(--foreground)/0.45)] backdrop-blur-xl">
          <CardHeader className="block space-y-4 border-b border-border/60 px-5 pb-5 pt-7 text-center sm:px-9 sm:pt-8">
            <div className="flex justify-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-primary/25 bg-primary/5 shadow-lg ring-4 ring-primary/5 sm:h-24 sm:w-24">
                <Image
                  src="/images/qcc-logo.png"
                  alt="QCC Logo - Quality Control Company Limited"
                  width={96}
                  height={96}
                  className="rounded-full object-cover w-full h-full p-1"
                  priority
                />
              </div>
            </div>
            <div className="space-y-1 slide-up">
              <div className="mb-3 text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Welcome to QCC</p>
              </div>
              <CardTitle className="text-xl font-bold tracking-normal text-foreground sm:text-2xl">QCC Staff Portal</CardTitle>
              <CardDescription className="mx-auto max-w-sm text-sm leading-6 text-muted-foreground">
                Attendance, leave and loan services in one secure workspace.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-7 pt-6 sm:px-9 sm:pb-9">
            <form onSubmit={handleLogin} className="space-y-5 sm:space-y-6 stagger-children">
                  <div className="space-y-2.5">
                    <Label htmlFor="identifier" className="text-sm font-medium text-foreground flex items-center gap-2">
                      <Mail className="h-4 w-4 text-primary/60" />
                      Staff Number or Email
                    </Label>
                    <Input
                      id="identifier"
                      type="text"
                      placeholder="Enter staff number or email"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      required
                      className="h-12 sm:h-12 border border-border/40 focus:border-primary focus:ring-2 focus:ring-primary/20 bg-input/50 hover:bg-input/70 focus:bg-input transition-all text-base rounded-lg"
                      disabled={isLoading}
                      autoComplete="email"
                      inputMode="email"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Use your 7-digit staff number or your work email — either works!
                    </p>
                  </div>
                  <div className="space-y-2.5">
                    <Label htmlFor="password" className="text-sm font-medium text-foreground flex items-center gap-2">
                      <Lock className="h-4 w-4 text-primary/60" />
                      Password
                    </Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="h-12 border border-border/40 focus:border-primary focus:ring-2 focus:ring-primary/20 bg-input/50 hover:bg-input/70 focus:bg-input transition-all text-base pr-12 rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/70 hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-primary rounded p-1"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        tabIndex={0}
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-12 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/95 hover:to-primary/75 text-primary-foreground font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 cursor-pointer border border-primary/20 hover:border-primary/40 flex items-center justify-center gap-2"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <div className="h-4 w-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                        <span>Signing in...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Sign In</span>
                      </>
                    )}
                  </Button>
            </form>

            <div className="mt-8 text-center">
              <p className="text-sm leading-6 text-muted-foreground">Need access? Contact your IT Manager or Regional IT Head.</p>
            </div>

          <div className="mt-6 border-t border-border/60 pt-6 text-center">
            <p className="text-sm font-medium text-foreground">Quality Control Company Limited</p>
            <p className="mt-1 text-xs text-muted-foreground">Intranet Portal, managed by the IT Department</p>
            <p className="mt-3 inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">V.3-25-09-26</p>
          </div>
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  )
}
