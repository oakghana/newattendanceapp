# Purge System - Usage Examples

## Example 1: Local Script with Full Output

```bash
$ cd /vercel/share/v0-project
$ node scripts/purge-leave-loan-transactions.mjs

🔒 Leave & Loan Transaction Purge Utility
==========================================

⚠️  WARNING: This will DELETE ALL leave and loan transactions.
   This action CANNOT be undone.
   Only auth, user profiles, and attendance data will remain.

📊 Fetching current record counts...

📈 Records to be deleted:
   leave_notifications: 0
   leave_archive_log: 23
   leave_payment_memos: 156
   leave_balance_transactions: 312
   leave_plan_stagger_reviews: 45
   leave_plan_stagger_requests: 89
   leave_plan_reviews: 234
   leave_deferment_requests: 12
   leave_recall_requests: 8
   leave_plan_requests: 567
   leave_requests: 1,234
   leave_status: 1,234
   leave_change_proposals: 45
   leave_office_work_log: 89
   outstanding_leave_balances: 234
   regional_leave_reports: 67
   loan_request_timeline: 123
   loan_applications: 89
   loan_requests: 456
   loan_hod_linkages: 34
   regional_loan_office_locations: 12

   TOTAL RECORDS TO DELETE: 5,934

❓ Do you want to proceed? (type "yes" to confirm): yes
❓ Are you absolutely sure? (type "DELETE ALL" to confirm): DELETE ALL

🗑️  Starting deletion...

📋 Deleting LEAVE tables:
   ✅ Deleted all records from leave_notifications
   ✅ Deleted all records from leave_archive_log
   ✅ Deleted all records from leave_payment_memos
   ✅ Deleted all records from leave_balance_transactions
   ✅ Deleted all records from leave_plan_stagger_reviews
   ✅ Deleted all records from leave_plan_stagger_requests
   ✅ Deleted all records from leave_plan_reviews
   ✅ Deleted all records from leave_deferment_requests
   ✅ Deleted all records from leave_recall_requests
   ✅ Deleted all records from leave_plan_requests
   ✅ Deleted all records from leave_requests
   ✅ Deleted all records from leave_status
   ✅ Deleted all records from leave_change_proposals
   ✅ Deleted all records from leave_office_work_log
   ✅ Deleted all records from outstanding_leave_balances
   ✅ Deleted all records from regional_leave_reports

📋 Deleting LOAN tables:
   ✅ Deleted all records from loan_request_timeline
   ✅ Deleted all records from loan_applications
   ✅ Deleted all records from loan_requests
   ✅ Deleted all records from loan_hod_linkages
   ✅ Deleted all records from regional_loan_office_locations

==========================================
✅ Purge Complete!
   Tables cleared: 21
   Tables with issues: 0
   Duration: 3.24s
   Timestamp: 2026-01-15T10:30:45.123Z

📝 Action logged to purge-audit.log
```

---

## Example 2: API Request via cURL

### GET - Check endpoint availability

```bash
$ curl -H "Authorization: Bearer YOUR_ADMIN_SECRET_KEY" \
  http://localhost:3000/api/admin/purge-transactions

{
  "message": "Admin purge endpoint is active. Use POST to delete all leave and loan transactions.",
  "tablesToDelete": {
    "leave": [
      "leave_notifications",
      "leave_archive_log",
      ...
    ],
    "loan": [
      "loan_request_timeline",
      ...
    ]
  },
  "usageInstructions": {
    "method": "POST",
    "headers": {
      "Authorization": "Bearer YOUR_ADMIN_SECRET_KEY",
      "Content-Type": "application/json"
    },
    "body": {
      "confirmDeletion": "DELETE_ALL_LEAVE_AND_LOAN_TRANSACTIONS"
    }
  }
}
```

### POST - Execute purge

```bash
$ curl -X POST http://localhost:3000/api/admin/purge-transactions \
  -H "Authorization: Bearer YOUR_ADMIN_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "confirmDeletion": "DELETE_ALL_LEAVE_AND_LOAN_TRANSACTIONS"
  }'

{
  "success": true,
  "message": "All leave and loan transactions have been successfully deleted",
  "deletedTables": {
    "leave_notifications": 1,
    "leave_archive_log": 1,
    "leave_payment_memos": 1,
    "leave_balance_transactions": 1,
    "leave_plan_stagger_reviews": 1,
    "leave_plan_stagger_requests": 1,
    "leave_plan_reviews": 1,
    "leave_deferment_requests": 1,
    "leave_recall_requests": 1,
    "leave_plan_requests": 1,
    "leave_requests": 1,
    "leave_status": 1,
    "leave_change_proposals": 1,
    "leave_office_work_log": 1,
    "outstanding_leave_balances": 1,
    "regional_leave_reports": 1,
    "loan_request_timeline": 1,
    "loan_applications": 1,
    "loan_requests": 1,
    "loan_hod_linkages": 1,
    "regional_loan_office_locations": 1
  },
  "timestamp": "2026-01-15T10:30:45.123Z"
}
```

---

## Example 3: API with Invalid Confirmation

```bash
$ curl -X POST http://localhost:3000/api/admin/purge-transactions \
  -H "Authorization: Bearer YOUR_ADMIN_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "confirmDeletion": "YES"
  }'

{
  "error": "Deletion not confirmed",
  "message": "To proceed, you must send confirmDeletion with value: DELETE_ALL_LEAVE_AND_LOAN_TRANSACTIONS"
}
```

