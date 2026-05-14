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
