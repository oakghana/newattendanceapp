# Login System - Code Snippets Reference

## 1. Login Page Component
**File:** `app/auth/login/page.tsx`

### Main Login Function
```typescript
const handleLogin = async (e: React.FormEvent) => {
  e.preventDefault()
  setIsLoading(true)
  setError(null)
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

    // Authenticate with Supabase
    const result = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    const data = result.data
    const error = result.error

    if (error) {
      // Handle authentication error
      showError(error.message, "Login Failed")
      return
    }

    // Check user approval status
    if (data?.user?.id) {
      const approvalCheck = await checkUserApproval(data.user.id)

      if (!approvalCheck.approved) {
        await supabase.auth.signOut()
        showWarning(approvalCheck.error || "Account not approved", "Account Approval Required")
        router.push("/auth/pending-approval")
        return
      }

      // Check password enforcement
      const runtimeFlags = await getRuntimeFlags()
      const mustChangePassword =
        runtimeFlags.passwordEnforcementEnabled &&
        (Boolean(data.user.user_metadata?.force_password_change) ||
          isPasswordChangeRequired(approvalCheck.passwordChangedAt))

      if (mustChangePassword) {
        logLoginActivity(data.user.id, "login_password_change_required", true, "password")
        showWarning(getPasswordEnforcementMessage(), "Password Change Required")
        setTimeout(() => {
          window.location.href = "/dashboard/profile?forceChange=true&reason=monthly"
        }, 800)
        return
      }

      // Log successful login
      logLoginActivity(data.user.id, "login_success", true, "password")

      // Clear cache and redirect
      clearAttendanceCache()
      clearGeolocationCache()

      showSuccess("Login successful! Redirecting to check-in...", "Welcome Back")
      
      setTimeout(() => {
        window.location.href = "/dashboard/attendance"
      }, 800)
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    showError(msg || 'An error occurred during login', 'Login Error')
  } finally {
    setIsLoading(false)
  }
}
```

### Check User Approval Function
```typescript
const checkUserApproval = async (userId: string) => {
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from("user_profiles")
      .select("is_active, first_name, last_name, password_changed_at, role")
      .eq("id", userId)
      .single()

    if (error) {
      return { approved: false, error: "Failed to verify account status" }
    }

    if (!data) {
      return { approved: false, error: "User profile not found. Please contact administrator." }
    }

    return {
      approved: data.is_active,
      name: `${data.first_name} ${data.last_name}`,
      passwordChangedAt: data.password_changed_at || null,
      role: data.role,
      error: data.is_active ? null : "Your account is pending admin approval. Please wait for activation.",
    }
  } catch (error) {
    return { approved: false, error: "Failed to verify account status" }
  }
}
```

### OTP Login Function
```typescript
const handleSendOtp = async (e: React.FormEvent) => {
  e.preventDefault()
  const supabase = createClient()
  setIsLoading(true)
  setError(null)

  try {
    if (!otpEmail.trim()) {
      showFieldError("Email", "Please enter your email address")
      return
    }

    if (!otpEmail.includes("@") || !otpEmail.includes(".")) {
      showFieldError("Email", "Please enter a valid email address")
      return
    }

    // Validate email exists in system
    const validateResponse = await fetch("/api/auth/validate-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: otpEmail }),
      signal: AbortSignal.timeout(10000),
    })

    if (validateResponse.ok) {
      const validateResult = await validateResponse.json()
      if (!validateResult.exists) {
        showFieldError("Email", "This email is not registered in the QCC system.")
        return
      }
      if (!validateResult.approved) {
        showFieldError("Email", "Your account is pending admin approval.")
        return
      }
    }

    // Send OTP via Supabase
    const otpResult = await supabase.auth.signInWithOtp({
      email: otpEmail,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        shouldCreateUser: false,
      },
    })

    if (otpResult.error) {
      showFieldError("Email", `Failed to send OTP: ${otpResult.error.message}`)
      return
    }

    setOtpSent(true)
    showSuccess("OTP sent to your email. Please check your inbox.", "OTP Sent")
  } catch (error: unknown) {
    if (error instanceof Error) {
      showError(`Failed to send OTP: ${error.message}`, "OTP Error")
    }
  } finally {
    setIsLoading(false)
  }
}
```

### Verify OTP Function
```typescript
const handleVerifyOtp = async (e: React.FormEvent) => {
  e.preventDefault()
  const supabase = createClient()
  setIsLoading(true)
  setError(null)

  try {
    if (!otp.trim() || otp.length !== 6 || !/^\d{6}$/.test(otp)) {
      showFieldError("OTP Code", "OTP code must be 6 digits")
      return
    }

    // Verify OTP with Supabase
    const result = await supabase.auth.verifyOtp({
      email: otpEmail,
      token: otp,
      type: "email",
    })

    const data = result.data
    const error = result.error

    if (error) {
      if (error.message.includes("expired")) {
        showFieldError("OTP Code", "OTP code has expired. Please request a new one.")
      } else {
        showFieldError("OTP Code", "Invalid OTP code. Please check and try again.")
      }
      return
    }

    // Same post-auth flow as password login
    if (data?.user?.id) {
      const approvalCheck = await checkUserApproval(data.user.id)

      if (!approvalCheck.approved) {
        await supabase.auth.signOut()
        showWarning(approvalCheck.error || "Account not approved", "Account Approval Required")
        router.push("/auth/pending-approval")
        return
      }

      // Log and redirect
      await logLoginActivity(data.user.id, "otp_login_success", true, "otp")
      showSuccess("OTP verified successfully! Redirecting to check-in...", "Login Successful")

      setTimeout(() => {
        window.location.href = "/dashboard/attendance"
      }, 800)
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      showError(`Failed to verify OTP: ${error.message}`, "OTP Error")
    }
  } finally {
    setIsLoading(false)
  }
}
```

