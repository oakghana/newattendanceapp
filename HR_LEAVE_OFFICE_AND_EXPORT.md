# HR Leave Office Role & HOD Annual Leave Export

## Overview
This document covers two key features:
1. **HR Leave Office Role** - Basic leave approval without admin capabilities
2. **HOD Annual Leave Export** - Excel export for departmental leave data

---

## Part 1: HR Leave Office Role

### Role Definition
- **Database Value**: `hr_leave_office`
- **Display Name**: HR Leave Office
- **Visibility**: Only admins can assign
- **Location**: Required

### Capabilities
HR Leave Office users CAN:
- ✅ View all leave requests in their queue
- ✅ Approve leave requests
- ✅ Reject leave requests with notes
- ✅ Access Leave Management dashboard
- ✅ Basic leave request management

HR Leave Office users CANNOT:
- ❌ Access Settings & Linkages tab
- ❌ Declare/manage holidays
- ❌ Update leave days configuration
- ❌ View/edit HR templates
- ❌ Access analytics dashboard
- ❌ Assign roles to staff
- ❌ Access staff management menu

### Key Differences

| Feature | HR Leave Office | HR-Leave-Office-Admin |
|---------|-----------------|----------------------|
| Approve Leaves | ✅ | ✅ |
| Reject Leaves | ✅ | ✅ |
| Settings & Linkages | ❌ | ✅ |
| Holiday Declaration | ❌ | ✅ |
| Leave Days Update | ❌ | ✅ |
| Templates | ❌ | ✅ |
| Analytics | ❌ | ✅ |
| Staff Management | ❌ | ❌ |

### Workflow
1. Staff submits annual leave request
2. HOD reviews (basic approval/rejection only)
3. HR Leave Office user reviews and approves/rejects
4. If approved, forwarded to HR-Leave-Office-Admin for final deductions
5. Payment memo generated

### How to Assign

1. **Admin** logs in
2. Navigate to **Settings → Administration → Staff Management**
3. Click **Add Staff** or **Edit** existing staff
4. Select **Role: "HR Leave Office"**
5. Assign location (required)
6. Click **"Add Staff"** or **"Update Staff"**

### Testing the Role

After assignment, the user can:
```
1. Log in and navigate to /dashboard/leave-management
2. See leave requests in their queue
3. Approve/Reject with notes
4. NO admin settings visible (no Settings/Holidays/Templates tabs)
5. Cannot access /dashboard/staff
```

---

## Part 2: HOD Annual Leave Export to Excel

### Feature Overview
HOD and Regional Manager users can now download all their staff's annual leave requests as an Excel file for:
- Data import into payroll systems
- Offline modifications
- Archival records
- Bulk analysis

### Who Can Export
- ✅ Department Head (HOD)
- ✅ Regional Manager
- ❌ HR Leave Office (cannot export)
- ❌ Staff (cannot export)

### How to Export

1. **HOD/Regional Manager** logs in
2. Navigate to **Dashboard → Leave Management**
3. Scroll to **"Export Annual Leave Requests"** section
4. Click **"Export to Excel"** button
5. Excel file downloads automatically with format:
   ```
   Annual_Leave_Requests_[YEAR]_[DATE].xlsx
   ```

### Excel File Structure

**Columns:**
- Staff Name
- Staff Number
- Leave Type
- Start Date
- End Date
- Requested Days
- Status
- Reason
- Submitted Date

**Formatting:**
- Header row: Dark blue with white text
- Approved requests: Green background
- Rejected requests: Red background
- Pending requests: Yellow background
- Summary row at bottom with total count
- Auto-sized columns for readability

### Excel Import for Modifications

**To modify and re-import:**

1. Download Excel file
2. Open in Excel/Google Sheets
3. Modify data as needed:
   - Update "Requested Days" if needed
   - Add/update "Reason" field
   - Modify "Status" if required
   - Add notes in any column
4. Save file
5. Re-import data through admin interface (future feature)

### Data Filtering

The export automatically filters by:
- Leave type: Annual leave only
- Leave year: Current leave year (Nov-Oct cycle)
- Staff: Only staff under HOD's department/region
- Status: All statuses included (pending, approved, rejected)

### API Endpoints

**Export Request**
```
POST /api/leave/export/hod-annual-leave
Body: {
  leaveYear: "2026/2027",  // Optional - defaults to current year
  staffIds: ["id1", "id2"]  // Optional - specific staff only
}
Response: Excel file (.xlsx)
```

**Data Fetch**
```
POST /api/admin/supabase-context
Body: {
  action: "fetch-hod-leave-requests",
  userRole: "department_head",
  userId: "user-id",
  staffIds: [],
  leaveYear: "2026/2027"
}
Response: {
  requests: [{
    id, staff_name, staff_number, 
    leave_type_key, preferred_start_date, 
    preferred_end_date, requested_days, 
    status, reason, created_at
  }],
  success: true
}
```

### Files Modified

**Backend:**
- `/app/api/leave/export/hod-annual-leave.ts` - Main export endpoint
- `/app/api/admin/supabase-context.ts` - Data fetching
- `/package.json` - Added exceljs v4.4.0

**Frontend:**
- `/app/dashboard/leave-management/leave-management-client.tsx`
  - Added export button UI
  - Added `handleExportLeaveRequests()` function
  - Added `isExporting` and `exportMessage` states
  - Added Download icon import

- `/components/admin/staff-management.tsx`
  - Added `hr_leave_office` option in dropdowns

- `/app/dashboard/leave-management/page.tsx`
  - Added `hr_leave_office` to canReviewLeave

### Dependencies
- **exceljs** (v4.4.0) - Excel workbook creation and styling

### Error Handling

**Common Errors:**

1. **"Unauthorized"**
   - Only HOD/Regional Manager can export
   - Check user role assignment

2. **"Export failed"**
   - Check leave data integrity
   - Verify Supabase connection
   - Check browser console for details

3. **File download fails**
   - Check browser download settings
   - Allow popups for the domain
   - Try different browser

### Testing Checklist

- [ ] HOD can see "Export Annual Leave Requests" button
- [ ] Regional Manager can see export button
- [ ] HR Leave Office user does NOT see export button
- [ ] Export button works and downloads file
- [ ] Excel file has correct headers
- [ ] Data is sorted and formatted correctly
- [ ] Status colors are applied correctly
- [ ] Summary row shows total count
- [ ] File can be opened in Excel/Google Sheets
- [ ] All staff records from department are included
- [ ] No data from other departments included

### Related Documentation
- `/ROLE_BASED_ACCESS_CONTROL.md` - Permission structure
- `/HR_LEAVE_OFFICE_ADMIN_ROLE.md` - Admin role details
- `/ANNUAL_LEAVE_VALIDATION_AND_CALCULATIONS.md` - Leave workflow

---

## Future Enhancements

Potential improvements:
1. Re-import functionality to update leave data in bulk
2. Custom field selection for export
3. Multiple year export
4. Scheduled automated exports
5. Email delivery of exports
6. Integration with payroll systems
