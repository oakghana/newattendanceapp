# Profile Fields Not Populating in Loan Processing Hub

## Problem

User profile fields in the QCC Loan Processing Hub show "Not set" or "Not assigned":
- Corporate Email: Not set
- Staff Number: Not set
- Station / Department: Not assigned
- Rank / Position: Not set
- Assigned Location: Not assigned
- Assigned District: Not assigned
- Linked HOD: Not yet assigned
- Location Address: Not set

Only "Category: Junior" is populated.

## Root Cause

The workflow API correctly queries the database for these fields, but they're returning NULL/empty because:

1. **User profile incomplete in database** - The user_profiles table record lacks these values
2. **Foreign key relationships not linked** - Fields like department_id and assigned_location_id are NULL
3. **Profile never updated after initial creation** - Default profile record has minimal data

## Diagnostic Steps

### Step 1: Check What Data Actually Exists in Database

Run this SQL in Supabase SQL Editor:

```sql
SELECT 
  id, email, first_name, last_name, employee_id, position, 
  role, department_id, assigned_location_id, hire_date, 
  date_of_appointment, years_of_service, is_active
FROM user_profiles
WHERE email = 'ACTUAL_USER_EMAIL_HERE'
LIMIT 1;
```

**Replace `ACTUAL_USER_EMAIL_HERE`** with the user's email (e.g., `itm@gmail.com`)

**Expected result** should show:
- ✓ NULL values = fields not populated in database (this is the issue)
- ✓ Values exist = database has data but API not returning it correctly

### Step 2: Check Field Population Across All Users

Run this query to see how many users have each field populated:

```sql
SELECT 
  'Total active users' AS field_name, COUNT(*) AS count
FROM user_profiles WHERE is_active = true
UNION ALL
SELECT 'Users with email', COUNT(*) FROM user_profiles 
  WHERE email IS NOT NULL AND is_active = true
UNION ALL
SELECT 'Users with position', COUNT(*) FROM user_profiles 
  WHERE position IS NOT NULL AND is_active = true
UNION ALL
SELECT 'Users with department_id', COUNT(*) FROM user_profiles 
  WHERE department_id IS NOT NULL AND is_active = true
UNION ALL
SELECT 'Users with assigned_location_id', COUNT(*) FROM user_profiles 
  WHERE assigned_location_id IS NOT NULL AND is_active = true;
```

If counts are:
- **Total: 50, Position: 5** → Most users missing position data
- **Total: 50, Department: 3** → Most users not linked to departments
- **Total: 50, Location: 2** → Most users not assigned locations

This confirms **bulk data population is missing**, not just individual records.

## Solution: Populate User Profile Fields

### Option A: Update Individual User (One Person)

```sql
UPDATE user_profiles
SET 
  position = 'THE IT MANAGER',
  email = 'itm@gmail.com',
  department_id = (SELECT id FROM departments WHERE name = 'IT' LIMIT 1),
  assigned_location_id = (SELECT id FROM geofence_locations WHERE name = 'HEAD OFFICE SWANZY ARCADE' LIMIT 1),
  date_of_appointment = '2020-01-15',
  hire_date = '2020-01-15'
WHERE email = 'itm@gmail.com'
RETURNING id, email, position, department_id, assigned_location_id;
```

### Option B: Bulk Import User Data

If you have a CSV or spreadsheet with user data:

1. Go to Supabase dashboard
2. Click on `user_profiles` table
3. Click "Import data"
4. Upload CSV with columns: email, position, employee_id, department_id, assigned_location_id, hire_date

### Option C: Manual Update via Admin UI (If exists)

1. Go to Admin Settings
2. Find User Management / Profiles
3. Edit each user's profile to fill in missing fields
4. Save

## Fields Reference

When populating user profiles, use these values:

### Positions (typical examples)
- THE IT MANAGER
- MANAGING DIRECTOR
- HEAD OF HUMAN RESOURCES
- ACCOUNTS MANAGER
- ADMINISTRATIVE OFFICER

### Departments (query available ones)
```sql
SELECT id, name, code FROM departments WHERE is_active = true;
```

### Locations (query available ones)
```sql
SELECT id, name, address FROM geofence_locations WHERE is_active = true;
```

### Dates
- `hire_date`: When employee was hired (DATE format: YYYY-MM-DD)
- `date_of_appointment`: When employee started current role (DATE format: YYYY-MM-DD)

## Testing the Fix

After updating profile data:

1. **Clear browser cache** (Ctrl+Shift+Delete → All time)
2. **Log out** completely
3. **Close browser tab**
4. **Log back in**
5. **Go to Loan Administration**
6. **Check QCC Loan Processing Hub header**
7. **Profile fields should now show actual data instead of "Not set"**

## Why This Happens

- When users are first created in the system (via auth signup or admin import), a minimal profile record is generated
- This record has: `id`, `email`, `role`, `created_at`
- Missing: `position`, `employee_id`, `department_id`, `assigned_location_id`, `hire_date`, etc.
- Until these fields are populated, they display as "Not set" throughout the system

## Prevention

Ensure new users are created with complete profile data:
- Admin creates user → must fill in all required fields immediately
- Or: Import users from HR system → ensures all data is populated at creation
- Or: Run data sync script → pulls data from HR database on schedule

## Quick Check

If users can see loans in dropdown but profile shows "Not set", the issue is **ONLY** missing profile data, not a technical bug. The system is working correctly - just waiting for profile data to be populated.

The fix is administrative (data entry), not technical.
