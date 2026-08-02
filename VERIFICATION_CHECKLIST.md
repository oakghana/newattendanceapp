# Resumption Workflow - Manual Verification Checklist

Complete these steps to verify the system is working end-to-end.

## Pre-Deployment (Before going live)

### 1. Database Schema Verification
```bash
# Run the test script
node scripts/test-resumption-workflow.js
```
**Expected**: All tests pass (green checkmarks)
**Status**: [ ] PASS [ ] FAIL

### 2. API Routes Exist
Check these routes return 200 or 405 (not 404):
```bash
curl -X POST http://localhost:3000/api/leave/resumption/confirm
curl -X POST http://localhost:3000/api/leave/resumption/trigger-check-in
```
**Expected**: No 404 errors
**Status**: [ ] VERIFIED

### 3. Database Tables Exist
```bash
# Log in to Supabase dashboard or run:
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('leave_resumption_notifications', 'leave_resumption_confirmations', 'resumption_confirmation_audit');
```
**Expected**: All 3 tables listed
**Status**: [ ] VERIFIED

---

## Post-Deployment (Live System)

### 4. UI Red Highlighting
1. Log in as HR Leave Office or HOD/RM
2. Go to: **Leave Management → All Requests**
3. Find a staff member with:
   - Status: "HR Approved"
   - End Date: In the past
   - No check-in after end date

**Expected**: That row has light red background
**Status**: [ ] VISIBLE [ ] NOT VISIBLE

### 5. Confirmation Modal Opens
1. On the All Requests table, find a red-highlighted row
2. Click **"Verify Resumption"** button (orange)

**Expected**: Modal dialog opens with:
- Staff name
- Leave end date
- "Not Resumed" and "Confirmed" buttons
- Notes text field

**Status**: [ ] OPENS [ ] FAILS TO OPEN

### 6. HOD/RM Can Confirm Resumption
1. In the modal, add notes: "Staff confirmed at desk"
2. Click **"Confirmed"** button

**Expected**:
- Modal closes
- Toast message: "Resumption confirmed successfully"
- Table refreshes
- Row background changes from red to normal

**Status**: [ ] SUCCESS [ ] FAILED

### 7. HR Leave Office Receives Notification
1. Log in as HR Leave Office user
2. Check the notifications panel
3. Look for message: "...has confirmed resumption"

**Expected**: New notification appears
**Status**: [ ] RECEIVED [ ] NOT RECEIVED

### 8. Audit Trail Records Decision
1. Log in to Supabase dashboard
2. Go to table: `resumption_confirmation_audit`
3. Find newest entry
4. Check fields:
   - `action`: "hod_confirmed"
   - `decision_maker_id`: populated
   - `notes`: "Staff confirmed at desk"

**Expected**: All fields populated correctly
**Status**: [ ] VERIFIED [ ] MISSING DATA

### 9. Check-In Triggers Confirmation
1. Log in as a staff member
2. Use the Attendance Check-In feature to check in
3. After check-in, log in as HOD/RM
4. Go to All Requests
5. Look for the orange "Verify Resumption" button

**Expected**: Button appears for this staff member
**Status**: [ ] APPEARS [ ] NOT APPEARING

### 10. HR Manual Verification (Escalation)
1. If HOD/RM doesn't confirm for 3+ days
2. Log in as HR Leave Office
3. Go to All Requests tab
4. Look for button: **"HR Verify"** (red)

**Expected**: Red button appears for overdue non-confirmations
**Status**: [ ] VISIBLE [ ] NOT VISIBLE

---

## Data Integrity Checks

### 11. Resumption Records Exist
Check for each approved leave:
```bash
# Count pending resumptions
SELECT COUNT(*) FROM leave_resumption_notifications 
WHERE status = 'pending' 
AND leave_end_date < NOW()::DATE;
```
**Expected**: Count matches number of approved leaves past end date
**Status**: [ ] MATCHES [ ] MISMATCH

### 12. No Duplicate Confirmations
```bash
# Check for duplicates
SELECT leave_resumption_id, COUNT(*) 
FROM leave_resumption_confirmations 
GROUP BY leave_resumption_id 
HAVING COUNT(*) > 1;
```
**Expected**: No results (no duplicates)
**Status**: [ ] CLEAN [ ] DUPLICATES FOUND

### 13. All Notifications Readable
```bash
# Check notification table
SELECT COUNT(*) FROM staff_notifications 
WHERE notification_type LIKE 'leave_resumption%';
```
**Expected**: Rows > 0 after confirmations
**Status**: [ ] DATA EXISTS [ ] NO DATA

---

## Error Scenario Tests

### 14. System Handles Missing User
1. Try to confirm a non-existent user
2. Check API response

**Expected**: 404 or validation error, not 500
**Status**: [ ] GRACEFUL ERROR [ ] CRASH

### 15. System Handles Invalid Confirmation Status
1. Send confirmation with invalid status
2. Check API response

**Expected**: 400 Bad Request, not 500
**Status**: [ ] GRACEFUL ERROR [ ] CRASH

### 16. No Auth Breakage
1. Log out completely
2. Log back in as staff member
3. Check-in works normally

**Expected**: Check-in succeeds, no auth errors in console
**Status**: [ ] WORKS [ ] AUTH ERROR

---

## Performance Tests

### 17. All Requests Table Loads Quickly
1. Open All Requests tab with 100+ requests

**Expected**: Loads in < 2 seconds
**Status**: [ ] FAST [ ] SLOW

### 18. Modal Opens Without Delay
1. Click "Verify Resumption" button

**Expected**: Modal appears in < 500ms
**Status**: [ ] FAST [ ] SLOW

---

## Final Signoff

| Component | Status | Verified By | Date |
|-----------|--------|-------------|------|
| Database Schema | ✓ | | |
| API Routes | ✓ | | |
| UI Highlighting | ✓ | | |
| Confirmation Modal | ✓ | | |
| HOD/RM Confirmation | ✓ | | |
| Notifications | ✓ | | |
| Audit Trail | ✓ | | |
| Check-In Integration | ✓ | | |
| Escalation | ✓ | | |
| Error Handling | ✓ | | |
| Performance | ✓ | | |
| Auth Integrity | ✓ | | |

**Overall Status**: [ ] READY FOR PRODUCTION [ ] NEEDS FIXES

---

## Quick Reference

### Test Script
```bash
node scripts/test-resumption-workflow.js
```

### Check Tables in Supabase
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'leave_resumption%' OR table_name LIKE 'resumption%';
```

### Check Recent Confirmations
```sql
SELECT * FROM resumption_confirmation_audit 
ORDER BY created_at DESC LIMIT 10;
```

### Check Notifications for User
```sql
SELECT * FROM staff_notifications 
WHERE recipient_id = 'user-uuid'
AND notification_type LIKE 'leave_resumption%'
ORDER BY created_at DESC LIMIT 5;
```

### View Pending Confirmations
```sql
SELECT 
  u.first_name, u.last_name,
  lrn.leave_end_date,
  lrc.hod_rm_confirmation_status,
  lrn.days_overdue
FROM leave_resumption_notifications lrn
JOIN leave_resumption_confirmations lrc ON lrn.id = lrc.leave_resumption_id
JOIN user_profiles u ON lrn.user_id = u.id
WHERE lrn.confirmation_status = 'pending_hod_rm'
ORDER BY lrn.leave_end_date DESC;
```
