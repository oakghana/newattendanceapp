# QCC Electronic Attendance App - Login Process Guide

## Overview

This app uses **Supabase Authentication** with multiple login methods:
1. **Password Login** (Email or Staff Number + Password)
2. **OTP Login** (One-Time Password via Email)
3. **Account Approval System** (Admin activation required)
4. **Password Enforcement** (Mandatory password changes for new/monthly resets)

---

## Login Flow Architecture

### 1. **User Identifies Themselves**
- Users can log in using:
  - Email address
  - Staff number (7-digit employee ID)

### 2. **Staff Number Resolution** 
If user enters a staff number (7 digits):
- App calls `/api/auth/lookup-staff` 
- Looks up the staff number in `user_profiles` table
- Returns the associated email address
- Continues with password/OTP authentication

### 3. **Email Validation**
Before OTP is sent:
- App calls `/api/auth/validate-email`
- Checks if email exists in `user_profiles` table
- Verifies user's `is_active` status (admin approval)
- Returns: `{ exists: true, approved: true/false }`

### 4. **Authentication Methods**

#### **Method A: Password Authentication**
1. User enters email/staff number + password
2. App calls `supabase.auth.signInWithPassword()`
3. Supabase validates credentials
4. If successful, creates session with auth token

#### **Method B: OTP Authentication**
1. User enters email address
2. App calls `supabase.auth.signInWithOtp()`
3. Supabase sends 6-digit OTP to email
4. User enters OTP code
5. App calls `supabase.auth.verifyOtp()`
6. Session created on successful verification

### 5. **Post-Authentication Checks**
After successful auth, app performs:

#### **a) Account Approval Check**
```typescript
const { data, error } = await supabase
  .from("user_profiles")
  .select("is_active, first_name, last_name, password_changed_at, role")
  .eq("id", userId)
  .single()

if (!data.is_active) {
  // Block login, redirect to /auth/pending-approval
}
```

#### **b) Password Enforcement Check**
```typescript
const mustChangePassword = 
  runtimeFlags.passwordEnforcementEnabled &&
  (Boolean(data.user.user_metadata?.force_password_change) ||
   isPasswordChangeRequired(passwordChangedAt))

if (mustChangePassword) {
  // Redirect to /dashboard/profile?forceChange=true&reason=monthly
}
```

#### **c) Device Binding Check** (Currently Disabled)
- Feature exists but disabled for free login
- Allows users to login without device restrictions

### 6. **Login Activity Logging**
After each login attempt, app calls `/api/auth/login-log`:
```javascript
{
  user_id: userId,
  action: "login_success" | "login_failed" | "otp_login_success",
  success: boolean,
  method: "password" | "otp",
  ip_address: null,
  user_agent: navigator.userAgent
}
```
This data is stored in `audit_logs` table for security tracking.

### 7. **Post-Login Redirect**
- All successful logins redirect to: `/dashboard/attendance`
- Users can then perform check-in/check-out

---

## Key Code Files

### Frontend (User Interface)
**File:** `/app/auth/login/page.tsx`
- React Client Component
- Handles both password and OTP forms
- Two tabs: "Password Login" and "OTP Login"
- ~766 lines of validation and error handling

### Backend APIs

#### **1. Staff Number Lookup**
**File:** `/app/api/auth/lookup-staff/route.ts`
```typescript
POST /api/auth/lookup-staff
Body: { identifier: "1234567" }
Response: { email: "user@example.com" }
```
- Validates 7-digit staff number format
- Queries `user_profiles` table
- Returns email for password auth

#### **2. Email Validation**
**File:** `/app/api/auth/validate-email/route.ts`
```typescript
POST /api/auth/validate-email
Body: { email: "user@example.com" }
Response: { exists: true, approved: true }
```
- Rate limited (10 requests per 5 minutes)
- Checks if email registered in system
- Verifies account `is_active` status
- Security headers included

#### **3. Login Activity Logger**
**File:** `/app/api/auth/login-log/route.ts`
```typescript
POST /api/auth/login-log
Body: {
  user_id: "uuid",
  action: "login_success",
  success: true,
  method: "password",
  user_agent: "Mozilla/5.0..."
}
```
- Records all login attempts
- Captures IP address and user agent
- Stores in `audit_logs` table
- Fire-and-forget (non-blocking)

#### **4. Logout**
**File:** `/app/api/auth/logout/route.ts`
```typescript
POST /api/auth/logout
Response: { success: true }
```
- Clears Supabase session
- Removes auth cookies
- Logs logout action to audit_logs

