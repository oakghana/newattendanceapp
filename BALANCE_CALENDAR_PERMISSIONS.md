# Balance & Calendar View - Permission Structure

## Overview
The "Balance & Calendar" tab in Leave Management implements role-based access control to protect staff privacy while enabling HR management oversight.

---

## Permission Structure

### Regular Staff (All Other Roles)
**Calendar View:** Personal only - See only your own approved leave calendar

**What You See:**
- Your approved leave requests only
- Your own leave dates
- Your balance information
- No visibility to other staff leave

**Roles Affected:**
- staff
- intern
- contract
- loan_office (without admin roles)
- Any role not in the admin list below

---

### HR Management Roles (Full Access)
**Calendar View:** All staff approved leave calendars visible

**Full Visibility Roles:**
1. **admin** - System administrator
2. **leave_admin** - Leave administration specialist
3. **hr_leave_office** - HR leave office staff
4. **hr_office** - HR office general staff
5. **director_hr** - HR director
6. **manager_hr** - HR manager
7. **hr** - HR department staff
8. **regional_manager** - Regional manager
9. **department_head** - Department head

**What They See:**
- All staff approved leave calendars
- Team leave balance overview
- Leave calendar for all departments/locations
- Conflict detection across organization
- Aggregate leave patterns

---

## Use Cases

### Staff Member
```
Login as: Staff (any non-admin role)
Go to: Leave Management → Balance & Calendar
See: Your calendar only
```
✓ View personal leave balance
✓ See your approved leaves on calendar
✓ Plan your leave schedule
✗ Cannot see other staff leaves
✗ Cannot see team calendars

### HR Leave Office Admin
```
Login as: leave_admin (or hr_leave_office, hr_office, etc.)
Go to: Leave Management → Balance & Calendar
See: ALL staff calendars
```
✓ View all staff leave calendars
✓ See organization-wide leave patterns
✓ Identify conflicts
✓ Plan staffing needs
✓ Analyze leave distribution

### Department Head
```
Login as: department_head
Go to: Leave Management → Balance & Calendar
See: ALL staff approved leaves
```
✓ View team members' leaves
✓ Monitor department coverage
✓ Identify leave patterns
✓ Plan workload distribution

---

## API Implementation

### Endpoint
`GET /api/leave/team-calendar?month=2026-05`

### Role-Based Query Filter

**Regular Staff:**
```sql
SELECT * FROM leave_plan_requests
WHERE user_id = CURRENT_USER_ID
AND status = 'hr_approved'
AND is_archived = false
```

**Admin Roles:**
```sql
SELECT * FROM leave_plan_requests
WHERE status = 'hr_approved'
AND is_archived = false
```

### Role Detection
```typescript
const ADMIN_ROLES = [
  "admin",
  "leave_admin",
  "hr_leave_office",
  "hr_office",
  "director_hr",
  "manager_hr",
  "hr",
  "regional_manager",
  "department_head",
]

const hasFullAccess = ADMIN_ROLES.includes(normalizedRole)
```

---

## Data Returned

### Calendar Entry
```typescript
{
  id: string
  userId: string
  name: string
  employeeId: string
  department: string
  leaveType: string
  startDate: string
  endDate: string
}
```

### For Regular Staff
Only entries where `userId` matches logged-in user

### For Admin Roles
All HR-approved leave entries for all users

---

## Privacy & Security

### Protected Data
- Staff personal leave details are hidden from other staff
- Only approved leaves visible (pending/rejected are private)
- Archived leaves excluded
- Employee names and departments visible only to authorized HR roles

### Visibility Rules
- **Staff cannot see:** Other staff leaves, other team member details
- **Admin can see:** All staff leaves, all departments, organization-wide patterns
- **Department heads can see:** Department member leaves only (via admin access)

---

## Testing Role-Based Access

### Test Case 1: Staff Member
1. Login as regular staff (role: "staff")
2. Navigate to Balance & Calendar
3. Calendar should show only user's leaves
4. No other staff visible

### Test Case 2: Leave Admin
1. Login as leave_admin user
2. Navigate to Balance & Calendar
3. Calendar shows all organization leaves
4. Can see staff names and departments

### Test Case 3: HR Officer
1. Login as hr_office user
2. Navigate to Balance & Calendar
3. Full visibility to all leaves
4. See team patterns

---

## Edge Cases

### User Without Approved Leaves
- Regular staff: Calendar appears empty
- Admin roles: See other staff leaves (if any)

### Month with No Data
- Returns empty entries array
- Month/year range still provided
- Calendar renders but shows no leaves

### Archived Leaves
- Automatically excluded from both views
- Doesn't affect visible calendar

### Multiple Leaves Same Period
- All displayed on calendar
- Stacked if overlapping
- Color-coded by leave type

---

## Related Permissions

| Feature | Staff | Leave Admin | HR Manager | Director HR |
|---------|-------|---|---|---|
| View personal calendar | ✅ | ✅ | ✅ | ✅ |
| View all calendars | ❌ | ✅ | ✅ | ✅ |
| See staff names | Personal only | All | All | All |
| See departments | Personal only | All | All | All |
| Balance widget | Personal | Personal | Personal | Personal |
| Analytics dashboard | ❌ | ✅ | ✅ | ✅ |

---

## Configuration

The admin role list in `/app/api/leave/team-calendar/route.ts`:

```typescript
const ADMIN_ROLES = [
  "admin",                  // System admin
  "leave_admin",           // Leave admin (new)
  "hr_leave_office",       // HR leave office
  "hr_office",             // HR office
  "director_hr",           // HR director
  "manager_hr",            // HR manager
  "hr",                    // HR generic
  "regional_manager",      // Regional manager
  "department_head",       // Department head
]
```

To add more roles, update this array in the API route and rebuild.

---

## Performance Notes

- Regular staff queries are faster (filtered by user_id)
- Admin queries retrieve all approved leaves (may be slower with large datasets)
- Calendar pagination: Monthly view to manage data load
- Consider indexing on: status, is_archived, user_id

---

## Troubleshooting

### "I can't see all staff leaves"
- Verify your role is in ADMIN_ROLES list
- Check if leaves are marked as "hr_approved"
- Verify leaves are not archived

### "I see only my leave"
- You have a non-admin role
- To see all leaves, request admin role assignment

### "No leaves showing"
- Check if any leaves are approved for this month
- Verify leaves are not archived
- Check date range of leaves vs. current month

---

## Related Documentation

- `/ROLE_BASED_ACCESS_CONTROL.md` - Full permission matrix
- `/LEAVE_ADMIN_ROLE_GUIDE.md` - Leave admin capabilities
- `/STAFF_UPDATE_ERROR_FIX.md` - Role assignment troubleshooting

