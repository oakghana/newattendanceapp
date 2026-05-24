# Approved Memo Signature Implementation

## Overview
All approved payment advice memos now automatically include the HR Executive signer's signature image when downloaded.

## Implementation Flow

### 1. Approval Process (`approve-secure/route.ts`)
When an HR Executive approves payment memos:
- The endpoint fetches all memos to be updated
- For each memo, it parses the existing `memo_body` JSON
- Adds an `approver` object containing:
  - `id`: HR Executive's user ID
  - `name`: Full name of the signer
  - `position`: HR Executive's position
  - `role`: HR Executive's role
  - `approved_at`: Timestamp of approval
- Updates the memo with new `status: "reviewed_by_hr"` and the updated `memo_body`

### 2. Signature Fetching API (`app/api/user/signature/[userId]/route.ts`)
New endpoint that:
- Accepts a user ID as parameter
- Queries `approval_signature_registry` table
- Returns the approved user's signature image URL
- Used by PDF generation to retrieve the signer's saved signature

### 3. PDF Generation (`handleDownloadMemo` in payment-advice-client.tsx`)
When generating PDF for approved memos:
- Checks if memo is approved and has signer information
- Fetches the signer's signature using the new `/api/user/signature/[userId]` endpoint
- If signature found: downloads and embeds the 40mm × 15mm signature image above the signature line
- If no signature available: shows blank signature line for handwritten signature
- Includes signer name and position below the signature/line

## Security & Validation

- Only HR Executives with approved HR roles can approve memos
- Only users with saved, approved signatures in `approval_signature_registry` can add their signature to PDFs
- Signature is only added when memo status is `reviewed_by_hr`
- Admin query bypass ensures approved memo retrieval works even with RLS policies

## Database Changes

**Modified Tables:**
- `leave_payment_memos.memo_body`: Now includes `approver` object when approved

**Queried Tables:**
- `approval_signature_registry`: Used to fetch signer's saved signature image URL
- `user_profiles`: Used to validate HR Executive role

## User Experience

1. **Before Approval**: Pending memos show blank signature line
2. **HR Executive Approves**: System stores approver info
3. **After Approval**: Downloaded PDFs automatically include signer's signature image
4. **No Signature Case**: If HR Executive has no saved signature, PDF shows blank line and user is informed

## Testing Checklist

- [ ] Approve memos as HR Executive with saved signature
- [ ] Download approved memo - verify signature appears
- [ ] Approve with HR Executive without saved signature - verify blank line
- [ ] Verify signer name and position appear below signature
- [ ] Check memo_body contains approver object after approval
- [ ] Verify non-HR-Executives cannot approve memos
