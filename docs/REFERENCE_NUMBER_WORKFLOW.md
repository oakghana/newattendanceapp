# Reference Number Workflow for Payment Advice Memos

## Overview

HR Leave Office staff now have a streamlined workflow to provide reference numbers to payment advice memos before sending them to HR Executive for approval. Reference numbers are critical for tracking and organizing payment advice by staff category.

## Feature Implementation

### 1. Enhanced UI Section - "Reference Numbers (by Staff Category)"

**Location**: Payment Advice Client → Create Payment Advice Tab
**Visual Design**: 
- Blue highlighted section (bg-blue-50 with blue-300 border)
- Clearly labeled as "REQUIRED Before Submission"
- Shows count of staff per category

**Key Elements**:
- Input field for each category (Manager, Senior, Junior)
- Completion indicator: Green "✓ Complete" vs Red "Required"
- Placeholder examples: `HR/PA/Manager/2026/07`
- Help text showing how many staff per category will use this reference number

### 2. Validation Before Submission

**Implementation**: 
```typescript
const missingReferences = requiredCategories.filter(
  (cat) => !referenceNumbers[cat]?.trim()
)

if (missingReferences.length > 0) {
  toast({
    title: "Error",
    description: `Please enter reference numbers for: ${missingReferences.join(", ")}`,
    variant: "destructive",
  })
  return
}
```

**Behavior**: 
- Prevents submission if any category with staff lacks a reference number
- Shows user-friendly error message with missing categories
- Toast notification guides user back to input fields

### 3. Confirmation Section Before HR Executive Submission

**Card**: "Confirm Reference Numbers Before Submission"
**Visual**: Amber background with AlertCircle icon
**Contents**:
- Lists all categories with staff
- Shows the reference number for each category
- Indicates if reference number is complete or "NOT PROVIDED"
- Explains that these will be included in all memos

### 4. Submit Button Enhancement

**Label**: "Submit All Memos to HR Executive"
**Additional Info in Loading State**: "Submitting to HR Executive..."
**Tooltip**: Explains reference numbers will be included
**Disabled State**: When submitting (shows loading spinner)

## Data Flow

```
1. HR Leave Office enters reference numbers
   ↓
2. System validates before submission
   ↓
3. Confirmation section displays reference numbers
   ↓
4. HR Leave Office clicks "Submit All Memos to HR Executive"
   ↓
5. API call includes referenceNumbers in payload
   ↓
6. Reference numbers stored in memo_body JSON
   ↓
7. Memos generated with reference numbers
   ↓
8. HR Executive receives memos with reference numbers visible
```

## Database Storage

**Location**: `payment_advice_memos` table
**Field**: `memo_body` (JSON)
**Data Structure**:
```json
{
  "referenceNumber": "HR/PA/Manager/2026/07",
  "month": "2026-07",
  "category": "Manager",
  "staff_rank_label": "Senior Officer",
  ...
}
```

## API Endpoint Changes

**Endpoint**: `/api/leave/payment-advice/submit-memo`
**Required Parameter**: `referenceNumbers` object
```typescript
{
  "referenceNumbers": {
    "Manager": "HR/PA/Manager/2026/07",
    "Senior": "HR/PA/Senior/2026/07",
    "Junior": "HR/PA/Junior/2026/07"
  }
}
```

## User Experience Flow

### For HR Leave Office User

1. **Create Payment Advice Tab**:
   - Select month and signers
   - Click "Detect Staff" to load staff on leave
   
2. **Enter Reference Numbers** (NEW):
   - Blue section appears showing staff by category
   - Input reference number for each category with staff
   - Fields show visual feedback (green for complete, red for missing)
   
3. **Review Before Submission** (NEW):
   - Amber confirmation section displays all reference numbers
   - User can verify they match their records
   
4. **Submit to HR Executive**:
   - Click "Submit All Memos to HR Executive"
   - System validates all reference numbers are provided
   - Memos are created with reference numbers embedded
   - HR Executive receives memos with reference numbers

### For HR Executive

- Receives memos with reference numbers in memo_body
- Can track approvals by reference number
- Reference numbers visible in generated PDF memos
- Can match back to staff categories and payment tracking

## Benefits

✅ **Data Tracking**: Reference numbers enable organized tracking of payments by category and period
✅ **Error Prevention**: Validation prevents incomplete submissions
✅ **Compliance**: Ensures all payment advice has proper documentation
✅ **Audit Trail**: Reference numbers provide clear linking between approvals and payments
✅ **User Guidance**: Clear UI instructions and visual feedback

## Example Reference Number Formats

Standard format recommended: `DEPARTMENT/TYPE/CATEGORY/YEAR/MONTH`

Examples:
- `HR/PA/Manager/2026/07` - HR Department, Payment Advice, Manager category, July 2026
- `HR/PA/Senior/2026/07` - HR Department, Payment Advice, Senior category, July 2026
- `HR/PA/Junior/2026/07` - HR Department, Payment Advice, Junior category, July 2026

Alternative formats accepted:
- `PA-MGR-2026-07`
- `PA/2026/07/MGR`
- `COCOBOD/PA/Manager/07-2026`

## Technical Notes

- Reference numbers are stored as strings in memo_body JSON
- No character limits enforced (but recommended max 50 chars)
- Used by memo generator to populate memos
- Can be customized by organization as needed
