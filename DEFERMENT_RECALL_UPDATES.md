# Deferment & Recall Request Updates

## Overview
Complete implementation of deferment and recall request processing with role-based permissions and business rule validation.

## Key Changes

### 1. Role-Based Permissions
**Allowed Roles for Deferment/Recall:**
- Staff
- HOD (Head of Department)
- RM (Regional Manager)
- HR Leave Office
- HR Executive
- Director/Admin

**Implementation:**
- `/app/api/leave/deferment/route.ts` - Role validation on POST
- `/app/api/leave/recall/route.ts` - Role validation on POST
- Normalized role matching: converts hyphens and spaces to underscores for consistent comparison

**Error Handling:**
```
"Deferment can only be initiated by Staff, HOD, RM, HR Leave Office, or HR Executive. Your role: [role]"
```

### 2. Two-Year Deferment Limit
**Business Rule:**
- Deferment cannot exceed two calendar years from the original leave year
- Prevents indefinite deferment of leave entitlements

**Validation Logic:**
```typescript
const yearsToDefer = requestedDefermentYear - leaveYear
if (yearsToDefer > 2) {
  error: "Deferment cannot exceed two calendar years..."
}
```

**Example:**
- Leave year: 2025
- Maximum deferment allowed: 2027 (2 years)
- Invalid deferment: 2028 or later (exceeds 2 years)

### 3. Process Request Button (HR Leave Office)
**Feature:**
- "⚡ Process Request" button appears on pending deferment/recall requests
- Only visible to HR Leave Office staff
- Clicking expands an assignment interface to select HR Executive

**Workflow:**
1. HR Leave Office staff clicks "Process Request"
2. Form expands showing HR Executive dropdown
3. Selects desired HR Executive
4. Clicks "Confirm & Forward" to assign
5. Request forwarded to HR Executive's queue

### 4. Component Changes
**File:** `/components/leave/deferment-recall-tracker.tsx`
- Removed debug logging (console.log statements)
- Cleaned up button onClick handlers
- Fixed state management for expandable sections
- Process Request button properly updates `expandedId` state

## API Endpoints

### Deferment Creation
**POST** `/api/leave/deferment`

**Request Body:**
```json
{
  "leave_plan_request_id": "uuid",
  "deferral_year": "YYYY",
  "reason": "string",
  "user_id": "uuid",
  "user_role": "string"
}
```

**Validations:**
- User role must be in allowed list
- Deferral year must be YYYY format
- Original leave must be approved
- Deferral year cannot exceed original year + 2

### Recall Creation
**POST** `/api/leave/recall`

**Request Body:**
```json
{
  "leave_plan_request_id": "uuid",
  "recall_date": "YYYY-MM-DD",
  "reason": "string",
  "user_id": "uuid",
  "user_role": "string"
}
```

**Validations:**
- User role must be in allowed list
- Recall date must be YYYY-MM-DD format
- Recall date must be before leave end date
- Leave must not have already ended

## Testing Checklist

- [ ] Test deferment with each allowed role (Staff, HOD, RM, HR Leave Office, HR Executive)
- [ ] Test deferment rejection with disallowed role (e.g., regular user)
- [ ] Test two-year limit validation (e.g., leave in 2025, try to defer to 2028 → should fail)
- [ ] Test Process Request button visibility (only shows for HR Leave Office staff with pending requests)
- [ ] Test Process Request button functionality (clicking expands form, shows HR Executive dropdown)
- [ ] Test recall with each allowed role
- [ ] Test recall rejection with disallowed role
- [ ] Verify error messages are clear and helpful

## Files Modified

1. `/app/api/leave/deferment/route.ts` - Added role validation and two-year limit
2. `/app/api/leave/recall/route.ts` - Extended role permissions
3. `/components/leave/deferment-recall-tracker.tsx` - Removed debug logging, cleaned up buttons

## Future Enhancements

- Add audit logging for all deferment/recall actions
- Implement email notifications when requests are processed
- Add bulk deferment/recall operations for HR
- Create dashboard analytics for deferment/recall trends
- Add memo generation for approved deferments/recalls