#### **5. Current User Info**
**File:** `/app/api/auth/current-user/route.ts`
```typescript
GET /api/auth/current-user
Response: {
  success: true,
  user: {
    id: "uuid",
    first_name: "John",
    last_name: "Doe",
    email: "john@example.com",
    role: "staff",
    department_id: "uuid"
  }
}
```
- Retrieves authenticated user's profile
- Used for dashboard initialization

---

## Database Schema (Key Tables)

### `user_profiles`
```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  employee_id VARCHAR(7),           -- Staff number
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT false,  -- Admin approval status
  password_changed_at TIMESTAMP,
  role VARCHAR(50),
  department_id UUID,
  assigned_location_id UUID,
  ...
);
```

### `audit_logs`
```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES user_profiles(id),
  action TEXT,                      -- login_success, login_failed, logout
  table_name TEXT,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Login Sequence Diagram

```
User
  |
  +---> /auth/login (React Page)
  |
  +---> Enter Email/Staff Number + Password
  |
  +---> Staff Lookup? [if 7-digit number]
  |       └---> GET /api/auth/lookup-staff
  |           └---> Returns email
  |
  +---> Supabase signInWithPassword(email, password)
  |       └---> Auth Server validates
  |
  +---> If Success:
  |       |
  |       +---> Check User Approval [/api/auth/lookup-staff implicitly]
  |       |       └---> Query user_profiles.is_active
  |       |
  |       +---> Check Password Enforcement
  |       |       └---> Check password_changed_at timestamp
  |       |
  |       +---> Log Activity [POST /api/auth/login-log]
  |       |       └---> Insert into audit_logs
  |       |
  |       +---> Redirect to /dashboard/attendance
  |
  +---> If Failed:
          └---> Show error message
          └---> Remain on login page
```

---

## Error Handling

### Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| "Invalid login credentials" | Wrong email/password | Re-check email and password |
| "Staff number not found" | 7-digit number doesn't exist | Use email instead |
| "Your account is pending admin approval" | `is_active = false` | Wait for admin activation |
| "Email not confirmed" | Supabase email not verified | Verify email link sent |
| "OTP code has expired" | OTP older than 15 minutes | Request new OTP |
| "Too many validation attempts" | Rate limit exceeded | Wait 5 minutes |
| "Network error" | Connection issue | Check internet, try Incognito, disable extensions |

---

## Security Features

1. **Password Hashing**: Supabase uses bcrypt (industry standard)
2. **Session Management**: HTTP-only, Secure, SameSite cookies
3. **Rate Limiting**: Email validation API limited to 10 requests/5 min
4. **OTP Expiration**: 15-minute validity window
5. **Audit Logging**: All auth attempts tracked in audit_logs
6. **Account Approval**: Admin gate before first login
7. **Password Enforcement**: Mandatory monthly or on-demand resets
8. **Device Binding**: Optional enforcement (currently disabled)
9. **Input Sanitization**: Email validation regex, staff number format check
10. **CORS Headers**: Security headers on email validation endpoint

---

## User Experience

### New User (First Login)
1. User receives credentials from IT Manager
2. Goes to `/auth/login`
3. Enters staff number/email + temporary password
4. After successful login:
   - Redirected to password change page
   - Must set new password
   - Then redirected to `/dashboard/attendance`

### Returning User (Normal Login)
1. Goes to `/auth/login`
2. Selects "Password Login" tab
3. Enters email/staff number + password
4. Redirected to `/dashboard/attendance`
5. Can perform check-in/check-out

### Alternative Login (OTP Method)
1. User clicks "OTP Login" tab
2. Enters email address
3. OTP sent to registered email
4. Enters 6-digit code
5. Same post-auth flow as password login

---

## Configuration Files

### Environment Variables Required
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key
```

### Runtime Flags (App Configuration)
```typescript
passwordEnforcementEnabled: boolean      // Force password changes
deviceBindingEnabled: boolean            // Require device registration
```

Configured via: `/api/settings/runtime`

---

## Testing Login Flow

### Test Credentials (if created)
See `/scripts/012_create_demo_users.sql` for test user setup.

### Common Testing Scenarios
```bash
# Test password login
Email: john.doe@example.com
Password: TestPassword123!

# Test staff number lookup
Staff Number: 1234567 (maps to john.doe@example.com)

# Test unapproved account
- Create user with is_active=false
- Attempt login → "pending admin approval"

# Test password change requirement
- Create user with force_password_change=true
- Login → Redirected to password change page
```

---

## Implementation Summary

This authentication system provides:
- ✅ Multiple login methods (password + OTP)
- ✅ Staff number resolution
- ✅ Admin account approval workflow
- ✅ Mandatory password changes
- ✅ Comprehensive audit logging
- ✅ Rate limiting
- ✅ Email validation
- ✅ Device binding (optional)
- ✅ Session management via Supabase
- ✅ Error handling and notifications

All code follows security best practices and is production-ready.
