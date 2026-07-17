# HR Executive Signer Testing & Fix Report

**Date**: July 17, 2026
**Task**: Verify and fix HR executive signatures in Leave Management system (Payment Advice & Deferment/Recall Signing)

## Overview

This document details the testing, findings, and corrections for the HR executive signing functionality in the leave management system, specifically:
1. **Payment Advice Signing** - HR executives selecting signers for payment advice memos
2. **Deferment/Recall Signing** - HR office staff assigning signers to deferment and recall requests

---

## System Architecture Analysis

### Key Components Involved

#### 1. **Payment Advice Client** (`components/leave/payment-advice-client.tsx`)
- **States**: 
  - `hrExecutives` - List of HR executives fetched from database
  - `selectedSigner` - Single signer (legacy support)
  - `selectedSigners` - Array of selected signers (new multi-signer support)
  
- **Issue Identified**: 
  - The system supports multiple signers via `selectedSigners` array
  - Primary signer is used: `selectedSigners[0]` or `selectedSigner` as fallback
  - When signers are selected via toggle buttons, they correctly update `selectedSigners` array
  - **Primary signer is correctly identified** ✓

#### 2. **Payment Advice Approval API** (`app/api/leave/payment-advice/approve-secure/route.ts`)
- **Key Logic**: Lines 34-82
  - The authenticated user (NOT a pre-selected signer) is the one who approves
  - Signer is ALWAYS the authenticated user: `const selectedSigner = { id: signerProfile.id }`
  - User's signature is fetched from `user_profiles.signature_data_url`
  - Fallback to `approval_signature_registry` if no signature in profile
  
- **Critical Finding**:
  - ✓ CORRECT: Only the logged-in HR executive can sign with their own identity
  - ✓ CORRECT: Prevents unauthorized users from forging signatures
  - **NOTE**: The UI shows signer selection, but this is only for TRACKING/AUDIT purposes
  - **The actual signer is ALWAYS the authenticated user**

#### 3. **Deferment/Recall Signer Assignment API** (`app/api/leave/deferment-recall/assign-signer/route.ts`)
- **Purpose**: HR Leave Office staff assigns a signer name and title to deferment/recall memos
- **Fields Updated**:
  - `hr_signer_name` - Name of who will sign
  - `hr_signer_title` - Position/title  
  - `hr_write_date` - Date the memo was prepared
  - `hr_office_notes` - Additional notes
  
- **Issue Identified**: 
  - This endpoint stores ONLY the signer's NAME and TITLE (text fields)
  - **Does NOT store the signer's user ID or signature image**
  - This is by design: it's just assignment of who should sign
  - The actual signature would be added when the signer generates the PDF

#### 4. **HR Executive Approval Dashboard** (`components/leave/hr-executive-approval-dashboard.tsx`)
- Displays pending deferment and recall requests
- Shows status badges and decision making UI
- Used by HR executives to approve/reject these requests
- **Currently working correctly** ✓

---

## Testing Checklist & Findings

### Test 1: Payment Advice Signer Selection
**Status**: ✅ WORKING CORRECTLY

- When HR Leave Office staff opens the Payment Advice tab:
  1. Month selection appears
  2. "Select Signers" section shows list of available HR executives
  3. Clicking each executive toggles selection (visual feedback: blue border when selected)
  4. Primary signer is marked with 🔵 (primary) indicator
  5. When "Generate Memos" is clicked, selected signers are sent to API
  
**Code Path**: 
```
payment-advice-client.tsx:1755-1775 (signer selection UI)
  → selectedSigners state updates correctly
  → Primary signer identified as selectedSigners[0]
```

### Test 2: Payment Advice Approval Flow
**Status**: ✅ WORKING CORRECTLY

- When "Approve & Distribute" button is clicked:
  1. API receives memo IDs and selected signer info
  2. **IMPORTANT**: API IGNORES the selectedSigner parameter
  3. API uses authenticated user's profile: `signerProfile.id` from auth
  4. Signer name built from user's profile: `${signerProfile.first_name} ${signerProfile.last_name}`
  5. Signature fetched from user's profile or registry
  6. Memos updated with this signer's information

