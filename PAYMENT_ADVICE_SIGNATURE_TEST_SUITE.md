# Payment Advice Signature Test Suite

## Overview

This comprehensive test suite verifies that the payment advice signature workflow correctly signs memos with the approver's signature and displays it on downloaded PDFs.

---

## Test Files Included

### 1. **PAYMENT_ADVICE_SIGNATURE_TEST.md**
Complete test specification document covering:
- System flow (6 phases)
- Database state verification before/after approval
- Test checklist with expected results
- Test data requirements
- Expected console logs
- Success criteria

**Use this to**: Understand the complete signature workflow

### 2. **PAYMENT_ADVICE_SIGNATURE_TROUBLESHOOTING.md**
Comprehensive troubleshooting guide for:
- Signature not appearing on PDF
- Wrong signer appearing on PDF
- Memo stuck in "ready_for_review" status
- Server logs showing errors
- Common SQL queries for debugging
- Testing steps

**Use this to**: Diagnose and fix any issues

### 3. **PAYMENT_ADVICE_SIGNATURE_VERIFICATION_REPORT.md**
Technical verification report covering:
- Architecture analysis
- Code path verification
- Data flow analysis
- Critical code sections with line numbers
- Test scenarios
- Database schema verification
- Recommendations

**Use this to**: Understand the technical implementation details

### 4. **scripts/test-payment-advice-signature-flow.ts**
TypeScript test script that:
- Verifies HR Executive setup
- Checks payment memo state
- Simulates approval
- Verifies database state
- Generates test report

**Use this to**: Run automated verification tests

**Run with**:
```bash
npx ts-node scripts/test-payment-advice-signature-flow.ts
```

---

## Quick Start Guide

### Step 1: Understand the System
Read: `PAYMENT_ADVICE_SIGNATURE_TEST.md`

This explains the complete workflow from memo generation through PDF download with signature.

### Step 2: Set Up Test Data
If you don't have staff on annual leave:

```bash
# Run the test data script to create sample staff
cd /vercel/share/v0-project
psql -d your_database -f scripts/068_payment_advice_test_data.sql
```

Or manually create:
- At least 1 HR Executive user with saved signature
- At least 1 staff member on annual leave for the current month

### Step 3: Verify HR Executive Has Signature
1. Log in as HR Executive
2. Go to Settings > Profile
3. Look for "Add Signature" section
4. If no signature, add one:
   - Upload image, OR
   - Draw signature, OR
   - Type signature
5. Save signature

**Verify in database**:
```sql
SELECT signature_data_url, signature_mode 
FROM user_profiles 
WHERE role = 'hr_executive' LIMIT 1;
```

Should show a signature (starts with `data:image/` or URL)

### Step 4: Run Manual Workflow Test

#### Phase 1: Generate Memos
1. Log in as **HR LEAVE OFFICE** role
2. Go to **Payment Advice** tab
3. Select current month
4. Click **"Detect Staff"** button
5. Should find staff on annual leave
6. Click **"Generate Memos"** button
7. Select all memo categories
8. Verify memos appear

#### Phase 2: Submit Memos
1. (Still as HR LEAVE OFFICE)
2. Select **all memos** (Manager, Senior, Junior)
3. Select an **HR Executive signer** from dropdown
4. Click **"Submit Memos"** button
5. Should see success message
6. Memos should move to "Approved Memos" tab

#### Phase 3: Approve as HR Executive
1. **Log out**, log in as the selected **HR Executive**
2. Go to **Payment Advice** tab
3. Should see **"Pending Approval"** tab
4. Click to see pending memos
5. Select memos to approve
6. Click **"Approve"** button
7. If error: "Signature required" → Go back to Step 3
8. If success: See success message

#### Phase 4: Verify Database State
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

**Check**:
- ✅ `status` = `reviewed_by_hr`
- ✅ `signer_name` = HR Executive's name
- ✅ `signature_data_url` contains base64 image
- ✅ `memo_body` has `selectedSigner.signature_image_url`