### Login Activity Logging Function
```typescript
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
        ip_address: null, // Captured server-side
        user_agent: navigator.userAgent,
      }),
    })

    if (!response.ok) {
      console.error("Failed to log login activity:", response.status)
      // Don't throw - login should continue even if logging fails
      return
    }
  } catch (error) {
    // Don't throw error - login should continue even if logging fails
    console.error("Login logging error:", error)
  }
}
```

---

## 2. Backend API Endpoints

### Staff Lookup API
**File:** `app/api/auth/lookup-staff/route.ts`

```typescript
import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { identifier } = await request.json()

    const supabase = await createClient()

    // Check if identifier is an email or staff number
    const isEmail = identifier.includes("@")

    if (isEmail) {
      return NextResponse.json({ email: identifier })
    }

    // Validate 7-digit staff number format
    const staffNumberRegex = /^\d{7}$/
    if (!staffNumberRegex.test(identifier)) {
      return NextResponse.json(
        { error: "Staff number must be exactly 7 digits" },
        { status: 400 }
      )
    }

    // Look up staff number in database
    const { data: profile, error } = await supabase
      .from("user_profiles")
      .select("email, employee_id, first_name, last_name")
      .eq("employee_id", identifier)
      .single()

    if (error || !profile) {
      return NextResponse.json(
        { error: "Staff number not found in system" },
        { status: 404 }
      )
    }

    return NextResponse.json({ email: profile.email })
  } catch (error) {
    console.error("[v0] Staff lookup error:", error)
    return NextResponse.json(
      { error: `Internal server error: ${error.message}` },
      { status: 500 }
    )
  }
}
```

### Email Validation API
**File:** `app/api/auth/validate-email/route.ts`

```typescript
import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { rateLimit, getClientIdentifier, sanitizeInput, createSecurityHeaders } from "@/lib/security"

export async function POST(request: NextRequest) {
  try {
    // Rate limiting: 10 requests per 5 minutes
    const clientId = getClientIdentifier(request)
    const isAllowed = rateLimit(clientId, {
      windowMs: 5 * 60 * 1000,
      maxRequests: 10,
    })

    if (!isAllowed) {
      return NextResponse.json(
        { error: "Too many validation attempts. Please try again later.", exists: false },
        { status: 429 }
      )
    }

    // Parse and validate email
    const body = await request.json()
    const email = sanitizeInput(body.email?.trim()?.toLowerCase())

    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Invalid email format", exists: false },
        { status: 400 }
      )
    }

    // Query database
    const supabase = await createClient()
    const { data: user, error: queryError } = await supabase
      .from("user_profiles")
      .select("id, email, is_active, first_name, last_name")
      .ilike("email", email)
      .maybeSingle()

    if (queryError) {
      return NextResponse.json(
        { error: "Database error during validation", exists: false },
        { status: 500 }
      )
    }

    if (!user) {
      return NextResponse.json(
        {
          error: "This email is not registered in the QCC system.",
          exists: false,
        },
        { status: 404 }
      )
    }

    if (!user.is_active) {
      return NextResponse.json(
        {
          exists: true,
          approved: false,
          message: "Account pending approval",
        },
        { status: 200 }
      )
    }

    return NextResponse.json(
      {
        exists: true,
        approved: true,
        message: "Email validated successfully",
      },
      { status: 200 }
    )
  } catch (error) {
    console.error("[v0] Email validation error:", error)
    return NextResponse.json(
      { error: "Server error occurred", exists: false },
      { status: 500 }
    )
  }
}
```

### Login Activity Logging API
**File:** `app/api/auth/login-log/route.ts`