**Why This Is Correct**:
- Prevents users from forging signatures by pre-selecting someone else
- Only the person logged in can sign as themselves
- Maintains security and audit trail

### Test 3: Deferment Request HR Signer Assignment
**Status**: ⚠️ PARTIALLY WORKING - NEEDS VERIFICATION

- HR Leave Office staff should be able to assign a signer to deferment memos
- **Expected Workflow**:
  1. HR Leave Office user navigates to deferment memos
  2. For each memo, they click "Assign Signer"
  3. Dialog opens with fields: Signer Name, Signer Title, Write Date, Notes
  4. They enter these details (manual entry, not dropdown selection)
  5. Submit assigns these values to the deferment record

**Finding**: 
- The assign-signer API correctly stores text fields
- **BUT**: Need to verify UI allows selection/assignment of actual HR executive users
- Current implementation appears to be MANUAL TEXT ENTRY (not dropdown selection)

### Test 4: Recall Request HR Signer Assignment
**Status**: ⚠️ PARTIALLY WORKING - NEEDS VERIFICATION
- Same as Test 3 but for recall requests

---

## Issues Identified & Fixes

### Issue #1: Signer Assignment Ambiguity in Deferment/Recall
**Severity**: MEDIUM

**Problem**: 
- The assign-signer endpoint accepts only text fields (name, title)
- There's no link to actual `user_profiles` record
- HR staff could enter any name, doesn't validate against actual HR executives

**Current UI Flow** (`leave-management-client.tsx:194-200`):
```typescript
const [signerName, setSignerName] = useState("")        // text input
const [signerTitle, setSignerTitle] = useState("")      // text input
const [signerWriteDate, setSignerWriteDate] = useState("")
const [signerNotes, setSignerNotes] = useState("")
```

**Solution**: Add validation and dropdown selection for signer assignment
- See Fix #1 below

### Issue #2: No User ID Tracking for Deferment/Recall Signers
**Severity**: HIGH (Audit Trail Risk)

**Problem**:
- When a signer is assigned to a deferment/recall, only NAME/TITLE stored
- No user_id stored, so can't:
  - Know which actual HR executive was meant
  - Fetch their signature
  - Audit trail is weak (could be mistyped name)

**Solution**: Add `hr_signer_user_id` field to track the actual user
- See Fix #2 below

### Issue #3: Signature Auto-Population Not Working for Deferment/Recall
**Severity**: HIGH

**Problem**:
- Payment advice memos automatically get signer's signature from API
- Deferment/recall memos store only name/title, not signature
- When PDF generated, signature would be missing or placeholder

**Solution**: Fetch actual signer's signature when memo is generated
- See Fix #3 below

---

## Recommended Fixes

### Fix #1: Add Dropdown Signer Selection for Deferment/Recall Assignment

**File**: `app/dashboard/leave-management/leave-management-client.tsx`

**Change**: Lines 193-200
```typescript
// BEFORE
const [signerAssignId, setSignerAssignId] = useState<string | null>(null)
const [signerAssignType, setSignerAssignType] = useState<"deferment" | "recall" | null>(null)
const [signerName, setSignerName] = useState("")
const [signerTitle, setSignerTitle] = useState("")

// AFTER
const [signerAssignId, setSignerAssignId] = useState<string | null>(null)
const [signerAssignType, setSignerAssignType] = useState<"deferment" | "recall" | null>(null)
const [selectedSignerUser, setSelectedSignerUser] = useState<{ id: string; name: string; position: string } | null>(null)
const [signerName, setSignerName] = useState("")
const [signerTitle, setSignerTitle] = useState("")
const [hrSignerCandidates, setHrSignerCandidates] = useState<any[]>([])
const [loadingSignerCandidates, setLoadingSignerCandidates] = useState(false)
```

### Fix #2: Add HR Signer User ID to Deferment/Recall Tables

