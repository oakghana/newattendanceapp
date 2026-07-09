# Payment Advice Signature Simulation Test

## Test Objective
Verify that when an HR Executive approves payment advice memos, their signature correctly appears on the downloaded PDF.

## Current System Flow

### 1. **Generate Memos Phase**
- HR LEAVE OFFICE generates memos for staff on annual leave
- Memos are created with status: `draft`
- Each memo stores: staff_name, staff_category, payment details
- Database: `leave_payment_memos` table

### 2. **Submit Memos Phase**
- HR LEAVE OFFICE selects a signer (HR Executive)
- Memos are submitted with status: `ready_for_review`
- The selected signer info is stored in `memo_body.selectedSigner` field
- Database field: `leave_payment_memos.memo_body` (JSON)

### 3. **Approval Phase (CRITICAL)**
- HR Executive reviews pending memos
- HR Executive clicks "Approve" button
- System validates:
  - User is authenticated HR Executive
  - User has a saved signature in `approval_signature_registry` or `user_profiles.signature_data_url`
  - User is one of the `assigned_signers` for the memos
- On approval:
  - Memos status changed to: `reviewed_by_hr`
  - Approver information stored in `memo_body.approver`
  - Signature URL stored in `memo_body.selectedSigner.signature_image_url`
  - `signer_id` column updated
  - `signer_name` column updated
  - `signature_data_url` column updated

### 4. **Download Phase**
- HR Executive or HR LEAVE OFFICE downloads approved memo
- System fetches memo from `leave_payment_memos`
- PDF generation retrieves:
  - Signer name from `memo_body.selectedSigner.name`
  - Signer position from `memo_body.selectedSigner.position`
  - Signature image from `memo_body.selectedSigner.signature_image_url`
- PDF includes:
  - Signature image embedded (40mm × 18mm)
  - Signer name and position below signature
  - All staff list in table format
  - Professional memo header with reference number

## Database State Verification

### Before Approval
```json
leave_payment_memos record:
{
  id: "memo-123",
  status: "ready_for_review",
  staff_name: "John Doe",
  staff_category: "Manager",
  memo_body: {
    "selectedSigner": {
      "id": "user-456",
      "name": "Mary Smith",
      "position": "HR MANAGER",
      "signature_image_url": null  // Not yet approved
    }
  },
  signer_id: null,
  signature_data_url: null
}
```

### After Approval
```json
leave_payment_memos record:
{
  id: "memo-123",
  status: "reviewed_by_hr",  // CHANGED
  staff_name: "John Doe",
  staff_category: "Manager",
  memo_body: {
    "selectedSigner": {
      "id": "user-456",
      "name": "Mary Smith",
      "position": "HR MANAGER",
      "signature_image_url": "data:image/png;base64,iVBORw0KGg..." // NOW SET
    },
    "approver": {  // ADDED
      "id": "user-456",
      "name": "Mary Smith",
      "position": "HR MANAGER",
      "role": "hr_executive",
      "approved_at": "2024-01-15T14:32:00Z"
    }
  },
  signer_id: "user-456",  // CHANGED
  signer_name: "Mary Smith",  // CHANGED
  signature_data_url: "data:image/png;base64,iVBORw0KGg...",  // CHANGED
  updated_at: "2024-01-15T14:32:00Z"  // CHANGED
}
```

## Test Checklist

### ✅ PHASE 1: Verify Approver Has Signature
- [ ] Test user (HR Executive) is logged in
- [ ] Check `/api/user/signature-check/{userId}` returns `hasSignature: true`
- [ ] Signature is saved in `approval_signature_registry` table with `is_active: true`
- [ ] OR signature is saved in `user_profiles.signature_data_url` column

**Expected Result**: Signature check passes, approval button is enabled

### ✅ PHASE 2: Verify Memo Assignment
- [ ] Query `leave_payment_memos` for status `ready_for_review`
- [ ] Check `assigned_signers` includes the HR Executive's user_id
- [ ] Verify `memo_body.selectedSigner` contains the correct HR Executive info

**Expected Result**: Memo is properly assigned to the approver

