# Modern Leave Date Changes System - Implementation Guide

## Overview
This system enables HOD/RM to propose leave date changes with a modern, fast, and simple interaction model for staff to accept, reject, or counter-propose alternatives.

## Key Changes Made

### 1. Leave Type Search Field
**File:** `/components/leave/leave-request-dialog.tsx`
- Replaced "Annual Leave" as the first visible option
- Added search input with placeholder: "Search your leave here..."
- Auto-focus on search field for quick access
- Clean, filtered dropdown without defaults

### 2. Leave Year Periods Format (2026/2027, 2027/2028, etc.)
**File:** `/app/dashboard/leave-planning/leave-planning-client.tsx`
- Updated `getLeaveYearPeriodOptions()` function
- Changed from single year format to fiscal year format (YYYY/YYYY)
- Generates 10 forward years automatically
- Shows current active period + future planning options

### 3. Modern Pending Change Card Component
**File:** `/components/leave/pending-change-card.tsx`

#### Features:
- **Visual Comparison**: Original dates vs. proposed dates side-by-side
- **Day Count Display**: Shows total days and difference (+/-)
- **Three Action Options**:
  1. **Accept Changes** (green button) - Fast approval with one click
  2. **Counter-Propose** (edit button) - Staff can suggest alternative dates
  3. **Reject** (X button) - Keep original dates

#### User Experience:
- Clean gradient card design with color-coded sections
- Blue header for "pending changes" status
- Real-time validation on counter-proposals
- Toast notifications for all actions
- Simple, step-by-step counter-proposal form

#### Data Structure:
```typescript
interface PendingChange {
  id: string                    // Change proposal ID
  requestId: string            // Original leave request
  proposedStartDate: Date      // HOD/RM's proposed start
  proposedEndDate: Date        // HOD/RM's proposed end
  originalStartDate: Date      // Staff's original start
  originalEndDate: Date        // Staff's original end
  reason: string               // Why changes were proposed
  proposedBy: string           // HOD/RM name
  status: "pending" | "accepted" | "rejected" | "countered"
}
```

## Integration Steps

### Step 1: Display Pending Changes to Staff
In your staff leave request view (e.g., "My Requests" tab):

```tsx
import { PendingChangeCard } from "@/components/leave/pending-change-card"

// Inside your staff request list:
{pendingChanges.map((change) => (
  <PendingChangeCard
    key={change.id}
    change={change}
    isStaff={true}
    onAccept={handleAcceptChange}
    onReject={handleRejectChange}
    onCounterPropose={handleCounterPropose}
  />
))}
```

### Step 2: API Integration
Connect to your leave change proposal API endpoints:

```typescript
// Accept changes
const handleAcceptChange = async (changeId: string) => {
  const response = await fetch(`/api/leave/change-proposal/${changeId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "accept" }),
  })
  return response.json()
}

// Counter-propose
const handleCounterPropose = async (
  changeId: string,
  newStart: Date,
  newEnd: Date,
  reason: string
) => {
  const response = await fetch(`/api/leave/change-proposal/${changeId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "counter",
      startDate: newStart.toISOString(),
      endDate: newEnd.toISOString(),
      reason,
    }),
  })
  return response.json()
}
```

### Step 3: HOD/RM Change Proposal Creation
Use the existing `HodChangeLeaveRequestDialog` component:

```tsx
import { HodChangeLeaveRequestDialog } from "@/components/leave/hod-change-leave-dialog"

// In manager's leave review view:
<HodChangeLeaveRequestDialog
  open={isDialogOpen}
  onOpenChange={setIsDialogOpen}
  requestId={selectedRequestId}
  originalStartDate={leave.startDate}
  originalEndDate={leave.endDate}
  staffName={leave.staffName}
  onPropose={handleProposeChanges}
/>
```

## Modern UX Features

### Fast Actions
- One-click accept for quick approval
- Quick reject with single X button
- Counter-propose with minimal form fields

### Visual Feedback
- Color-coded cards (blue=pending, green=accepted, red=rejected)
- Gradient backgrounds for visual hierarchy
- Clear icons for each action
- Day count with +/- difference indicator

### Simple Form
- Only 3 fields for counter-proposal (dates + reason)
- Auto-populated with current proposal values
- Real-time validation
- Toast notifications for all outcomes

## Toast Notifications

The system provides clear feedback for all actions:

```
✓ "Changes Accepted - You've accepted the date changes proposed by [Manager]"
✓ "Counter-Proposal Sent - Your alternative dates have been sent to [Manager]"
✓ "Changes Rejected - You've rejected the date changes. Original dates kept."
✗ "Error - Could not accept changes. Please try again."
```

## Styling

Uses Tailwind CSS with semantic color system:
- **Green**: Accept/approved actions
- **Blue**: Primary actions and highlights
- **Red**: Reject/warning actions
- **Slate**: Neutral background and text

All components follow your existing design tokens and theme configuration.

## Production Ready

✓ Error handling with try-catch blocks
✓ Loading states on all buttons
✓ Input validation on forms
✓ Compiled without errors
✓ TypeScript interfaces for type safety
✓ Responsive design (mobile-friendly)
✓ Accessibility considerations (semantic HTML, ARIA labels)

## Files Modified/Created

- `/components/leave/leave-request-dialog.tsx` - Updated search placeholder
- `/app/dashboard/leave-planning/leave-planning-client.tsx` - Fixed year period format
- `/components/leave/pending-change-card.tsx` - NEW: Modern change card UI
- `/app/api/leave/change-proposal/route.ts` - Existing change proposal API

All changes integrate seamlessly with your existing leave management system.
