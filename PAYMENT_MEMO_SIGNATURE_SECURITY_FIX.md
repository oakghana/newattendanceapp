# Payment Advice Memo Signature Security Fix

## Executive Summary

Payment advice memos were using **hardcoded signer information** instead of dynamically displaying the actual HR Executive who was assigned and approved each memo. This has been fixed to ensure accurate audit trails and proper signature handling.

## Issues Fixed

### 1. ❌ Hardcoded "FROM" Field
**Before**: Always showed "DEPUTY HUMAN RESOURCE MANAGER"
**After**: Shows the actual approver's position from their profile

### 2. ❌ Hardcoded Signature Title
**Before**: Always showed "HUMAN RESOURCE MANAGER" below signature
**After**: Shows the actual approver's position (e.g., "HR DIRECTOR", "HR MANAGER")

### 3. ❌ Wrong Signature Image
**Before**: Fetched signature based on `memo.signer_id` (could be outdated/incorrect)
**After**: Fetches signature based on who actually approved the memo

### 4. ❌ Missing Approver Information
**Before**: No way to know which specific HR Executive approved the memo
**After**: PDF clearly shows the approver's name and position

## Technical Implementation

### File Modified
`/app/api/leave/payment-advice/download/route.ts`

### Key Changes

#### 1. Approver Info Extraction (Lines 75-86)
```typescript
// Parse memo_body FIRST to extract approver information
let approverInfo: any = null
if (memo.memo_body) {
  try {
    const body = typeof memo.memo_body === "string" 
      ? JSON.parse(memo.memo_body) 
      : memo.memo_body
    approverInfo = body.approver || null  // Critical: Extract who approved
  } catch (e) {
    console.warn("[v0] Could not parse memo_body")
  }
}
```

**Why this matters**: The approval flow stores approver details in `memo_body.approver`:
```json
{
  "approver": {
    "id": "user-id-of-hr-executive",
    "name": "John Doe",
    "position": "HR DIRECTOR"
  }
}
```

#### 2. Dynamic Signer Name (Lines 92-96)
```typescript
// Use approver name if available (the person who actually approved)
if (approverInfo && approverInfo.name) {
  signerName = approverInfo.name  // "John Doe" instead of fallback
  console.log("[v0] Using approver info from memo body:", approverInfo)
}
```

#### 3. Smart Signature Fetching (Lines 98-137)
```typescript
// Priority 1: Use approver ID (who actually signed)
let approverId: string | null = null
if (approverInfo?.id) {
  approverId = approverInfo.id  // First choice: the person who approved
} else if (memo.signer_id) {
  approverId = memo.signer_id   // Fallback: stored signer
}

// Fetch from two sources:
if (!signatureUrl && approverId) {
  // 1. Check approval_signature_registry (signatures they've registered)
  const { data: signatureRecords } = await admin
    .from("approval_signature_registry")
    .select("id, signature_data_url, ...")
    .eq("user_id", approverId)
  
  // 2. If not found, check user_profiles.signature_data_url
  if (!signatureUrl && approverId) {
    const { data: userProfile } = await admin
      .from("user_profiles")
      .select("signature_data_url")
      .eq("id", approverId)
  }
}
```

#### 4. Dynamic FROM Field (Lines 182-184)
```typescript
// FROM field now uses the approver's actual position
const fromPosition = (approverInfo?.position || "HUMAN RESOURCE MANAGER").toUpperCase()
doc.text(fromPosition, margin + 15, y)
```

**Result**: PDF shows "FROM: HR DIRECTOR" instead of hardcoded "DEPUTY HUMAN RESOURCE MANAGER"

#### 5. Dynamic Signature Title (Lines 321-323)
```typescript
// Title below signature now reflects approver's position
const signerPosition = (approverInfo?.position || "HUMAN RESOURCE MANAGER").toUpperCase()
doc.text(signerPosition, margin, y)
```

**Result**: PDF shows correct title for whoever signed it

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│ HR LEAVE OFFICE: Submits Payment Advice Memo            │
│ Status: ready_for_review                                │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│ HR EXECUTIVE: Reviews and Approves Memo                 │
│ Backend stores in memo_body.approver:                   │
│ {                                                        │
│   "id": "user-id",                                       │
│   "name": "Jane Smith",                                  │
│   "position": "HR DIRECTOR"                             │
│ }                                                        │
│ Status: signed_by_hr_executive                          │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│ PDF DOWNLOAD REQUEST                                    │
│ GET /api/leave/payment-advice/download?memo_id=...     │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│ DOWNLOAD ENDPOINT                                       │
│ 1. Extract approverInfo from memo_body                  │
│ 2. Set signerName = approverInfo.name                  │
│ 3. Fetch signature using approverInfo.id               │
│ 4. Render PDF with:                                     │
│    - FROM: approverInfo.position                        │
│    - Signature: from approverInfo.id                    │
│    - Title: approverInfo.position                       │
│    - Name: approverInfo.name                            │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│ PDF GENERATED WITH CORRECT SIGNER INFO                  │
│ ✓ FROM: HR DIRECTOR (Jane Smith's position)            │
│ ✓ Signature: Jane's actual digital signature           │
│ ✓ Name: Jane Smith                                      │
│ ✓ Title: HR DIRECTOR (Jane's actual title)             │
└─────────────────────────────────────────────────────────┘
```

## Security Improvements

✅ **Accurate Audit Trail**
- Every memo now clearly shows who approved it
- Tracking which HR Executive signed each memo

✅ **Correct Signatures**
- Only the approver's actual signature is rendered
- Prevents signature mismatches or generic placeholders

✅ **Proper Position Display**
- Shows the approver's position at time of approval
- No more generic/hardcoded titles

✅ **Access Control Enforcement**
- Existing `approve-secure` route ensures only assigned signers can approve
- Download route just reflects what was already approved

✅ **Fallback Handling**
- If approver info missing, falls back to `memo.signer_name`
- If signature not found in registry, tries `user_profiles`
- Default fallback to "HUMAN RESOURCE MANAGER" if all else fails

## Testing Verification

To verify the fix is working:

1. **Submit Memo** (as HR Leave Office)
   - Create payment advice memo for a month

2. **Approve Memo** (as HR Executive)
   - HR Executive with position "HR DIRECTOR" approves the memo
   - Ensure they have a digital signature stored in profile

3. **Download PDF**
   - Download the approved memo
   - Verify:
     - ✓ FROM field shows "HR DIRECTOR" (not "DEPUTY HUMAN RESOURCE MANAGER")
     - ✓ Signer name shows the HR Executive's name
     - ✓ Signature image is present and visible
     - ✓ Title below signature shows "HR DIRECTOR"
     - ✓ No hardcoded values

## Rollback Instructions

If needed, revert to the previous version:
```bash
git revert <commit-hash>
```

Or manually revert changes in `/app/api/leave/payment-advice/download/route.ts`:
- Remove approver info extraction
- Revert FROM field to hardcoded value
- Revert signature fetching to use only `memo.signer_id`
- Revert title to hardcoded "HUMAN RESOURCE MANAGER"

## Related Systems

- **Approval API**: `/app/api/leave/payment-advice/approve-secure/route.ts` (stores approver info)
- **Signature Registry**: `approval_signature_registry` table
- **User Profiles**: `user_profiles` table (contains position and signature)
- **Memo Storage**: `leave_payment_memos` table (stores memo_body with approver info)

## Conclusion

Payment advice memos now accurately reflect who approved them, with proper signatures and positions displayed dynamically. This improves audit trails, document authenticity, and compliance with HR procedures.
