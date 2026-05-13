# Annual Leave Validation & Holiday/Weekend Calculations

## 1. Preventing Duplicate Annual Leave in Same Year

### Problem Identified
The system was allowing staff to submit **multiple annual leave requests for the same leave year (e.g., 2026/2027)**, which violates organizational planning requirements.

### Solution Implemented
Added comprehensive validation to prevent duplicate annual leave in the same leave year period.

### Technical Details

**New Function**: `findAnnualLeaveInSameYear()` (added to `/app/api/leave/planning/route.ts`)

```typescript
async function findAnnualLeaveInSameYear(
  admin: any,
  userId: string,
  leaveYearPeriod: string,
  excludeRequestId?: string,
)
```

This function:
- Searches for existing annual leave requests by the same user
- Filtered to the same leave year period (e.g., "2025/2026")
- Only checks active/pending statuses (not archived or rejected)
- Excludes the current request being edited
- Returns the conflicting request if found

**Validation Points**:
1. **New Leave Submission** (POST endpoint, line ~1115)
   - After all other checks pass
   - Only for `leave_type_key === "annual"`
   - Returns HTTP 409 with error code: `ANNUAL_LEAVE_ALREADY_SUBMITTED_IN_YEAR`

2. **Edit Existing Leave** (PUT endpoint, line ~1415)
   - When staff edits a pending annual leave request
   - Ensures changing dates doesn't create duplicates
   - Excludes current request from duplicate check

**Error Response Example**:
```json
{
  "error": "You already have an annual leave request for 2025/2026 (2025-07-01 to 2025-08-05) with status: pending_hod_review. Only one annual leave request is allowed per leave year.",
  "code": "ANNUAL_LEAVE_ALREADY_SUBMITTED_IN_YEAR",
  "existing": {
    "id": "uuid...",
    "status": "pending_hod_review",
    "leave_year_period": "2025/2026",
    "start_date": "2025-07-01",
    "end_date": "2025-08-05",
    "submitted_at": "2025-05-12T10:30:00Z"
  }
}
```

### Workflow Impact
- **Staff**: Cannot submit second annual leave in same year
- **HOD/Regional Manager**: Cannot edit dates to circumvent the rule
- **HR Leave Office**: Can still work with the existing annual leave request

---

## 2. Holiday & Weekends Calculation - Behind the Scenes

### Current Implementation Status

**YES - Holiday and weekend calculations ARE happening**, but at different stages:

#### Stage 1: Submission (Read-Only Display)
- **File**: `/app/dashboard/leave-planning/leave-planning-client.tsx`
- **What happens**: 
  - Calculates calendar days selected
  - Subtracts weekends automatically
  - Shows "Working Days" to staff
  - **No holidays are deducted here** (staff sees full working days)

#### Stage 2: HOD Review (Optional Adjustment)
- **File**: `/app/dashboard/leave-management/leave-management-client.tsx`
- **What happens**:
  - HOD can see the working days calculated
  - Optional: Can add travelling days if approved
  - Can suggest date adjustments
  - **No holiday deduction at this stage**

#### Stage 3: HR Leave Office Approval (FINAL Calculation)
- **Files**: 
  - `/app/api/leave/planning/hr-approve/route.ts`
  - `/app/dashboard/leave-planning/leave-planning-client.tsx` (line ~1735)
- **What happens**:
  - HR Office can now **deduct public holidays** that fall within the leave period
  - Formula: `finalDays = baseDays - holidayDeducted - priorDeducted + travelAdded`
  - Example:
    - Staff selected: 12 May - 22 May (11 calendar days)
    - System calculates: 9 working days (minus 2 weekends)
    - HR finds 1 public holiday (e.g., Independence Day)
    - **Final approved: 8 days** (9 - 1 holiday)

### Database Fields Tracking Calculations
In `leave_plan_requests` table:

