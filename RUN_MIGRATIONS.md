# How to Run the Leave Management System Migrations

The new leave calculation system requires 4 database migrations to be applied. Follow these steps:

## Option 1: Using Supabase Dashboard (Easy - Recommended)

1. Go to your Supabase project: https://app.supabase.com
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Copy and paste the entire content of **each migration file** in this order:
   - `/scripts/062_outstanding_leave_tracking.sql`
   - `/scripts/063_enhance_leave_policy_catalog.sql`
   - `/scripts/064_extend_leave_plan_requests.sql`
   - `/scripts/065_migrate_leave_data.sql`
5. Click **Run** after pasting each file
6. Wait for "Success" message before moving to the next migration

## Option 2: Using Supabase CLI

If you have the Supabase CLI installed:

```bash
# Navigate to your project
cd /vercel/share/v0-project

# Run migrations in order
supabase db push

# Or manually apply each:
supabase sql /scripts/062_outstanding_leave_tracking.sql
supabase sql /scripts/063_enhance_leave_policy_catalog.sql
supabase sql /scripts/064_extend_leave_plan_requests.sql
supabase sql /scripts/065_migrate_leave_data.sql
```

## Option 3: Direct SQL Execution (If you have pgAdmin or direct DB access)

Connect to your Supabase PostgreSQL database and execute the migration files in order.

## What Each Migration Does

### 062 - Outstanding Leave Tracking
- Creates `outstanding_leave_balances` table
- Tracks annual leave carryover from previous years
- Stores entitlements and used days per user/year
- Includes RLS policies for security

### 063 - Enhance Leave Policy Catalog
- Adds `staff_category` column (junior/senior/manager)
- Adds `calculation_method` column (for future flexibility)
- Adds indexes for performance

### 064 - Extend Leave Plan Requests
- Adds `staff_category` column to link to policy entitlements
- Adds `auto_calculated_end_date` to track system calculations
- Adds `calculation_summary` JSON field to store breakdown

### 065 - Migrate Leave Data
- Copies historical leave data into new outstanding_leave_balances table
- Calculates previous year carryover
- Sets current year entitlements based on policy

## Verify Migrations Were Successful

After running all 4 migrations, check in Supabase:

1. Go to **Table Editor**
2. You should see:
   - `outstanding_leave_balances` (new table)
   - `leave_policy_catalog` (enhanced with new columns)
   - `leave_plan_requests` (enhanced with new columns)

3. Or run this query in SQL Editor:

```sql
-- Check new tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('outstanding_leave_balances', 'leave_policy_catalog', 'leave_plan_requests');

-- Check columns were added
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'outstanding_leave_balances';
```

## If You Get an Error

**Error: "Column already exists"**
- This is safe - migrations use `ALTER TABLE IF NOT EXISTS`
- It means the migration was already applied
- You can safely re-run it

**Error: "Table not found"**
- Make sure you're connected to the right Supabase project
- Check your NEXT_PUBLIC_SUPABASE_URL matches the project

**Error: "Permission denied"**
- Make sure you're using your Supabase admin account
- You may need service role key permissions

## After Migrations

Once migrations are applied:

1. The leave management page should load without errors
2. The "Request Leave" dialog will show auto-calculation
3. You'll see the Outstanding Leave widget
4. HR staff can manage carryover balances

## Troubleshooting

If the leave management page **still shows errors** after migrations:

1. Clear browser cache (Ctrl+Shift+Del)
2. Refresh the page (Ctrl+R or Cmd+R)
3. Check browser console (F12) for specific errors
4. The error message should now be more helpful (from API, not HTML)

## Need Help?

If migrations fail:
1. Screenshot the error
2. Check the specific migration file that failed
3. Try running it directly in SQL Editor to see detailed error
4. Common issues: foreign key conflicts, role/permission issues

---

**Status**: Ready to deploy  
**Estimated Time**: 2-3 minutes to run all 4 migrations  
**Risk Level**: Low (all additive, no data loss)
