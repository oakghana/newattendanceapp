# Approved Memo Prevention Feature

## Overview

This feature prevents HR Leave Office users and other staff from accidentally generating duplicate payment advice memos for a month that already has approved/signed memos in the system.

## Problem Solved

Previously, users could:
1. Generate payment advice memos for a month
2. Get them signed/approved
3. Later, forget they already generated them
4. Generate duplicate memos for the same month
5. Result: Multiple payment advice documents for the same staff and month in the system

This created confusion, audit trail issues, and potential for double payments.

## Solution

When an HR Leave Office user selects a month for payment advice:

1. **Automatic Check**: The system checks if approved memos already exist for that month
2. **Approved Memos Alert**: If approved memos exist, a prominent green alert card is displayed showing:
   - All approved memos for that month
   - Staff names and memo IDs
   - Status (Approved)
   - Generation date
3. **Button Disabled**: The "Generate Professional Memos" button becomes disabled
4. **Clear Instructions**: Users see a message directing them to select a different month or check the Monthly Summary tab

## Technical Implementation

### New Component State

```typescript
// Check for approved memos in the selected month
const [approvedMemosForMonth, setApprovedMemosForMonth] = useState<any[]>([])
const [loadingApprovedMemosForMonth, setLoadingApprovedMemosForMonth] = useState(false)
const [hasApprovedMemosForMonth, setHasApprovedMemosForMonth] = useState(false)
```

### Automatic Detection (useEffect)

When user changes the selected month:
```typescript
useEffect(() => {
  if (!isHrLeaveOffice || !selectedMonth) return
  
  // Checks /api/leave/payment-advice/my-memos?month={selectedMonth}
  // Filters for memos with status === "approved"
  // Updates UI accordingly
}, [isHrLeaveOffice, selectedMonth])
```

### UI Changes

**When approved memos exist:**
- Green alert card displays all approved memos
- Generate button is disabled with tooltip
- Button text changes to "Memos Already Generated for This Month"
- Card includes note directing to Monthly Summary tab

**When no approved memos:**
- Normal workflow continues
- Generate button is enabled
- Create Payment Advice section displays normally

## User Experience Flow

### Scenario 1: First time generating for a month
1. User selects month (e.g., July 2026)
2. System checks for approved memos - none found
3. User can proceed normally
4. Generates memos, gets them approved

### Scenario 2: Attempting to generate again for same month
1. User selects same month (July 2026)
2. System detects approved memos exist
3. Green alert shows existing approved memos
4. Generate button is disabled
5. User is prompted to select different month or view in Summary tab

### Scenario 3: Generating for a different month
1. User selects new month (August 2026)
2. System checks - no approved memos found
3. Generate button re-enables
4. User can proceed with new month

## Data Flow

1. **Month Selection Change** → Triggers useEffect
2. **API Call**: `/api/leave/payment-advice/my-memos?month={selectedMonth}`
3. **Filter Response**: Look for `status === "approved"`
4. **Update State**: Set `hasApprovedMemosForMonth` and `approvedMemosForMonth`
5. **Re-render UI**: Show appropriate alert and disable/enable button

## API Endpoint Used

**GET** `/api/leave/payment-advice/my-memos?month={YYYY-MM}`

Returns:
```json
{
  "memos": [
    {
      "id": "memo-id",
      "staff_name": "John Doe",
      "status": "approved",
      "created_at": "2026-07-20T10:30:00Z"
    }
  ]
}
```

## Benefits

✅ **Prevents Duplicate Memos**: Stops accidental duplicate generation  
✅ **Clear Visibility**: Shows exactly which memos already exist  
✅ **Protects Data Integrity**: No double entries in audit trail  
✅ **User Guidance**: Clear prompts on how to proceed  
✅ **Non-Intrusive**: Only affects months with approved memos  
✅ **Easy Recovery**: Users can still select a different month  

## Testing

### Test Case 1: No Approved Memos
1. Select month with no previous memos
2. Verify Generate button is enabled
3. Verify alert card does NOT appear
4. Verify staff can be detected and memos generated

### Test Case 2: Approved Memos Exist
1. Generate and approve memos for a month
2. Select same month again
3. Verify green alert appears with memo details
4. Verify Generate button is disabled
5. Verify tooltip shows helpful message

### Test Case 3: Switch Months
1. Have approved memos for July
2. Select July - button should be disabled
3. Select August - button should be enabled
4. Verify alert changes as month changes

## Edge Cases

- **Draft Memos**: Only blocks approved memos, not drafts
- **Mixed Status**: Shows all approved, allows generation if some are rejected
- **Loading State**: Shows loading spinner while checking
- **Error Handling**: If check fails, allows generation (fail-safe)
- **No Permissions**: Check only runs for HR Leave Office role

## Future Enhancements

- Allow regenerating approved memos with user confirmation
- Add audit reason when overwriting memos
- Email notification when attempting duplicate generation
- Batch operations for multiple months
