# HR Leave Office Role - Troubleshooting & Testing

## Issue Summary

**Problem**: HR Leave Office users were unable to access the dashboard after login. 
- Login was successful (no authentication errors)
- However, accessing `/dashboard` resulted in repeated "unauthorized access" errors
- User was redirected back to login page

**Root Cause**: The `proxy.ts` authorization middleware did not include `hr_leave_office` in the allowed roles for protected dashboard routes.

**Solution**: Added `hr_leave_office` to `PROTECTED_ROUTES` in `proxy.ts` for all relevant dashboard paths.

## What Was Fixed

### Authorization Middleware (`proxy.ts`)

Added `hr_leave_office` to the following protected routes:

```typescript
// Staff Dashboard - Main entry point
"/dashboard": [
  "staff", "nsp", "intern", "it-admin", "department_head", 
  "regional_manager", "admin", "loan_office", "accounts", 
  "director_hr", "manager_hr", "hr_officer", 
  "hr_leave_office",    // ← ADDED
  "leave_admin", "audit_staff", "contract", "loan_committee", "committee"
]

// Leave Management Module
"/dashboard/leave-management": [
  "admin", "staff", "nsp", "intern", "it-admin", "department_head",
  "regional_manager", "loan_office", "accounts", "director_hr",
  "manager_hr", "hr_officer",
  "hr_leave_office",    // ← ADDED
  "leave_admin", "hr_office", "audit_staff", "contract"
]

// Leave Planning Module
"/dashboard/leave-planning": [
  "admin", "staff", "nsp", "intern", "it-admin", "department_head",
  "regional_manager", "loan_office", "accounts", "director_hr",
  "manager_hr", "hr_officer",
  "hr_leave_office",    // ← ADDED
  "leave_admin", "hr_office", "audit_staff", "contract"
]
```

## Testing the Fix

### Manual Testing Steps

1. **Login as HR Leave Office User**
   ```
   Email: dhrm@qccgh.com
   Password: password
   Role: HR Leave Office
   ```

2. **Verify Dashboard Access**
   - After login, user should be redirected to `/dashboard`
   - No "unauthorized access" errors in console
   - Dashboard should load successfully

3. **Check Leave Management Module**
   - Navigate to Leave Management
   - Verify all tabs are visible EXCEPT:
     - Holiday Management (hidden)
     - Leave Policy (hidden)
   
4. **Verify Tab Visibility**
   Expected tabs for HR Leave Office:
   - ✅ Leave Management
   - ✅ Leave & HR Leave Planning
   - ✅ Leave Analytics
   - ✅ Balance & Calendar
   - ❌ Holiday Management (hidden)
   - ❌ Leave Policy (hidden)

### Testing Authorization

To test authorization, you can check the browser console for errors:

```javascript
// In browser DevTools Console
// Should NOT see authorization errors like:
// [Authorization] User xxx (role: hr_leave_office) attempted unauthorized access to /dashboard
```

## Related Configurations

### Leave Management Module Access Control

File: `app/dashboard/leave-management/leave-management-module-client.tsx`

Role arrays that include `hr_leave_office`:
```typescript
const HR_ANALYTICS_ROLES = [
  "leave_admin", "admin", "hr_office", "hr_leave_office", "hr"
]

// Excludes hr_leave_office - restricted from holiday management
const HOLIDAY_MANAGEMENT_ROLES = [
  "admin", "leave_admin", "director_hr", "manager_hr"
]

// Excludes hr_leave_office - restricted from leave policy
const LEAVE_POLICY_ROLES = [
  "admin", "leave_admin", "director_hr"
]
```

## Debugging Authorization Issues

If you encounter authorization issues after applying this fix:

### 1. Check Proxy Configuration
- File: `proxy.ts`
- Verify `hr_leave_office` is in `PROTECTED_ROUTES`
- Check role normalization (hyphens → underscores)

### 2. Check User Role
```javascript
// Run in browser DevTools
// This confirms the user's assigned role
JSON.parse(localStorage.getItem('user')).user_metadata.role
```

### 3. Check Server Logs
Look for authorization messages:
```
[Authorization] User xxx (role: hr_leave_office) attempted unauthorized access to /path
```

If you see this message:
- Check that `hr_leave_office` is in the allowed roles array for that path in `proxy.ts`
- Clear browser cache (Ctrl+Shift+R)
- Restart dev server: `npm run dev`

### 4. Role Normalization
The system converts role values:
- Hyphens (-) → Underscores (_)
- Spaces → Underscores (_)
- Lowercase conversion

Examples:
- `HR Leave Office` → `hr_leave_office`
- `hr-leave-office` → `hr_leave_office`
- `HR_LEAVE_OFFICE` → `hr_leave_office`

## Files Modified

1. **proxy.ts** - Added `hr_leave_office` to protected routes
2. **app/dashboard/leave-management/leave-management-module-client.tsx** - Tab visibility restrictions (already complete)

## Verification Checklist

After applying this fix:

- [ ] HR Leave Office user can login successfully
- [ ] User is not redirected away from `/dashboard`
- [ ] Dashboard loads without authorization errors
- [ ] No console errors about unauthorized access
- [ ] Leave Management tab is visible and accessible
- [ ] Leave Planning tab is visible and accessible
- [ ] Leave Analytics tab is visible and accessible
- [ ] Holiday Management tab is hidden
- [ ] Leave Policy tab is hidden (if exists)
- [ ] Other roles still have correct access restrictions

## Rollback Instructions

If you need to revert this change:

```bash
git revert <commit-hash>
```

Or manually edit `proxy.ts` and remove `hr_leave_office` from:
- `/dashboard`
- `/dashboard/leave-management`
- `/dashboard/leave-planning`

## Support

For issues or questions about HR Leave Office role configuration:

1. Review this documentation
2. Check the troubleshooting section
3. Verify role normalization
4. Check console logs for authorization messages
5. Contact your IT Department

---

**Last Updated**: 2025-05-13
**Related Documentation**: HR_LEAVE_OFFICE_ROLE_GUIDE.md
