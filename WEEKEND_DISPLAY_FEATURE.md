# Weekend Display in Annual Leave Date Selection

## Overview
When staff members select their annual leave dates, the system now visually displays all weekends (Saturdays and Sundays) that fall within their selected date range. This helps staff understand exactly which non-working days are included and how the working day calculation is derived.

## Feature Details

### What's Displayed
**When staff selects start and end dates for annual leave:**

1. **Days Requested** - Total working days calculated (weekdays only)
2. **Return to Work Date** - The next working day after leave ends
3. **Weekends Section** - NEW:
   - Lists each Saturday and Sunday within the range
   - Shows date and day name (e.g., "Sat 15 May 2026")
   - Displays in formatted pills for easy scanning
   - Includes calculation summary explaining the breakdown

### Example
**Selected Period:** 12 May 2026 - 22 May 2026

**Display Shows:**
```
Days Requested: 9 working days

Weekends Within Selected Period (2 days):
[Sat 16 May 2026] [Sun 17 May 2026]

Your 9 working day(s) requested are calculated from 11 calendar day(s) 
minus these 2 weekend day(s).
```

## User Benefits
- **Transparency** - Staff see exactly which days are non-working
- **Clarity** - Understands the working day calculation methodology
- **Confidence** - Knows precisely what they're requesting
- **Accuracy** - Reduces confusion about leave duration

## Technical Implementation
- Located in: `/app/dashboard/leave-planning/leave-planning-client.tsx`
- Calculation: Pure client-side date math using `useMemo` hook
- Only displays for:
  - Annual leave requests (`leaveType === "annual"`)
  - When both start and end dates are selected
  - Live updates as staff changes dates

## Related Features
- **Holiday Calculations** - HR Leave Office adds public holidays during approval stage
- **Same-Month Conflict Check** - Prevents duplicate requests in same month
- **Annual Leave Year Validation** - Prevents multiple annual leaves in same leave year
- **Working Days Calculation** - `computeLeaveDays()` function in `/lib/leave-policy.ts`

## Future Enhancements
- Add public holidays to the display (when HR provides holiday data)
- Highlight overlapping dates with existing approvals
- Export detailed breakdown with PDF leave memo