#### Phase 5: Download PDF
1. (Still as HR Executive)
2. Go to **"Approved Memos"** tab
3. Click on an approved memo
4. Click **"Download"** button
5. **Check the PDF**:
   - ✅ Has company header
   - ✅ Shows staff list in table
   - ✅ **HAS SIGNATURE IMAGE** (NOT blank line)
   - ✅ Shows signer name
   - ✅ Shows signer position
   - ✅ Shows "FOR: MANAGING DIRECTOR"

**SUCCESS**: If signature image appears, the workflow is working correctly!

### Step 5: Run Automated Test (Optional)

```bash
npx ts-node scripts/test-payment-advice-signature-flow.ts
```

This will:
- Check if HR Executive exists
- Verify HR Executive has saved signature
- Find pending payment memos
- Simulate the approval process
- Verify database state after approval
- Generate a test report

---

## Expected Results - Success Scenario

### Console Messages (When Everything Works)

When you click **"Approve"**, look for these in server logs:

```
[v0] APPROVE FLOW: Authenticated approver signing: {
  id: "user-123",
  name: "Mary Smith",
  role: "hr_executive",
  hasSignatureInProfile: true
}

[v0] Found signature in user_profiles for user: user-123

[v0] Signature validation PASSED for signer: {
  userId: "user-123",
  userName: "Mary Smith",
  signatureLength: 5120
}

[v0] Memos approved by selected HR Executive: {
  signerName: "Mary Smith",
  signerId: "user-123",
  signerRole: "hr_executive",
  memoCount: 3,
  timestamp: "2024-01-15T14:32:00Z"
}
```

When you **download the PDF**, look for:

```
[v0] Using selectedSigner from payment memo: Mary Smith

[v0] SIGNATURE RENDERING: URL found, length: 5120, starts with: data:image/png;base64,...

[v0] Base64 signature detected, length after cleaning: 5120, first 50 chars: iVBORw0KGgoAAAANSUhEUgAAAyAAAAK8...

[v0] SUCCESS: Added base64 signature image to PDF at y: 185
```

### Database State After Approval

Query:
```sql
SELECT id, status, signer_name, signature_data_url 
FROM leave_payment_memos 
WHERE status = 'reviewed_by_hr' 
LIMIT 1;
```

Expected result:
```
id                   | 550e8400-e29b-41d4-a716-446655440000
status               | reviewed_by_hr
signer_name          | Mary Smith
signature_data_url   | data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAyAAAAKQAAAAAfQ...
```

### PDF Contents

When you open the downloaded PDF in a PDF viewer:

```
┌─────────────────────────────────────────┐
│   QUALITY CONTROL COMPANY LTD.          │
│   (COCOBOD)                             │
│   P.O. BOX M54, ACCRA                   │
│                                         │
│   REF NO: QCC/HR/PA/2026/01/MGR/001   │
│   DATE: 9 January 2026                  │
├─────────────────────────────────────────┤
│                                         │
│   TO: DEPUTY DIRECTOR, FINANCE          │
│   FROM: HR MANAGER                      │
│   SUBJECT: PAYMENT OF LEAVE ALLOWANCE   │
│            (MANAGEMENT STAFF) - JANUARY │
│                                         │
│   We wish to inform you that the        │
│   under-listed management staff are     │
│   scheduled to proceed on their annual  │
│   vacation leave in January 2026.       │
│                                         │
│   ┌─────────────────────────────────┐   │
│   │ NO │ NAME │ S/NO │ POS. │ DEPT │   │
│   ├─────────────────────────────────┤   │
│   │ 1  │ John │ 001  │ ... │ ... │   │
│   │    │ Doe  │      │     │     │   │
│   │ 2  │ Mary │ 002  │ ... │ ... │   │
│   │    │ Jane │      │     │     │   │
│   └─────────────────────────────────┘   │
│                                         │
│   We count on your co-operation.        │
│                                         │
│   We request you to process and pay     │
│   their leave allowance accordingly.    │
│                                         │
│   ┌──────────────────────┐              │
│   │  [SIGNATURE IMAGE]   │ ← ✅ HERE   │
│   └──────────────────────┘              │
│   MARY SMITH                            │
│   HR MANAGER                            │
│   FOR: MANAGING DIRECTOR                │
│                                         │
│   cc: Managing Director                 │
│       Deputy Director, HR               │
│       Audit Manager                     │
│                                         │
└─────────────────────────────────────────┘
```

