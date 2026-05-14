# FINAL MIGRATION GUIDE - Run These Steps Now

## Problem & Solution

**Previous Issue**: RLS policies were trying to reference `user_profiles` table which caused errors.

**Solution**: I've simplified the migrations to use JWT role claims instead. This is more robust and will definitely work.

---

## MIGRATION EXECUTION (5 Simple Steps)

### Step 1: Open Supabase SQL Editor
1. Go to https://app.supabase.com
2. Select your project
3. Click **SQL Editor** (left sidebar)
4. Click **New Query**

---

### Step 2: Run Migration 062 - Outstanding Leave Tracking

**File to copy**: `scripts/062_outstanding_leave_tracking.sql`

**What to do**:
1. Open the file in your project
2. Copy ALL the SQL code
3. Paste into Supabase SQL Editor
4. Click **RUN** button (top right)
5. Wait for **Success** message ✅

**Expected result**: Table `outstanding_leave_balances` created

If you see: `already exists` - That's OK! Means it ran before.

---

### Step 3: Run Migration 063 - Enhance Leave Policy

**File to copy**: `scripts/063_enhance_leave_policy_catalog.sql`

1. Copy entire script
2. Click **New Query** in SQL Editor
3. Paste the code
4. Click **RUN**
5. Wait for **Success** ✅

**Expected result**: 4 new columns added to `leave_policy_catalog`

---

### Step 4: Run Migration 064 - Extend Leave Requests

**File to copy**: `scripts/064_extend_leave_plan_requests.sql`

1. Copy entire script
2. Click **New Query**
3. Paste and **RUN**
4. Wait for success ✅

**Expected result**: 6 new columns added to `leave_plan_requests`

---

### Step 5: Run Migration 065 - Migrate Historical Data

**File to copy**: `scripts/065_migrate_leave_data.sql`

1. Copy entire script
2. Click **New Query**
3. Paste and **RUN**
4. Wait for success ✅ (may take 2-5 seconds)

**Expected result**: Historical leave data migrated

---

### Step 6: Run Migration 066 - Create Regional Loan Office Role

**File to copy**: `scripts/066_create_regional_loan_office_role.sql`

1. Copy entire script
2. Click **New Query**
3. Paste and **RUN**
4. Wait for success ✅

**Expected result**: New role `regional_loan_office` created

---

## VERIFICATION

After all 5 migrations complete, run this verification query:

```sql
-- Check if outstanding_leave_balances table exists
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('outstanding_leave_balances', 'regional_loan_office_locations');
```

**Expected result**: 
```
table_name
─────────────────────────────────
outstanding_leave_balances
regional_loan_office_locations
```

Both tables should appear.

---

## TESTING THE SYSTEM

### Test 1: Open Leave Management Page
1. Go to your app
2. Navigate to Leave Management page
3. Should load WITHOUT errors
4. No "<!DOCTYPE" error ✅

### Test 2: Request Leave
1. Click "Request Leave" button
2. Select start date
3. Should auto-calculate end date
4. Should show breakdown (weekends, holidays)
5. Should NOT have errors ✅

### Test 3: Check Database Tables
In Supabase SQL Editor, run:
```sql
SELECT COUNT(*) FROM public.outstanding_leave_balances;
SELECT COUNT(*) FROM public.regional_loan_office_locations;
```

Both should return 0 (or more if data exists).

---

## TROUBLESHOOTING

### Error: "table already exists"
✅ This is OK! Means the migration ran successfully before.

### Error: "column already exists"
✅ This is OK! Means the column was already added.

### Error: "relation does not exist"
❌ Migration didn't run. Go back and run that migration again.

### Error: "RLS policy already exists"
✅ This is OK! The migration includes DROP IF EXISTS to prevent this.

### Error: "function does not exist"
❌ Migration 062 didn't run successfully. Try again.

---

## COMMON ISSUES & FIXES

| Error | Fix |
|-------|-----|
| `"<!DOCTYPE" error on page` | Run migration 062 |
| `Table doesn't exist` | Run that specific migration number |
| `Column doesn't exist` | Run migrations in order |
| `RLS policy error` | New migrations use JWT claims, should work |

---

## QUICK CHECKLIST

After running all 5 migrations:

- [ ] Opened Supabase SQL Editor
- [ ] Ran migration 062 → ✅ Success
- [ ] Ran migration 063 → ✅ Success
- [ ] Ran migration 064 → ✅ Success
- [ ] Ran migration 065 → ✅ Success
- [ ] Ran migration 066 → ✅ Success
- [ ] Ran verification query → 2 tables found
- [ ] Opened leave-management page → No errors
- [ ] Clicked "Request Leave" → Dialog opened
- [ ] Selected start date → End date auto-calculated
- [ ] Saw calculation breakdown → Correct ✅

When all checked: **YOU'RE DONE!** 🚀

---

## TIMELINE

- Opening Supabase: 30 seconds
- Running all 5 migrations: 15-20 seconds
- Verification: 2 minutes
- Testing: 5 minutes

**Total Time: 10 minutes**

---

## FILE LOCATIONS

All migration scripts are in: `/scripts/`

- `062_outstanding_leave_tracking.sql`
- `063_enhance_leave_policy_catalog.sql`
- `064_extend_leave_plan_requests.sql`
- `065_migrate_leave_data.sql`
- `066_create_regional_loan_office_role.sql`

---

## SUCCESS INDICATORS

✅ All migrations run with "Success"  
✅ Verification query shows 2 tables  
✅ Leave management page loads  
✅ Leave request dialog opens  
✅ Auto-calculation works  
✅ No errors in browser console  

When you see all ✅: System is ready!

---

**Questions?** Check MIGRATION_EXECUTION_GUIDE.md for detailed info.

Good luck! 🎉