### ✅ PHASE 3: Trigger Approval
Test the approval flow:
```bash
POST /api/leave/payment-advice/approve-secure
{
  "memoIds": ["memo-123"],
  "selectedSigner": {
    "id": "user-456",
    "name": "Mary Smith",
    "position": "HR MANAGER"
  }
}
```

**Expected Result**: 
- Response: `{ "success": true, "approvedCount": 1 }`
- Memo status in DB changed to `reviewed_by_hr`
- `signer_name` updated to "Mary Smith"

### ✅ PHASE 4: Verify Database Updates
After approval, query the memo:
```sql
SELECT 
  id,
  status,
  memo_body,
  signer_id,
  signer_name,
  signature_data_url
FROM leave_payment_memos 
WHERE id = 'memo-123';
```

**Expected Results**:
- `status` = `reviewed_by_hr`
- `signer_id` = `user-456` (the approver)
- `signer_name` = `Mary Smith`
- `signature_data_url` is NOT NULL (contains base64 image data)
- `memo_body.selectedSigner.signature_image_url` is set
- `memo_body.approver` object exists with approval details

### ✅ PHASE 5: Download PDF and Verify Signature
Test the download:
```
GET /api/leave/planning/memo/[memoId]
```

**Expected PDF contains**:
1. Memo header with company info and reference number
2. Staff list in professional table format
3. **Signature image** (40mm × 18mm) - THIS IS THE CRITICAL TEST
4. Signer name: "MARY SMITH" 
5. Signer title: "HR MANAGER"
6. "FOR: MANAGING DIRECTOR" text
7. CC list
8. Company footer

### ✅ PHASE 6: Client-Side Download Test
Test the client download function in payment-advice-client.tsx:

1. User is HR Executive with saved signature
2. User clicks on approved memo in "Approved Memos" tab
3. System calls `downloadApprovedMemo(memo)`
4. URL opens: `/api/leave/planning/memo/[memoId]`
5. Browser downloads PDF

**Expected Result**: Downloaded PDF includes signer's signature image, NOT a blank line

## Common Issues & Fixes

### Issue #1: Signature Not Appearing on Downloaded PDF
**Symptoms**: Blank signature line instead of image on downloaded memo
**Root Causes**:
1. ❌ Approver has no saved signature in `approval_signature_registry`
2. ❌ Signature URL is not stored in `memo_body.selectedSigner`
3. ❌ Signature URL format is invalid (not base64 or HTTP URL)
4. ❌ Memo status is still `ready_for_review` (not approved yet)

**Fix**:
- Verify signature saved: Check `user_profiles.signature_data_url` or `approval_signature_registry`
- Verify approval completed: Check `memo_body.selectedSigner.signature_image_url` is set
- Check server logs for signature rendering errors

### Issue #2: Wrong Signer Appearing on PDF
**Symptoms**: Downloaded memo shows incorrect person's name or position
**Root Causes**:
1. ❌ Default signer was pre-selected during memo generation
2. ❌ Approver data is NOT the same as the user who clicked approve
3. ❌ Memo status transition failed silently

**Fix**:
- NEVER auto-select a default signer
- Use authenticated user identity ONLY in `approve-secure`
- Verify `signer_id` matches the approver's ID, not a pre-selected ID

### Issue #3: Signature URL Blank or Invalid
**Symptoms**: PDF shows empty signature line, server logs show signature URL errors
**Root Causes**:
1. ❌ Signature not fetched during approval
2. ❌ Registry query returned no results
3. ❌ Base64 conversion failed

**Fix**:
- Ensure `checkSignerSignature()` returns true before approval
- Verify registry has active entry: `is_active = true`
- Check base64 string is properly formatted

## Test Data Requirements

To run this simulation, you need:

### 1. Test User (HR Executive)
```
Email: mary@qcc.com
Name: Mary Smith
Position: HR MANAGER
Role: hr_executive
Status: Active
```

### 2. Test User's Signature (Saved in System)
Option A - In `user_profiles`:
```
user_profiles.signature_data_url = "data:image/png;base64,..."
```

Option B - In `approval_signature_registry`:
```
{
  user_id: "user-456",
  signature_data_url: "data:image/png;base64,...",
  is_active: true,
  workflow_domain: "leave",
  approval_stage: "hr_approver"
}
```