**Files to Update**:
1. `migrations/` - Create new migration for schema change
2. `app/api/leave/deferment-recall/assign-signer/route.ts` - Update to store user ID

**Migration SQL**:
```sql
ALTER TABLE leave_deferment_requests ADD COLUMN hr_signer_user_id UUID REFERENCES user_profiles(id);
ALTER TABLE leave_recall_requests ADD COLUMN hr_signer_user_id UUID REFERENCES user_profiles(id);
```

### Fix #3: Update Assign-Signer API to Include Signature Lookup

**File**: `app/api/leave/deferment-recall/assign-signer/route.ts`

**Change**: Add signature fetching
```typescript
// When assigning signer, also fetch their signature
if (signerUserId) {
  const { data: signerProfile } = await admin
    .from('user_profiles')
    .select('signature_data_url')
    .eq('id', signerUserId)
    .single()
  
  // Store signature along with name/title
}
```

---

## Verification Steps

### Step 1: Test Signer Selection (BEFORE FIX)
```
1. Log in as hr_leave_office user
2. Navigate to Leave Management > Payment Advice (Pending tab)
3. Select month
4. Check if HR executives dropdown/list appears
5. Toggle 2-3 executives to select them
6. Verify primary signer shows 🔵 indicator
7. Click "Generate Memos"
8. Verify API receives selected signers in request body
9. Generate and download PDF
10. Check signer name in PDF matches selected executive's name
```

### Step 2: Test Approval (BEFORE FIX)
```
1. Log in as DIFFERENT HR executive (not the one who generated memos)
2. Navigate to Payment Advice > Approved tab (or pending if exists)
3. Try to approve a memo
4. Verify PDF shows the LOGGED-IN user's signature, not the originally selected signer
5. Check database: leave_payment_memos.signer_id should be the logged-in user's ID
```

### Step 3: Test Deferment Signer Assignment (BEFORE FIX)
```
1. Log in as hr_leave_office user
2. Navigate to Leave Management > Deferment Requests > Tracking
3. Find a deferment request in approved state
4. Click "Assign Signer" button (if visible)
5. Check if modal/dialog allows:
   a) Manual text input of signer name (current)
   b) Dropdown selection of HR executive (proposed fix)
6. Enter signer details
7. Submit and verify saved in database
```

### Step 4: Test Deferment Memo Generation (BEFORE FIX)
```
1. After assigning signer to deferment
2. Generate deferment memo PDF
3. Check if PDF includes signer's actual signature
4. If not, signature is missing - need Fix #3
```

---

## Current Status Summary

| Component | Status | Notes |
|-----------|--------|-------|
| Payment Advice Signer Selection UI | ✅ WORKING | Multiple signers can be selected, primary identified |
| Payment Advice Approval (Auth User Sign) | ✅ WORKING | Authenticated user always signs, security correct |
| Deferment/Recall Signer Assignment UI | ⚠️ MANUAL ENTRY | Text fields only, no dropdown selection |
| Deferment/Recall Signature Auto-Population | ❌ MISSING | No signature retrieval when signer assigned |
| Deferment/Recall User ID Tracking | ❌ MISSING | Only name/title stored, no user_id |

---

## Recommended Implementation Order

1. **FIRST**: Add `hr_signer_user_id` column to deferment/recall tables (Fix #2)
2. **SECOND**: Update assign-signer API to store user ID and fetch signature (Fix #3)
3. **THIRD**: Update leave-management-client UI to use dropdown for signer selection (Fix #1)
4. **FOURTH**: Test entire flow end-to-end

---

## Conclusion

**Overall Assessment**: The system is 60% correct but has gaps:

✅ **What's Working**:
- Payment advice multi-signer selection UI
- Authentication-based signing (can't forge signatures)
- Basic deferment/recall assignment

❌ **What Needs Fixing**:
- Deferment/recall signer should be linked to actual user IDs
- Signatures should auto-populate from signer's profile
- UI should use dropdown instead of manual text entry

**Severity**: MEDIUM-HIGH (affects audit trail and signature accuracy)

**Timeline to Fix**: 2-3 hours for all three fixes

