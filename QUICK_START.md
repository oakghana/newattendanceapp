# Quick Start - Staff Leave Resumption Confirmation System

## TL;DR

Staff leave resumptions are now automatically tracked and require HOD/RM verification before being marked as confirmed. The system automatically escalates to HR if not verified within timeframe.

---

## For Staff

### What Changed?
- When you take leave and it ends, the system tracks when you return
- Your HOD/RM will verify you're back at work
- The system notifies relevant people

### What You Need to Do
1. ✓ Check in normally after your leave ends
2. ✓ Your HOD/RM will verify you're present
3. ✓ If needed, you may need to provide evidence of resumption

---

## For HOD/RM

### What Changed?
You now verify when staff return from leave.

### How to Verify
1. Go to **Leave Management → All Requests**
2. Look for **red-highlighted rows** = staff who were on leave, now claiming to be back
3. Click the **orange "Verify Resumption"** button
4. In the modal:
   - Add notes (e.g., "Confirmed at desk", "Saw in office", etc.)
   - Click **"Confirmed"** or **"Not Resumed"**
5. Done! HR is automatically notified

### Timeline
- Staff checks in → You get notification to verify
- You have until day 5 overdue → HR escalates if you don't verify
- If escalated → HR Office will manually verify

---

## For HR Leave Office

### What Changed?
You get automatic notifications when:
1. Staff resume and HOD confirms → just FYI
2. Staff resume but HOD doesn't confirm (5+ days) → you need to manually verify

### How to Manually Verify
1. Go to **Leave Management → All Requests**
2. Look for **red "HR Verify"** button (only appears if HOD didn't verify in time)
3. Click it
4. In the modal:
   - Add investigation notes (e.g., "Checked attendance records", "Confirmed via email", etc.)
   - Click **"Confirmed"** or **"Not Resumed"**
5. All relevant parties are notified

---

## For HR Executive

### What Changed?
You receive notifications for:
- Staff who resume but HOD doesn't verify → awareness notification
- Formal escalation notices at 2, 5, and 10 days overdue

### What You Need to Do
- Monitor notifications
- If needed, coordinate with HR Leave Office for manual verification

---

## System Overview

```
Leave Ends
    ↓
Staff Checks In (Auto)
    ↓
HOD/RM Verifies Presence (via Orange Button)
    ↓
HR Leave Office Notified ✓
    ↓
System Marks as Confirmed
```

**Or if HOD/RM doesn't verify:**

```
Staff Checks In
    ↓
5 Days Pass (Auto-escalation)
    ↓
HR Leave Office Gets Red "HR Verify" Button
    ↓
HR Manually Verifies (via Red Button)
    ↓
System Marks as Confirmed
```

---

## Testing (For Admins)

### Verify System is Working
```bash
cd /vercel/share/v0-project
node scripts/test-resumption-workflow.js
```

**Expected**: All tests pass (green checkmarks)

### Quick Database Check
In Supabase dashboard, run:
```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND (table_name LIKE 'leave_resumption%' OR table_name = 'resumption_confirmation_audit');

-- Check recent confirmations
SELECT * FROM resumption_confirmation_audit 
ORDER BY created_at DESC LIMIT 5;

-- Check pending verifications
SELECT 
  u.first_name, u.last_name, lrn.leave_end_date, lrc.hod_rm_confirmation_status
FROM leave_resumption_notifications lrn
JOIN leave_resumption_confirmations lrc ON lrn.id = lrc.leave_resumption_id
JOIN user_profiles u ON lrn.user_id = u.id
WHERE lrn.confirmation_status = 'pending_hod_rm';
```

---

## Notifications

All notifications appear **in-app** (dashboard notification panel):

| Who Gets It | When | Message |
|---|---|---|
| **HOD/RM** | Staff checks in after leave | "Staff has checked in, please verify presence" |
| **HR Leave Office** | HOD confirms | "Resumption confirmed by HOD" |
| **HR Executive** | 5+ days overdue | "Staff not verified, escalation needed" |
| **Staff** | Resumption confirmed | "Your resumption has been confirmed" |

---

## Red Highlighting Rules

A row shows **red background** when:
- Status = "HR Approved" AND
- Leave end date = in the past AND
- Confirmation status = "unconfirmed" OR "pending_hod_rm"

**Goes away when**:
- HOD/RM confirms, OR
- HR Leave Office confirms, OR
- Staff is marked as rejected

---

## Escalation Timeline

| Days After Leave Ends | Action | Who Notified |
|---|---|---|
| **Day 0** | Leave ends | HOD/RM |
| **Day 1** | Reminder sent | HOD/RM |
| **Day 2** | Warning escalation | HR Leave Office |
| **Day 5** | Formal letter | HR Executive + HR Leave Office |
| **Day 10** | Return-to-work memo generated | All roles |

---

## Audit Trail

Every decision is recorded (for compliance):

```
✓ Who verified
✓ When they verified
✓ What they said (notes)
✓ Approval or rejection
✓ Timestamp
```

This creates a complete compliance record.

---

## Troubleshooting

### Red highlighting not showing?
- Clear browser cache
- Verify `confirmation_status` is set in database
- Check if leave end date is in the past

### Can't click "Verify Resumption" button?
- Make sure you're logged in as HOD/RM
- Check browser console for JavaScript errors
- Verify the staff member is actually on approved leave

### Not receiving notifications?
- Make sure you're logged in
- Check notifications panel (bell icon)
- Verify in database: `SELECT * FROM staff_notifications WHERE recipient_id = 'your-id'`

### Need more help?
See: `RESUMPTION_WORKFLOW_SETUP.md` or `VERIFICATION_CHECKLIST.md`

---

## Key Points

✓ **Automatic**: Starts when HR approves leave
✓ **No manual setup needed**: Just use the system
✓ **Red highlighting**: Visual cue for action needed
✓ **In-app notifications**: No external email service
✓ **Audit trail**: Every decision recorded
✓ **Escalation**: Auto-escalates after 5 days
✓ **No auth issues**: Works seamlessly with existing login
✓ **Backward compatible**: Old leave system still works

---

## Questions?

1. Check the relevant guide:
   - Staff: This document (QUICK_START.md)
   - HOD/RM: See "For HOD/RM" section above
   - HR: See "For HR Leave Office" section above
   - Admin: See `RESUMPTION_WORKFLOW_SETUP.md`

2. Run the test script:
   ```bash
   node scripts/test-resumption-workflow.js
   ```

3. Check the verification checklist:
   - See: `VERIFICATION_CHECKLIST.md`

---

## One Minute Demo

1. **Admin**: Run `node scripts/test-resumption-workflow.js` → All systems working ✓
2. **Staff**: Check in after leave ends → Red "Verify Resumption" button appears
3. **HOD/RM**: Click button → Modal opens → Add notes → Confirm
4. **HR**: Notification appears → Resume marked as confirmed ✓

Done!

---

**Status**: Production Ready ✅
