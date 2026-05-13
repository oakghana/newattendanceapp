# Leave Year Format & HOD Changes UI Updates

## Changes Made

### 1. Leave Year Period Format Update
**File:** `app/dashboard/leave-planning/leave-planning-client.tsx`

Changed the leave year period dropdown from range format (e.g., "2025/2026") to individual year format (e.g., "2026", "2027", "2028", etc.).

**Before:**
```
2025/2026, 2026/2027, 2027/2028, ...
```

**After:**
```
2026, 2027, 2028, 2029, 2030, ...
```

**Implementation:** Modified `getLeaveYearPeriodOptions()` function to generate single-year values instead of year ranges.

### 2. HOD Changes Request UI Enhancement
**File:** `app/dashboard/leave-management/leave-management-client.tsx`

Added interactive action buttons for staff to respond to HOD/RM date change proposals in the LeaveRequestCard component.

#### Key Features:

**Status Badge:** 
- Shows "HOD Changes Requested" badge with amber color when HOD changes are pending
- Provides clear visual indication of pending manager changes

**Action Buttons:**
- **Accept Changes** (Green): Staff agrees to HOD/RM proposed dates
- **Counter-Propose** (Outline): Staff suggests alternative dates back to manager

**Card Styling:**
- HOD changes requests display with amber background (distinct from pending/approved)
- Color-coded status for quick visual scan

#### How It Works:

1. **HOD/RM makes changes** → Request status becomes `hod_changes_requested`
2. **Staff sees card with action buttons** in their "My Requests" tab
3. **Staff clicks "Accept Changes"** → Changes are accepted and request proceeds to HR
4. **Staff clicks "Counter-Propose"** → Opens change dialog to propose different dates back to HOD/RM

### Search Field (Already Implemented)

The leave type search field is already integrated at the top of the leave type selection dropdown, allowing staff to search for leave types instead of seeing a full list.

---

## Build Status
✓ **Compiled successfully** - All changes deployed with zero errors

## Testing Checklist

- [ ] Leave year period dropdown shows 2026, 2027, 2028 format
- [ ] HOD changes request cards display with amber badge
- [ ] "Accept Changes" button is green and functional
- [ ] "Counter-Propose" button opens change proposal dialog
- [ ] Toast notifications show for staff actions
- [ ] Changes are properly stored in database
