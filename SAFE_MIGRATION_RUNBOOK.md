# Safe Migration Runbook (Production)

**Goal:** Apply only additive, idempotent schema changes so **auth, login, check-in, check-out, loan, and leave** keep working exactly as they do today.

**Rule:** Prefer one master script. Do **not** run every `.sql` file in the repo.

---

## What you should run

### Recommended (single script)

| Order | File | Purpose |
|------:|------|---------|
| 1 | [`SAFE_MASTER_MIGRATION.sql`](SAFE_MASTER_MIGRATION.sql) | All safe additive changes in one transaction-friendly, idempotent run |

### Optional follow-ups (only if that feature is missing in DB)

| When | File | Notes |
|------|------|--------|
| Leave balances / auto end-date still broken after master | Already covered in master (062–065 logic) | Do not re-run old incomplete role scripts |
| Performance only | Logic from `supabase/migrations/097_performance_indexes.sql` is included in master | Indexes only; no data change |
| Accounts Executive FD review tables missing | `supabase/migrations/096_accounts_executive_fd_review.sql` | **New tables only** — review first; skip if loans already work without it |
| Transport module not deployed yet | `supabase/migrations/100`–`107` | **Optional product feature** — not required for auth/attendance/loan/leave |

---

## What you must NOT run (can break working features)

| File | Why it is unsafe for a healthy production DB |
|------|-----------------------------------------------|
| `supabase/migrations/099_rename_loan_office_roles.sql` | **Updates live user roles** (`loan_office` → `hr_loan_office` / `accounts_loan_office`). Can break loan dashboards and permissions if app still expects `loan_office`. Marked as already applied 2026-08-01 — **do not re-run**. |
| `FINAL_SAFE_DEPLOYMENT_SCRIPT.sql` alone as-is | Drops/recreates `user_profiles_role_check` with a **fixed role list** that may **omit** roles already in production (e.g. transport, `hr_loan_office`, `regional_loan_office`). Risk of constraint failure or blocking role assignment. |
| `supabase/migrations/098_safe_role_and_entitlement_fixes.sql` alone as-is | Same issue: recreates role CHECK with an incomplete hard-coded list. |
| `scripts/066_create_regional_loan_office_role.sql` alone as-is | Does **not** reliably expand an existing CHECK to add `regional_loan_office`; incomplete role list if used to create constraint from scratch. Master script handles role merge safely. |
| Random scripts under `/scripts/` (025–059, etc.) | Many are historical one-offs; re-running can conflict with current schema or duplicate policies. |
| `docs/migrations/*` | Reference / docs copies — not the primary path unless you intentionally need that one feature. |
| Any script with bulk `UPDATE ... role =` without a backup | Can lock users out of loan/leave/admin UIs. |

---

## Safety guarantees of `SAFE_MASTER_MIGRATION.sql`

| Area | Guarantee |
|------|-----------|
| Auth / login | Does **not** modify `auth.*` schema, passwords, sessions, or JWT secrets. Only may **expand** `user_profiles.role` CHECK to include **existing DB roles + new optional roles** (never removes a role value already used). |
| Check-in / check-out | Does **not** alter attendance row data. May add **indexes only** on attendance tables if those tables/columns exist. |
| Leave | Additive columns + optional new balance table. Data migration only **fills NULL** fields / upserts balance rows — does **not** delete leave requests or change statuses. |
| Loan | Does **not** rename roles, does **not** delete loan rows. No loan workflow status changes. |
| Data loss | No `DROP TABLE`, no `TRUNCATE`, no `DROP COLUMN`, no bulk `DELETE` of business data. |
| Idempotent | Safe to run multiple times (`IF NOT EXISTS`, `ON CONFLICT`, guarded blocks). |

---

## How to run (Supabase SQL Editor)

1. **Backup** (Supabase Dashboard → Database → Backups, or `pg_dump` of `public` schema).
2. Open **SQL Editor** → New query.
3. **Run pre-flight** section at the top of `SAFE_MASTER_MIGRATION.sql` (or full file once).
4. Confirm notices / results look normal.
5. If anything errors, **stop** and fix — do not continue with other random scripts.
6. Run **post-flight verification** queries at the bottom of the master script.
7. Smoke-test in the app (same browser session is fine):

   - [ ] Login / logout  
   - [ ] Check-in  
   - [ ] Check-out  
   - [ ] Open leave list + one leave detail  
   - [ ] Open loan list + one loan detail  
   - [ ] Admin/HR page that was working before  

---

## Pre-flight SQL (read-only)

```sql
-- Roles currently in use (must still work after migration)
SELECT role, COUNT(*) FROM public.user_profiles GROUP BY role ORDER BY 1;

-- Core tables present?
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'user_profiles',
    'leave_plan_requests',
    'attendance_records',
    'loan_requests',
    'loan_fd_requests'
  )
ORDER BY 1;
```

---

## Post-flight verification

```sql
-- New optional objects (may already exist)
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'outstanding_leave_balances',
    'regional_loan_office_locations'
  );

-- Role constraint still accepts every role actually used
SELECT up.role, COUNT(*) AS users
FROM public.user_profiles up
GROUP BY up.role
ORDER BY 1;

-- Leave columns exist
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'leave_plan_requests'
  AND column_name IN (
    'entitlement_days',
    'entitlement_days_used',
    'auto_calculated_end_date',
    'annual_leave_days',
    'staff_category'
  )
ORDER BY 1;
```

---

## If a statement fails

| Error | Action |
|-------|--------|
| `already exists` | **OK** — continue / re-run master (idempotent). |
| `column ... does not exist` on attendance index | Master skips missing columns; ignore if notice says skipped. |
| `audit_logs` insert failed | Non-fatal in master — business schema still applied. |
| Role check violation on `UPDATE` | Master does **not** bulk-update roles. Investigate app code, not force 099. |
| Anything about `auth.users` ownership | Stop; contact DBA. Master should not require superuser beyond normal Supabase SQL Editor. |

---

## Summary

1. **Run only** [`SAFE_MASTER_MIGRATION.sql`](SAFE_MASTER_MIGRATION.sql).  
2. **Never run** `099_rename_loan_office_roles.sql` on a working production DB.  
3. **Do not** paste incomplete role CHECK lists from old “safe” scripts.  
4. Smoke-test auth, attendance, leave, loan after run.  
