# Payment Advice Signature - Troubleshooting Guide

## Issue: Signature Not Appearing on Downloaded PDF

### Symptoms
- PDF downloads successfully
- Memo content appears correct (staff list, header, footer)
- **BUT**: Signature line is blank (no image, just a line)
- Signer name and position appear correctly

### Root Cause Analysis

#### Cause #1: HR Executive Never Saved a Signature
**How to Check**:
```sql
-- Check user_profiles for signature
SELECT id, first_name, last_name, signature_data_url, signature_mode 
FROM user_profiles 
WHERE role = 'hr_executive' AND is_active = true;

-- Check approval_signature_registry
SELECT user_id, signature_data_url, is_active, updated_at 
FROM approval_signature_registry 
WHERE is_active = true AND workflow_domain = 'leave';
```

**Expected**: At least one of these should have a non-null `signature_data_url` starting with `data:image/`

**Fix**:
1. Have the HR Executive log into the app
2. Go to Settings > Profile
3. Click "Add Signature"
4. Either:
   - Upload a signature image, OR
   - Draw a signature using the pad, OR
   - Type their signature
5. Save the signature
6. Verify it appears in the database

#### Cause #2: Approval Endpoint Didn't Fetch the Signature
**How to Check**:
1. In browser console, open Network tab
2. Approve a memo
3. Look for `POST /api/leave/payment-advice/approve-secure`
4. Check Response - should show no errors
5. In server logs, look for messages like:
   ```
   [v0] APPROVE FLOW: Authenticated approver signing: { ... hasSignatureInProfile: true }
   [v0] Signature validation PASSED for signer
   ```

**Expected**: Logs show `hasSignatureInProfile: true` or registry signature found

**Fix**:
- If logs show `APPROVAL BLOCKED - No signature found`, HR Executive must save signature first
- If logs show approval succeeded but signature not in memo_body, check next cause

#### Cause #3: Signature Not Stored in memo_body.selectedSigner
**How to Check**:
```sql
-- Query the approved memo
SELECT memo_body::text as memo_json 
FROM leave_payment_memos 
WHERE id = '[memo-id]' AND status = 'reviewed_by_hr';
```

**Expected Output** (in `memo_body` JSON):
```json
{
  "selectedSigner": {
    "id": "user-123",
    "name": "Mary Smith",
    "position": "HR MANAGER",
    "signature_image_url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
  },
  "approver": {
    "id": "user-123",
    "name": "Mary Smith",
    "position": "HR MANAGER",
    "approved_at": "2024-01-15T14:32:00Z"
  }
}
```

**Problem**: If `signature_image_url` is null or missing

**Fix**:
Check the `approve-secure` endpoint in `/app/api/leave/payment-advice/approve-secure/route.ts`

The code should:
1. Fetch signature from `user_profiles.signature_data_url`
2. If not found, fetch from `approval_signature_registry`
3. Store in `memo_body.selectedSigner.signature_image_url`
4. Store in `signature_data_url` column

If this isn't happening, the endpoint code has a bug.

#### Cause #4: PDF Generation Not Reading Signature from Memo Body
**How to Check**:
1. Download the approved memo
2. In browser console Network tab, look for `GET /api/leave/planning/memo/[id]`
3. Right-click response > "Save as..." to inspect
4. In server logs, look for:
   ```
   [v0] SIGNATURE RENDERING: URL found, length: 5120...
   [v0] SUCCESS: Added base64 signature image to PDF
   ```

**Expected**: Logs show signature being added to PDF

**Fix if logs show**:
- `No signature image URL available` - memo body doesn't have signature URL
- `Base64 signature detected` - then `SUCCESS` message should appear
- If you see error messages about signature rendering, that's an issue with the PDF library

#### Cause #5: Signature URL Format Invalid
**How to Check**:
Look at the signature URL stored in `memo_body.selectedSigner.signature_image_url`

**Valid formats**:
- ✅ `data:image/png;base64,iVBORw0KGgoAAAANSU...` (Base64 data URL)
- ✅ `https://blob-storage.com/sig-123.png` (HTTPS URL)

**Invalid formats**:
- ❌ `"data:image/png;base64,"` (empty - just the prefix)
- ❌ `null` or `undefined`
- ❌ `"/path/to/file"` (file path - not a valid URL)

**Fix**:
If the signature_data_url from the registry doesn't start with `data:` or `http`, it needs to be converted to a proper format before storage.

---

## Issue: Wrong Signer Appearing on PDF

### Symptoms
- PDF has the WRONG person's name and position
- Signature might be correct or incorrect

### Root Cause Analysis

#### Cause #1: Default Signer Was Pre-Selected During Generation
**This is a CRITICAL BUG** if it's still happening

**How to Check**:
Look at `payment-advice-client.tsx` line ~245:
```typescript
// This should be EMPTY, not pre-selected!
setSelectedSigners([])
setSelectedSigner(null)
```

**Expected**: When HR Executives are loaded, NO signer should be auto-selected

