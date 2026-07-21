# HR Executive Signer - Troubleshooting Guide

## Common Issues and Solutions

### Issue 1: "No Pending Memos" for HR Executive
**Symptom:** HR Executive sees empty pending queue but memos should be available

**Root Causes & Solutions:**

1. **Memo Not Assigned to This Executive**
   ```sql
   -- Check what signers are assigned to pending memos
   SELECT id, staff_name, assigned_signers, status 
   FROM leave_payment_memos 
   WHERE status = 'ready_for_review';
   
   -- If your user_id is NOT in the assigned_signers array, that's why you don't see it
   ```
   **Fix:** Re-submit memo and select this executive as signer

2. **Memo Already Approved (Wrong Status)**
   ```sql
   -- Check if memos were already approved
   SELECT id, staff_name, status, signer_id, signer_name 
   FROM leave_payment_memos 
   WHERE status IN ('reviewed_by_hr', 'forwarded_to_accounts')
   AND signer_id = '[your_user_id]';
   ```
   **Fix:** Approved memos don't reappear. This is correct behavior.

3. **User Role Issue**
   ```sql
   -- Verify your role is in the authorized list
   SELECT id, first_name, last_name, role FROM user_profiles 
   WHERE id = '[your_user_id]';
   ```
   **Authorized Roles:**
   - hr_executive
   - hr_manager
   - hr_director
   - director_hr
   - hr_officer
   - manager_hr
   - manager
   - deputy_hr
   
   **Fix:** Contact admin to update your role if needed

---

### Issue 2: "Signature Required" Error During Approval
**Symptom:** Cannot approve memo because system says no signature found

**Root Causes & Solutions:**

1. **No Signature Saved**
   ```sql
   -- Check both signature storage locations
   SELECT id, signature_data_url FROM user_profiles 
   WHERE id = '[your_user_id]';
   
   SELECT user_id, signature_data_url, is_active 
   FROM approval_signature_registry 
   WHERE user_id = '[your_user_id]' AND is_active = true;
   ```
   **If Both Return NULL:**
   - Go to Settings > My Profile
   - Draw or upload your signature
   - Click Save
   - Try approving again

2. **Signature in Wrong Location**
   ```sql
   -- Signature might be in registry but marked inactive
   SELECT user_id, is_active, created_at, workflow_domain 
   FROM approval_signature_registry 
   WHERE user_id = '[your_user_id]'
   ORDER BY created_at DESC;
   ```
   **Fix:** Check if signature is marked `is_active = false`
   - If so, update it: 
   ```sql
   UPDATE approval_signature_registry 
   SET is_active = true 
   WHERE user_id = '[your_user_id]' 
   AND signature_data_url IS NOT NULL;
   ```

3. **Data URL Corrupted**
   ```sql
   -- Check if signature data is valid
   SELECT LENGTH(signature_data_url) as sig_length, 
          SUBSTRING(signature_data_url, 1, 50) as sig_start
   FROM user_profiles 
   WHERE id = '[your_user_id]';
   ```
   **If sig_length < 100 or doesn't start with "data:image":**
   - Re-save your signature in Settings > My Profile

---

### Issue 3: Signature Not Appearing in PDF
**Symptom:** Approved memo generated but signature image missing from PDF

**Root Causes & Solutions:**

1. **Signature Not Retrieved During Approval**
   ```
   Check server logs for messages like:
   "[v0] Found signature in user_profiles for user: [user_id]"
   "[v0] Found signature in approval_signature_registry for user: [user_id]"
   "[v0] APPROVAL BLOCKED - No signature found"
   ```

2. **Signature Not Stored in Memo**
   ```sql
   -- Check if signature was stored during approval
   SELECT id, signature_data_url, signer_name, 
          memo_body->>'selectedSigner' as signer_info
   FROM leave_payment_memos 
   WHERE id = '[memo_id]';
   ```
   **If signature_data_url is NULL:**
   - The approval process didn't complete successfully
   - Check server logs for errors
   - Try approving again

3. **PDF Generation Issue**
   - Signature is stored but PDF generator isn't using it
   - Check: `memo_body.selectedSigner.signature_image_url` field
   - If missing, manually approve memo again

---

### Issue 4: Wrong Executive's Signature on Memo
**Symptom:** Memo shows signature of different person than who approved it

**Root Causes & Solutions:**

1. **Selected Signer ≠ Approver (CRITICAL BUG - Should Not Happen)**
   
   The system ensures the authenticated user (who approved) is always the signer:
   ```typescript
   // approve-secure API
   const { data: { user } } = await supabase.auth.getUser()  // ✅ Logged-in user
   const selectedSigner = { id: user.id }  // ✅ ALWAYS the approver
   ```
   
   **If wrong signature appears:**
   - Check who's name is in `signer_name` field
   - Who approved the memo should match `signer_name`
   - If not, there's a critical issue - contact admin immediately

