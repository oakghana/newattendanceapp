# Admin Purge Guide: Delete All Leave & Loan Transactions

## Overview

This guide provides safe methods to delete all leave and loan transaction data from the database while preserving:
- ✅ User authentication and profiles
- ✅ Attendance records (check-in, check-out, daily logs)
- ✅ All other system tables and configurations
- ✅ Data integrity and app functionality

## Tables That Will Be Deleted

### Leave-Related Tables (16 tables)
```
leave_notifications
leave_archive_log
leave_payment_memos
leave_balance_transactions
leave_plan_stagger_reviews
leave_plan_stagger_requests
leave_plan_reviews
leave_deferment_requests
leave_recall_requests
leave_plan_requests
leave_requests
leave_status
leave_change_proposals
leave_office_work_log
outstanding_leave_balances
regional_leave_reports
```

### Loan-Related Tables (5 tables)
```
loan_request_timeline
loan_applications
loan_requests
loan_hod_linkages
regional_loan_office_locations
```

## Tables That Will NOT Be Affected

### Attendance (Protected)
- `attendance_logs`
- `daily_check_in`
- `check_in_events`
- `checkout_events`
- `daily_attendance_summary`

### Authentication & Users (Protected)
- `auth.users` (Supabase auth)
- `user_profiles`
- `user_departments`
- `user_roles`
- `user_sessions`

### Configuration (Protected)
- `leave_types`
- `loan_types`
- `leave_policies`
- All other system configuration tables

---

## Method 1: Local Script (Recommended for Development)

The safest method with full audit logging and user confirmation.

### Setup

1. **Ensure environment variables are loaded:**
   ```bash
   cd /vercel/share/v0-project
   ```

2. **Make the script executable:**
   ```bash
   chmod +x scripts/purge-leave-loan-transactions.mjs
   ```

### Usage

```bash
node scripts/purge-leave-loan-transactions.mjs
```

### Process

1. Script displays all tables and current record counts
2. Asks for confirmation: `Do you want to proceed? (type "yes" to confirm)`
3. Asks for final confirmation: `Are you absolutely sure? (type "DELETE ALL" to confirm)`
4. Deletes all records from leave and loan tables
5. Logs audit trail to `purge-audit.log`

### Output Example

```
🔒 Leave & Loan Transaction Purge Utility
==========================================

📊 Fetching current record counts...

📈 Records to be deleted:
   leave_notifications: 0
   leave_archive_log: 23
   leave_payment_memos: 156
   ...
   TOTAL RECORDS TO DELETE: 1,245

❓ Do you want to proceed? (type "yes" to confirm): yes
❓ Are you absolutely sure? (type "DELETE ALL" to confirm): DELETE ALL

🗑️  Starting deletion...

📋 Deleting LEAVE tables:
   ✅ Deleted all records from leave_notifications
   ✅ Deleted all records from leave_archive_log
   ...

✅ Purge Complete!
   Tables cleared: 21
   Duration: 2.45s
   Timestamp: 2026-01-15T10:30:45.123Z

📝 Action logged to purge-audit.log
```

---

## Method 2: API Endpoint (For Production)

Use the HTTP API endpoint for remote execution.

### Prerequisites

1. Set `ADMIN_SECRET_KEY` environment variable on server:
   ```bash
   export ADMIN_SECRET_KEY="your-secure-admin-key"
   ```

2. The key should be long and secure (e.g., 32+ characters)

### API Endpoint

**URL:** `POST /api/admin/purge-transactions`

**Authorization:** Bearer token with `ADMIN_SECRET_KEY`

### Request Example

```bash
curl -X POST http://localhost:3000/api/admin/purge-transactions \
  -H "Authorization: Bearer YOUR_ADMIN_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "confirmDeletion": "DELETE_ALL_LEAVE_AND_LOAN_TRANSACTIONS"
  }'
```

### Response

**Success (200):**
```json
{
  "success": true,
  "message": "All leave and loan transactions have been successfully deleted",
  "deletedTables": {
    "leave_notifications": 0,
    "leave_archive_log": 23,
    "leave_payment_memos": 156,
    ...
  },
  "timestamp": "2026-01-15T10:30:45.123Z"
}
```

