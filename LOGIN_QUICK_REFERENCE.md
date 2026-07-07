# Login System - Quick Reference

## Overview
**QCC Electronic Attendance App** uses **Supabase Authentication** with a custom approval workflow.

---

## 🔐 Login Methods

### Method 1: Email + Password
```
1. User enters: email@example.com + password
2. App calls: supabase.auth.signInWithPassword()
3. Result: Session created or error
```

### Method 2: Staff Number + Password
```
1. User enters: 1234567 (7-digit ID) + password
2. App calls: /api/auth/lookup-staff → Returns email
3. App calls: supabase.auth.signInWithPassword()
4. Result: Session created or error
```

### Method 3: Email OTP
```
1. User enters: email@example.com
2. App calls: supabase.auth.signInWithOtp() → Sends OTP email
3. User enters: 6-digit code
4. App calls: supabase.auth.verifyOtp()
5. Result: Session created or error
```

---

## 📋 Login Flow Steps

```
User Login Attempt
    ↓
Staff Number? → Look up email [/api/auth/lookup-staff]
    ↓
Authenticate [supabase.auth.signInWithPassword() or verifyOtp()]
    ↓
Account Approved? [Check user_profiles.is_active]
    ├─ NO  → Show error, Redirect to /auth/pending-approval
    └─ YES ↓
Password Change Required? [Check password_changed_at timestamp]
    ├─ YES → Redirect to /dashboard/profile?forceChange=true
    └─ NO  ↓
Log Activity [POST /api/auth/login-log]
    ↓
Clear Cache & Redirect to /dashboard/attendance
```

---

## 📁 Key Files

| File | Purpose |
|------|---------|
| `app/auth/login/page.tsx` | Main login UI (766 lines) |
| `app/api/auth/lookup-staff/route.ts` | Staff number → email lookup |
| `app/api/auth/validate-email/route.ts` | Email validation + rate limiting |
| `app/api/auth/login-log/route.ts` | Audit logging for all login attempts |
| `app/api/auth/logout/route.ts` | Sign out + cookie clearing |
| `app/api/auth/current-user/route.ts` | Get authenticated user info |

---

## 🔑 API Endpoints

### POST `/api/auth/lookup-staff`
```json
Request:
{ "identifier": "1234567" }

Response:
{ "email": "user@example.com" }
```

### POST `/api/auth/validate-email`
```json
Request:
{ "email": "user@example.com" }

Response:
{ 
  "exists": true, 
  "approved": true,
  "message": "Email validated successfully"
}

Rate Limit: 10 requests per 5 minutes
```

### POST `/api/auth/login-log`
```json
Request:
{
  "user_id": "uuid",
  "action": "login_success",
  "success": true,
  "method": "password",
  "user_agent": "Mozilla/5.0..."
}

Response:
{ "success": true, "logged": true }
```

### POST `/api/auth/logout`
```json
Response:
{ "success": true }
```

### GET `/api/auth/current-user`
```json
Response:
{
  "success": true,
  "user": {
    "id": "uuid",
    "first_name": "John",
    "last_name": "Doe",
    "email": "john@example.com",
    "role": "staff",
    "department_id": "uuid"
  }
}
```

---

## 🗄️ Database Tables

### user_profiles
```sql
-- Key columns for login
id (UUID)
email (TEXT, UNIQUE)
employee_id (VARCHAR 7)    -- Staff number
first_name (TEXT)
last_name (TEXT)
is_active (BOOLEAN)        -- Admin approval status
password_changed_at (TIMESTAMP)
role (VARCHAR 50)
```

### audit_logs
```sql
-- Tracks all login attempts
id (UUID)
user_id (UUID)
action (TEXT)              -- login_success, login_failed, logout, otp_login_success
table_name (TEXT)
new_values (JSONB)         -- Contains success, method, timestamp
ip_address (INET)
user_agent (TEXT)
created_at (TIMESTAMP)
```

---

## ⚙️ Configuration

### Environment Variables
```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxxx
SUPABASE_SERVICE_ROLE_KEY=xxxx
```

### Runtime Flags
```typescript
// Configurable at: /api/settings/runtime

passwordEnforcementEnabled: boolean
// Forces password change every 30 days or on first login

deviceBindingEnabled: boolean
// Currently disabled - would restrict login to registered devices
```

---

## 🛡️ Security Features

| Feature | Description |
|---------|-------------|
| **Password Hashing** | Supabase uses bcrypt |
| **Session Tokens** | HTTP-only, Secure, SameSite cookies |
| **Rate Limiting** | Email validation: 10 requests/5 min |
| **OTP Expiration** | 15-minute validity window |
| **Account Approval** | Admin gate before first login |
| **Audit Logging** | All auth attempts tracked |
| **Password Enforcement** | Monthly reset requirement |
| **Input Validation** | Email regex, staff number format |
| **CORS Headers** | Security headers on auth endpoints |
| **Geolocation Cache** | Cleared on logout |

