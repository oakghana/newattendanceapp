# Fleet Migration Runbook

## Single script to run (recommended)

| File | Purpose |
|------|---------|
| [SAFE_FLEET_MIGRATION.sql](SAFE_FLEET_MIGRATION.sql) | Full fleet + nonregional transport + shift tables, **safe role merge** |

**Do not** paste the raw `100` / `101` / `106` role CHECK blocks alone — they use **incomplete** role lists and can break loan/leave roles.

---

## Source migrations (reference only)

| # | File | What it does |
|---|------|----------------|
| 100 | [supabase/migrations/100_add_transport_roles.sql](supabase/migrations/100_add_transport_roles.sql) | Adds `driver`, `transport_manager` (unsafe incomplete CHECK) |
| 101 | [supabase/migrations/101_nonregional_transport_requisitions.sql](supabase/migrations/101_nonregional_transport_requisitions.sql) | Non-regional requisitions table |
| 102 | [supabase/migrations/102_transport_hr_executive_signing.sql](supabase/migrations/102_transport_hr_executive_signing.sql) | HR exec signer cols on `transport_requests` |
| 103 | [supabase/migrations/103_transport_role_signatures.sql](supabase/migrations/103_transport_role_signatures.sql) | Regional HR / HOD / TM signatures |
| 104 | [supabase/migrations/104_nonregional_department_head_signature.sql](supabase/migrations/104_nonregional_department_head_signature.sql) | HOD signer on nonregional |
| **105** | [supabase/migrations/105_vehicle_inventory_and_shift_scheduling.sql](supabase/migrations/105_vehicle_inventory_and_shift_scheduling.sql) | **Core fleet:** `transport_vehicles`, bookings, shifts |
| 106 | [supabase/migrations/106_regional_chief_driver_dispatch.sql](supabase/migrations/106_regional_chief_driver_dispatch.sql) | `chief_driver`, dispatch cols, fleet RLS |
| 107 | [supabase/migrations/107_nonregional_requester_hod_approval.sql](supabase/migrations/107_nonregional_requester_hod_approval.sql) | Requester + HOD dual sign |

Helper (optional): [scripts/apply-transport-migrations.mjs](scripts/apply-transport-migrations.mjs) applies **105 → 106 → 107** only via `POSTGRES_URL_NON_POOLING`.

---

## How to run

1. Backup DB.
2. Supabase → SQL Editor → paste entire [SAFE_FLEET_MIGRATION.sql](SAFE_FLEET_MIGRATION.sql) → Run.
3. Confirm verification `SELECT`s list `transport_vehicles` and related tables.
4. Smoke-test: login, check-in/out, leave, loan, then fleet inventory UI.

---

## Objects created

- `transport_vehicles`
- `transport_vehicle_bookings`
- `nonregional_transport_requisitions` (+ HOD/MD columns)
- `shift_patterns`, `shift_assignments`, `shift_swap_requests`
- Columns on `transport_requests` **if that table already exists**
- `user_profiles.hod_id`
- Roles allowed: `driver`, `chief_driver`, `transport_manager`, … **without removing existing roles**

---

## Safety vs auth / attendance / loan / leave

| Area | Effect |
|------|--------|
| Auth | No password/session changes; role CHECK only **expanded** |
| Attendance | Untouched |
| Loan / leave | Untouched data; roles preserved via merge |
| Fleet | New tables + RLS only |
