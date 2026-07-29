# Debugging: Length of Service Still Shows "Set via Staff Management"

## Problem
After running the migration script, the Loan Administration portal still displays:
```
Length of Service: Set via Staff Management
```

Instead of showing the actual value (e.g., "6 yrs").

## Root Causes (Check in order)

### 1. Migration Script Wasn't Actually Executed
**Check:** Run the diagnostic query to see data population status

```sql
SELECT 
  COUNT(*) as total_staff,
  COUNT(CASE WHEN years_of_service IS NOT NULL THEN 1 END) as with_years_populated
FROM public.user_profiles
WHERE deleted_at IS NULL;
```

**If `with_years_populated` is still 0 or very low:**
- The migration wasn't executed
- Go to Supabase Dashboard → SQL Editor
- Copy the migration SQL from `scripts/072_populate_years_of_service.sql`
- Paste and run it

### 2. Data Source Problem: hire_date is NULL
**Check:** Run this to find staff with NULL hire_date

```sql
SELECT 
  id, first_name, last_name, 
  hire_date, date_of_appointment, years_of_service
FROM public.user_profiles
WHERE years_of_service IS NULL 
  AND hire_date IS NULL
  AND deleted_at IS NULL
LIMIT 20;
```

**If many records have NULL hire_date:**
- The staff data wasn't imported from Staff Management system
- You need to manually populate hire_date or date_of_appointment
- Or sync data from the Staff Management portal

### 3. Frontend Caching Issue
**Fix:** Clear the browser cache or do a hard refresh

- Press `Ctrl+Shift+Delete` (Windows) or `Cmd+Shift+Delete` (Mac)
- Clear "All time" cache
- Refresh the Loan Administration portal

### 4. API Not Returning Updated Data
**Check:** Open browser DevTools and check the API response

1. Open the Loan Administration page
2. Press `F12` to open DevTools → Network tab
3. Filter for `workflow` API calls
4. Click on the request and check the response JSON
5. Look for `years_of_service` and `date_of_appointment` values

**If they're NULL in the API response:**
- The database update didn't persist
- Run the diagnostic query again to verify the database state

## Quick Fix: Run Diagnostic + Migration Script

Copy and run this entire script in Supabase SQL Editor:

```sql
-- This script checks the issue and fixes it automatically

-- 1. DIAGNOSE: Show Bernard Addai's current data
SELECT 
  id, first_name, last_name, hire_date, 
  date_of_appointment, years_of_service
FROM public.user_profiles
WHERE first_name ILIKE 'bernard' AND last_name ILIKE 'addai'
LIMIT 1;

-- 2. POPULATE: Fill in missing dates_of_appointment from hire_date
UPDATE public.user_profiles
SET date_of_appointment = hire_date
WHERE date_of_appointment IS NULL 
  AND hire_date IS NOT NULL;

-- 3. CALCULATE: Calculate years_of_service
UPDATE public.user_profiles
SET years_of_service = FLOOR(
  EXTRACT(EPOCH FROM (NOW() - date_of_appointment::timestamp)) / 
  (365.25 * 24 * 3600)
)
WHERE years_of_service IS NULL
  AND date_of_appointment IS NOT NULL;

-- 4. VERIFY: Check Bernard Addai again
SELECT 
  id, first_name, last_name, hire_date, 
  date_of_appointment, years_of_service
FROM public.user_profiles
WHERE first_name ILIKE 'bernard' AND last_name ILIKE 'addai'
LIMIT 1;

-- 5. STATS: Show population summary
SELECT 
  COUNT(*) as total_staff,
  COUNT(CASE WHEN years_of_service IS NOT NULL THEN 1 END) as with_years,
  ROUND(100.0 * COUNT(CASE WHEN years_of_service IS NOT NULL THEN 1 END) / 
    COUNT(*), 2) as percent_populated
FROM public.user_profiles
WHERE deleted_at IS NULL;
```

## Expected Output After Fix

Bernard Addai's record should show:
```
hire_date: 2019-10-01
date_of_appointment: 2019-10-01
years_of_service: 6
```

And the Loan Admin portal should display:
```
Length of Service: 6 yrs
```

## Still Not Working?

If the issue persists after all these steps:

1. **Check Staff Management System:** Verify that hire_date exists in the original staff record
2. **Verify User ID:** Confirm Bernard Addai's user_id matches between systems
3. **Check for Multiple Records:** Run `SELECT * FROM user_profiles WHERE first_name ILIKE 'bernard'` - there might be duplicate records
4. **Restart Dev Server:** The API might be caching old responses

## Related Files
- Migration script: `scripts/072_populate_years_of_service.sql`
- Verification script: `scripts/verify_years_of_service.sql`
- API endpoint: `app/api/loan/workflow/route.ts` (lines 214-225)
- Frontend display: `app/dashboard/loan-app/page.tsx` (lines 2500-2509)
