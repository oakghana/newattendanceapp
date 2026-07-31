# Admin Menu Access Fix Guide

## Problem
Admin users cannot access:
- **Memo Console** (`/dashboard/secretary-memos`)
- **Disbursement Confirmation** (`/dashboard/disbursement-confirmation`)

## Root Cause
The admin user's role in the `user_profiles` table doesn't match the expected value `"admin"` (lowercase).

The sidebar normalizes roles with `.toLowerCase().trim()`, so:
- `"Admin"` → `"admin"` ✓ (matches)
- `"ADMIN"` → `"admin"` ✓ (matches)
- `"AdminUser"` → `"adminuser"` ✗ (doesn't match)
- `"it-admin"` → `"it-admin"` ✗ (doesn't match)

## Solution: Quick Fix (Recommended)

### Method 1: Run the Node.js Script (Easiest)

```bash
# Option A: Using npm script
npm run fix:admin-menu

# Option B: Direct node command
node fix-admin-template.js
```

**What it does:**
1. Connects to your Supabase database
2. Finds all users with admin-related roles
3. Normalizes them to exactly `"admin"`
4. Verifies the fix worked
5. Provides next steps

**Requirements:**
- `.env.development.local` must have `SUPABASE_URL` and `SUPABASE_ANON_KEY`
- Supabase client already installed: `npm install @supabase/supabase-js`

---

### Method 2: Run SQL Queries Manually (Most Control)

#### Step 1: View Current Admin Users
Go to [Supabase Dashboard](https://app.supabase.com/) → SQL Editor → New Query

```sql
SELECT id, email, role FROM user_profiles
WHERE LOWER(TRIM(role)) = 'admin'
   OR LOWER(TRIM(role)) LIKE '%admin%'
ORDER BY role, email;
```

This shows you all users with admin-related roles and their current role values.

#### Step 2: Normalize Admin Roles
```sql
UPDATE user_profiles
SET role = 'admin'
WHERE LOWER(TRIM(role)) LIKE '%admin%'
  AND LOWER(TRIM(role)) != 'admin';
```

This updates all non-standard admin roles to exactly `"admin"`.

#### Step 3: Verify the Fix
```sql
SELECT id, email, role FROM user_profiles
WHERE role = 'admin'
ORDER BY email;
```

Confirm all admin users now have `role = 'admin'`.

---

## After Running the Fix

### 1. Clear Browser Cache
```
Windows/Linux: Ctrl + Shift + Delete
Mac: Cmd + Shift + Delete
```

### 2. Restart Dev Server
```bash
# Press Ctrl+C to stop current server
npm run dev
```

### 3. Test Access
1. Log in as an admin user
2. Navigate to `/dashboard/overview`
3. Check the sidebar for "Memo Console" and "Disbursement Confirmation"
4. Click to verify both pages load

---

## Troubleshooting

### Issue: Menus still not visible

**Check 1: Verify role was updated**
```sql
-- Run in Supabase SQL Editor
SELECT email, role FROM user_profiles WHERE email = 'admin@example.com';
```
Ensure the `role` column shows exactly `"admin"`.

**Check 2: Clear all cache**
- Close browser completely
- Delete browser cache
- Reopen browser
- Log out and log back in

**Check 3: Check browser console**
- Open DevTools (F12)
- Go to Console tab
- Look for `[v0] Disbursement visibility check` messages
- Verify `effectiveRole` shows `"admin"`

**Check 4: Restart everything**
```bash
# Kill dev server
Ctrl+C

# Clear Next.js cache
rm -rf .next

# Restart
npm run dev
```

### Issue: Can't run Node script

**Error: Cannot find module '@supabase/supabase-js'**
```bash
npm install @supabase/supabase-js
npm run fix:admin-menu
```

**Error: SUPABASE_URL not configured**
1. Check `.env.development.local` exists in project root
2. Verify it has:
   ```
   SUPABASE_URL=your_url_here
   SUPABASE_ANON_KEY=your_key_here
   ```
3. Get values from Supabase Dashboard → Project Settings → API

---

## File Locations

| File | Purpose |
|------|---------|
| `fix-admin-template.js` | Automated Node.js script to fix admin access |
| `fix-admin-queries.sql` | SQL queries to run manually in Supabase |
| `scripts/fix-admin-menu-access.mjs` | Detailed setup guide and documentation |
| `ADMIN_ACCESS_FIX.md` | This file |

---

## Configuration Reference

### Sidebar Menu Configuration
**Location:** `components/dashboard/sidebar.tsx`

```typescript
// Line 151-156: Memo Console
{
  title: "Memo Console",
  href: "/dashboard/secretary-memos",
  icon: ScrollText,
  roles: ["secretary", "admin"],  // ← Admin has access
  category: "main",
  executive: true,
},

// Line 160-164: Disbursement Confirmation
{
  title: "Disbursement Confirmation",
  href: "/dashboard/disbursement-confirmation",
  icon: CheckCircle2,
  roles: ["admin", "accounts_executive"],  // ← Admin has access
  category: "main",
},
```

### Role Normalization Logic
**Location:** `components/dashboard/sidebar.tsx:417-420`

```typescript
const normalizedRole = (profile?.role || "staff").toLowerCase().trim()
const effectiveRole =
  normalizedRole === "audit_staff" ? "staff" :
  normalizedRole
```

---

## Quick Reference

### For IT/DevOps
```bash
# One-liner to fix admin access
npm run fix:admin-menu

# Or with npm
npx node fix-admin-template.js
```

### For SQL Administrators
```sql
-- Quick SQL command
UPDATE user_profiles SET role = 'admin'
WHERE LOWER(TRIM(role)) LIKE '%admin%' AND LOWER(TRIM(role)) != 'admin';
```

### For Supabase Dashboard Users
1. Go to SQL Editor
2. Copy the SQL from `fix-admin-queries.sql`
3. Run queries 1, 2, 3 in order
4. Refresh browser

---

## Testing After Fix

**Test URL Path:** `/dashboard/secretary-memos`
- Admin should see: ✓ Memo Console menu item visible
- Admin should see: ✓ Page loads without permission errors

**Test URL Path:** `/dashboard/disbursement-confirmation`
- Admin should see: ✓ Disbursement Confirmation menu item visible
- Admin should see: ✓ Page loads with disbursement data

---

## Support

If issues persist after following these steps:

1. **Check role case sensitivity:**
   - Database: `SELECT DISTINCT role FROM user_profiles;`
   - Look for any variation like "Admin", "ADMIN", "AdminUser"

2. **Check for trailing spaces:**
   - Database: `SELECT id, '[' || role || ']' as role FROM user_profiles;`
   - Look for extra spaces in brackets

3. **Check Supabase RLS policies:**
   - Navigate to: Supabase Dashboard → Authentication → Policies
   - Verify `user_profiles` table allows access for authenticated users

4. **Verify Supabase credentials:**
   - Check `.env.development.local` has correct `SUPABASE_URL` and `SUPABASE_ANON_KEY`
   - Generate new keys if needed from Supabase Dashboard → Project Settings

---

## Additional Resources

- [Supabase SQL Editor](https://app.supabase.com/)
- [Project Settings - API Keys](https://app.supabase.com/project/_/settings/api)
- Sidebar Configuration: `components/dashboard/sidebar.tsx`
- Menu Role Definitions: Lines 79-172 in `sidebar.tsx`
