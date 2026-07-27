# Quick Start: Delete All Leave & Loan Transactions

## ⚡ 30-Second Setup

### Option A: Local Script (Easiest)

```bash
# 1. Navigate to project
cd /vercel/share/v0-project

# 2. Run the purge script
node scripts/purge-leave-loan-transactions.mjs

# 3. Follow the prompts:
#    - Confirm you want to proceed: type "yes"
#    - Confirm you're absolutely sure: type "DELETE ALL"

# Done! Check purge-audit.log for results
```

### Option B: API Endpoint (Remote)

```bash
# 1. Set admin key on server
export ADMIN_SECRET_KEY="your-secure-key-here"

# 2. Make API request
curl -X POST https://your-app.com/api/admin/purge-transactions \
  -H "Authorization: Bearer your-secure-key-here" \
  -H "Content-Type: application/json" \
  -d '{
    "confirmDeletion": "DELETE_ALL_LEAVE_AND_LOAN_TRANSACTIONS"
  }'

# Done! Check response for results
```

---

## What Gets Deleted

✅ **Deleted:**
- 16 leave tables (requests, status, memos, etc.)
- 5 loan tables (requests, applications, linkages, etc.)

❌ **NOT Deleted:**
- User authentication & profiles
- Attendance records & logs
- System configuration
- All other data

---

## Audit Trail

Both methods create logs:
- **Local:** Check `purge-audit.log` in project root
- **API:** Check server logs for timestamp

---

## Verification

### Confirm deletion worked
```bash
# Local access to DB:
SELECT COUNT(*) FROM leave_requests;       -- Should be 0
SELECT COUNT(*) FROM loan_requests;        -- Should be 0
SELECT COUNT(*) FROM attendance_logs;      -- Should be UNCHANGED
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Command not found: node" | Install Node.js or use full path |
| "SUPABASE_URL not found" | Ensure `.env.local` or `.env.development.local` is loaded |
| "401 Unauthorized" | Check ADMIN_SECRET_KEY value matches |
| "Partial deletion" | Re-run script (idempotent) |

---

## For More Details

See full documentation: `docs/ADMIN_PURGE_GUIDE.md`

---

**Warning:** This action cannot be undone without database restoration. Take a backup first!
