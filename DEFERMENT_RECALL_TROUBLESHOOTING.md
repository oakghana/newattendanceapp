# Deferment & Recall Feature - Troubleshooting Guide

## Issues Found & Fixed

### Issue 1: Foreign Key Relationship Errors
**Problem**: The API was trying to join `leave_deferment_requests` and `leave_recall_requests` with `leave_plan_requests` using non-existent foreign keys:
```
Searched for a foreign key relationship between 'leave_deferment_requests' and 'leave_plan_requests' 
using the hint 'leave_deferment_requests_leave_plan_request_id_fkey' in the schema 'public', but no matches were found.
```

**Root Cause**: The foreign key names in the API select statements didn't match the actual table relationships in the database.

**Solution**: Removed the `.select()` relationships and now fetch data without the joins. The deferment/recall requests table has the `leave_plan_request_id` directly available without needing to join.

**Fixed Files**:
- `/app/api/leave/my-deferment-recall-requests/route.ts` - Removed all foreign key joins from SELECT statements

### Issue 2: Staff Dropdown Empty for HOD/RM
**Problem**: The Deferments/Recalls dropdowns show "No approved leave available for deferment" even though the HOD/RM is properly assigned to a department and location.

**Root Causes**:
1. **No approved leave exists**: The test data may not have any leave requests with status `"approved"` or `"hr_approved"` for the staff in that HOD's department/location.
2. **Fetch endpoints wrong**: The client-side was calling `/api/leave/deferment?requester_id=...` and `/api/leave/recall?initiated_by=...` which don't exist. These endpoints don't support those parameters.

**Solutions**:
1. **Fixed fetch endpoints**: Updated `fetchMyRecallAndDefermentRequests()` in the client to call the correct `/api/leave/my-deferment-recall-requests` API endpoint that returns all deferments and recalls for the user.
2. **Combined data**: Now combines user's own requests with requests they initiated, displaying them all in My Requests tab.

**Fixed Files**:
- `/app/dashboard/leave-management/leave-management-client.tsx` - Updated fetch function to use correct endpoint
- `/app/api/leave/my-deferment-recall-requests/route.ts` - Fixed filter logic and removed FK joins

### Issue 3: Filtering by Department & Location Works
**Confirmed Working**: The HOD/RM filtering logic is correctly implemented:
- HOD sees only staff in their **department AND location**
- RM sees only staff in their **assigned locations** (from `regional_manager_locations` table)
- HR/Admin sees **all staff**

Example from logs:
```
[v0] DEBUG - HOD with dept+loc, staffIds: 3 dept: 330bc0db-53c0-4783-a1da-f47acf2a0abf loc: 235f9596-3469-4e39-93fe-950c68ab4fbf
```

## What Data is Needed

For the deferment/recall dropdowns to populate, you need:

1. **Staff users** created with:
   - `department_id` set (for HOD filtering)
   - `assigned_location_id` set (for HOD filtering and RM location filtering)

2. **Leave requests** for those staff with status:
   - `"approved"` or `"hr_approved"` (for deferment/recall dropdowns)

3. **Deferment/Recall requests** with:
   - `status` = pending (to show edit buttons)
   - `initiated_by_user_id` set to HOD/RM user ID (to track who initiated it)
   - OR `user_id` set to staff user ID (to track whose leave it is)

## Testing Checklist

- [ ] Create staff users with department_id and assigned_location_id
- [ ] Create leave requests with status "approved" for those staff
- [ ] Create deferment/recall requests with proper user_id and initiated_by_user_id
- [ ] As HOD, verify dropdowns show your department/location staff
- [ ] Verify deferment/recall data appears in My Requests tab
- [ ] Verify Edit/Delete buttons appear for pending requests
- [ ] Verify requests disappear from Edit/Delete once HR processes them

## Database Schema Requirements

Ensure these columns exist and are properly populated:

| Table | Column | Type | Notes |
|-------|--------|------|-------|
| `user_profiles` | `department_id` | UUID | HOD's assigned department |
| `user_profiles` | `assigned_location_id` | UUID | Staff's assigned location |
| `regional_manager_locations` | `regional_manager_id` | UUID | RM's user ID |
| `regional_manager_locations` | `location_id` | UUID | Location ID |
| `leave_deferment_requests` | `user_id` | UUID | Staff whose leave is being deferred |
| `leave_deferment_requests` | `initiated_by_user_id` | UUID | HOD/RM who initiated deferment |
| `leave_recall_requests` | `staff_user_id` | UUID | Staff being recalled |
| `leave_recall_requests` | `initiated_by_user_id` | UUID | HOD/RM who initiated recall |
