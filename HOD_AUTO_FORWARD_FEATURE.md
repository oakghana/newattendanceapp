# HOD Auto-Forward Feature Documentation

## Overview
This feature automatically forwards leave and loan requests to HR office when HODs fail to endorse them within 2 days (48 hours).

## Purpose
- Prevents requests from getting stuck in the "pending_hod" stage indefinitely
- Ensures timely processing through the workflow
- Reduces manual intervention when HODs don't review requests promptly

## How It Works

### Loan Requests
- **Initial Status**: `pending_hod` (awaiting HOD review)
- **Trigger**: 48 hours after submission with no HOD action
- **Auto-Forward Status**: Moves to `loan_office_pending`
- **Field Updated**: `hod_auto_advanced_at` timestamp + `hod_auto_advanced_reason`

### Leave Requests
- **Initial Status**: `pending_hod_review` (awaiting HOD review)
- **Trigger**: 48 hours after submission with no HOD action
- **Auto-Forward Status**: Moves to `hr_office_forwarded`
- **Field Updated**: `hod_auto_advanced_at` timestamp + `hod_auto_advanced_reason`

## Setup Instructions

### 1. Database Migration
Apply the migration file to add the necessary columns:
```bash
# The script will add:
# - hod_auto_advanced_at (timestamp with timezone)
# - hod_auto_advanced_reason (text)
# - Indexes for query performance

# Located in: /scripts/055_hod_auto_forward.sql
```

### 2. Cron Job Setup
The cron job is configured at: `/app/api/cron/hod-auto-forward/route.ts`

To set up automatic execution, configure your hosting platform:

**For Vercel:**
1. Add to `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/hod-auto-forward",
      "schedule": "0 */6 * * *"
    }
  ]
}
```

The schedule runs every 6 hours (adjust as needed):
- `0 */6 * * *` = Every 6 hours
- `0 0 * * *` = Daily at midnight (UTC)
- `*/30 * * * *` = Every 30 minutes

**Environment Variable Required:**
Set `CRON_SECRET` environment variable for security.

### 3. Testing the Cron Job
Run a manual test:
```bash
# From your terminal or API client
curl -X POST http://localhost:3000/api/cron/hod-auto-forward \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

# Or without auth in development:
curl -X POST http://localhost:3000/api/cron/hod-auto-forward
```

Expected response:
```json
{
  "success": true,
  "message": "Auto-forwarded X loan requests and Y leave requests",
  "loansUpdated": 0,
  "leavesUpdated": 0,
  "timestamp": "2026-05-12T10:30:00.000Z"
}
```

## Database Schema Changes

### Columns Added to `loan_requests`:
- `hod_auto_advanced_at` (timestamptz) - When the auto-forward occurred
- `hod_auto_advanced_reason` (text) - Reason for auto-forward

### Columns Added to `leave_plan_requests`:
- `hod_auto_advanced_at` (timestamptz) - When the auto-forward occurred
- `hod_auto_advanced_reason` (text) - Reason for auto-forward

### Indexes Created:
- `idx_leave_plan_requests_hod_pending` - Optimizes pending leave queries
- `idx_loan_requests_hod_pending` - Optimizes pending loan queries

## Behavior Details

### What Triggers Auto-Forward?
A request is auto-forwarded if:
1. Status is `pending_hod` (loans) or `pending_hod_review` (leaves)
2. `submitted_at` timestamp is more than 48 hours ago
3. `hod_auto_advanced_at` is NULL (not already auto-forwarded)

### What Data is Updated?
When auto-forwarded:
- Status changes to the next stage in workflow
- `hod_auto_advanced_at` is set to current timestamp
- `hod_auto_advanced_reason` is set to system message

### Safety Mechanisms
- Requests are only auto-forwarded ONCE (tracked by `hod_auto_advanced_at` being NULL)
- Original request data is preserved
- Auto-forward action is logged for audit trail
- Can be queried to track auto-forwarded requests

## Monitoring & Logging

### View Auto-Forwarded Requests
```sql
-- Loan requests auto-forwarded
SELECT 
  id, 
  request_number, 
  status, 
  hod_auto_advanced_at, 
  hod_auto_advanced_reason 
FROM loan_requests 
WHERE hod_auto_advanced_at IS NOT NULL 
ORDER BY hod_auto_advanced_at DESC;

-- Leave requests auto-forwarded
SELECT 
  id, 
  status, 
  hod_auto_advanced_at, 
  hod_auto_advanced_reason 
FROM leave_plan_requests 
WHERE hod_auto_advanced_at IS NOT NULL 
ORDER BY hod_auto_advanced_at DESC;
```

### Check Cron Job Logs
Monitor API logs at `/api/cron/hod-auto-forward` for execution details.

## Customization

### Change Auto-Forward Delay
Edit `/app/api/cron/hod-auto-forward/route.ts`:
```typescript
// Line 24: Change 48 to desired hours
const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
// For 3 days: - 72 * 60 * 60 * 1000
// For 1 day: - 24 * 60 * 60 * 1000
```

### Change Auto-Forward Target Status
Modify the status values in the cron job based on your workflow requirements.

## Troubleshooting

**Q: Requests aren't being auto-forwarded**
- Check that the cron job is scheduled and running
- Verify `CRON_SECRET` is set correctly
- Check database indexes are created
- Review API logs for errors

**Q: Same request gets forwarded multiple times**
- This shouldn't happen due to the NULL check on `hod_auto_advanced_at`
- If it does, verify the migration was applied

**Q: How do I disable this feature?**
- Comment out the cron schedule in `vercel.json`
- Or set it to run very infrequently

## Related Files
- `/app/api/cron/hod-auto-forward/route.ts` - Main cron job implementation
- `/scripts/055_hod_auto_forward.sql` - Database schema changes
- `/scripts/054_loan_inactivity_governance.sql` - Original loan columns
