"use client"

import type React from "react"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { clearAttendanceCache } from "@/lib/utils/attendance-cache"
import { clearGeolocationCache } from "@/lib/geolocation"
import { getDeviceInfo } from "@/lib/device-info"

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
import { Eye, EyeOff } from "lucide-react"

export default function LoginPage() {
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [otpEmail, setOtpEmail] = useState("")
  const [otp, setOtp] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [otpSent, setOtpSent] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const router = useRouter()

  const { showFieldError, showSuccess, showError, showWarning } = useNotifications()

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
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }))
        // Don't throw error - login should continue even if logging fails
        return
      }

      const result = await response.json()
    } catch (error) {
      // Don't throw error - login should continue even if logging fails
    }
  }

  const checkUserApproval = async (userId: string) => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("user_profiles")
        .select("is_active, first_name, last_name")
        .eq("id", userId)
        .single()

      if (error) {
        console.error("Error checking user approval:", error)
        return { approved: false, error: "Failed to verify account status" }
      }

      if (!data) {
        return { approved: false, error: "User profile not found. Please contact administrator." }
      }

      return {
        approved: data.is_active,
        name: `${data.first_name} ${data.last_name}`,
        error: data.is_active ? null : "Your account is pending admin approval. Please wait for activation.",
      }
      } catch (error) {
        return { approved: false, error: "Failed to verify account status" }
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

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

      // Preflight: verify network connectivity to Supabase auth endpoint
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
        if (supabaseUrl) {
          try {
            // a lightweight connectivity check — server will likely return 401 but we only care that it doesn't throw
            await fetch(`${supabaseUrl}/auth/v1/token`, { method: 'GET', cache: 'no-store' })
          } catch (netErr) {
            showError('Unable to reach authentication service. Check network, VPN, or browser extensions and try again.', 'Network Error')
            setIsLoading(false)
            return
          }
        }
      } catch (preflightErr) {
        // ignore and continue — preflight is best-effort
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
          await logLoginActivity(data.user.id, "login_blocked_unapproved", false, "password")
          await supabase.auth.signOut()
          showWarning(approvalCheck.error || "Account not approved", "Account Approval Required")
          if (approvalCheck.error?.includes("pending admin approval")) {
            router.push("/auth/pending-approval")
          }
          return
        }

        const deviceInfo = getDeviceInfo()
        const deviceCheckResponse = await fetch("/api/auth/check-device-binding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            device_id: deviceInfo.device_id,
            device_info: deviceInfo,
          }),
        })

        const deviceCheck = await deviceCheckResponse.json()

        if (!deviceCheck.allowed) {
          await logLoginActivity(data.user.id, "login_blocked_device_violation", false, "password")
          await supabase.auth.signOut()
          showError(
            deviceCheck.message || "This device is registered to another user. Your supervisor has been notified.",
            "Device Security Violation",
          )
          return
        }

        // If there are concurrent active sessions on other devices, warn the user but allow login to continue
        if (deviceCheck.concurrent) {
          try {
            const first = Array.isArray(deviceCheck.sessions) && deviceCheck.sessions.length > 0 ? deviceCheck.sessions[0] : null
            const deviceLabel = first ? `${first.device_name || first.device_type || first.device_id} (last seen ${new Date(first.last_activity).toLocaleString()})` : 'another device'
            showWarning(
              `Another active session was detected on ${deviceLabel}. Proceeding will allow you to sign in; if this wasn't you, contact IT immediately.`,
              'Concurrent Session Detected',
            )
          } catch (warnErr) {
            showWarning('Another active session was detected on this account. Proceeding will allow you to sign in.', 'Concurrent Session Detected')
          }
        }

        // Log successful login
        await logLoginActivity(data.user.id, "login_success", true, "password")
      }

      // Clear attendance and geolocation cache
      clearAttendanceCache()
      clearGeolocationCache()

      showSuccess("Login successful! Redirecting...", "Welcome Back")

      // Wait longer for Supabase to properly set and persist cookies
      setTimeout(() => {
        // Force a full page reload to ensure cookies are read on the new page
        window.location.href = "/dashboard/attendance"
      }, 800)
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

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)
    setSuccessMessage(null)

    try {
      if (!otpEmail.trim()) {
        showFieldError("Email", "Please enter your email address")
        return
      }

      if (!otpEmail.includes("@") || !otpEmail.includes(".")) {
        showFieldError("Email", "Please enter a valid email address")
        return
      }

      console.log("[v0] Attempting to validate email:", otpEmail)
      let validationError: string | null = null

      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

        const validateResponse = await fetch("/api/auth/validate-email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ email: otpEmail }),
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
      console.log("[v0] Sending OTP to:", otpEmail)

      const otpResult = await supabase.auth.signInWithOtp({
        email: otpEmail,
        options: {
          emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL || `${window.location.origin}/dashboard`,
          shouldCreateUser: false,
        },
      })

      console.log("[v0] Supabase OTP result:", otpResult)

      if (otpResult.error) {
        console.error("[v0] Supabase OTP error:", otpResult.error.message)

        if (otpResult.error.message.includes("Email rate limit exceeded")) {
          showFieldError("Email", "Too many OTP requests. Please wait 5 minutes before trying again.")
        } else if (
          otpResult.error.message.includes("User not found") ||
          otpResult.error.message.includes("Signups not allowed")
        ) {
          showFieldError(
            "Email",
            "This email is not registered in the system. Please use password login or contact your administrator.",
          )
        } else if (otpResult.error.message.includes("Invalid email")) {
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
      console.error("[v0] OTP send error:", error)
      if (error instanceof Error) {
        showError(`Failed to send OTP: ${error.message}. Please try again or use password login.`, "OTP Error")
      } else {
        showError("Failed to send OTP. Please try again or use password login.", "OTP Error")
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    try {
      if (!otp.trim()) {
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

        await logLoginActivity(data.user.id, "otp_login_success", true, "otp")
      }

      console.log("[v0] OTP verification successful")
      showSuccess("OTP verified successfully! Redirecting to dashboard...", "Login Successful")

      // Wait longer for Supabase to properly set and persist cookies
      setTimeout(() => {
        window.location.href = "/dashboard/attendance"
      }, 800)
    } catch (error: unknown) {
      showFieldError("OTP Code", error instanceof Error ? error.message : "Invalid OTP code")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-3 sm:p-4 fade-in">
      <div className="w-full max-w-md scale-in">
        <Card className="glass-effect shadow-2xl border-border/50">
          <CardHeader className="text-center space-y-5 pb-6 sm:pb-8 px-4 sm:px-8 pt-6 sm:pt-8">
            <div className="flex justify-center">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-card border-2 border-primary/20 flex items-center justify-center shadow-lg scale-in">
                <Image
                  src="/images/qcc-logo.png"
                  alt="QCC Logo - Quality Control Company Limited"
                  width={80}
                  height={80}
                  className="rounded-full object-contain"
                  priority
                />
              </div>
            </div>
            <div className="space-y-2 slide-up">
              <CardTitle className="text-xl sm:text-2xl font-bold text-primary tracking-wide">QCC ATTENDANCE</CardTitle>
              <CardDescription className="text-xs sm:text-sm text-muted-foreground">
                Sign in with your Staff Number, Email or use OTP
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-4 sm:px-8 pb-6 sm:pb-8">
            <Tabs defaultValue="password" className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-muted/50 p-1 rounded-lg h-11 sm:h-12 transition-all">
                <TabsTrigger
                  value="password"
                  className="text-sm sm:text-base transition-all duration-200 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
                >
                  Staff Login
                </TabsTrigger>
                <TabsTrigger
                  value="otp"
                  className="text-sm sm:text-base transition-all duration-200 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
                >
                  OTP Login
                </TabsTrigger>
              </TabsList>

              <TabsContent value="password" className="space-y-5 mt-6 sm:space-y-6 fade-in">
                <form onSubmit={handleLogin} className="space-y-5 sm:space-y-6 stagger-children">
                  <div className="space-y-2">
                    <Label htmlFor="identifier" className="text-sm font-medium text-foreground">
                      Staff Number or Email
                    </Label>
                    <Input
                      id="identifier"
                      type="text"
                      placeholder="Enter your email"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      required
                      className="h-12 sm:h-12 border-border focus:border-primary focus:ring-primary bg-input focus-enhanced text-base"
                      disabled={isLoading}
                      autoComplete="email"
                      inputMode="email"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      7-digit staff number or email address
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm font-medium text-foreground">
                      Password
                    </Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="h-12 border-border focus:border-primary focus:ring-primary bg-input focus-enhanced pr-12"
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
                    onClick={(e) => {
                      console.log("[v0] Sign-in button clicked directly")
                      console.log("[v0] Button disabled state:", isLoading)
                      console.log("[v0] Identifier:", identifier)
                      console.log("[v0] Password length:", password.length)
                    }}
                    className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 cursor-pointer"
                    disabled={isLoading}
                  >
                    {isLoading ? "Signing in..." : "Sign In"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="otp" className="space-y-6 mt-6">
                {!otpSent ? (
                  <form onSubmit={handleSendOtp} className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="otpEmail" className="text-sm font-medium text-foreground">
                        Corporate Email Address
                      </Label>
                      <Input
                        id="otpEmail"
                        type="email"
                        placeholder="your.email@qccgh.com"
                        value={otpEmail}
                        onChange={(e) => setOtpEmail(e.target.value)}
                        required
                        className="h-12 border-border focus:border-primary focus:ring-primary bg-input focus-enhanced"
                      />
                      <p className="text-xs text-muted-foreground">OTP will be sent to your registered email address</p>
                    </div>
                    <Button
                      type="submit"
                      className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-lg shadow-lg hover:shadow-xl transition-all duration-200"
                      disabled={isLoading}
                    >
                      {isLoading ? "Sending OTP..." : "Send OTP Code"}
                    </Button>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyOtp} className="space-y-6">
                    <div className="space-y-4">
                      <Label htmlFor="otp" className="text-sm font-medium text-foreground">
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
                      <p className="text-xs text-muted-foreground text-center">
                        Enter the 6-digit code sent to {otpEmail}
                      </p>
                    </div>
                    <Button
                      type="submit"
                      className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-lg shadow-lg hover:shadow-xl transition-all duration-200"
                      disabled={isLoading || otp.length !== 6}
                    >
                      {isLoading ? "Verifying..." : "Verify OTP"}
                    </Button>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1 h-12 border-border text-foreground hover:bg-muted bg-transparent"
                        onClick={() => {
                          setOtpSent(false)
                          setOtp("")
                          setSuccessMessage(null)
                        }}
                      >
                        Back to Email
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1 h-12 border-primary text-primary hover:bg-primary hover:text-primary-foreground bg-transparent"
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
              <p className="text-sm text-muted-foreground">Don't have an account?</p>
            </div>

          <div className="mt-6 text-center border-t border-border pt-6">
            <p className="text-sm font-medium text-foreground">Quality Control Company Limited</p>
            <p className="text-xs text-muted-foreground mt-1">Intranet Portal - Powered by IT Department</p>
            <p className="text-xs text-muted-foreground mt-2 font-mono text-center">V.1.1.2-28-26</p>
          </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
