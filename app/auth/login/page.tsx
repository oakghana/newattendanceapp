"use client"

import type React from "react"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { clearAttendanceCache } from "@/lib/utils/attendance-cache"
import { clearGeolocationCache } from "@/lib/geolocation"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useRouter } from "next/navigation"
import { useState } from "react"
import Image from "next/image"
import { useNotifications } from "@/components/ui/notification-system"
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, Lock, Mail, ShieldCheck } from "lucide-react"
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
  const [otpEmail, setOtpEmail] = useState("")
  const [otp, setOtp] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [otpSent, setOtpSent] = useState(false)
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

  const handleSendOtp = async (event?: React.SyntheticEvent) => {
    event?.preventDefault()
    setIsLoading(true)

    try {
      const email = String(otpEmail ?? "").trim().toLowerCase()

      if (!email) {
        showFieldError("Email", "Please enter your email address")
        return
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showFieldError("Email", "Please enter a valid email address")
        return
      }

      setOtpEmail(email)
      console.log("[v0] Attempting to validate email:", email)
      let validationError: string | null = null
      let emailValidated = false

      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

        const validateResponse = await fetch("/api/auth/validate-email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ email }),
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (validateResponse.ok) {
          const validateResult = await validateResponse.json()

          if (!validateResult.exists) {
            validationError = "This email is not registered in the QCC system. Please contact your administrator."
          } else if (!validateResult.approved) {
            validationError = "Your account is pending admin approval. Please wait for activation."
          } else {
            emailValidated = true
          }
        } else {
          console.log("[v0] Email validation API returned error status:", validateResponse.status)
          // Continue anyway - let Supabase handle the validation
        }
      } catch (fetchError) {
        console.log("[v0] Email validation API failed, will attempt OTP send anyway:", fetchError)
        // Continue anyway - let Supabase handle the validation
      }

      // If validation explicitly failed (email not found or not approved), show error
      if (validationError) {
        showFieldError("Email", validationError)
        return
      }

      // Proceed with OTP sending (either validation passed or we're using fallback)
      console.log("[v0] Sending OTP to:", email)
      const supabase = createClient()
      let deliveryTimeoutId: number | undefined
      const deliveryTimeout = new Promise<never>((_, reject) => {
        deliveryTimeoutId = window.setTimeout(
          () => reject(new Error("The OTP delivery request timed out. Check your connection and try again.")),
          15000,
        )
      })
      const otpResult = await Promise.race([
        supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || `${window.location.origin}/dashboard`,
            shouldCreateUser: false,
          },
        }),
        deliveryTimeout,
      ])
      if (deliveryTimeoutId !== undefined) {
        window.clearTimeout(deliveryTimeoutId)
      }

      console.log("[v0] Supabase OTP result:", otpResult)

      if (otpResult.error) {
        const otpErrorMessage = otpResult.error.message.toLowerCase()

        if (otpErrorMessage.includes("email rate limit exceeded")) {
          showFieldError("Email", "Too many OTP requests. Please wait 5 minutes before trying again.")
        } else if (
          otpErrorMessage.includes("user not found") ||
          otpErrorMessage.includes("signups not allowed")
        ) {
          showFieldError(
            "Email",
            "This email is not registered in the system. Please use password login or contact your administrator.",
          )
        } else if (otpErrorMessage.includes("invalid email")) {
          showFieldError("Email", "Invalid email format. Please check your email address.")
        } else {
          showFieldError("Email", `Failed to send OTP: ${otpResult.error.message}`)
        }
        return
      }

      console.log("[v0] OTP sent successfully")
      setOtpSent(true)
      showSuccess(
        emailValidated
          ? "OTP sent to your email. Please check your inbox and enter the code below."
          : "OTP request sent. If your email is registered, you will receive a code shortly.",
        "OTP Sent",
      )
    } catch (error: unknown) {
      const otpErrorMessage = error instanceof Error ? error.message.toLowerCase() : ""
      if (otpErrorMessage.includes("email rate limit exceeded")) {
        showFieldError("Email", "Too many OTP requests. Please wait 5 minutes before trying again.")
      } else if (error instanceof Error) {
        console.error("[v0] OTP send error:", error)
        showError(`Failed to send OTP: ${error.message}. Please try again or use password login.`, "OTP Error")
      } else {
        console.error("[v0] OTP send error:", error)
        showError("Failed to send OTP. Please try again or use password login.", "OTP Error")
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    clearPendingDeviceSharingWarning()

    try {
      if (!String(otp ?? "").trim()) {
        showFieldError("OTP Code", "Please enter the OTP code")
        return
      }

      if (otp.length !== 6) {
        showFieldError("OTP Code", "OTP code must be 6 digits")
        return
      }

      if (!/^\d{6}$/.test(otp)) {
        showFieldError("OTP Code", "OTP code must contain only numbers")
        return
      }

      console.log("[v0] Verifying OTP:", otp.substring(0, 2) + "****") // Log first 2 digits only for security
      const supabase = createClient()
      let data: any = null
      let error: any = null
      
      try {
        const result = await supabase.auth.verifyOtp({
          email: otpEmail,
          token: otp,
          type: "email",
        })
        data = result.data
        error = result.error
      } catch (authError: any) {
        // Handle AbortError silently
        if (authError.name === "AbortError") {
          const { data: sessionData } = await supabase.auth.getSession().catch(() => ({ data: null }))
          if (sessionData?.session) {
            data = { user: sessionData.session.user, session: sessionData.session }
            error = null
          } else {
            throw new Error("Verification request was cancelled. Please try again.")
          }
        } else {
          throw authError
        }
      }

      if (error) {
        if (data?.user?.id) {
          await logLoginActivity(data.user.id, "otp_login_failed", false, "otp")
        }

        if (error.message.includes("expired")) {
          showFieldError("OTP Code", "OTP code has expired. Please request a new one.")
        } else if (error.message.includes("invalid")) {
          showFieldError("OTP Code", "Invalid OTP code. Please check and try again.")
        } else {
          showFieldError("OTP Code", "Invalid or expired OTP code. Please try again.")
        }
        return
      }

      if (data?.user?.id) {
        const approvalCheck = await checkUserApproval(data.user.id)

        if (!approvalCheck.approved) {
          await logLoginActivity(data.user.id, "otp_login_blocked_unapproved", false, "otp")
          await supabase.auth.signOut()
          showWarning(approvalCheck.error || "Account not approved", "Account Approval Required")
          if (approvalCheck.error?.includes("pending admin approval")) {
            router.push("/auth/pending-approval")
          }
          return
        }

        const runtimeFlags = await getRuntimeFlags()

        const mustChangePassword =
          runtimeFlags.passwordEnforcementEnabled &&
          (Boolean(data.user.user_metadata?.force_password_change) ||
            isPasswordChangeRequired(approvalCheck.passwordChangedAt))

        if (mustChangePassword) {
          await logLoginActivity(data.user.id, "otp_password_change_required", true, "otp")
          clearAttendanceCache()
          clearGeolocationCache()
          showWarning(getPasswordEnforcementMessage(), "Password Change Required")
          setTimeout(() => {
            window.location.href = "/dashboard/profile?forceChange=true&reason=monthly"
          }, 800)
          return
        }

        const { data: persistedSession } = await supabase.auth.getSession()
        if (!persistedSession.session) {
          showError("Your code was accepted, but the session could not be saved. Please try again.", "Session Error")
          return
        }

        await logLoginActivity(data.user.id, "otp_login_success", true, "otp")
        clearAttendanceCache()
        clearGeolocationCache()

        console.log("[v0] OTP verification successful")
        showSuccess("OTP verified successfully! Redirecting to dashboard...", "Login Successful")

        // All roles go to attendance check-in page (same as every other role)
        const dashboardUrl = "/dashboard/attendance"

        // Wait longer for Supabase to properly set and persist cookies
        setTimeout(() => {
          window.location.href = dashboardUrl
        }, 800)
      }
    } catch (error: unknown) {
      showFieldError("OTP Code", error instanceof Error ? error.message : "Invalid OTP code")
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
            <Tabs defaultValue="password" className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-muted/40 p-1 rounded-xl h-11 sm:h-12 transition-all border border-border/20">
                <TabsTrigger
                  value="password"
                  className="text-sm sm:text-base font-medium transition-all duration-200 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=active]:border data-[state=active]:border-primary/30"
                >
                  <Lock className="h-4 w-4 mr-1.5" />
                  <span className="hidden sm:inline">Password</span>
                  <span className="sm:hidden">Login</span>
                </TabsTrigger>
                <TabsTrigger
                  value="otp"
                  className="text-sm sm:text-base font-medium transition-all duration-200 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=active]:border data-[state=active]:border-primary/30"
                >
                  <Mail className="h-4 w-4 mr-1.5" />
                  <span className="hidden sm:inline">OTP</span>
                  <span className="sm:hidden">Code</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="password" className="space-y-5 mt-6 sm:space-y-6 fade-in">
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
              </TabsContent>

              <TabsContent value="otp" className="space-y-6 mt-6 fade-in">
                {!otpSent ? (
                  <form onSubmit={handleSendOtp} className="space-y-6">
                    <div className="space-y-2.5">
                      <Label htmlFor="otpEmail" className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <Mail className="h-4 w-4 text-primary/70" />
                        Corporate Email Address
                      </Label>
                      <Input
                        id="otpEmail"
                        type="email"
                        placeholder="your.email@qccgh.com"
                        value={otpEmail}
                        onChange={(e) => setOtpEmail(e.target.value)}
                        required
                        className="h-12 rounded-lg border-border/50 bg-input/60 text-base focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                      <p className="text-xs leading-5 text-muted-foreground">We will send a six-digit code to your registered work email.</p>
                    </div>
                    <Button
                      type="submit"
                      className="h-12 w-full gap-2 rounded-lg bg-primary font-semibold text-primary-foreground shadow-md transition-all hover:bg-primary/90 hover:shadow-lg"
                      disabled={isLoading}
                    >
                      {isLoading ? "Sending code..." : <><KeyRound className="h-4 w-4" /> Send secure code</>}
                    </Button>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyOtp} className="space-y-6">
                    <div className="space-y-4">
                      <Label htmlFor="otp" className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <ShieldCheck className="h-4 w-4 text-primary/70" />
                        Enter OTP Code
                      </Label>
                      <div className="flex justify-center">
                        <InputOTP maxLength={6} value={otp} onChange={(value) => setOtp(value)} className="gap-2">
                          <InputOTPGroup>
                            <InputOTPSlot
                              index={0}
                              className="w-12 h-12 text-lg border-border focus:border-primary focus:ring-primary bg-input"
                            />
                            <InputOTPSlot
                              index={1}
                              className="w-12 h-12 text-lg border-border focus:border-primary focus:ring-primary bg-input"
                            />
                            <InputOTPSlot
                              index={2}
                              className="w-12 h-12 text-lg border-border focus:border-primary focus:ring-primary bg-input"
                            />
                            <InputOTPSlot
                              index={3}
                              className="w-12 h-12 text-lg border-border focus:border-primary focus:ring-primary bg-input"
                            />
                            <InputOTPSlot
                              index={4}
                              className="w-12 h-12 text-lg border-border focus:border-primary focus:ring-primary bg-input"
                            />
                            <InputOTPSlot
                              index={5}
                              className="w-12 h-12 text-lg border-border focus:border-primary focus:ring-primary bg-input"
                            />
                          </InputOTPGroup>
                        </InputOTP>
                      </div>
                      <p className="text-center text-xs leading-5 text-muted-foreground">
                        Enter the six-digit code sent to <span className="font-medium text-foreground">{otpEmail}</span>. Check spam if it is not in your inbox.
                      </p>
                    </div>
                    <Button
                      type="submit"
                      className="h-12 w-full gap-2 rounded-lg bg-primary font-semibold text-primary-foreground shadow-md transition-all hover:bg-primary/90 hover:shadow-lg"
                      disabled={isLoading || otp.length !== 6}
                    >
                      {isLoading ? "Verifying..." : <><ShieldCheck className="h-4 w-4" /> Verify and sign in</>}
                    </Button>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-12 flex-1 gap-1.5 border-border text-foreground hover:bg-muted bg-transparent"
                        onClick={() => {
                          setOtpSent(false)
                          setOtp("")
                          setSuccessMessage(null)
                        }}
                      >
                        <ArrowLeft className="h-4 w-4" /> Edit email
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-12 flex-1 border-primary text-primary hover:bg-primary hover:text-primary-foreground bg-transparent"
                        onClick={handleSendOtp}
                        disabled={isLoading}
                      >
                        {isLoading ? "Sending..." : "Resend OTP"}
                      </Button>
                    </div>
                  </form>
                )}
              </TabsContent>
            </Tabs>

            <div className="mt-8 text-center">
              <p className="text-sm leading-6 text-muted-foreground">Need access? Contact your IT Manager or Regional IT Head.</p>
            </div>

          <div className="mt-6 border-t border-border/60 pt-6 text-center">
            <p className="text-sm font-medium text-foreground">Quality Control Company Limited</p>
            <p className="mt-1 text-xs text-muted-foreground">Intranet Portal, managed by the IT Department</p>
            <p className="mt-3 inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">🚀 V.2.2-5-09-26</p>
          </div>
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  )
}
