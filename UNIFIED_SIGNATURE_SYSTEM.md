# Unified Memo Signature System

## Overview
The application now uses a **single unified signature system** for all memo types (leave approval and payment advice). All signatures are stored in and fetched from the `approval_signature_registry` table.

## Architecture

### Signature Storage
- **Table**: `approval_signature_registry`
- **Key Fields**:
  - `user_id`: The HR Executive who owns this signature
  - `signature_data_url`: Base64-encoded PNG image of the signature
  - `workflow_domain`: "leave" or "loan"
  - `is_active`: Whether this signature is currently active
  - `updated_at`: When the signature was last updated

### Memo Types

#### 1. Leave Approval Memos
**Purpose**: Generated when a leave request is approved by HR
**Signer Resolution**:
```
1. Get leave_plan_requests record by ID
2. Extract hr_approver_id from the leave request
3. Query approval_signature_registry for that user_id
4. Fetch their saved signature image
5. Display in memo with their name and position from user_profiles
```

**API Route**: `/api/leave/planning/memo/[id]`
- `id` parameter is the `leave_plan_request` ID

#### 2. Payment Advice Memos
**Purpose**: Generated for payment processing of leave allowances
**Signer Resolution**:
```
1. Get leave_payment_memos record
2. Parse memo_body.selectedSigner (selected during submission)
3. Extract signer ID and check approval_signature_registry
4. Fetch their saved signature image
5. Display in memo with their selected name and position
```

**API Route**: `/api/leave/planning/memo/[id]`
- `id` parameter is the `leave_plan_request` ID (same route handles both types)

## Implementation Details

### Leave Memo Generation (`memo/[id]/route.ts`)
```typescript
// Priority order for signer resolution:
1. selectedSignerFromMemo?.selectedSigner (from leave_payment_memos)
2. memoBodyApprover?.approver (from leave_payment_memos)
3. leave_plan_requests.hr_approver_id (fallback for leave approval memos)

// For each signer ID:
- Fetch user_profiles for name and position
- Query approval_signature_registry for signature image
- Display in PDF with actual signature image
```

### Signature Display
- **Signature Image**: Base64 PNG from `signature_data_url`
- **Signer Name**: From `user_profiles.first_name + last_name`
- **Position**: From `user_profiles.position` or selected signer position
- **No Border Lines**: Only actual signature images displayed
- **Consistent Format**: All memos use identical signature rendering

## Benefits

✅ **Single Source of Truth**: All signatures stored in one table  
✅ **No Duplicates**: Signatures aren't stored multiple times  
✅ **Consistent Display**: Same signature format across all memo types  
✅ **Professional Look**: Real signature images instead of placeholder text  
✅ **Easy Maintenance**: Signature updates apply to all memo types automatically  
✅ **Role-Based**: Only HR Executives can be signers  
✅ **Audit Trail**: All signatures timestamped in registry  

## Status Indicators

### Approved Leave Memos Tab
- **✓ Approved & Signed**: Has `hr_approved_at` and signature in registry
- **✓ Approved**: Has `hr_approved_at` but no signature (still valid, might not be signed yet)

### Correct Behavior
- Only memos with status "approved" or "hr_approved" appear in Approved Memos tab
- Status shows actual approval state, not "Yet to Sign"
- Downloads always work and show proper signer information

## Testing Checklist

- [ ] Leave approval memos show HR approver's actual signature
- [ ] Payment advice memos show selected HR Executive's signature
- [ ] Both use signatures from `approval_signature_registry`
- [ ] Status badge shows "Approved" not "Yet to Sign"
- [ ] Downloads produce professional PDFs with signatures
- [ ] Only approved memos appear in Approved Memos tab
- [ ] Signature images are embedded in PDFs, not missing
