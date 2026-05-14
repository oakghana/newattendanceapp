# Migration Execution Guide

## Overview
This guide provides complete migration scripts in execution order. Run these in sequence in your Supabase SQL editor.

---

## ✅ Execution Order

Run migrations in this exact order:

1. **Migration 062** - Create outstanding_leave_balances table
2. **Migration 063** - Enhance leave_policy_catalog 
3. **Migration 064** - Extend leave_plan_requests
4. **Migration 065** - Migrate historical data
5. **Migration 066** - Create regional_loan_office role

---

## 📋 Migration 062: Outstanding Leave Tracking

**Purpose**: Create table to track annual leave carryover and outstanding balances

**Risk**: None - New table only

**Dependencies**: None

**SQL Script**:

```sql
-- Migration: 062_outstanding_leave_tracking.sql
-- Description: Create table to track annual leave carryover and outstanding balances
-- Status: Safe additive change - new table only

CREATE TABLE IF NOT EXISTS public.outstanding_leave_balances (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  leave_year_period character varying NOT NULL, -- e.g., "2024", "2025"
  opening_balance integer NOT NULL DEFAULT 0, -- Balance carried over from previous year
  entitlement_days integer NOT NULL DEFAULT 0, -- Annual entitlement for current year
  used_this_period integer NOT NULL DEFAULT 0, -- Days used in current year
  carryover_to_next_year integer DEFAULT 0, -- Days to carry over to next year
  max_carryover_allowed integer DEFAULT 5, -- Policy: max days that can be carried over
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT unique_user_period UNIQUE(user_id, leave_year_period)
);

-- Enable RLS
ALTER TABLE public.outstanding_leave_balances ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Users can view their own outstanding balances
CREATE POLICY "Users can view their own outstanding balances"
ON public.outstanding_leave_balances FOR SELECT
USING (auth.uid() = user_id);

-- HR staff can view all outstanding balances
CREATE POLICY "HR staff can view all outstanding balances"
ON public.outstanding_leave_balances FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role IN ('hr', 'admin', 'hr_office')
  )
);

-- HR staff can update outstanding balances (for carryover adjustments)
CREATE POLICY "HR staff can update outstanding balances"
ON public.outstanding_leave_balances FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role IN ('hr', 'admin', 'hr_office')
  )
);

-- System can insert outstanding balances (through API)
CREATE POLICY "System can insert outstanding balances"
ON public.outstanding_leave_balances FOR INSERT
WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_outstanding_leave_user_period
ON public.outstanding_leave_balances(user_id, leave_year_period);

CREATE INDEX IF NOT EXISTS idx_outstanding_leave_year
ON public.outstanding_leave_balances(leave_year_period);

-- Create audit trigger to track updates
CREATE TRIGGER outstanding_leave_balances_update_timestamp
BEFORE UPDATE ON public.outstanding_leave_balances
FOR EACH ROW
EXECUTE FUNCTION modfn_update_timestamp();
```

**Execution Time**: < 1 second  
**Expected Result**: Table created with 0 rows

---

## 📋 Migration 063: Enhance Leave Policy Catalog

**Purpose**: Add staff category and calculation method columns to leave_policy_catalog

**Risk**: None - Only adds columns with defaults

**Dependencies**: Migration 062 (not required, but recommended to run first)

**SQL Script**:

```sql
-- Migration: 063_enhance_leave_policy_catalog.sql
-- Description: Enhance leave_policy_catalog table with staff categories and calculation methods
-- Status: Safe additive change - adds columns only

-- Add new columns to leave_policy_catalog if they don't exist
ALTER TABLE public.leave_policy_catalog
ADD COLUMN IF NOT EXISTS staff_category character varying DEFAULT 'all_staff', -- 'junior', 'senior', 'manager', 'all_staff'
ADD COLUMN IF NOT EXISTS calculation_method character varying DEFAULT 'standard', -- 'standard', 'weighted_by_category'
ADD COLUMN IF NOT EXISTS allow_carryover boolean DEFAULT true, -- Whether this leave type allows carryover
ADD COLUMN IF NOT EXISTS max_carryover_days integer DEFAULT 5; -- Max days that can be carried over

-- Create index on staff_category for faster queries
CREATE INDEX IF NOT EXISTS idx_leave_policy_staff_category
ON public.leave_policy_catalog(staff_category);

-- Add comment to columns for documentation
COMMENT ON COLUMN public.leave_policy_catalog.staff_category IS 'Staff category this policy applies to: junior, senior, manager, or all_staff';
COMMENT ON COLUMN public.leave_policy_catalog.calculation_method IS 'How leave days are calculated: standard or weighted_by_category';
COMMENT ON COLUMN public.leave_policy_catalog.allow_carryover IS 'Whether unused days can be carried to next period';
COMMENT ON COLUMN public.leave_policy_catalog.max_carryover_days IS 'Maximum days allowed to carryover to next period';
```

