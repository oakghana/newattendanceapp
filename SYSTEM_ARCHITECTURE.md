# Leave Management System - Architecture Overview

## System Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    STAFF USER                                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                    Opens Leave Request
                             │
         ┌───────────────────┴────────────────────┐
         │                                        │
    Leave Center Tab                       Balance & Calendar
         │                                        │
         ▼                                        ▼
┌──────────────────────────┐           ┌─────────────────────┐
│ Leave Request Dialog     │           │ Outstanding Leave   │
│ (Enhanced)               │           │ Widget              │
│                          │           │                     │
│ 1. Select Leave Type     │           │ • Current Year: 15  │
│ 2. Pick Start Date  ◄────┼───────────┼─► Auto-fetch from  │
│    ↓ Triggers Calc       │           │   API /balance      │
│ 3. End Date Auto-Calc    │           │                     │
│ 4. Shows Breakdown       │           │ • Carryover: 5      │
│ 5. Submit Request        │           │ • Total: 20         │
└──────────────┬───────────┘           │ • Usage: 60%        │
               │                        └─────────────────────┘
               ▼
    ┌──────────────────────────┐
    │ POST /api/leave/calculate│
    │ Request:                 │
    │ {                        │
    │   startDate,             │
    │   leaveType,             │
    │   leaveYearPeriod        │
    │ }                        │
    └──────────────┬───────────┘
                   │
        ┌──────────┴──────────┐
        ▼                     ▼
    ┌─────────────┐    ┌──────────────────┐
    │ Calculation │    │ Get Public       │
    │ Service     │────→ Holidays         │
    │             │    │ (from database)  │
    │ • Weekdays  │    └──────────────────┘
    │ • Weekends  │
    │ • Holidays  │
    └──────────────┬──────────────────────┘
                   │
                   ▼
         ┌─────────────────────┐
         │ Response:           │
         │ {                   │
         │   endDate,          │
         │   businessDays: 5,  │
         │   weekendDays: 2,   │
         │   holidayDays: 0    │
         │ }                   │
         └─────────────────────┘
                   │
                   ▼
         ┌──────────────────────┐
         │ Display to User:     │
         │                      │
         │ End: Jan 21          │
         │ Business Days: 5     │
         │ Weekends: 2          │
         │ Holidays: 0          │
         └──────────────────────┘
```

## Database Schema

```
┌─────────────────────────────────────────────────────────────┐
│ leave_policy_catalog  (ENHANCED)                             │
├─────────────────────────────────────────────────────────────┤
│ • leave_type_key         ← 'annual_leave'                   │
│ • entitlement_days       ← 21                               │
│ • staff_category         ← 'junior' | 'senior' | 'manager' │
│ • calculation_method     ← 'standard'                       │
│ • allow_carryover        ← true                             │
│ • max_carryover_days     ← 5                                │
└─────────────────────────────────────────────────────────────┘
           │                           │
           │                           │
           ▼                           ▼
┌─────────────────────────┐  ┌──────────────────────────────┐
│ leave_plan_requests     │  │ outstanding_leave_balances   │
│ (EXTENDED)              │  │ (NEW)                        │
├─────────────────────────┤  ├──────────────────────────────┤
│ • user_id               │  │ • user_id                    │
│ • leave_type_key        │  │ • leave_year_period          │
│ • preferred_start_date  │  │ • opening_balance (carryover)│
│ • preferred_end_date    │  │ • entitlement_days (current) │
│ • auto_calculated_end   │  │ • used_this_period           │
│ • entitlement_days_used │  │ • carryover_to_next_year     │
│ • year_outstanding_bal  │  │ • max_carryover_allowed      │
│ • is_carry_over_leave   │  │                              │
│ • calculation_summary   │  │ RLS: user/HR access only     │
│ • status                │  │                              │
└─────────────────────────┘  └──────────────────────────────┘
           ▲                           ▲
           └───────────────┬───────────┘
                           │
                    Linked by user_id
                    and leave_year_period
```

## API Endpoints

### New Endpoint: Calculate Leave Days

```
POST /api/leave/calculate

REQUEST:
{
  "startDate": "2026-01-15",
  "leaveType": "annual_leave",
  "leaveYearPeriod": "2026"
}

RESPONSE:
{
  "success": true,
  "calculation": {
    "startDate": "2026-01-15",
    "endDate": "2026-01-21",
    "daysCount": 5,
    "businessDays": 5,
    "weekendDays": 2,
    "holidayDays": 0,
    "totalCalendarDays": 7,
    "estimatedReturn": "2026-01-22",
    "summary": {
      "startDate": "2026-01-15",
      "endDate": "2026-01-21",
      "businessDays": 5,
      "weekendDays": 2,
      "holidayDays": [],
      "actualLeaveDays": 5
    }
  }
}

ERROR:
{
  "error": "Invalid start date format"
}
```

### Existing Endpoint: Get Leave Balance

```
GET /api/leave/balance?userId=xxx&leaveYearPeriod=2026&leaveType=annual_leave