```typescript
import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { user_id, action, success, method, user_agent } = body

    // Validate required fields
    if (!user_id || !action || typeof success !== "boolean" || !method) {
      return NextResponse.json(
        { error: "Missing required fields: user_id, action, success, method" },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Extract valid IP address
    const getValidIpAddress = () => {
      const possibleIps = [
        request.ip,
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
        request.headers.get("x-real-ip"),
        request.headers.get("cf-connecting-ip"),
        request.headers.get("x-client-ip"),
      ]

      for (const ip of possibleIps) {
        if (ip && ip !== "unknown" && ip !== "::1" && ip !== "127.0.0.1") {
          if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip) || /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/.test(ip)) {
            return ip
          }
        }
      }
      return null
    }

    // Insert audit log
    const { data, error } = await supabase.from("audit_logs").insert({
      user_id,
      action,
      table_name: "auth_sessions",
      new_values: {
        success,
        method,
        timestamp: new Date().toISOString(),
        user_agent: user_agent || request.headers.get("user-agent") || "unknown",
      },
      ip_address: getValidIpAddress(),
      user_agent: user_agent || request.headers.get("user-agent") || "unknown",
    })

    if (error) {
      console.error("[v0] Failed to insert audit log:", error)
      // Don't fail login if audit logging fails
      return NextResponse.json({
        success: true,
        logged: false,
        warning: "Login successful but activity logging failed",
      })
    }

    return NextResponse.json({ success: true, logged: true })
  } catch (error) {
    console.error("[v0] Login logging error:", error)
    return NextResponse.json(
      {
        success: true,
        logged: false,
        warning: "Login successful but activity logging failed",
      },
      { status: 200 }
    )
  }
}
```

### Logout API
**File:** `app/api/auth/logout/route.ts`

```typescript
import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Log the logout action
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "logout",
      table_name: "auth_sessions",
      ip_address: request.ip || null,
      user_agent: request.headers.get("user-agent"),
    })

    // Sign out from Supabase
    const { error: signOutError } = await supabase.auth.signOut()

    if (signOutError) {
      return NextResponse.json({ error: "Failed to sign out" }, { status: 500 })
    }

    const response = NextResponse.json({ success: true })

    // Clear auth cookies
    response.cookies.set("sb-access-token", "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    })
    response.cookies.set("sb-refresh-token", "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    })

    return response
  } catch (error) {
    console.error("Logout error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
```

### Get Current User API
**File:** `app/api/auth/current-user/route.ts`

```typescript
import { createClientAndGetUser } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const { supabase, user, authError } = await createClientAndGetUser()

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      )
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("id, first_name, last_name, email, role, department_id, assigned_location_id")
      .eq("id", user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json(
        { success: false, error: "Profile not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      user: {
        id: profile.id,
        first_name: profile.first_name,
        last_name: profile.last_name,
        email: profile.email,
        role: profile.role,
        department_id: profile.department_id,
        assigned_location_id: profile.assigned_location_id,
      },
    })
  } catch (error) {
    console.error("Error fetching current user:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}
```

---

## 3. Database Tables

### user_profiles Table
```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  employee_id VARCHAR(7),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT false,
  password_changed_at TIMESTAMP,
  role VARCHAR(50) DEFAULT 'staff',
  department_id UUID REFERENCES departments(id),
  assigned_location_id UUID REFERENCES locations(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### audit_logs Table
```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  table_name TEXT,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
```

---

## 4. Utility Functions

### Check Password Change Required
```typescript
export function isPasswordChangeRequired(passwordChangedAt: string | null): boolean {
  if (!passwordChangedAt) return true

  const lastChanged = new Date(passwordChangedAt)
  const now = new Date()
  const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000

  return now.getTime() - lastChanged.getTime() > thirtyDaysInMs
}
```

### Get Password Enforcement Message
```typescript
export function getPasswordEnforcementMessage(): string {
  return "For security, you must change your password before continuing. This is a mandatory monthly requirement."
}
```

### Security Headers
```typescript
export function createSecurityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  }
}
```

### Rate Limiting Function
```typescript
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

export function rateLimit(
  clientId: string,
  options: { windowMs: number; maxRequests: number }
): boolean {
  const now = Date.now()
  const record = rateLimitStore.get(clientId)

  if (!record || now > record.resetTime) {
    rateLimitStore.set(clientId, {
      count: 1,
      resetTime: now + options.windowMs,
    })
    return true
  }

  if (record.count < options.maxRequests) {
    record.count++
    return true
  }

  return false
}
```

---

## Key Integration Points

1. **Supabase Auth Client**: `createClient()` (client-side)
2. **Supabase Server Client**: `createClient()` (server-side)
3. **Database Queries**: Supabase JS SDK
4. **Audit Logging**: Inserted to `audit_logs` table
5. **Notification System**: Custom `useNotifications()` hook
6. **Session Storage**: Browser cookies + Supabase session

---

## Testing Login Credentials

```javascript
// Test Case 1: Normal Password Login
const credentials = {
  email: "staff@example.com",
  password: "SecurePassword123!"
}

// Test Case 2: Staff Number Login
const staffLogin = {
  identifier: "1234567",  // 7-digit staff number
  password: "SecurePassword123!"
}

// Test Case 3: OTP Login
const otpLogin = {
  email: "staff@example.com"
  // Then enter 6-digit OTP from email
}

// Test Case 4: Unapproved Account
const unapprovedUser = {
  email: "pending@example.com",
  password: "Password123!"
  // Result: "Your account is pending admin approval"
}

// Test Case 5: Force Password Change
const forceChangeUser = {
  email: "staff@example.com",
  password: "OldPassword123!"
  // Result: Redirected to password change page
}
```

This comprehensive guide covers all aspects of the login system with working code examples!
