# Leave Resumption Alerts System - Integration Guide

## Overview

The leave resumption alerts system provides comprehensive monitoring and notifications for staff returning from leave. It tracks pre-resumption alerts, verifies attendance check-ins, and notifies managers of any staff not reporting to work.

## Key Features

### 1. Pre-Resumption Alerts
- **2-Week Reminder**: Weekly alert to staff that they have ~2 weeks until resumption
- **1-Week Reminder**: Weekly alert to staff that they have ~1 week until resumption
- Alerts are sent via the notifications system automatically

### 2. Attendance Integration
- When staff check in through the attendance system on their resumption date, the system automatically:
  - Verifies the resumption alert
  - Records check-in time and date
  - Updates resumption status to "checked_in"
  - Sends confirmation notification to staff

### 3. Missing Check-In Detection
- Daily cron job identifies staff who:
  - Should have reported on resumption date
  - Have not checked in through attendance
  - Have active leave resumption alerts
- Automatically notifies HOD and RM with staff details
- Marks alert status as "no_show"

### 4. Manager Follow-Up Dashboard
- HOD sees alerts for their department staff
- RM sees alerts for their region staff
- HR sees all missing check-in alerts
- Managers can acknowledge alerts after follow-up

## Database Schema

### `leave_resumption_alerts` Table

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| leave_plan_request_id | UUID | Reference to approved leave request |
| user_id | UUID | Staff member returning from leave |
| resumption_date | DATE | Expected return date |
| alert_2_weeks_sent | BOOLEAN | Whether 2-week alert was sent |
| alert_2_weeks_sent_at | TIMESTAMP | When 2-week alert was sent |
| alert_1_week_sent | BOOLEAN | Whether 1-week alert was sent |
| alert_1_week_sent_at | TIMESTAMP | When 1-week alert was sent |
| checked_in_date | DATE | Actual check-in date if checked in |
| checked_in_time | TIME | Actual check-in time if checked in |
| checked_out_date | DATE | Checkout date if applicable |
| checked_out_time | TIME | Checkout time if applicable |
| hod_rm_alert_sent | BOOLEAN | Whether HOD/RM notification was sent |
| hod_rm_alert_sent_at | TIMESTAMP | When HOD/RM alert was sent |
| hod_rm_alert_acknowledged | BOOLEAN | Whether manager acknowledged the alert |
| hod_rm_alert_acknowledged_at | TIMESTAMP | When manager acknowledged |
| hod_rm_alert_acknowledged_by | UUID | Who acknowledged the alert |
| status | VARCHAR | pending, checked_in, no_show, excused |
| reason_for_absence | TEXT | Reason if not reporting (filled by manager) |
| created_at | TIMESTAMP | Record created timestamp |
| updated_at | TIMESTAMP | Last updated timestamp |

## API Endpoints

### 1. Send Pre-Resumption Alerts
**POST** `/api/leave/resumption/send-alerts`

Sends 2-week and 1-week reminders to staff about upcoming resumption dates.

**Request:**
```json
{
  "action": "send_pre_resumption_alerts"
}
```

**Response:**
```json
{
  "success": true,
  "twoWeekAlerts": 5,
  "oneWeekAlerts": 3,
  "totalProcessed": 8
}
```

### 2. Check Missing Check-Ins
**POST** `/api/leave/resumption/check-missing-checkins`

Identifies staff not checking in on resumption date and sends HOD/RM alerts.

**Request:**
```json
{
  "action": "check_missing_checkins"
}
```

**Response:**
```json
{
  "success": true,
  "missedCheckIns": 2,
  "message": "Checked 2 staff for missing check-ins"
}
```

### 3. Verify Check-In
**POST** `/api/leave/resumption/verify-checkin`

Called automatically when staff check in through attendance system.

**Request:**
```json
{
  "userId": "uuid",
  "checkinTime": "09:15:00",
  "checkinDate": "2026-06-15"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Leave resumption check-in recorded successfully",
  "resumptionAlert": { ... }
}
```

### 4. Get Staff Resumptions
**GET** `/api/leave/resumption/get-staff-resumptions?userId={userId}`