### 3. Test Staff on Leave
```
Full Name: John Doe
Employee ID: EMP001
Position: Operations Manager
Department: Operations
Staff Category: Manager
Leave Period: Current Month
```

### 4. Test Payment Memo
```
Memo Status: ready_for_review
Assigned Signers: [mary-user-id]
Selected Signer: Mary Smith
Staff Category: Manager
```

## Script to Test Signature Workflow

```bash
# 1. Check if approver has signature
curl -X GET "http://localhost:3000/api/user/signature-check/user-456"

# 2. Generate and submit memos
curl -X POST "http://localhost:3000/api/leave/payment-advice/generate-memo" \
  -H "Content-Type: application/json" \
  -d '{
    "month": "2024-01",
    "staffList": [...],
    "selectedSigner": { "id": "user-456", "name": "Mary Smith", "position": "HR MANAGER" }
  }'

# 3. Approve memos
curl -X POST "http://localhost:3000/api/leave/payment-advice/approve-secure" \
  -H "Content-Type: application/json" \
  -d '{ "memoIds": ["memo-123"] }'

# 4. Download memo (verify signature in PDF)
curl -X GET "http://localhost:3000/api/leave/planning/memo/memo-123" \
  -o "payment-advice-memo.pdf"

# 5. Verify database state
curl -X GET "http://localhost:3000/api/leave/payment-advice/approved-memos"
```

## Expected Logs in Console

When approval is successful, you should see:

```
[v0] APPROVE FLOW: Authenticated approver signing: {
  id: "user-456",
  name: "Mary Smith",
  role: "hr_executive",
  hasSignatureInProfile: true
}

[v0] Signature validation PASSED for signer: {
  userId: "user-456",
  userName: "Mary Smith",
  signatureLength: 5120  // base64 data length
}

[v0] Memos approved by selected HR Executive: {
  signerName: "Mary Smith",
  signerId: "user-456",
  signerRole: "hr_executive",
  memoCount: 1,
  timestamp: "2024-01-15T14:32:00Z"
}

[v0] Memo[id] signer resolution: {
  memoType: "payment_advice",
  hasPaymentMemo: true,
  hasSelectedSigner: true,
  selectedSignerName: "Mary Smith",
  signerToUse: "Mary Smith"
}

[v0] SIGNATURE RENDERING: URL found, length: 5120, starts with: data:image/png;base64,...

[v0] SUCCESS: Added base64 signature image to PDF at y: 185
```

## Success Criteria

✅ **Test PASSES if ALL of the following are true**:

1. ✅ Approval request succeeds with HTTP 200
2. ✅ Memo status changes to `reviewed_by_hr` in database
3. ✅ `signer_name` field is updated to approver's name
4. ✅ `signature_data_url` field contains valid base64 image data
5. ✅ `memo_body.selectedSigner.signature_image_url` is populated
6. ✅ `memo_body.approver` object exists with approval metadata
7. ✅ Downloaded PDF includes embedded signature image (not blank line)
8. ✅ PDF shows correct signer name and position
9. ✅ No errors in server logs related to signature rendering
10. ✅ Browser/user receives notification "Approved successfully"

## Failure Resolution

If any test fails:

### Step 1: Check Logs
Review server console for `[v0]` debug messages to identify exact failure point

### Step 2: Verify Approver Signature
```sql
SELECT * FROM approval_signature_registry 
WHERE user_id = 'user-456' AND is_active = true;

SELECT signature_data_url FROM user_profiles 
WHERE id = 'user-456';
```

### Step 3: Check Memo Status
```sql
SELECT id, status, signer_id, signer_name, signature_data_url 
FROM leave_payment_memos 
WHERE id = 'memo-123';
```

### Step 4: Verify Memo Body
```sql
SELECT 
  memo_body::text
FROM leave_payment_memos 
WHERE id = 'memo-123';
```
Should show `selectedSigner` with `signature_image_url` populated.

### Step 5: Download PDF and Inspect
Use PDF viewer to check if signature image is present. If not, approver's signature was not fetched during PDF generation.

---

## Summary

The payment advice signature workflow is complete when:
1. HR Executive approves memos with a saved signature ✅
2. Database records are updated with signer and signature data ✅
3. Downloaded PDF includes the signer's signature image ✅
4. Memo header shows correct signer name and position ✅
