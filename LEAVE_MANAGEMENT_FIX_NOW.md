## URGENT FIX - Leave Management Page Error

**Status**: Page loads with error "We could not load that page"

**Root Cause**: Migration 062 hasn't run successfully yet, so the `outstanding_leave_balances` table doesn't exist.

**Solution**: 2-Step Fix

---

## STEP 1: Disable Auto-Calculation (DONE ✅)

I've already disabled the auto-calculation feature in the leave dialog that was failing. This allows the page to load even if the database isn't fully ready.

---

## STEP 2: Run Migration 062 NOW

**MOST IMPORTANT**: You MUST run migration 062 to create the missing table.

### How to Run:

1. **Open Supabase**: https://app.supabase.com
2. **Select your project**
3. **Click SQL Editor → New Query**
4. **Copy the ENTIRE contents** of: `/scripts/062_outstanding_leave_tracking.sql`
5. **Paste into Supabase SQL Editor**
6. **Click RUN button** (top right)
7. **Wait for "Success" message ✅**

### Expected Result:
- Table `outstanding_leave_balances` is created
- Function `modfn_update_timestamp()` is created
- RLS policies are added
- Indexes are created
- Trigger is created

---

## After Migration 062 Runs Successfully:

1. **Refresh your app** (Cmd+R or Ctrl+R)
2. **Go to Leave Management page**
3. **Page should load WITHOUT errors** ✅
4. **Auto-calculation will still be disabled** (that's normal for now)
5. **Users can manually enter leave dates** (click on end date field to set it)

---

## Migration Files Still Ready to Run:

After 062 succeeds, run these in order if needed:

- [ ] 062 - Outstanding Leave Tracking **(RUN THIS FIRST)**
- [ ] 063 - Enhance Leave Policy Catalog
- [ ] 064 - Extend Leave Plan Requests
- [ ] 065 - Migrate Leave Data
- [ ] 066 - Create Regional Loan Office Role

---

## Verification After 062:

Run this SQL query to confirm migration worked:

```sql
SELECT COUNT(*) as record_count, 'outstanding_leave_balances' as table_name
FROM public.outstanding_leave_balances
UNION ALL
SELECT COUNT(*) as record_count, 'regional_loan_office_locations' as table_name
FROM public.regional_loan_office_locations;
```

**Expected Result**: Both tables should appear (may show 0 records if empty).

---

## If You Still Get Errors After Running Migration 062:

| Error | Solution |
|-------|----------|
| "table already exists" | ✅ OK - Run migration next time anyway |
| "relation does not exist" | ❌ Migration 062 didn't run - Try again |
| "We could not load that page" | ❌ Migration 062 still didn't work - Check browser console for details |
| "RLS policy already exists" | ✅ OK - Migration handles this with DROP IF EXISTS |

---

## Next Steps:

1. ✅ Copy `062_outstanding_leave_tracking.sql` 
2. ✅ Paste into Supabase SQL Editor
3. ✅ Click RUN
4. ✅ Refresh app
5. ✅ Test Leave Management page

**Time needed**: ~5 minutes

**Go do this now!** 🚀