Retrieves upcoming resumption alerts for a staff member.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "resumption_date": "2026-06-15",
      "status": "pending",
      "leave": { "leave_type": "Annual Leave" }
    }
  ]
}
```

### 5. Get Manager Missing Check-Ins
**GET** `/api/leave/resumption/manager-missing-checkins?managerId={id}&role={role}`

Retrieves missing check-in alerts for a manager's department/region.

**Response:**
```json
{
  "success": true,
  "data": [ ... ],
  "totalAlerts": 2
}
```

### 6. Acknowledge Alert
**POST** `/api/leave/resumption/acknowledge-alert`

Manager acknowledges a missing check-in alert after follow-up.

**Request:**
```json
{
  "alertId": "uuid",
  "acknowledgedBy": "uuid"
}
```

### 7. Cron Job
**POST** `/api/leave/resumption/cron-job`

Main scheduled job that runs daily to:
1. Send pre-resumption alerts
2. Check for missing check-ins

**Authentication:** Requires `CRON_SECRET` environment variable

## Setting Up Cron Jobs

### Option 1: Vercel Crons (Recommended)

Add to `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/leave/resumption/cron-job",
      "schedule": "0 7 * * *"
    }
  ]
}
```

### Option 2: External Cron Service

Call the endpoint daily:
```bash
curl -X POST https://yourapp.com/api/leave/resumption/cron-job \
  -H "Authorization: Bearer {CRON_SECRET}" \
  -H "Content-Type: application/json"
```

## Environment Variables Required

```env
CRON_SECRET=your-secret-token
NEXT_PUBLIC_APP_URL=https://yourapp.com
SUPABASE_SERVICE_ROLE_KEY=your-key
NEXT_PUBLIC_SUPABASE_URL=your-url
```

## Components

### Staff-Facing Components

**`StaffResumptionReminder`**
- Displays upcoming resumption dates
- Shows countdown timer
- Provides "Check In" button
- Shows check-in status
- Alert badges for urgent resumptions

**Location:** `/components/leave/staff-resumption-reminder.tsx`

### Manager-Facing Components

**`ManagerMissingCheckInAlerts`**
- Shows staff not checking in on resumption date
- Displays staff details and leave type
- Allows managers to acknowledge alerts
- Filters by department (HOD) or region (RM)

**Location:** `/components/leave/manager-missing-checkin-alerts.tsx`

## Notification Types

| Type | Recipients | Trigger | Timing |
|------|-----------|---------|--------|
| `leave_resumption_2week` | Staff | 2 weeks before resumption | Once per alert |
| `leave_resumption_1week` | Staff | 1 week before resumption | Once per alert |
| `missing_checkin` | HOD, RM, HR | Staff doesn't check in on resumption date | Daily from cron job |
| `checkin_confirmed` | Staff | Successfully checked in | Immediate |

## Workflow

### Staff Perspective
1. Leave is approved → Resumption alert created
2. 2 weeks before: Staff receives notification
3. 1 week before: Staff receives notification
4. On resumption date: Staff comes to work
5. Staff checks in through attendance system
6. System automatically verifies and marks as checked in
7. Staff receives confirmation notification

### Manager Perspective
1. Staff should report but hasn't checked in by end of day
2. Cron job sends missing check-in alert
3. HOD/RM/HR sees alert in their dashboard
4. Manager can follow up with staff
5. Manager acknowledges alert after confirmation
6. System records the acknowledgment

## Testing

### Manual Testing

1. **Create test leave request:**
   - Create approved leave for a staff member
   - Set resumption date to tomorrow

2. **Test pre-resumption alerts:**
   ```bash
   curl -X POST http://localhost:3000/api/leave/resumption/send-alerts \
     -H "Content-Type: application/json" \
     -d '{"action": "send_pre_resumption_alerts"}'
   ```

3. **Test missing check-in detection:**
   ```bash
   curl -X POST http://localhost:3000/api/leave/resumption/check-missing-checkins \
     -H "Content-Type: application/json" \
     -d '{"action": "check_missing_checkins"}'
   ```

4. **Test check-in verification:**
   - Have staff member check in through attendance
   - Verify resumption alert is updated

## Troubleshooting

### Alerts not sending
- Check `leave_resumption_alerts` table for correct dates
- Verify `notifications` table is receiving notifications
- Check cron job logs for errors

### Check-in not being verified
- Verify `NEXT_PUBLIC_APP_URL` environment variable is set
- Check attendance API logs
- Ensure resumption date matches check-in date

### Missing check-in alerts not appearing
- Run cron job manually to test
- Check `hod_rm_alert_sent` flag in database
- Verify manager has correct role and department/region assignment

## Future Enhancements

- SMS alerts for urgent notifications
- Email reminders to staff
- Custom escalation workflows
- Automated absence reason tracking
- Integration with HR leave policies
- Dashboard analytics on resumption patterns
