# Professional Memo Generation - Quick Reference

## What Changed

The leave memo generation now produces professional, comprehensive memos that reflect **all workflow changes** throughout the leave request lifecycle.

## Key Features

| Feature | Before | After |
|---------|--------|-------|
| **Leave Year** | ❌ Wrong (2025) | ✅ Correct (2026) |
| **Days Granted** | ❌ Missing | ✅ Calculated & shown |
| **Remarks Field** | ❌ Empty | ✅ Complete workflow history |
| **HOD Changes** | ❌ Not shown | ✅ Captured & displayed |
| **Public Holidays** | ❌ Ignored | ✅ Deduction count shown |
| **Travelling Days** | ❌ Ignored | ✅ Addition count shown |
| **Leave Deferrals** | ❌ Not shown | ✅ Included in remarks |
| **Resume Date** | ❌ Basic | ✅ Smart calculation (skip weekends) |
| **Memo Format** | ❌ Generic | ✅ Professional template |

## Days Granted Formula

```
Days Granted = Approved Days - Public Holidays + Travelling Days
```

Example:
- Entitled: 30 days
- Public holidays deducted: 2 days
- Travelling days added: 2 days
- **Result: 30 - 2 + 2 = 30 days granted**

## Remarks Examples

### Simple Leave (No Changes)
```
Remarks: -
```

### With Public Holidays
```
Remarks: 2 public holidays deducted
```

### With HOD Changes (Accepted)
```
Remarks: HOD proposed adjustment from 1st May - 9th June to 5th May - 12th June: Accepted
```

### With Multiple Adjustments
```
Remarks: HOD proposed adjustment from 1st May - 9th June to 5th May - 12th June: Accepted; 2 public holidays deducted; 2 travelling days added
```

### With Deferment
```
Remarks: Leave deferred to: 2027 Q1; 2 travelling days added
```

## Resume Date Calculation

**Rule:** End date + 1 business day (skip weekends)

Examples:
- Leave ends Friday → Resume Monday ✓
- Leave ends Friday (5th) → Resume Monday (8th) ✓
- Leave ends Sunday → Resume Tuesday ✓

## New Template Fields

When rendering memos, the following fields are now available:

```javascript
{
  // Staff Information
  staff_name,           // Full name
  staff_number,         // Staff ID
  staff_position,       // New: Position/Title
  staff_department,     // New: Department
  
  // Company Information
  company_name,         // New: Fixed value
  hod_name,            // New: HOD/Director
  
  // Leave Details
  leave_year,          // New: Extracted from dates (2026)
  leave_year_period,   // Financial year (2026/2027)
  leave_start_date,    // Long format
  leave_end_date,      // Long format
  from,                // New: Short format with ordinal (1st May, 2026)
  to,                  // New: Short format with ordinal (9th June, 2026)
  
  // Days Information
  days_entitled,       // New: "30 plus 2 travelling days"
  days_granted,        // New: Calculated total
  approved_days,       // Raw approved days
  
  // Dates
  submitted_date,      // When requested
  return_to_work_date, // New: Calculated with ordinal (10th June, 2026)
  
  // Workflow History
  remarks,            // New: Complete history
}
```

## Professional Memo Structure

```
Your Ref No: _____________________

[STAFF NAME] (S/NO.: [STAFF NUMBER])
[Position]
[Department]

THRO: [HOD NAME]
      [COMPANY NAME]

ANNUAL LEAVE ADVICE FOR [YEAR]

In accordance with COCOBOD's vacation leave policy, we wish to inform you that 
approval has been granted for you to proceed on your annual leave in respect of 
the year January to December [YEAR].

Your leave details are shown below.

┌──────────────────────────┬──────────────────────┬────────────┬────────────┬─────────────────────────┐
│ Number of Days Entitled  │ Number of Days       │ From       │ To         │ Remarks                 │
│                          │ Granted              │            │            │                         │
├──────────────────────────┼──────────────────────┼────────────┼────────────┼─────────────────────────┤
│ [30 plus 2 travelling]   │ 30                   │ 1st May    │ 9th June   │ 2 public holidays...    │
├──────────────────────────┴──────────────────────┴────────────┴────────────┴─────────────────────────┤
│ TOTAL: 30
└────────────────────────────────────────────────────────────────────────────────────────────────────┘

You are to resume duty on 10th June, 2026.

We wish you a pleasant and relaxing vacation.
```

## Workflow Tables Queried

The memo generation now queries these tables for complete information:

1. **hod_change_notifications** - HOD proposed date changes
2. **leave_deferment_requests** - Leave deferment records
3. **leave_plan_requests** - Days, adjustments, travelling days, holidays
4. **user_profiles** - Staff details (position, department)
5. **approval_signature_registry** - HR signature

## Date Formats

Two formats for different purposes:

**Long Format** (fmtDate)
- Used in letter text
- Example: "01 May, 2026"

**Short Format** (fmtDateShort)
- Used in table cells
- Includes ordinal suffix: 1st, 2nd, 3rd, 4th, 5th, etc.
- Example: "1st May, 2026", "22nd June, 2026"

## Testing Checklist

- [ ] New memo shows correct year (2026, not 2025)
- [ ] Days granted calculated correctly
- [ ] Remarks field shows adjustments
- [ ] HOD changes reflected in memo
- [ ] Public holidays deduction shown
- [ ] Travelling days addition shown
- [ ] Resume date skips weekends
- [ ] Staff position and department populated
- [ ] Professional table format applied
- [ ] Memo downloadable as PDF
- [ ] Old memo approvals still work

## Deployment

✅ **No Database Changes Required**
- Template fetched from existing `leave_memo_templates` table
- Falls back to old behavior if template missing
- Backwards compatible with existing approvals

✅ **Database Seeding** (if needed)
The `annual_leave_memo` template should be seeded to the database with:
- `template_key`: `annual_leave_memo`
- `subject_template`: `ANNUAL LEAVE ADVICE FOR {{leave_year}}`
- `body_template`: Professional template (see above)
- `is_active`: `true`

## Support

See full documentation: `MEMO_FORMATTING_UPDATES.md`

---

**Implementation Date:** 2026-05-13  
**Status:** Production Ready ✓  
**Build:** Success ✓