**Fix**: 
Ensure that `setSelectedSigners([])` is called and no default signer is set.

#### Cause #2: Approver Data NOT Updated in Payment Memo
**How to Check**:
```sql
SELECT 
  id,
  status,
  signer_id,
  signer_name,
  memo_body::text
FROM leave_payment_memos 
WHERE id = '[memo-id]';
```

Check if `signer_id` and `signer_name` match the person who approved it.

**Expected**: These should be the authenticated user's ID and name, NOT a pre-selected default

**Fix**:
In the `approve-secure` endpoint, verify these lines exist:
```typescript
const { data: { user } } = await supabase.auth.getUser()
// The signer is ALWAYS the authenticated user
const selectedSigner = { id: user.id }
```

If not, the endpoint is using a client-provided signer instead of the authenticated user's identity.

#### Cause #3: Leave Request Has Wrong HR Approver ID
**How to Check**:
```sql
SELECT 
  id,
  hr_approver_id,
  hr_approver_name
FROM leave_plan_requests 
WHERE id = '[request-id]';
```

**Expected**: For payment advice memos, this shouldn't matter - the payment memo's signer should be used

**Fix**:
The PDF generation endpoint should prioritize:
1. First: `selectedSigner` from `leave_payment_memos.memo_body`
2. Second: Never fall back to leave_plan_requests data for payment memos

---

## Issue: Memo Status Still "ready_for_review" After Approval

### Symptoms
- Clicked "Approve"
- Got success message
- But memo still shows as pending
- PDF doesn't have signature

### Root Cause Analysis

#### Cause #1: Approval Endpoint Failed Silently
**How to Check**:
1. Browser console > Network tab
2. Approval request shows 200 or 4xx/5xx?
3. Response JSON has `success: true` or `error`?

**Expected**: HTTP 200 with `success: true` in response

**Fix**:
Look at server logs for error messages. The endpoint should return a 400+ status if:
- User is not HR Executive role
- User doesn't have a saved signature
- Memo update failed

#### Cause #2: Database Update Failed
**How to Check**:
In server logs, look for:
```
[v0] Failed to update memo during approval: { memoId: ..., error: ... }
```

**Expected**: No error messages

**Fix**:
- Check Supabase RLS policies - is the update allowed?
- Check if `memo_body` column can store the new JSON data
- Verify admin client has proper permissions

#### Cause #3: Memo ID Wasn't Found
**How to Check**:
```sql
SELECT id, status FROM leave_payment_memos 
WHERE status IN ('draft', 'ready_for_review') 
LIMIT 10;
```

Make sure you're approving memos that actually exist.

**Fix**:
Try approving a different memo to see if the issue is specific to one memo or all memos.

---

## Issue: Server Log Shows "No Signer ID Found for Memo"

### Location
Server logs show message:
```
[v0] WARNING: No signer ID found for memo
```

### What This Means
The PDF generation endpoint (`app/api/leave/planning/memo/[id]/route.ts`) couldn't determine who should sign the PDF.

### How to Fix

1. **Verify selectedSigner in memo_body**:
```sql
SELECT memo_body::text 
FROM leave_payment_memos 
WHERE id = '[memo-id]';
```

Should contain `selectedSigner` with an `id` field.

2. **If not present**, the memo was never properly submitted. Re-generate and re-submit.

3. **Check approver field**:
The endpoint looks for:
- `memo_body.selectedSigner.id` (primary for payment advice memos)
- `leave_plan_requests.hr_approver_id` (fallback for leave approval memos)
- `memo_body.approver.id` (last resort)

Make sure at least one is present.

---

## Quick Validation Checklist

Use this checklist to validate the entire signature workflow:

### 1. HR Executive Setup
- [ ] User has role = `hr_executive` or similar HR role
- [ ] User has `is_active = true`
- [ ] User has saved signature in `user_profiles.signature_data_url` OR `approval_signature_registry.signature_data_url`

### 2. Payment Memo Creation
- [ ] Memos exist for staff on approved annual leave
- [ ] Memo status = `draft` or `ready_for_review`
- [ ] `memo_body.selectedSigner` exists and has HR Executive's info

### 3. Approval Process
- [ ] HR Executive clicked "Approve" button
- [ ] Notification shows "Approved successfully"
- [ ] Check database: memo status = `reviewed_by_hr`

### 4. Database State After Approval
```sql
SELECT 
  status,
  signer_id,
  signer_name,
  signature_data_url,
  memo_body
FROM leave_payment_memos 
WHERE id = '[memo-id]';
```

- [ ] `status` = `reviewed_by_hr` ✅
- [ ] `signer_id` = HR Executive's ID ✅
- [ ] `signer_name` = HR Executive's full name ✅
- [ ] `signature_data_url` contains base64 image ✅
- [ ] `memo_body.selectedSigner.signature_image_url` populated ✅
- [ ] `memo_body.approver` object exists ✅

### 5. PDF Generation
- [ ] Download approved memo
- [ ] PDF displays correctly
- [ ] **CRITICAL**: Signature image visible, not blank line
- [ ] Correct signer name and position below signature