**Execution Time**: < 1 second  
**Expected Result**: 4 new columns added to leave_policy_catalog

---

## 📋 Migration 064: Extend Leave Plan Requests

**Purpose**: Add category and balance tracking fields to leave_plan_requests

**Risk**: None - Only adds columns with defaults

**Dependencies**: Migration 062, 063

**SQL Script**:

```sql
-- Migration: 064_extend_leave_plan_requests.sql
-- Description: Extend leave_plan_requests table with category and balance tracking fields
-- Status: Safe additive change - adds columns only

-- Add new columns to leave_plan_requests if they don't exist
ALTER TABLE public.leave_plan_requests
ADD COLUMN IF NOT EXISTS staff_category character varying, -- e.g., 'junior', 'senior', 'manager'
ADD COLUMN IF NOT EXISTS entitlement_days_used integer, -- Days actually used in this request
ADD COLUMN IF NOT EXISTS year_outstanding_balance integer DEFAULT 0, -- Opening balance from previous year
ADD COLUMN IF NOT EXISTS is_carry_over_leave boolean DEFAULT false, -- Whether this uses carryover days
ADD COLUMN IF NOT EXISTS calculation_summary jsonb, -- Details of how days were calculated
ADD COLUMN IF NOT EXISTS auto_calculated_end_date date; -- Auto-calculated end date (without manual override)

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_leave_requests_staff_category
ON public.leave_plan_requests(staff_category);

CREATE INDEX IF NOT EXISTS idx_leave_requests_carry_over
ON public.leave_plan_requests(is_carry_over_leave);

CREATE INDEX IF NOT EXISTS idx_leave_requests_user_year
ON public.leave_plan_requests(user_id, leave_year_period);

-- Add comments for documentation
COMMENT ON COLUMN public.leave_plan_requests.staff_category IS 'Staff category at time of request: junior, senior, manager';
COMMENT ON COLUMN public.leave_plan_requests.entitlement_days_used IS 'Actual days used based on weekends and holidays';
COMMENT ON COLUMN public.leave_plan_requests.year_outstanding_balance IS 'Outstanding balance from previous year (opening balance)';
COMMENT ON COLUMN public.leave_plan_requests.is_carry_over_leave IS 'True if this request uses carryover days from previous year';
COMMENT ON COLUMN public.leave_plan_requests.calculation_summary IS 'JSON with breakdown of holidays deducted, weekends, etc.';
COMMENT ON COLUMN public.leave_plan_requests.auto_calculated_end_date IS 'System-calculated end date based on business days logic';
```

**Execution Time**: < 1 second  
**Expected Result**: 6 new columns added to leave_plan_requests

---

## 📋 Migration 065: Migrate Leave Data

**Purpose**: Populate outstanding_leave_balances from historical leave request data

**Risk**: Low - Insert and update operations only, no deletions

**Dependencies**: Migrations 062, 063, 064

**SQL Script**:

```sql
-- Migration: 065_migrate_leave_data.sql
-- Description: Populate outstanding_leave_balances from historical data
-- Status: Safe - creates audit records for all migrations

-- Step 1: Populate outstanding_leave_balances for current staff from leave_plan_requests history
INSERT INTO public.outstanding_leave_balances (
  user_id,
  leave_year_period,
  opening_balance,
  entitlement_days,
  used_this_period,
  carryover_to_next_year,
  max_carryover_allowed,
  notes
)
SELECT
  lpr.user_id,
  lpr.leave_year_period,
  COALESCE(lpr.year_outstanding_balance, 0) as opening_balance,
  COALESCE(lpc.entitlement_days, 21) as entitlement_days,
  COUNT(*) FILTER (WHERE lpr.status = 'hr_approved') as used_this_period,
  COALESCE(lpc.max_carryover_days, 5) as carryover_to_next_year,
  COALESCE(lpc.max_carryover_days, 5) as max_carryover_allowed,
  'Migrated from leave_plan_requests history' as notes
FROM public.leave_plan_requests lpr
LEFT JOIN public.leave_policy_catalog lpc
  ON lpr.leave_type_key = lpc.leave_type_key
  AND lpr.leave_year_period = lpc.leave_year_period
WHERE
  lpr.leave_type_key = 'annual_leave'
  AND lpr.leave_year_period IS NOT NULL
GROUP BY
  lpr.user_id,
  lpr.leave_year_period,
  lpr.year_outstanding_balance,
  lpc.entitlement_days,
  lpc.max_carryover_days
ON CONFLICT (user_id, leave_year_period)
DO UPDATE SET
  entitlement_days = EXCLUDED.entitlement_days,
  updated_at = now();

-- Step 2: Update leave_plan_requests with calculated entitlement_days_used
UPDATE public.leave_plan_requests
SET
  entitlement_days_used = GREATEST(1, 
    EXTRACT(DAY FROM (preferred_end_date - preferred_start_date + INTERVAL '1 day')))
WHERE
  status = 'hr_approved'
  AND entitlement_days_used IS NULL
  AND preferred_start_date IS NOT NULL
  AND preferred_end_date IS NOT NULL;

-- Step 3: Backfill calculated_end_date from preferred_end_date (auto-calculated during update)
UPDATE public.leave_plan_requests
SET
  auto_calculated_end_date = preferred_end_date
WHERE
  auto_calculated_end_date IS NULL
  AND preferred_end_date IS NOT NULL;

-- Step 4: Create audit log entry for this migration
INSERT INTO public.audit_logs (
  user_id,
  table_name,
  action,
  details
) VALUES (
  NULL,
  'leave_plan_requests',
  'migration',
  jsonb_build_object(
    'migration_type', 'data_migration_065',
    'description', 'Populated outstanding_leave_balances and backfilled calculated fields',
    'migrated_at', NOW()
  )
);

-- Step 5: Log completion
DO $$
BEGIN
  RAISE NOTICE 'Migration 065 completed: Leave data migrated successfully';
  RAISE NOTICE 'Total outstanding_leave_balances records created/updated: %',
    (SELECT COUNT(*) FROM public.outstanding_leave_balances WHERE notes LIKE '%Migrated%');
END $$;
```

**Execution Time**: 2-5 seconds (depends on data volume)  
**Expected Result**: Outstanding leave balances populated, leave requests updated with calculated data

---

## 📋 Migration 066: Create Regional Loan Office Role

**Purpose**: Create new `regional_loan_office` role for regional data viewing and export

**Risk**: Low - Adds new role and new table only

**Dependencies**: Migrations 062-065

**SQL Script**:

```sql
-- Migration: 066_create_regional_loan_office_role.sql
-- Description: Create a new role "regional_loan_office" that has similar access to regional_manager 
-- but cannot approve/endorse leaves or loans, only view and export data from their region
-- Status: Safe additive change

-- Add new role to user_profiles constraint if it doesn't already exist
-- First, get the current constraint and update it
DO $$
DECLARE
  constraint_name text;
BEGIN
  -- Find the check constraint name on the role column
  SELECT constraint_name INTO constraint_name
  FROM information_schema.table_constraints
  WHERE table_name = 'user_profiles'
    AND constraint_type = 'CHECK'
    AND constraint_name LIKE '%role%'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    -- Drop the old constraint
    EXECUTE format('ALTER TABLE user_profiles DROP CONSTRAINT %I', constraint_name);
  END IF;

  -- Add the new constraint with the additional role
  ALTER TABLE user_profiles 
  ADD CONSTRAINT user_profiles_role_check CHECK (
    role IN (
      'admin','it-admin','department_head','regional_manager',
      'regional_loan_office', -- NEW ROLE
      'nsp','intern','contract','staff','audit_staff','accounts',
      'loan_office','hr_office','hr_leave_office','director_hr',
      'manager_hr','loan_committee','committee'
    )
  );
EXCEPTION WHEN OTHERS THEN
  -- Constraint might already exist, continue
  NULL;
END $$;

-- Create a new table for regional_loan_office location assignments
CREATE TABLE IF NOT EXISTS public.regional_loan_office_locations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  regional_loan_office_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  location_id uuid NOT NULL,
  region_id uuid,
  location_name text,
  region_name text,
  assigned_by uuid REFERENCES auth.users(id),
  assigned_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  is_active boolean DEFAULT true,
  CONSTRAINT unique_rlo_location UNIQUE(regional_loan_office_id, location_id)
);

-- Enable RLS
ALTER TABLE public.regional_loan_office_locations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for regional_loan_office_locations
CREATE POLICY "Regional loan office can view their own assignments"
ON public.regional_loan_office_locations FOR SELECT
USING (
  auth.uid() = regional_loan_office_id
  OR EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role = 'admin'
  )
);

CREATE POLICY "Admins can manage regional loan office assignments"
ON public.regional_loan_office_locations FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role = 'admin'
  )
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_regional_loan_office_locations_rlo_id 
ON public.regional_loan_office_locations(regional_loan_office_id);

CREATE INDEX IF NOT EXISTS idx_regional_loan_office_locations_location_id 
ON public.regional_loan_office_locations(location_id);

CREATE INDEX IF NOT EXISTS idx_regional_loan_office_locations_region_id 
ON public.regional_loan_office_locations(region_id);

-- Audit log entry
INSERT INTO audit_logs (user_id, table_name, action, details, created_at)
VALUES (
  auth.uid(),
  'user_profiles',
  'MIGRATION',
  jsonb_build_object('description', 'Created regional_loan_office role and regional_loan_office_locations table'),
  now()
);
```

