# HR Leave Office Role Configuration Guide

## Overview

The **HR Leave Office** role is designed for HR personnel who need full leave administration capabilities EXCEPT policy configuration and holiday management.

## Role Access Matrix

| Feature | Access | Notes |
|---------|--------|-------|
| **Leave Management** | ✅ Full | Process and approve leave requests |
| **Leave Planning** | ✅ Full | Plan leave schedules and assignments |
| **Leave Analytics** | ✅ Full | View analytics and reporting |
| **Balance & Calendar** | ✅ Full | View leave balances and team calendar |
| **Holiday Management** | ❌ Restricted | Cannot manage holiday calendars |
| **Leave Policy** | ❌ Restricted | Cannot configure leave policies |

## Capabilities

### What HR Leave Office Users CAN Do

1. **Process Leave Requests**
   - Approve/reject staff leave applications
   - View leave request details
   - Add comments and notes
   - Manage leave approvals workflow

2. **Leave Planning & Scheduling**
   - View leave plans
   - Schedule leave periods
   - Manage deferment and recalls
   - Track leave balances

3. **Reporting & Analytics**
   - View leave analytics dashboards
   - Generate leave reports
   - Monitor leave trends
   - Track departmental leave usage

4. **Calendar & Insights**
   - View team calendar
   - Check leave balances
   - See leave availability

### What HR Leave Office Users CANNOT Do

1. **Holiday Management**
   - Cannot add/edit/delete holidays
   - Cannot configure holiday calendars
   - Cannot set holiday entitlements

2. **Leave Policy Configuration**
   - Cannot configure leave types
   - Cannot set entitlement days
   - Cannot modify leave policy rules
   - Cannot configure leave policy catalog

## Technical Implementation

### Role Key
```
hr_leave_office
```

### Configuration

The role restrictions are implemented in:
```
app/dashboard/leave-management/leave-management-module-client.tsx
```

**Role Arrays:**
```typescript
// HR Leave Office is included in analytics
const HR_ANALYTICS_ROLES = ["leave_admin", "admin", "hr_office", "hr_leave_office", "hr"]

// HR Leave Office is NOT included in holiday management
const HOLIDAY_MANAGEMENT_ROLES = ["admin", "leave_admin", "director_hr", "manager_hr"]

// HR Leave Office is NOT included in leave policy management
const LEAVE_POLICY_ROLES = ["admin", "leave_admin", "director_hr"]
```

### Tab Visibility

When an HR Leave Office user logs in:
- ✅ Leave Management tab - VISIBLE
- ✅ Leave & HR Leave tab - VISIBLE
- ✅ Leave Analytics tab - VISIBLE
- ✅ Balance & Calendar tab - VISIBLE
- ❌ Holiday Management tab - HIDDEN
- ❌ Leave Policy tab - HIDDEN

## Setup Instructions

### 1. Add User to HR Leave Office Role

In Staff Management module:
1. Go to Staff Management → Staff Directory
2. Click "Add Staff"
3. Fill in user details
4. Select role: **"HR Leave Office"**
5. Click "Add Staff"

### 2. Assign Department/Location

1. Once user is created, edit their profile
2. Assign primary department/location
3. Set reporting structure if needed
4. Save changes

### 3. Verify Access

1. User logs in with their credentials
2. Navigate to Leave Management
3. Verify they can see:
   - Leave Management tab ✅
   - Leave Planning tab ✅
   - Leave Analytics tab ✅
   - Balance & Calendar tab ✅
4. Verify they CANNOT see:
   - Holiday Management tab ❌
   - Leave Policy tab ❌

## Troubleshooting

### User Cannot See Analytics Tab

**Issue:** HR Leave Office user cannot see Leave Analytics tab

**Solution:**
1. Verify user role is exactly "HR Leave Office"
2. Check role normalization (hyphens converted to underscores)
3. Clear browser cache (Ctrl+Shift+R)
4. Restart dev server: `npm run dev`

### User Can See Holiday Management Tab

**Issue:** HR Leave Office user can see Holiday Management tab (should be hidden)

**Solution:**
1. Check that `HOLIDAY_MANAGEMENT_ROLES` does NOT include `hr_leave_office`
2. Verify file: `app/dashboard/leave-management/leave-management-module-client.tsx`
3. Clear cache and restart server

### Tab Not Visible

**Issue:** Expected tab is not showing for HR Leave Office user

**Likely Cause:** Role normalization issue

**Debug:**
```typescript
// Add temporary console.log
console.log("[v0] User role:", userRole)
console.log("[v0] Normalized role:", normalizeRole(userRole))
console.log("[v0] Is analytics role:", isHrAnalyticsRole(userRole))
console.log("[v0] Can manage holidays:", canManageHolidays(userRole))
```

## Role Comparison

| Role | Leave Mgmt | Planning | Analytics | Calendar | Holidays | Leave Policy |
|------|-----------|----------|-----------|----------|----------|--------------|
| Admin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Leave Admin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| HR Leave Office | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Director HR | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Manager HR | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| Staff | ✅ | ⚠️ | ❌ | ⚠️ | ❌ | ❌ |

Legend:
- ✅ Full Access
- ⚠️ Limited Access (own department only)
- ❌ No Access

## Contact & Support

For issues with HR Leave Office role access or permissions:

1. Check this documentation
2. Review the troubleshooting section
3. Contact your IT Department
4. File a support ticket with:
   - User name
   - Role assigned
   - Expected vs actual behavior
   - Browser and device info