---

## Example 4: API with Invalid Authorization

```bash
$ curl -X POST http://localhost:3000/api/admin/purge-transactions \
  -H "Authorization: Bearer WRONG_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "confirmDeletion": "DELETE_ALL_LEAVE_AND_LOAN_TRANSACTIONS"
  }'

{
  "error": "Unauthorized - Invalid admin credentials"
}
```

---

## Example 5: Audit Log Contents

After successful purge, check `purge-audit.log`:

```bash
$ cat purge-audit.log

{
  "timestamp": "2026-01-15T10:30:45.123Z",
  "action": "purge_leave_loan_transactions",
  "tablesCleared": 21,
  "tablesWithIssues": 0,
  "duration": "3.24s",
  "results": {
    "leave_notifications": true,
    "leave_archive_log": true,
    "leave_payment_memos": true,
    "leave_balance_transactions": true,
    "leave_plan_stagger_reviews": true,
    "leave_plan_stagger_requests": true,
    "leave_plan_reviews": true,
    "leave_deferment_requests": true,
    "leave_recall_requests": true,
    "leave_plan_requests": true,
    "leave_requests": true,
    "leave_status": true,
    "leave_change_proposals": true,
    "leave_office_work_log": true,
    "outstanding_leave_balances": true,
    "regional_leave_reports": true,
    "loan_request_timeline": true,
    "loan_applications": true,
    "loan_requests": true,
    "loan_hod_linkages": true,
    "regional_loan_office_locations": true
  }
}
```

---

## Example 6: Verification Commands

### Verify leave data is deleted

```bash
# Using psql or your database client
SELECT COUNT(*) FROM leave_requests;        -- Returns: 0
SELECT COUNT(*) FROM leave_status;           -- Returns: 0
SELECT COUNT(*) FROM loan_requests;          -- Returns: 0
```

### Verify attendance is unaffected

```bash
SELECT COUNT(*) FROM attendance_logs;        -- Returns: [original count]
SELECT COUNT(*) FROM daily_check_in;         -- Returns: [original count]
```

### Check audit log for details

```bash
tail -n 20 purge-audit.log
cat purge-audit.log | jq '.duration'         # Extract duration
cat purge-audit.log | jq '.tablesCleared'    # Extract count
```

---

## Example 7: Integration with Backup System

### Before purge - Create backup

```bash
# Create a timestamped backup
pg_dump -h localhost -U postgres qcc_attendance > \
  backup_before_purge_$(date +%Y%m%d_%H%M%S).sql

# Or using Supabase CLI
supabase db pull
```

### If rollback needed

```bash
# Restore from backup
psql -h localhost -U postgres qcc_attendance < \
  backup_before_purge_20260115_103045.sql

# Or using Supabase
supabase db push
```

---

## Example 8: Scheduling Automated Purges

### Using cron for regular purges (Linux/macOS)

```bash
# Edit crontab
crontab -e

# Add: Every first day of month at 2 AM
0 2 1 * * cd /vercel/share/v0-project && \
  node scripts/purge-leave-loan-transactions.mjs < <(echo -e "yes\nDELETE ALL")
```

### Using scheduled workflow (GitHub Actions)

```yaml
name: Monthly Leave & Loan Purge

on:
  schedule:
    - cron: '0 2 1 * *'  # First day of month at 2 AM UTC

jobs:
  purge:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Purge Leave & Loan Transactions
        run: |
          curl -X POST ${{ secrets.API_URL }}/api/admin/purge-transactions \
            -H "Authorization: Bearer ${{ secrets.ADMIN_SECRET_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{"confirmDeletion": "DELETE_ALL_LEAVE_AND_LOAN_TRANSACTIONS"}'
```

---

## Troubleshooting Examples

### Error: "supabaseUrl is required"

```bash
# Solution: Load environment variables first
source .env.local
node scripts/purge-leave-loan-transactions.mjs

# Or set them explicitly
export NEXT_PUBLIC_SUPABASE_URL="https://xxx.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-key"
node scripts/purge-leave-loan-transactions.mjs
```

### Error: "Unauthorized"

```bash
# Solution: Check ADMIN_SECRET_KEY
echo $ADMIN_SECRET_KEY              # Should show your key

# Set it if empty
export ADMIN_SECRET_KEY="your-secure-key-32-chars-min"

# Use in request
curl -H "Authorization: Bearer $ADMIN_SECRET_KEY" ...
```

### Partial deletion (some tables failed)

```bash
# Solution: Re-run purge (it's idempotent)
node scripts/purge-leave-loan-transactions.mjs

# Check audit log for details
tail purge-audit.log

# Or retry with API
curl -X POST ... -d '{"confirmDeletion": "DELETE_ALL_LEAVE_AND_LOAN_TRANSACTIONS"}'
```

---

## Best Practices

1. **Always take a backup first:**
   ```bash
   pg_dump -h localhost -U postgres qcc_attendance > backup.sql
   ```

2. **Verify in development first:**
   ```bash
   # Test on dev database before production
   ```

3. **Schedule during low-traffic hours:**
   ```bash
   # Run purges at 2 AM when no one uses the system
   ```

4. **Keep audit logs:**
   ```bash
   # Archive purge-audit.log for compliance
   cp purge-audit.log archive/purge-audit-$(date +%Y%m%d).log
   ```

5. **Monitor the operation:**
   ```bash
   # Watch it run in real-time
   tail -f purge-audit.log
   ```
