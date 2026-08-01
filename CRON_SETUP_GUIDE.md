# Cron Job Setup Guide - Leave Compliance Checks

## Overview
The system includes an automated cron job endpoint that should be called once daily to:
1. Send leave submission reminders (during Aug 18-31 window)
2. Escalate overdue manager endorsements (>7 days pending)
3. Notify HR of escalations
4. Log all actions for audit trail

## Endpoint Details

**URL**: `POST /api/leave/compliance/cron-daily-checks`

**Authentication**: Bearer token via Authorization header
```
Authorization: Bearer {CRON_SECRET_TOKEN}
```

**Recommended Time**: 6:00 AM UTC (early morning, before business hours)

**Response on Success**:
```json
{
  "success": true,
  "timestamp": "2026-08-01T06:00:00Z",
  "actions": {
    "reminders_sent": 45,
    "is_reminder_period": true,
    "endorsements_escalated": 8
  }
}
```

**Response on Error**:
```json
{
  "error": "Unauthorized: Invalid cron token"
}
```

---

## Setup Options

### Option 1: GitHub Actions (Recommended for Vercel/GitHub)

**File**: `.github/workflows/daily-leave-compliance.yml`

```yaml
name: Daily Leave Compliance Checks

on:
  schedule:
    # Run every day at 6 AM UTC
    - cron: '0 6 * * *'
  # Allow manual trigger
  workflow_dispatch:

jobs:
  compliance-check:
    runs-on: ubuntu-latest
    steps:
      - name: Check Leave Compliance
        run: |
          curl -X POST \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET_TOKEN }}" \
            -H "Content-Type: application/json" \
            https://your-domain.com/api/leave/compliance/cron-daily-checks

      - name: Log Result
        if: always()
        run: echo "Cron job executed"
```

**Setup**:
1. Create `.github/workflows/` directory if it doesn't exist
2. Create `daily-leave-compliance.yml` file with above content
3. Replace `your-domain.com` with actual domain
4. Add GitHub Actions secret: `CRON_SECRET_TOKEN`
   - Go to: Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `CRON_SECRET_TOKEN`
   - Value: Your secure random token (use: `openssl rand -hex 32`)
5. Commit and push to main branch
6. Workflows should activate automatically

---

### Option 2: AWS EventBridge (For AWS-hosted apps)

**Step 1: Create IAM Role**
```
Service: Events
Permissions: events:*
```

**Step 2: Create EventBridge Rule**
- Name: `daily-leave-compliance`
- Schedule: `cron(0 6 * * ? *)` (6 AM UTC daily)
- Target Type: HTTP API
- Method: POST
- Endpoint URL: `https://your-domain.com/api/leave/compliance/cron-daily-checks`

**Step 3: Add HTTP Header**
- Key: `Authorization`
- Value: `Bearer {YOUR_CRON_SECRET_TOKEN}`

---

### Option 3: EasyCron.com (Free External Service)

1. Go to https://www.easycron.com/
2. Sign up for free account
3. Click "Add a Cron Job"
4. Configure:
   - **Cron Expression**: `0 6 * * *` (6 AM UTC daily)
   - **URL**: `https://your-domain.com/api/leave/compliance/cron-daily-checks`
   - **HTTP Method**: POST
   - **Request Header**: Add header
     - Name: `Authorization`
     - Value: `Bearer {YOUR_CRON_SECRET_TOKEN}`
   - **Enabled**: Check the checkbox
5. Save and test

---

### Option 4: Heroku Scheduler (If using Heroku)

1. Install Heroku Scheduler add-on
   ```bash
   heroku addons:create scheduler:standard -a your-app
   ```

2. Open scheduler dashboard
   ```bash
   heroku addons:open scheduler -a your-app
   ```

3. Add new job:
   - **Command**: 
   ```bash
   curl -X POST \
     -H "Authorization: Bearer $CRON_SECRET_TOKEN" \
     https://your-domain.com/api/leave/compliance/cron-daily-checks
   ```
   - **Frequency**: Daily at 6:00 AM
   - Click "Save"

4. Set environment variable:
   ```bash
   heroku config:set CRON_SECRET_TOKEN='your-secret-token' -a your-app
   ```

---

### Option 5: Render Cron Jobs (If using Render)

1. Go to your Render dashboard
2. Create new "Background Worker" service (if not existing)
3. Set up deploy hook for the cron job
4. Use `*/1440 * * * *` cron expression (runs once per day)

OR use their built-in background jobs feature with:
```
POST https://your-domain.com/api/leave/compliance/cron-daily-checks
Header: Authorization: Bearer {CRON_SECRET_TOKEN}
```

---

### Option 6: Manual Testing (Before Setting Up Automation)

**Test 1: Without Authentication (should fail with 401)**
```bash
curl -X POST http://localhost:3000/api/leave/compliance/cron-daily-checks
```