**Key Point**: The signature image appears where indicated, NOT a blank line.

---

## Common Issues & Quick Fixes

### Issue: "Signature required" error when approving

**Fix**:
1. Make sure you're logged in as an HR Executive
2. Go to Settings > Profile
3. Add a signature (upload image, draw, or type)
4. Save it
5. Try approval again

### Issue: Signature not showing in PDF

**Check**:
1. Did approval succeed? Check memo status in database
2. Is database updated? Run SQL query from "Database State" section
3. Check server logs for `[v0]` messages about signature rendering
4. See `PAYMENT_ADVICE_SIGNATURE_TROUBLESHOOTING.md` for detailed steps

### Issue: Wrong person's name on PDF

**Check**:
1. Who approved the memo?
2. Database field `signer_name` should match that person
3. The signer must be the authenticated user (person who clicked approve)
4. It should NOT be a pre-selected default from earlier

---

## Documentation Map

```
Payment Advice Signature Testing
│
├─ PAYMENT_ADVICE_SIGNATURE_TEST.md
│  └─ Read this FIRST for workflow overview
│
├─ PAYMENT_ADVICE_SIGNATURE_TROUBLESHOOTING.md
│  └─ Use when something isn't working
│
├─ PAYMENT_ADVICE_SIGNATURE_VERIFICATION_REPORT.md
│  └─ Read for technical implementation details
│
├─ scripts/test-payment-advice-signature-flow.ts
│  └─ Run automated tests with: npx ts-node scripts/test-payment-advice-signature-flow.ts
│
├─ scripts/068_payment_advice_test_data.sql
│  └─ Create test data if needed
│
└─ This file (PAYMENT_ADVICE_SIGNATURE_TEST_SUITE.md)
   └─ You are here - quick reference guide
```

---

## Success Criteria

You'll know the payment advice signature workflow is working correctly when:

✅ **All 5 Phases Complete**:
1. ✅ Memos generated for staff on leave
2. ✅ Memos submitted with signer selected
3. ✅ HR Executive approves successfully
4. ✅ Database shows updated memo with signature
5. ✅ Downloaded PDF includes signer's signature image

✅ **Database Verification**:
- ✅ Memo status changed to `reviewed_by_hr`
- ✅ `signer_name` field populated
- ✅ `signature_data_url` field populated with base64 image
- ✅ `memo_body.selectedSigner.signature_image_url` set

✅ **PDF Verification**:
- ✅ Signature image visible (not blank line)
- ✅ Signer name and position displayed
- ✅ Professional memo format maintained
- ✅ All staff list included

✅ **No Errors**:
- ✅ Approval completed with success message
- ✅ No "Signature required" errors
- ✅ No database update failures
- ✅ No PDF generation errors

---

## Support & Debugging

### Enable Debug Logging
Server logs show `[v0]` messages for each step. These are automatically enabled.

### Check Server Logs
Look for patterns:
- `[v0] APPROVE FLOW:` - Approval started
- `[v0] Signature validation PASSED:` - Signature found
- `[v0] SIGNATURE RENDERING:` - PDF generation
- `[v0] SUCCESS: Added base64 signature` - Signature embedded
- `[v0] CRITICAL:` or `[v0] Error:` - Problems

### Database Debugging
Use provided SQL queries in troubleshooting document to:
- Find pending memos
- Check signer information
- Verify signature storage
- Track status transitions

### Report an Issue
Include:
1. Screenshot of the issue
2. Server logs (copy `[v0]` messages)
3. SQL query results
4. Steps to reproduce

---

## Next Steps

1. **Now**: Read `PAYMENT_ADVICE_SIGNATURE_TEST.md`
2. **Then**: Follow the "Quick Start Guide" Phase 1-5 above
3. **If issue**: Check `PAYMENT_ADVICE_SIGNATURE_TROUBLESHOOTING.md`
4. **For details**: Read `PAYMENT_ADVICE_SIGNATURE_VERIFICATION_REPORT.md`

---

**Last Updated**: January 9, 2026  
**Status**: Ready for Testing  
**Questions**: See troubleshooting guide or code comments in implementation files  