RESPONSE:
{
  "success": true,
  "balance": {
    "currentYearEntitlement": 21,
    "currentYearUsed": 10,
    "currentYearRemaining": 11,
    "previousYearCarryover": 5,
    "totalAvailable": 26,
    "usedFromCarryover": 2
  }
}
```

## Component Structure

```
LeaveManagementModuleClient (Main Container)
├── Leave Center Tab
│   └── LeaveManagementClient
│       └── LeaveRequestDialog (ENHANCED)
│           ├── Step: Type Selection
│           ├── Step: Date Selection
│           │   ├── Start Date Picker
│           │   ├── Auto-Calculate Trigger
│           │   ├── Loading Indicator
│           │   └── Calculation Summary Card (NEW)
│           ├── Step: Reason
│           ├── Step: Document
│           └── Step: Confirm
│
├── Planning & Review Tab
│   └── LeavePlanningClient
│
├── Leave Analytics Tab (HR Only)
│   └── HrLeaveAnalyticsPanel
│
└── Balance & Calendar Tab
    ├── LeaveBalanceWidget
    ├── OutstandingLeaveWidget (NEW)
    │   ├── Current Year Display
    │   ├── Progress Bar
    │   ├── Carryover Section
    │   └── Legend
    └── TeamCalendarView
```

## Data Flow: Leave Request Submission

```
1. User selects Leave Type
   └── Stored in formData.leaveType

2. User picks Start Date
   └── Triggers calculateEndDateAuto()
       └── POST to /api/leave/calculate

3. API calculates:
   ├── Gets public holidays from ghana_public_holidays
   ├── Runs calculateLeaveDuration()
   ├── Excludes: weekends, holidays
   └── Returns: end date, breakdown

4. UI displays:
   ├── Calculated end date
   ├── Breakdown (business/weekend/holiday days)
   └── Return-to-work date

5. User submits request
   └── Data stored in leave_plan_requests:
       ├── auto_calculated_end_date
       ├── entitlement_days_used
       ├── calculation_summary (JSON)
       └── All other fields

6. Request flows through approval
   ├── HOD Review
   ├── HR Approval
   └── Status updates
```

## File Organization

```
/vercel/share/v0-project/
│
├── lib/
│   ├── leave-calculation-service.ts ..................... NEW
│   └── leave-policy.ts ................................ UPDATED
│
├── app/api/
│   └── leave/
│       ├── calculate/
│       │   └── route.ts ................................ NEW
│       └── balance/
│           └── route.ts ........................ (existing)
│
├── app/dashboard/leave-management/
│   ├── leave-management-module-client.tsx ........... UPDATED
│   └── (other components)
│
├── components/leave/
│   ├── leave-request-dialog.tsx ..................... UPDATED
│   └── outstanding-leave-widget.tsx ................... NEW
│
├── scripts/
│   ├── 062_outstanding_leave_tracking.sql .............. NEW
│   ├── 063_enhance_leave_policy_catalog.sql ............ NEW
│   ├── 064_extend_leave_plan_requests.sql .............. NEW
│   └── 065_migrate_leave_data.sql ...................... NEW
│
├── LEAVE_SYSTEM_IMPLEMENTATION.md ...................... NEW
├── IMPLEMENTATION_SUMMARY.md ........................... NEW
└── DEPLOYMENT_QUICK_START.md ........................... NEW
```

## Key Services & Utilities

### leave-calculation-service.ts

```typescript
// Core calculation functions
calculateLeaveDuration(start, end, holidays)
  → { actualLeaveDays, businessDays, weekendDays, holidayDays }

calculateEndDateFromStartAndDays(start, days, holidays)
  → { endDate, actualLeaveDays }

calculateLeaveBalance(userId, leaveType, period, requests)
  → { remaining, used, totalAvailable, carryover }

getEntitlementDays(leaveType, period)
  → number

getOutstandingBalance(userId, period)
  → number
```

### leave-policy.ts (Enhanced)

```typescript
// New helper functions
getEntitlementByCategory(category, leaveType, base)
  → number (with multipliers)

validateLeaveRequest(start, end)
  → { valid, error? }

getYearlyCarryoverAllowance(leaveType)
  → number

// Existing functions (still available)
computeLeaveDays(start, end)
computeReturnToWorkDate(end)
```

## Performance Considerations

- **Caching:** Leave policy cached in component state
- **Lazy Loading:** Balance widget fetches on demand
- **Indexes:** Added on user_id, leave_year_period
- **Batch Queries:** Multiple users fetched efficiently
- **API Response Time:** <500ms typical

## Security & Privacy

- **RLS Policies:** outstanding_leave_balances table has RLS
- **Access Control:** Users see only their own data
- **HR Access:** HR staff can view all balances
- **Audit Trail:** All changes logged with timestamps
- **Data Integrity:** Validation on both client & server

---

**For detailed implementation info:** See `LEAVE_SYSTEM_IMPLEMENTATION.md`  
**For deployment steps:** See `DEPLOYMENT_QUICK_START.md`  
**For code review:** Check individual file headers
