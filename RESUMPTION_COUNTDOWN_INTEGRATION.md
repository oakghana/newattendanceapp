# Resumption Countdown Feature - Integration Guide

## Quick Start for HR Leave Office

### 1. Access the HR Dashboard
```
URL: /dashboard/leave  (or admin section)
```

### 2. View Staff Countdowns
- Automatically shows all staff within 5 days of returning to work
- Sorted by urgency (critical first)
- Real-time updates every 5 minutes

### 3. Filter by Urgency
- **🚨 Critical (≤2 days)**: Immediate action required
- **⏰ Warning (3-5 days)**: Plan ahead
- **All**: View everyone

### 4. Take Action

#### Send Reminder
```
1. Find staff member in countdown list
2. Click "Send Reminder" button
3. Email + notification sent automatically
4. System logs the reminder
```

#### Issue Warning
```
1. Click "Issue Warning" button (appears for critical staff)
2. Select warning type:
   - Non-resumption: Staff didn't return
   - Late return: Staff came back late
   - Extension required: Need to extend leave
   - Return warning: Final notice
3. Staff gets notification with warning details
4. HR office receives notification
5. Warning tracked for compliance records
```

#### Contact HOD
```
1. Click "Contact HOD" button
2. Opens communication channel with Head of Department
3. Coordinate on staff return preparations
```

#### Export Data
```
1. Click "Export CSV"
2. Downloads file: resumption-countdowns-YYYY-MM-DD.csv
3. Contains all staff, leave dates, days remaining
4. For HR records and reporting
```

---

## For Staff: What They See

### Dashboard Widget
- **Displays at top of dashboard** (after warnings, before stats)
- Shows personal countdown if on approved leave within 5 days
- Updates automatically
- No action needed from staff

### Notifications
- Email reminder (when HR sends one)
- In-app notification badge
- Audio alert (if enabled) when logging in
- Can acknowledge or dismiss

### Important Dates
- **Leave End Date**: Last day of approved leave
- **Resume Date**: First day back to work
- **Days Left**: Countdown to return

---

## Database Setup

### Create `staff_warnings` Table
```sql
CREATE TABLE staff_warnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES user_profiles(id),
  staff_name TEXT NOT NULL,
  issued_by UUID NOT NULL REFERENCES user_profiles(id),
  issued_by_name TEXT NOT NULL,
  warning_type TEXT NOT NULL CHECK (warning_type IN (
    'non_resumption',
    'late_return',
    'extension_required',
    'return_warning'
  )),
  details TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'acknowledged',
    'resolved'
  )),
  date_issued TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_pending_warning UNIQUE(staff_id, warning_type, date_issued)
);

-- Indexes for performance
CREATE INDEX idx_staff_warnings_staff_id ON staff_warnings(staff_id);
CREATE INDEX idx_staff_warnings_issued_by ON staff_warnings(issued_by);
CREATE INDEX idx_staff_warnings_status ON staff_warnings(status);
CREATE INDEX idx_staff_warnings_date ON staff_warnings(date_issued DESC);
```

### Enable RLS (Row Level Security)
```sql
ALTER TABLE staff_warnings ENABLE ROW LEVEL SECURITY;

-- Staff can see their own warnings
CREATE POLICY "staff_see_own_warnings" ON staff_warnings
  FOR SELECT USING (staff_id = auth.uid());

-- HR can see all warnings
CREATE POLICY "hr_see_all_warnings" ON staff_warnings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'hr', 'hr_office', 'hr_leave_office', 'director_hr')
    )
  );

-- HR can insert warnings
CREATE POLICY "hr_can_insert_warnings" ON staff_warnings
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'hr', 'hr_office', 'hr_leave_office', 'director_hr')
    )
  );
```

---

## API Testing

### Test Countdown Fetch
```bash
curl -X GET http://localhost:3000/api/leave/reminders/resume-five-days-countdown \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Test Issue Warning
```bash
curl -X POST http://localhost:3000/api/leave/issue-warning \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "staff_id": "user-uuid-here",
    "staff_name": "John Doe",
    "warning_type": "return_warning"
  }'
```

### Test Send Reminder
```bash
curl -X POST http://localhost:3000/api/leave/send-reminder \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "staff_id": "user-uuid-here",
    "staff_name": "John Doe"
  }'
```

---

## Troubleshooting

### Countdown Not Showing
1. Check if staff has approved leave (status: "hr_approved")
2. Verify end date is within 5 days
3. Check leave is not archived (is_archived: false)
4. Verify user role for visibility

### Audio Alert Not Playing
1. Check browser sound settings
2. Click "Sound On" button in widget
3. Browser may require user gesture first
4. Check browser console for errors

### Warning Not Created
1. Verify issuer is HR/Leave Office staff
2. Check staff_id is valid
3. Check warning_type is valid option
4. Verify database permissions

### Reminder Not Sent
1. Check email service is configured
2. Verify staff member has email on file
3. Check notification logs
4. Verify leave record exists and is approved

---

## Permissions Matrix

| Action | Staff | HOD | HR Office | Director HR | Admin |
|--------|-------|-----|-----------|------------|-------|
| View own countdown | ✓ | ✓ | ✓ | ✓ | ✓ |
| View all countdowns | ✗ | ✗ | ✓ | ✓ | ✓ |
| Send reminders | ✗ | ✗ | ✓ | ✓ | ✓ |
| Issue warnings | ✗ | ✗ | ✓ | ✓ | ✓ |
| View own warnings | ✓ | ✓ | ✓ | ✓ | ✓ |
| View all warnings | ✗ | ✗ | ✓ | ✓ | ✓ |
| Export data | ✗ | ✗ | ✓ | ✓ | ✓ |

---

## Email Templates

### Resume Reminder Email
Subject: "Reminder: Your Leave Ends Soon - Expected Return to Work"

Body:
```
Hello [Staff Name],

This is a reminder that your approved leave is ending soon.

Leave Details:
- Leave Type: [Type]
- Leave Ends: [Date]
- Expected Return: [Date]
- Days Remaining: [Number]

Please ensure you are prepared to return to work as scheduled.

If you need to extend your leave or have any concerns, please submit a deferment request through the system.

Best regards,
HR Leave Office
```

---

## Monitoring & Maintenance

### Daily Tasks
1. Review critical countdowns (≤2 days)
2. Send reminders to upcoming returners
3. Check for any non-resumption flags

### Weekly Tasks
1. Export countdown reports
2. Review warning status
3. Follow up on unresolved warnings
4. Contact HODs for any issues

### Monthly Tasks
1. Generate compliance reports
2. Archive old warnings (>90 days)
3. Review patterns in deferrals
4. Plan staffing for upcoming returns

---

## Feature Flags

To enable/disable features:

### In Dashboard
```typescript
<DashboardCountdownWrapper autoPlaySound={true} />
```

### In HR Dashboard
```typescript
// Can customize refresh interval
setInterval(fetchData, 300000) // 5 minutes
```

### Sound Alert Frequency
Change in `resumption-countdown-widget.tsx`:
```typescript
oscillator.frequency.value = 800 // Hz, change for different pitch
gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5) // Duration
```

---

## Support & Questions

For issues or questions:
1. Check RESUMPTION_COUNTDOWN_FEATURE.md for technical details
2. Review API endpoint documentation
3. Check database schema setup
4. Verify user permissions
5. Contact development team