2. **Verify Who Actually Approved**
   ```sql
   -- Check the approval trail
   SELECT id, staff_name, signer_id, signer_name, 
          signer_id::text as approver_id,
          updated_at as approval_time
   FROM leave_payment_memos 
   WHERE id = '[memo_id]';
   ```

---

### Issue 5: Memo Appearing Twice (Pending + Approved)
**Symptom:** Same memo appears in both pending queue and approved list

**Root Cause:** Status not properly updated after approval

**Solution:**
```sql
-- Check memo status
SELECT id, status, created_at, updated_at FROM leave_payment_memos 
WHERE id = '[memo_id]';

-- Status should be 'reviewed_by_hr' or 'forwarded_to_accounts'
-- NOT 'ready_for_review'

-- If still 'ready_for_review', manually update:
UPDATE leave_payment_memos 
SET status = 'reviewed_by_hr',
    updated_at = NOW()
WHERE id = '[memo_id]';
```

---

### Issue 6: "Access Denied" Error
**Symptom:** Cannot see or approve memos due to authorization error

**Root Causes & Solutions:**

1. **Not an HR Role**
   ```sql
   SELECT role FROM user_profiles WHERE id = '[your_user_id]';
   ```
   **Fix:** Admin must change your role to an HR Executive role

2. **Memo Not Assigned to You**
   ```sql
   SELECT assigned_signers FROM leave_payment_memos 
   WHERE id = '[memo_id]';
   ```
   **Fix:** If your user_id isn't in the array, HR Leave Office must re-submit and assign it to you

3. **Invalid JSON in assigned_signers**
   ```sql
   -- Check if assigned_signers is properly formatted
   SELECT assigned_signers, pg_typeof(assigned_signers)
   FROM leave_payment_memos 
   WHERE id = '[memo_id]';
   ```
   **Should be:** `["uuid-here", "uuid-here"]` (JSON array)

---

## Debug Logging

### Enable Detailed Logging
Add this to your environment or check these logs:

```bash
# Server logs
tail -f /var/log/next-server.log | grep "\[v0\]"

# Check browser console
F12 > Console tab > Filter: "[v0]"
```

### What to Look For

#### Signature Retrieval Logs
```
[v0] Signer signature found in user_profiles for: [user_id]
[v0] Signer signature found in approval_signature_registry for: [user_id]
[v0] APPROVAL BLOCKED - No signature found
```

#### Memo Assignment Logs
```
[v0] Memo signer assignment: {
  memo_staff: "John Doe",
  selectedSigner_id: "uuid",
  computed_assignedSigners: ["uuid"],
}
```

#### Memo Visibility Logs
```
[v0] Memo visibility check: {
  memoId: "uuid",
  storedSigners: ["uuid1", "uuid2"],
  currentUserId: "uuid1",
  isMatch: true,
}
```

#### Approval Logs
```
[v0] APPROVE FLOW: Authenticated approver signing: {
  id: "user_uuid",
  name: "John Doe",
  role: "hr_executive",
  hasSignatureInProfile: true,
}
[v0] Memos approved by selected HR Executive: {
  signerName: "John Doe",
  signerId: "user_uuid",
  memoCount: 3,
}
```

---

## Database Query Reference

### Find All Pending Memos
```sql
SELECT id, staff_name, assigned_signers, created_at 
FROM leave_payment_memos 
WHERE status = 'ready_for_review'
ORDER BY created_at DESC;
```

### Find Your Pending Memos (as HR Executive)
```sql
SELECT id, staff_name, memo_subject, created_at 
FROM leave_payment_memos 
WHERE status = 'ready_for_review'
AND assigned_signers::text LIKE '%[your_user_id]%'
ORDER BY created_at DESC;
```

### Find Your Approved Memos
```sql
SELECT id, staff_name, memo_subject, signer_name, updated_at 
FROM leave_payment_memos 
WHERE status = 'reviewed_by_hr'
AND signer_id = '[your_user_id]'
ORDER BY updated_at DESC;
```

### Check Your Signature
```sql
SELECT id, first_name, last_name, signature_data_url 
FROM user_profiles 
WHERE id = '[your_user_id]';
```

### Check All Approved Signatures
```sql
SELECT user_id, signature_data_url, is_active, created_at 
FROM approval_signature_registry 
WHERE is_active = true
ORDER BY created_at DESC;
```

---

## When to Contact Support

Create a support ticket if:
1. You cannot find your user ID in assigned_signers and you know you should be the signer
2. Signature keeps disappearing after approval
3. Wrong person's name shows as signer
4. Database queries show corrupted data
5. Approval process returns 500 error

**Provide:**
- Your user ID
- Memo ID(s) affected
- Error message text
- Steps you took before error
- Server log output (grep for "[v0]")