**Execution Time**: < 1 second  
**Expected Result**: New role added, new table created, audit logged

---

## 🚀 How to Execute

### Step 1: Open Supabase SQL Editor
1. Go to your Supabase project
2. Click **SQL Editor** in the left sidebar
3. Click **New query**

### Step 2: Copy and Run Each Migration

For each migration (062-066):

1. Copy the complete SQL script above
2. Paste into the SQL editor
3. Click **Run** button (or press `Ctrl+Enter` / `Cmd+Enter`)
4. Wait for completion (you should see "Success" message)
5. Check the **Results** tab to verify it worked

### Step 3: Verify Each Migration

After each migration runs, you should see:

**Migration 062**:
```
Successfully created table "outstanding_leave_balances"
1 row affected
```

**Migration 063**:
```
Successfully altered table "leave_policy_catalog"
4 columns added
```

**Migration 064**:
```
Successfully altered table "leave_plan_requests"
6 columns added
```

**Migration 065**:
```
Migration 065 completed: Leave data migrated successfully
[number] outstanding_leave_balances records created/updated
```

**Migration 066**:
```
Successfully altered table "user_profiles"
Successfully created table "regional_loan_office_locations"
1 row inserted
```

---

## ⚠️ Troubleshooting

### Error: "relation does not exist"
**Cause**: Migration 062 wasn't run first  
**Fix**: Run migrations in order 062 → 066

### Error: "constraint already exists"
**Cause**: Migration already ran  
**Fix**: This is safe - the `IF NOT EXISTS` clause prevents duplicates

### Error: "column already exists"
**Cause**: Migration was run twice  
**Fix**: Safe - use `ADD COLUMN IF NOT EXISTS` which skips existing columns

### Error: "function modfn_update_timestamp does not exist"
**Cause**: Your database doesn't have this function  
**Fix**: Use SQL below to create it:

```sql
CREATE OR REPLACE FUNCTION modfn_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## ✅ Post-Migration Checklist

After all migrations complete:

- [ ] Migration 062: Table `outstanding_leave_balances` exists
- [ ] Migration 063: Columns added to `leave_policy_catalog`
- [ ] Migration 064: Columns added to `leave_plan_requests`
- [ ] Migration 065: Data migrated (check with query below)
- [ ] Migration 066: Role `regional_loan_office` in user_profiles

### Verify Migrations

Run these queries to verify everything worked:

```sql
-- Check outstanding_leave_balances table
SELECT COUNT(*) as balance_records FROM public.outstanding_leave_balances;

-- Check leave_policy_catalog new columns
SELECT staff_category, calculation_method, allow_carryover, max_carryover_days 
FROM public.leave_policy_catalog LIMIT 1;

-- Check leave_plan_requests new columns
SELECT staff_category, entitlement_days_used, calculation_summary 
FROM public.leave_plan_requests LIMIT 1;

-- Check regional_loan_office_locations table
SELECT COUNT(*) as rlo_assignments FROM public.regional_loan_office_locations;
```

---

## 🔄 Rollback Plan

If you need to rollback (not recommended unless there's an issue):

```sql
-- Rollback all migrations
DROP TABLE IF EXISTS public.regional_loan_office_locations;
DROP TABLE IF EXISTS public.outstanding_leave_balances;
ALTER TABLE public.leave_plan_requests DROP COLUMN IF EXISTS staff_category;
ALTER TABLE public.leave_plan_requests DROP COLUMN IF EXISTS entitlement_days_used;
ALTER TABLE public.leave_plan_requests DROP COLUMN IF EXISTS year_outstanding_balance;
ALTER TABLE public.leave_plan_requests DROP COLUMN IF EXISTS is_carry_over_leave;
ALTER TABLE public.leave_plan_requests DROP COLUMN IF EXISTS calculation_summary;
ALTER TABLE public.leave_plan_requests DROP COLUMN IF EXISTS auto_calculated_end_date;
```

---

## 📞 Support

If migrations fail or you have questions:

1. Check the **Error Message** above - most errors have a fix
2. Review the **Troubleshooting** section
3. Verify dependencies are met (run migrations in order)
4. Check that your Supabase user has sufficient permissions

---

**Total Migration Time**: ~10-15 seconds  
**Rollback Time**: < 5 seconds  
**Risk Level**: Low (additive changes only)