Expected response:
```json
{"error": "Unauthorized: Invalid cron token"}
```

**Test 2: With Correct Token (should succeed)**
```bash
curl -X POST \
  -H "Authorization: Bearer your-test-token" \
  http://localhost:3000/api/leave/compliance/cron-daily-checks
```

Expected response:
```json
{
  "success": true,
  "timestamp": "2026-08-01T06:00:00Z",
  "actions": {
    "reminders_sent": 0,
    "is_reminder_period": false,
    "endorsements_escalated": 0
  }
}
```

---

## Environment Configuration

### Required Environment Variables

In your `.env.local` file (development) or deployment platform:

```bash
# Cron job authorization token
CRON_SECRET_TOKEN=your-very-secret-token-here-use-strong-random

# Email configuration (for notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@example.com
SMTP_PASS=your-app-password

# Application URL (for email links)
APP_URL=https://your-domain.com
# Or for local development:
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Generate Secure Token

**macOS/Linux**:
```bash
openssl rand -hex 32
```

**PowerShell** (Windows):
```powershell
[System.Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

**Online Tool**: https://www.random.org/bytes/

---

## Monitoring & Logging

### Check Logs (Different Platforms)

**Vercel**:
- Go to your project dashboard
- Click "Analytics" → "Functions"
- Look for `POST /api/leave/compliance/cron-daily-checks`
- Check response status and duration

**GitHub Actions**:
- Go to your repo → Actions tab
- Click "Daily Leave Compliance Checks" workflow
- View run history and logs

**AWS CloudWatch**:
- CloudWatch Logs → `/aws/lambda/your-function`
- Filter by `cron-daily-checks`
- Check for errors

**Render**:
- Dashboard → Services → Your App
- Logs section → Search for endpoint logs

### What to Look For

✅ **Success Indicators**:
- HTTP 200 status
- `"success": true` in response
- Appropriate action counts (reminders_sent, endorsements_escalated)

❌ **Error Indicators**:
- HTTP 401: Wrong or missing CRON_SECRET_TOKEN
- HTTP 500: Database or email service error
- Empty response: Timeout or network issue
- High latency: Database queries taking too long

### Troubleshooting

**Issue**: Cron job not running
- Verify cron expression (test at crontab.guru)
- Check that service is enabled/active
- Verify URL is correct and accessible
- Test manually with curl first

**Issue**: 401 Unauthorized
- Verify CRON_SECRET_TOKEN matches exactly
- Check token is set in environment variables
- Ensure Bearer prefix is included in auth header
- Regenerate token if unsure

**Issue**: Email notifications not sending
- Verify SMTP credentials are correct
- Check SMTP service is not blocking
- Look for errors in server logs
- Test SMTP config separately

**Issue**: Too many reminders sent
- Check reminder period logic (should be Aug 18-31 only)
- Verify cron job isn't being called multiple times
- Check for duplicate entries in database

---

## Maintenance

### Weekly Checks
- [ ] Review cron job logs for errors
- [ ] Verify last successful run timestamp
- [ ] Check email delivery status

### Monthly Review
- [ ] Monitor cron job success rate
- [ ] Review escalation patterns
- [ ] Check if reminder period dates need adjustment
- [ ] Verify token security (rotate if needed)

### Quarterly Audit
- [ ] Validate compliance data accuracy
- [ ] Review audit trail logs
- [ ] Assess manager responsiveness to escalations
- [ ] Update documentation if process changes

---

## Emergency Procedures

### Disable Cron Job Temporarily
1. Go to your cron service
2. Toggle "Enabled" OFF or delete the job
3. System will continue to function for manual checks
4. Re-enable when ready

### Force Manual Run
```bash
curl -X POST \
  -H "Authorization: Bearer $CRON_SECRET_TOKEN" \
  https://your-domain.com/api/leave/compliance/cron-daily-checks
```

### Reset if Something Goes Wrong
1. Check `/api/leave/compliance/check` endpoint
2. Verify database integrity
3. Review audit_logs table for issues
4. Contact system administrator

---

## Quick Reference

| Service | Setup Time | Cost | Ease |
|---------|-----------|------|------|
| GitHub Actions | 5 min | Free | ⭐⭐⭐⭐⭐ |
| EasyCron | 10 min | Free | ⭐⭐⭐⭐ |
| AWS EventBridge | 20 min | Pay-as-you-go | ⭐⭐⭐ |
| Heroku Scheduler | 10 min | $7/mo | ⭐⭐⭐⭐ |
| Render | 15 min | Included | ⭐⭐⭐⭐ |

**Recommendation**: Use **GitHub Actions** for simplicity and cost-effectiveness.

---

## Support

If you encounter issues:
1. Check logs first
2. Test endpoint manually with curl
3. Verify environment variables
4. Review this guide's troubleshooting section
5. Contact system administrator with error message