**Unauthorized (401):**
```json
{
  "error": "Unauthorized - Invalid admin credentials"
}
```

**Unconfirmed (400):**
```json
{
  "error": "Deletion not confirmed",
  "message": "To proceed, you must send confirmDeletion with value: DELETE_ALL_LEAVE_AND_LOAN_TRANSACTIONS"
}
```

### Check API Info

**URL:** `GET /api/admin/purge-transactions`

**Authorization:** Bearer token with `ADMIN_SECRET_KEY`

```bash
curl -H "Authorization: Bearer YOUR_ADMIN_SECRET_KEY" \
  http://localhost:3000/api/admin/purge-transactions
```

Returns information about the endpoint and tables to be deleted.

---

## Safety Features

✅ **Multi-Level Confirmation**
- Requires explicit confirmation text to prevent accidents
- Both script and API require confirmation parameters

✅ **Audit Logging**
- All deletions are logged to `purge-audit.log`
- Includes timestamp, duration, and results
- Can be reviewed for compliance/audit purposes

✅ **Authentication Protection**
- API requires `ADMIN_SECRET_KEY` authorization
- Prevents unauthorized access
- Scripts only run with explicit admin execution

✅ **Read-Only Verification**
- GET endpoint to check what will be deleted without executing
- Review table counts before proceeding
- Verify tables to be affected

✅ **Ordered Deletion**
- Tables deleted in dependency order to prevent foreign key issues
- Each table deletion is independent
- Partial failures don't corrupt data

---

## Verification

### After Deletion

**Verify leave tables are empty:**
```sql
SELECT COUNT(*) FROM leave_requests;
SELECT COUNT(*) FROM leave_status;
SELECT COUNT(*) FROM loan_requests;
-- Should all return 0
```

**Verify attendance is untouched:**
```sql
SELECT COUNT(*) FROM attendance_logs;
SELECT COUNT(*) FROM daily_check_in;
-- Should return pre-deletion counts
```

**Check audit log:**
```bash
cat purge-audit.log
```

---

## Rollback

⚠️ **There is NO automatic rollback.** If you need to restore data:

1. **From Supabase backups:**
   - Go to Supabase Dashboard → Backups
   - Restore from a backup before the purge
   - This requires manual intervention with Supabase

2. **From database backups:**
   - Use your database provider's backup/restore feature
   - Restore the specific tables from pre-purge backup

3. **Prevent future issues:**
   - Always take a backup before running the purge
   - Test in development/staging first
   - Keep audit logs for compliance

---

## Troubleshooting

### Script: "NEXT_PUBLIC_SUPABASE_URL not found"

**Solution:** Ensure environment variables are loaded:
```bash
source .env.local
node scripts/purge-leave-loan-transactions.mjs
```

Or use the `.env.development.local` file which should be auto-loaded.

### API: "401 Unauthorized"

**Solution:** Verify `ADMIN_SECRET_KEY`:
```bash
# Check if set
echo $ADMIN_SECRET_KEY

# Set it
export ADMIN_SECRET_KEY="your-secure-key"

# Use correct value in API request
curl -H "Authorization: Bearer $ADMIN_SECRET_KEY" ...
```

### Partial Deletion

If some tables fail to delete:

1. Check the audit log for error messages
2. Retry the purge (idempotent - safe to run multiple times)
3. Manual cleanup if needed using Supabase client

---

## Compliance & Audit

All purge operations are recorded in `purge-audit.log`:

```json
{
  "timestamp": "2026-01-15T10:30:45.123Z",
  "action": "purge_leave_loan_transactions",
  "tablesCleared": 21,
  "tablesWithIssues": 0,
  "duration": "2.45s",
  "results": {
    "leave_notifications": true,
    "leave_archive_log": true,
    ...
  }
}
```

Use this log for:
- ✅ Audit trails
- ✅ Compliance documentation
- ✅ Incident investigation
- ✅ System maintenance records

---

## Emergency Contact

For data recovery issues:
- Contact Supabase support for backup restoration
- Review system backups with your DevOps team
- Check database logs for error details

---

**Last Updated:** 2026-01-15
**Version:** 1.0