| Field | Purpose | Set At |
|-------|---------|--------|
| `requested_days` | Calendar days requested by staff | Submission |
| `entitlement_days` | Annual leave entitlement for leave year | Submission |
| `original_requested_days` | Requested days before adjustments | Submission |
| `adjusted_days` | Final days after HR adjustments | HR Approval |
| `holiday_days_deducted` | Public holidays within leave period | HR Approval |
| `travelling_days_added` | Travelling days added by HR | HR Approval |
| `prior_leave_days_deducted` | Days deducted from previous requests | HR Approval |
| `adjusted_start_date` | Start date if adjusted | HR Approval |
| `adjusted_end_date` | End date if adjusted | HR Approval |

### Three-Stage Calculation Summary

```
STAGE 1 (STAFF SUBMISSION):
─────────────────────────
Calendar Days (12 May - 22 May)
         ↓
Subtract Weekends → 9 Working Days (shown to staff)


STAGE 2 (HOD REVIEW):
────────────────────
- HOD endorses or suggests date changes
- No calculation changes


STAGE 3 (HR OFFICE APPROVAL):
─────────────────────────────
Working Days = 9
    ↓
- Deduct Public Holidays = -1 (Independence Day falls within leave)
- Add Travelling Days = +0 (none approved)
- Deduct Prior Deductions = 0 (none)
    ↓
FINAL APPROVED DAYS = 8
```

### Where Holiday Data Comes From

**Currently**: Holidays are inputted manually by HR Leave Office during approval stage
- No automatic holiday detection from database
- HR must know which dates are public holidays
- HR manually enters `holiday_days_deducted` value

**Future Enhancement Needed**:
- Create `public_holidays` table with Ghana holidays
- HR Admin enters holidays once per year (before leave period starts)
- System automatically detects holidays within selected leave dates
- Provides immediate feedback to staff during submission

### Leave Memo Generation
When leave is approved, the memo includes the calculation breakdown:

```
"Memo References:
- Calendar Days Requested: 11 (12 May 2026 - 22 May 2026)
- Public Holidays Deducted: 1 day
- Travelling Days Added: 0 days
- Final Approved Leave Days: 8 working days
- You are expected to return to work on: 23 May 2026"
```

---

## Implementation Checklist

### Completed ✅
- [x] Annual leave year duplicate prevention
- [x] Holiday/weekend calculation in 3 stages
- [x] Manual holiday deduction by HR Leave Office
- [x] Adjustment tracking (holidays, travelling days, prior deductions)
- [x] Leave memo generation with calculation details

### Recommended Future Enhancements
- [ ] Create `public_holidays` table with Ghana holidays
- [ ] Let HR Admin input holidays once per year before leave season
- [ ] Auto-detect holidays during staff submission (show real-time calculation)
- [ ] Email notifications showing final approved days
- [ ] Mobile app showing leave balance after adjustments

---

## Testing the Annual Leave Validation

### Test Case 1: Prevent Second Annual Leave Same Year
```
1. Staff submits annual leave: 12 May - 22 May 2025 (Year: 2025/2026)
   ✓ ALLOWED - First annual leave for the year
   
2. Staff tries to submit another: 01 Jul - 10 Jul 2025 (Year: 2025/2026)
   ✗ BLOCKED - Error: "You already have an annual leave request for 2025/2026"
```

### Test Case 2: Allow Different Leave Types Same Month
```
1. Staff submits ANNUAL leave: May 2025
   ✓ ALLOWED
   
2. Staff submits CASUAL leave: May 2025  
   ✓ ALLOWED - Different leave type, same month is OK
   
3. Staff submits another ANNUAL leave: June 2025
   ✗ BLOCKED - Annual leave already submitted for 2025/2026 year
```

### Test Case 3: Holiday Deduction During Approval
```
Leave Period: 12 May - 22 May 2026 (11 calendar days)
Weekends: 2 days (sat + sun)
Working Days: 9 days

HR Leave Office Review:
- Finds Independence Day (19 May) falls within period
- Enters: holiday_days_deducted = 1
- Final Days = 9 - 1 = 8 days approved
✓ Leave memo shows: "8 working days approved"
```
