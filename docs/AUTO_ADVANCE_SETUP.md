# Auto-Advance Workflow System Setup Guide

## Overview
This system automatically advances non-annual leave requests and loan requests through their approval workflows after 2 days of waiting at each stage.

## Workflows

### Leave Requests (Non-Annual Only)
- **Trigger**: Request pending at HOD/Regional Manager review for 2+ days
- **Action**: Auto-advance to HR Leave Office
- **Approval**: Set as "auto_approved_after_2_days"
- **Notes**: Annual leave requests are NOT auto-advanced (they can remain with HOD for up to 2 weeks)

### Loan Requests (All Types)
- **Stage 1**: HOD Review → Auto-advance to Loan Office after 2 days
- **Stage 2**: Loan Office Review → Auto-advance to Accounts after 2 days
- **Stage 3**: Accounts Review → Auto-advance to Committee after 2 days
- **Result**: Request reaches Committee for final decision

## API Endpoints

### Manual Execution
You can manually trigger auto-advancement at any time:

```bash
# Auto-advance non-annual leave requests
curl -X POST https://your-app.vercel.app/api/leave/auto-advance

# Auto-advance loan requests
curl -X POST https://your-app.vercel.app/api/loan/auto-advance

# Run both (with cron security)
curl -X POST https://your-app.vercel.app/api/cron/auto-advance \
  -H "Authorization: Bearer your-cron-secret"
```

## Setup Cron Job

### Option 1: Vercel Cron (Recommended)
Add to your `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/auto-advance",
      "schedule": "0 2 * * *"
    }
  ]
}
```

### Option 2: External Cron Service (Upstash, AWS CloudWatch, etc.)
1. Set `CRON_SECRET` environment variable in your .env
2. Call `https://your-app.vercel.app/api/cron/auto-advance` daily with header:
   ```
   Authorization: Bearer your-cron-secret
   ```

### Option 3: GitHub Actions (Free)
Create `.github/workflows/auto-advance.yml`:
```yaml
name: Auto-Advance Workflows
on:
  schedule:
    - cron: '0 2 * * *'

jobs:
  advance:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger auto-advance
        run: |
          curl -X POST ${{ secrets.APP_URL }}/api/cron/auto-advance \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```

## Environment Variables Required
```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
CRON_SECRET=your-secret-for-cron-verification (optional but recommended)
```

## Audit Trail
All auto-advancements are logged to `leave_deferment_recall_audit_log` with:
- Action: "auto_advance_to_hr" or "auto_advance_loan"
- Entity type: "leave_request" or "loan"
- Details: Previous status, new status, leave type, reason

## Database Tables Checked
- `leave_plan_request_hod_review` - Status: "pending_hod", Leave Type: NOT "annual"
- `loan_hod_review` - Decision: "pending"
- `loan_office_review` - Decision: "pending"
- `loan_accounts_review` - Decision: "pending"

## Monitoring

Check the system logs for these messages:
- `[v0] Auto-advanced leave request {id} to HR Leave Office`
- `[v0] Auto-advanced loan {id} from HOD to Loan Office`
- `[v0] Auto-advanced loan {id} from Loan Office to Accounts`
- `[v0] Auto-advanced loan {id} from Accounts to Committee`

## Error Handling
If auto-advancement fails:
1. The error is logged with the request/loan ID
2. The request remains in its current stage
3. Manual review is still possible
4. Check the cron job logs for details

## Testing
To test without waiting 2 days:
1. Manually update a request's `created_at` to 2+ days ago
2. Call the endpoint: `POST /api/leave/auto-advance` or `POST /api/loan/auto-advance`
3. Verify the request status changed and audit log was created
