# Migration Scripts - Summary

## All Migration Files Are Ready

Your migration scripts are located in `/scripts/` folder:

```
scripts/
├── 062_outstanding_leave_tracking.sql          ← RUN FIRST
├── 063_enhance_leave_policy_catalog.sql        ← RUN SECOND
├── 064_extend_leave_plan_requests.sql          ← RUN THIRD
├── 065_migrate_leave_data.sql                  ← RUN FOURTH
└── 066_create_regional_loan_office_role.sql    ← RUN FIFTH
```

---

## ✅ Migration Execution Order

### 1️⃣ FIRST: Migration 062
**File**: `/scripts/062_outstanding_leave_tracking.sql`  
**Purpose**: Create outstanding_leave_balances table  
**Size**: 2.6 KB  
**Time**: <1 second  
**Risk**: None (new table)

```sql
-- Creates:
-- - Table: outstanding_leave_balances
-- - RLS Policies (4)
-- - Indexes (2)
-- - Trigger (1)
```

---

### 2️⃣ SECOND: Migration 063
**File**: `/scripts/063_enhance_leave_policy_catalog.sql`  
**Purpose**: Add columns to leave_policy_catalog  
**Size**: 1.5 KB  
**Time**: <1 second  
**Risk**: None (adds columns only)

```sql
-- Adds 4 columns:
-- - staff_category
-- - calculation_method
-- - allow_carryover
-- - max_carryover_days
```

---

### 3️⃣ THIRD: Migration 064
**File**: `/scripts/064_extend_leave_plan_requests.sql`  
**Purpose**: Add columns to leave_plan_requests  
**Size**: 2.1 KB  
**Time**: <1 second  
**Risk**: None (adds columns only)

```sql
-- Adds 6 columns:
-- - staff_category
-- - entitlement_days_used
-- - year_outstanding_balance
-- - is_carry_over_leave
-- - calculation_summary
-- - auto_calculated_end_date
```

---

### 4️⃣ FOURTH: Migration 065
**File**: `/scripts/065_migrate_leave_data.sql`  
**Purpose**: Migrate historical data  
**Size**: 2.7 KB  
**Time**: 2-5 seconds  
**Risk**: Low (insert/update only)

```sql
-- Does:
-- - Populates outstanding_leave_balances from leave_plan_requests
-- - Updates entitlement_days_used
-- - Backfills auto_calculated_end_date
-- - Creates audit log
```

---

### 5️⃣ FIFTH: Migration 066
**File**: `/scripts/066_create_regional_loan_office_role.sql`  
**Purpose**: Create regional_loan_office role  
**Size**: 3.5 KB  
**Time**: <1 second  
**Risk**: Low (new role + table)

```sql
-- Creates:
-- - Role: regional_loan_office
-- - Table: regional_loan_office_locations
-- - RLS Policies (2)
-- - Indexes (3)
```

---

## 🎯 How to Run Migrations

### Via Supabase Dashboard

1. Open **Supabase** → Your Project
2. Click **SQL Editor** → **New Query**
3. Copy entire migration script from `/scripts/06X_*.sql`
4. Paste into editor
5. Click **Run** (Ctrl/Cmd + Enter)
6. Check **Results** tab - should show "Success"
7. Repeat for next migration

### Via Terminal (Using Supabase CLI)

```bash
# Login to Supabase
supabase login

# Link to your project
supabase link

# Run migrations in order
supabase db push scripts/062_outstanding_leave_tracking.sql
supabase db push scripts/063_enhance_leave_policy_catalog.sql
supabase db push scripts/064_extend_leave_plan_requests.sql
supabase db push scripts/065_migrate_leave_data.sql
supabase db push scripts/066_create_regional_loan_office_role.sql
```

---

## ✅ Verify Migrations Worked

After running all 5 migrations, run these queries in SQL Editor:

```sql
-- Check table created
SELECT * FROM information_schema.tables 
WHERE table_name IN ('outstanding_leave_balances', 'regional_loan_office_locations');

-- Check columns added to leave_policy_catalog
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'leave_policy_catalog' 
AND column_name IN ('staff_category', 'calculation_method', 'allow_carryover', 'max_carryover_days');

-- Check columns added to leave_plan_requests
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'leave_plan_requests' 
AND column_name IN ('staff_category', 'entitlement_days_used', 'year_outstanding_balance', 
                    'is_carry_over_leave', 'calculation_summary', 'auto_calculated_end_date');

-- Check data migrated
SELECT COUNT(*) as balance_records FROM outstanding_leave_balances;

-- Check RLS policies
SELECT policy_name FROM pg_policies 
WHERE tablename IN ('outstanding_leave_balances', 'regional_loan_office_locations');
```

---

## 📊 Expected Results After All Migrations

| Migration | Table/Column | Type | Count |
|-----------|-------------|------|-------|
| 062 | outstanding_leave_balances | New Table | 1 |
| 062 | RLS Policies | New | 4 |
| 062 | Indexes | New | 2 |
| 063 | leave_policy_catalog columns | New | 4 |
| 064 | leave_plan_requests columns | New | 6 |
| 065 | outstanding_leave_balances rows | Data | Variable |
| 066 | regional_loan_office_locations | New Table | 1 |
| 066 | RLS Policies | New | 2 |
| 066 | Indexes | New | 3 |

---

## ⏱️ Total Time Required

- **Sequential Execution**: ~10-15 seconds
- **Per Migration**: <1 second each (except 065: 2-5 seconds)
- **Setup Time**: 2-3 minutes (copying/pasting scripts)
- **Total**: 5-10 minutes

---

## 🚨 If Something Goes Wrong

### Error: "relation does not exist"
Run migrations in order: 062 → 063 → 064 → 065 → 066

### Error: "column already exists"
Safe - migration already ran. You can run it again (uses `IF NOT EXISTS`)

### Error: "constraint already exists"
Safe - just a warning. Migration still succeeds.

### Need to Rollback?
```sql
-- Remove all changes
DROP TABLE IF EXISTS regional_loan_office_locations;
DROP TABLE IF EXISTS outstanding_leave_balances;
ALTER TABLE leave_plan_requests DROP COLUMN IF EXISTS staff_category, 
  entitlement_days_used, year_outstanding_balance, is_carry_over_leave, 
  calculation_summary, auto_calculated_end_date;
```

---

## 📖 Documentation

For detailed info, see these files:

- **MIGRATION_EXECUTION_GUIDE.md** - Complete step-by-step guide
- **RUN_MIGRATIONS.md** - Alternative execution methods
- **START_HERE.md** - Overall project setup
- **DEPLOYMENT_CHECKLIST.md** - Testing checklist

---

## 🔑 Key Points

✅ Run in exact order: 062 → 063 → 064 → 065 → 066  
✅ All migrations are safe (additive only)  
✅ Can be rolled back easily if needed  
✅ RLS policies automatically restrict access  
✅ Audit logs created for all changes  
✅ Performance indexes created for new tables  

**Status**: Ready to execute ✅  
**Risk Level**: Low  
**Estimated Time**: 5-10 minutes