---

## ✅ Login Checklist

After successful authentication, system performs:

- [ ] Verify account is active (`is_active = true`)
- [ ] Check if password change is required
- [ ] Get runtime flags for enforcement policies
- [ ] Log authentication attempt to audit_logs
- [ ] Clear attendance cache
- [ ] Clear geolocation cache
- [ ] Display success notification
- [ ] Redirect to /dashboard/attendance

---

## ❌ Common Error Scenarios

| Error | Cause | Solution |
|-------|-------|----------|
| "Invalid login credentials" | Wrong email/password | Re-check credentials |
| "Staff number not found" | 7-digit ID doesn't exist | Use email instead |
| "Account pending approval" | `is_active = false` | Wait for admin activation |
| "OTP expired" | OTP older than 15 min | Request new OTP |
| "Rate limit exceeded" | Too many validation attempts | Wait 5 minutes |
| "Network error" | Connection problem | Check internet, disable extensions |
| "Email not registered" | Email not in system | Contact IT admin |

---

## 🎯 User Journeys

### New User First Login
```
1. Receives temporary credentials from IT
2. Goes to /auth/login
3. Enters staff number/email + temporary password
4. System detects force_password_change flag
5. Redirected to /dashboard/profile?forceChange=true
6. Sets new password
7. Automatically redirected to /dashboard/attendance
```

### Returning User Normal Login
```
1. Goes to /auth/login
2. Selects "Password Login" tab
3. Enters email/staff number + password
4. Account check passes
5. Activity logged
6. Redirected to /dashboard/attendance
```

### User Using OTP Login
```
1. Goes to /auth/login
2. Selects "OTP Login" tab
3. Enters email → OTP sent
4. Enters 6-digit code
5. Same post-auth flow as password login
6. Redirected to /dashboard/attendance
```

### Unapproved Account Attempt
```
1. User tries to login
2. Authentication succeeds
3. System checks is_active flag
4. Finds is_active = false
5. Shows: "Your account is pending admin approval"
6. Redirected to /auth/pending-approval
7. Session automatically cleared
```

---

## 🔍 Debugging

### Check if User is Approved
```typescript
const { data } = await supabase
  .from("user_profiles")
  .select("is_active, email")
  .eq("email", "user@example.com")
  .single()

console.log("Is Active:", data.is_active) // true/false
```

### View Login History
```typescript
const { data } = await supabase
  .from("audit_logs")
  .select("*")
  .eq("user_id", userId)
  .in("action", ["login_success", "login_failed"])
  .order("created_at", { ascending: false })
  .limit(50)

data.forEach(log => {
  console.log(`${log.action} at ${log.created_at}`)
})
```

### Check Password Change Status
```typescript
const { data } = await supabase
  .from("user_profiles")
  .select("password_changed_at")
  .eq("id", userId)
  .single()

const daysSinceChange = (Date.now() - new Date(data.password_changed_at).getTime()) / (1000 * 60 * 60 * 24)
console.log(`Password changed ${daysSinceChange} days ago`)
```

---

## 📊 Audit Trail Queries

### All Login Attempts (Last 24 Hours)
```sql
SELECT 
  user_id,
  action,
  new_values->>'success' as success,
  ip_address,
  created_at
FROM audit_logs
WHERE action LIKE 'login%'
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

### Failed Login Attempts
```sql
SELECT 
  COUNT(*) as failed_attempts,
  user_id,
  DATE(created_at) as date
FROM audit_logs
WHERE action = 'login_failed'
GROUP BY user_id, DATE(created_at)
ORDER BY failed_attempts DESC;
```

### OTP Login Usage
```sql
SELECT 
  COUNT(*) as otp_logins,
  new_values->>'method' as method,
  DATE(created_at) as date
FROM audit_logs
WHERE action LIKE 'otp%'
GROUP BY method, DATE(created_at)
ORDER BY date DESC;
```

---

## 🚀 Deployment Checklist

- [ ] Supabase URL configured
- [ ] Supabase keys set in environment
- [ ] Database tables created (user_profiles, audit_logs)
- [ ] RLS policies configured
- [ ] SMTP settings configured (for OTP emails)
- [ ] Redirect URL configured in Supabase auth settings
- [ ] Runtime flags initialized in settings table
- [ ] At least one admin user created and approved
- [ ] SSL/HTTPS enabled
- [ ] CORS configured if needed

---

## 📞 Support

For issues or questions:
1. Check `/LOGIN_PROCESS_GUIDE.md` for detailed flow
2. Check `/LOGIN_CODE_SNIPPETS.md` for implementation examples
3. Review audit_logs table for login history
4. Check server console logs for error messages
5. Contact IT administrator for account approval

---

## Version Information

- **Framework**: Next.js 16
- **Auth Provider**: Supabase
- **Database**: PostgreSQL (via Supabase)
- **API Method**: RESTful endpoints
- **Session Storage**: HTTP-only cookies
- **Last Updated**: July 2026

