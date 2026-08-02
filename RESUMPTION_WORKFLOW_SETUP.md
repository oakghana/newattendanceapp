# Resumption Confirmation Workflow - Setup & Deployment Guide

## Overview

This system automatically tracks and manages staff leave resumptions with a multi-level verification workflow:
1. **Staff checks in** after leave ends → triggers confirmation workflow
2. **HOD/RM verifies** staff presence at workstation
3. **HR Leave Office manually verifies** if HOD/RM doesn't confirm within timeframe
4. **Notifications** sent to all relevant roles
5. **Audit trail** records all decisions

## Database Changes

Three new tables were created (migration already applied):

### 1. `leave_resumption_notifications`
Tracks each approved leave's resumption status
- `id` - UUID primary key
- `user_id` - FK to staff member
- `leave_request_id` - FK to leave plan request
- `leave_end_date` - when leave ends
- `confirmation_status` - unconfirmed | pending_hod_rm | confirmed | rejected | pending_hr_manual
- `first_hod_rm_check_in_date` - when staff first checked in
- `days_overdue` - calculated days past leave end

### 2. `leave_resumption_confirmations`
Records check-in claims and verification decisions
- `id` - UUID primary key
- `leave_resumption_id` - FK to leave_resumption_notifications
- `user_id` - staff member
- `staff_check_in_date` - when they checked in
- `hod_rm_user_id` - HOD/RM assigned to verify
- `hod_rm_confirmation_status` - pending | confirmed | rejected
- `hr_office_manual_status` - none | confirmed | investigating | rejected
- `final_status` - unconfirmed | confirmed | rejected | pending_verification

### 3. `resumption_confirmation_audit`
Audit trail of all actions and decisions
- `confirmation_id` - FK to leave_resumption_confirmations
- `action` - check_in_claimed | hod_confirmed | hod_rejected | hr_manual_confirmed
- `decision_maker_id` - who made the decision
- `notes` - evidence or reason for decision

## New API Routes

### 1. `/api/leave/resumption/trigger-check-in` [POST]
**Called automatically by**: Attendance check-in route when staff checks in after leave ended

**Body:**
```json
{
  "user_id": "uuid",
  "check_in_date": "2026-08-01"
}
```

**What it does:**
- Creates a `leave_resumption_confirmations` record with status `pending_hod_rm`
- Updates `leave_resumption_notifications` to `pending_hod_rm`
- Notifies HOD/RM via `staff_notifications` that they need to verify

### 2. `/api/leave/resumption/confirm` [POST]
**Called by**: HOD/RM or HR Leave Office via UI modal

**Body:**
```json
{
  "leave_resumption_id": "uuid",
  "action": "confirmed" | "rejected",
  "notes": "Staff present at desk",
  "confirmation_type": "pending_hod_rm" | "pending_hr_manual"
}
```

**What it does:**
- Updates confirmation record with decision
- Sets `final_status` to confirmed/rejected
- Creates audit trail entry
- Notifies HR Leave Office & HR Executive if confirmed

## UI Changes

### 1. All Leave Requests Table
**Location**: Leave Administration → All Requests tab

**Changes**:
- ✓ Red background highlight for rows where:
  - Leave has ended AND
  - Staff haven't checked in (confirmation_status = unconfirmed)
  
- ✓ New action buttons:
  - **"Verify Resumption"** (Orange) - HOD/RM: appears when status = pending_hod_rm
  - **"HR Verify"** (Red) - HR Leave Office: appears when status = pending_hr_manual

- ✓ Confirmation modal with:
  - Staff name, leave dates
  - Notes field (evidence of presence)
  - "Confirmed" / "Not Resumed" buttons

## Running Tests

### Automated Test Script
Tests all components without affecting real data or user auth:

```bash
cd /vercel/share/v0-project
node scripts/test-resumption-workflow.js
```

**What it tests:**
1. ✓ All three new tables exist
2. ✓ staff_notifications table is accessible
3. ✓ Can create test leave data
4. ✓ Check-in trigger creates confirmation records
5. ✓ HOD/RM confirmation updates status
6. ✓ Notifications are created correctly
7. ✓ Audit trail records decisions
8. ✓ Cleans up all test data

**Output**: GREEN checkmarks = everything working

---

## Daily Escalation

The existing `cron-daily-checks` route now includes non-resumption escalation:

### Timeline:
- **Day 0** (leave ends): Staff expected to resume
- **Day 2 overdue**: 2-day warning email to HOD/RM requesting verification
- **Day 5 overdue**: Formal letter escalated to HR Executive & HR Leave Office
- **Day 10 overdue**: Return-to-work memo generated, all roles notified

This is handled by `checkAndEscalateNonResumption()` in `leave-resumption-service.ts`

---

## Notification Destinations

All notifications use the `staff_notifications` table (in-app inbox):

| Recipient Role | Trigger | Message |
|---|---|---|
| **HOD/RM** | Staff checks in after leave | "Please verify this staff is at desk" |
| **HR Executive** | HOD doesn't confirm in time | "HOD did not verify - please manually check" |
| **HR Leave Office** | HOD/RM confirms resumption | "Resumption confirmed - see All Requests" |
| **Staff** | HR confirms | "Your return confirmed" |

---

## Environment Variables

No new env vars required. Uses existing:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

---

## Deployment Checklist

- [ ] Run test script: `node scripts/test-resumption-workflow.js`
- [ ] Verify migrations applied: `leave_resumption_notifications` table exists
- [ ] Check `/api/leave/resumption/confirm` route is accessible
- [ ] Test All Requests table shows red highlighting
- [ ] Test HOD/RM can open confirmation modal and confirm
- [ ] Test notifications appear in staff_notifications
- [ ] Verify daily cron escalation runs (check logs)
- [ ] Test with real user account (no auth issues)

---

## Troubleshooting

### Red highlight not appearing
- Check `confirmation_status` is set correctly in `leave_resumption_notifications`
- Verify `leave_end_date` is in the past
- Clear browser cache

### HOD/RM confirmation modal doesn't open
- Check browser console for errors
- Verify HOD/RM has the correct role in user_profiles
- Check confirmation record exists in database

### Notifications not received
- Verify HOD/RM user_id is correct in `leave_resumption_confirmations`
- Check `staff_notifications` table has rows
- Verify recipient is logged in and viewing notifications

### Staff check-in doesn't trigger confirmation
- Verify `/api/leave/resumption/trigger-check-in` route exists
- Check attendance check-in route calls the trigger endpoint
- Look for errors in API logs

---

## Production Notes

✓ **No auth issues**: Uses admin client internally, bypasses RLS for system operations
✓ **Non-blocking**: All failures are caught and logged, don't break core functionality
✓ **Cleanup**: Test script removes all test data automatically
✓ **Audit trail**: All decisions recorded with timestamp and decision-maker
✓ **Safe to deploy**: Backward compatible, doesn't affect existing leave system
