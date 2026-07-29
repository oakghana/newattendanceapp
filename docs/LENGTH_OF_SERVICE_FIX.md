# Length of Service Fix - Technical Documentation

## Issue
The Loan Administration portal was displaying "Set via Staff Management" placeholder text instead of the actual years of service for staff members.

## Root Cause
The `user_profiles` table in the database was missing three required columns:
1. `date_of_appointment` - Date when staff member was hired/appointed
2. `years_of_service` - Calculated years of service for the staff member  
3. `staff_category` - Staff classification (Junior/Senior) for loan eligibility

The loan workflow API (`/api/loan/workflow`) attempts to fetch these columns, but since they didn't exist, the API returned `null` values, causing the UI to display the fallback text.

## Solution

### Migration Script
Run the migration script at `/scripts/072_populate_years_of_service.sql` to:

1. **Add missing columns to user_profiles table:**
   - `staff_category VARCHAR(50)` - For staff tier classification
   - `date_of_appointment DATE` - Appointment/hire date
   - `years_of_service INTEGER` - Calculated years

2. **Populate data:**
   - Use existing `hire_date` column as source for `date_of_appointment`
   - Calculate `years_of_service` as complete years between appointment and today
   - Formula: `FLOOR(EXTRACT(EPOCH FROM (NOW() - date_of_appointment)) / (365.25 * 24 * 3600))`

3. **Create indexes:**
   - Index on `years_of_service` for faster loan lookups
   - Index on `staff_category` for entitlement calculations

### How It Works

**Before (broken):**
```
User Profile → API fetches years_of_service (NULL) → UI shows "Set via Staff Management"
```

**After (fixed):**
```
User Profile → API fetches years_of_service (6) → UI shows "6 yrs"
```

### UI Display Logic
The loan app display (`/app/dashboard/loan-app/page.tsx` lines 2503-2510) shows:

1. If `yearsOfService` exists → Display value (e.g., "6 yrs")
2. Else if `dateOfAppointment` exists → Calculate and display with date
3. Else → Show "Set via Staff Management"

With this migration, Bernard Addai and all other staff will now see their actual years of service.

## Running the Migration

### Option 1: Via Supabase Dashboard
1. Open Supabase Dashboard
2. Go to SQL Editor
3. Copy and paste contents of `scripts/072_populate_years_of_service.sql`
4. Execute each statement in order

### Option 2: Via SQL CLI
```bash
psql "your-database-connection-string" -f scripts/072_populate_years_of_service.sql
```

### Option 3: Via Application Auto-Migration
If using the application's migration runner, ensure migration 072 is included in the sequence.

## Verification

After running the migration, verify success:

```sql
-- Check a specific user (e.g., Bernard Addai)
SELECT 
  first_name, 
  last_name, 
  date_of_appointment, 
  years_of_service,
  staff_category
FROM user_profiles
WHERE first_name = 'Bernard' AND last_name = 'Addai';
-- Should show: Bernard | Addai | 2019-10-01 | 6 | NULL (or category if set)

-- Check overall statistics
SELECT 
  COUNT(*) as total_staff,
  COUNT(date_of_appointment) as with_appointment_date,
  COUNT(years_of_service) as with_years_calculated
FROM user_profiles;
```

## Related Issues Fixed

This fix also resolves:
- **Category derivation** - Position-based category assignment (e.g., "Assistant Information Technology Officer" = Junior)
- **Staff Management sync** - Years of service now properly synced from Staff Management system via hire_date

## Files Modified

1. `/scripts/072_populate_years_of_service.sql` - Migration script
2. `/app/api/loan/workflow/route.ts` - Already correctly fetches the data
3. `/app/dashboard/loan-app/page.tsx` - Already correctly displays the data

No code changes needed - just database migration!
