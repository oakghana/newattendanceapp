# Deferment & Recall Data Setup Notes

## Issue: Deferments Tab Appears Inactive

The Deferments tab was disabled when no `approvedRequests` existed. This has been fixed.

## Data Requirements

### For Staff Users:
- Need approved leave requests in `leave_plan_requests` table
- Status must be "approved" or "hr_approved"
- These will show in:
  - My Requests (Recalls tab) - to recall their own leave
  - My Deferments (under My Requests) - to defer their own leave

### For HOD/RM/HR Users:
- Need approved staff leave requests from their department/location
- The app fetches these via `initialApprovedStaffRequests` from `page.tsx`
- Filtering:
  - **HOD**: Staff in their department AND location
  - **RM**: Staff in their assigned locations (from `regional_manager_locations`)
  - **HR**: All staff
- These populate the dropdowns in:
  - Recalls tab - to recall staff leave
  - Deferments tab - to defer staff leave

## To Test Deferment/Recall Functionality:

### Option 1: Create Test Leave Data
```sql
-- Insert approved leave requests for staff in your dept/location
INSERT INTO leave_plan_requests (
  user_id,
  leave_type_key,
  preferred_start_date,
  preferred_end_date,
  status,
  reason
) VALUES (
  '<staff_user_id>',
  'annual',
  '2026-06-01',
  '2026-06-15',
  'approved',
  'Test leave for deferment'
);
```

### Option 2: Use Existing Leave Data
- Create an annual leave application as staff
- Wait for HOD/HR to approve it
- Then use the Recalls/Deferments tabs to manage it

## Database Tables Used:
- `leave_plan_requests` - Main leave requests (staff's own and approved ones)
- `leave_deferment_requests` - Deferment request tracking
- `leave_recall_requests` - Recall request tracking
- `user_profiles` - Staff details (name, rank, location)
- `geofence_locations` - Location names
- `regional_manager_locations` - RM-to-location mappings (for RM filtering)

## API Endpoints:
- `POST /api/leave/deferment` - Create deferment request
- `PATCH /api/leave/deferment` - Edit pending deferment
- `DELETE /api/leave/deferment` - Delete pending deferment
- `GET /api/leave/deferment` - Fetch deferments
- `POST /api/leave/recall` - Create recall request
- `PATCH /api/leave/recall` - Edit pending recall
- `DELETE /api/leave/recall` - Delete pending recall
- `GET /api/leave/recall` - Fetch recalls
- `GET /api/leave/my-deferment-recall-requests` - Fetch user's requests