---

## Testing Steps

### Step 1: Create Test Data
If you don't have staff on leave:
```bash
# Run the test data script
psql -d your_database -f scripts/068_payment_advice_test_data.sql
```

### Step 2: Generate Memos
1. Log in as HR LEAVE OFFICE user
2. Go to Payment Advice tab
3. Select current month
4. Click "Detect Staff"
5. Should find test staff on leave
6. Click "Generate Memos"

### Step 3: Verify Memo Generation
```sql
SELECT COUNT(*) FROM leave_payment_memos 
WHERE status = 'draft';
```

Should return > 0

### Step 4: Submit Memos
1. (Still as HR LEAVE OFFICE)
2. Select all three categories (Manager, Senior, Junior)
3. Select an HR Executive signer
4. Click "Submit"
5. Memos should move to `ready_for_review` status

### Step 5: Approve as HR Executive
1. Log out, log in as the selected HR Executive
2. Go to Payment Advice tab (should see "Pending Approval" tab)
3. Select memos to approve
4. Click "Approve"
5. Should see success message

### Step 6: Verify Signature on PDF
1. While still logged in as HR Executive
2. Click on an approved memo in "Approved Memos" tab
3. Click "Download" or "View"
4. **Check the PDF**:
   - [ ] Has signature image (NOT blank line)
   - [ ] Shows correct HR Executive name
   - [ ] Shows correct position

### Step 7: Database Verification
```sql
SELECT 
  id,
  status,
  signer_name,
  signature_data_url,
  memo_body::text
FROM leave_payment_memos 
WHERE status = 'reviewed_by_hr' 
LIMIT 1;
```

Verify all fields are populated correctly.

---

## Common SQL Queries for Debugging

### Find All Pending Payment Memos
```sql
SELECT 
  id,
  status,
  staff_category,
  staff_name,
  signer_name,
  signature_data_url,
  created_at
FROM leave_payment_memos 
WHERE status IN ('draft', 'ready_for_review')
ORDER BY created_at DESC;
```

### Find Approved Memos Missing Signatures
```sql
SELECT 
  id,
  status,
  staff_category,
  signer_name,
  CASE 
    WHEN signature_data_url IS NULL THEN 'NO SIGNATURE'
    WHEN signature_data_url LIKE 'data:image%' THEN 'HAS BASE64'
    WHEN signature_data_url LIKE 'http%' THEN 'HAS URL'
    ELSE 'INVALID FORMAT'
  END as signature_status
FROM leave_payment_memos 
WHERE status = 'reviewed_by_hr'
ORDER BY updated_at DESC;
```

### Find HR Executives Without Signatures
```sql
SELECT 
  up.id,
  up.first_name,
  up.last_name,
  up.position,
  up.signature_data_url,
  COUNT(asr.id) as registry_count
FROM user_profiles up
LEFT JOIN approval_signature_registry asr 
  ON up.id = asr.user_id AND asr.is_active = true
WHERE up.role IN ('hr_executive', 'hr_manager', 'director_hr')
  AND up.is_active = true
GROUP BY up.id
HAVING up.signature_data_url IS NULL 
  AND COUNT(asr.id) = 0;
```

### Verify Memo Body Structure
```sql
SELECT 
  id,
  status,
  CASE 
    WHEN memo_body::text LIKE '%selectedSigner%' THEN 'HAS selectedSigner'
    ELSE 'MISSING selectedSigner'
  END as signer_check,
  CASE 
    WHEN memo_body::text LIKE '%approver%' THEN 'HAS approver'
    ELSE 'MISSING approver'
  END as approver_check
FROM leave_payment_memos 
WHERE status = 'reviewed_by_hr'
LIMIT 10;
```

---

## When to Contact Support

If after following all these steps you still have issues:

1. **Collect Evidence**:
   - Screenshot of the memo in the app (before and after approval)
   - Server log output (from when approval was clicked)
   - SQL query results from the debugging queries above

2. **Document the Issue**:
   - What action did you take? (generate → submit → approve → download)
   - What did you expect to happen?
   - What actually happened?
   - Any error messages?

3. **Share Your Findings**:
   - Database state (SQL query results)
   - Browser console errors
   - Server logs
   - This will help diagnose the root cause

---

## Key Files to Review

If you're developing and need to understand the signature flow:

1. **Client Components**:
   - `components/leave/payment-advice-client.tsx` - UI and download logic
   - `components/leave/signature-required-dialog.tsx` - Signature prompt

2. **Approval Logic**:
   - `app/api/leave/payment-advice/approve-secure/route.ts` - Core approval endpoint

3. **PDF Generation**:
   - `app/api/leave/planning/memo/[id]/route.ts` - PDF rendering with signatures

4. **Database Schema**:
   - `leave_payment_memos` table - Stores memos and signatures
   - `approval_signature_registry` table - Signature registry
   - `user_profiles` table - User signature storage

---
