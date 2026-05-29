# Signature Auto-Population System for Memo Approvals

## Overview
This system automatically loads a signer's saved profile signature when they need to approve any memo (payment advice, loan application, leave request, etc.), providing a seamless approval experience without requiring them to redraw or re-upload their signature each time.

## Architecture

### User Journey
```
1. Signer saves signature in Profile > Signature tab
   ↓
2. Signature stored in user_profiles.signature_data_url
   ↓
3. Signer navigates to approve a memo (Payment Advice, Loan, Leave, etc.)
   ↓
4. SignatureRequiredDialog opens
   ↓
5. API automatically fetches saved signature from user_profiles
   ↓
6. If signature exists → Auto-populate and auto-approve (no dialog shown)
   If signature doesn't exist → Show drawing/upload interface
   ↓
7. Memo is approved with the saved signature instantly
```

## Component Flow

### 1. SignatureRequiredDialog (`components/leave/signature-required-dialog.tsx`)
**Purpose**: Main dialog that handles signature collection for memo approvals

**Key Features**:
- Auto-fetches saved signature when dialog opens (line 36-57)
- Checks if signature exists and auto-proceeds (line 60-68)
- If signature exists, displays it with "Use This Signature" button
- If no signature, shows draw/upload interface
- Saves new signatures to `user_profiles.signature_data_url`

**Flow**:
```tsx
// When dialog opens:
1. fetchExistingSignature() → Calls GET /api/user/signature-save
2. If signature found → Auto-proceed with handleUseExistingSignature()
3. If no signature → Show creation UI
```

### 2. Auto-Populate API (`app/api/user/signature-auto-populate/route.ts`)
**Purpose**: Dedicated endpoint for auto-populating signatures in memo workflows

**Endpoint**: `GET /api/user/signature-auto-populate`

**Returns**:
```json
{
  "success": true,
  "hasSignature": true,
  "signature": {
    "signature_data_url": "https://...",
    "signature_mode": "draw",
    "signer_name": "John Doe",
    "signer_position": "HR Director"
  }
}
```

### 3. Payment Advice Client (`components/leave/payment-advice-client.tsx`)
**Where It's Used**:
- Line 78: `showSignatureRequiredDialog` state
- Line 488: Triggered when approving pending memos
- Line 1124: Triggered for quick approvals
- Line 1555, 1834: Dialog rendered for HR Executives

## How to Use

### For Signers
1. Go to **Profile > Signature Tab**
2. Click **Draw** or **Upload** your signature
3. Click **Save Signature**
4. Your signature is now saved to the database

### For Memo Approvals
1. Signer navigates to any memo approval (Payment Advice, Loan, Leave)
2. When approval dialog appears:
   - If signature is saved → **Automatically uses saved signature, no action needed**
   - If signature is NOT saved → Shows signature drawing/upload interface
3. Memo is approved with the saved signature

## Database Schema

### user_profiles Table
```sql
-- Signature columns added by migration:
signature_data_url TEXT              -- Stores Vercel Blob URL
signature_updated_at TIMESTAMP       -- When signature was last updated
signature_mode VARCHAR               -- 'draw' or 'upload' method

-- Example query:
SELECT id, signature_data_url, signature_mode 
FROM user_profiles 
WHERE id = 'user-id' AND signature_data_url IS NOT NULL;
```

## API Endpoints

### 1. Signature Save (Primary)
**Endpoint**: `POST /api/user/signature-save`
**Purpose**: Save new signature to user_profiles
**Request**:
```json
{
  "signature_data_url": "data:image/png;base64,..."
}
```

### 2. Signature Fetch (Auto-Populate)
**Endpoint**: `GET /api/user/signature-save`
**Purpose**: Retrieve saved signature for display
**Response**:
```json
{
  "success": true,
  "signature": {
    "signature_data_url": "...",
    "signature_mode": "draw"
  }
}
```

### 3. Signature Auto-Populate (New)
**Endpoint**: `GET /api/user/signature-auto-populate`
**Purpose**: Get signature data with signer info for memo workflows
**Response**:
```json
{
  "success": true,
  "hasSignature": true,
  "signature": {
    "signature_data_url": "...",
    "signer_name": "John Doe",
    "signer_position": "HR Director"
  }
}
```

### 4. Signature Clear
**Endpoint**: `DELETE /api/user/signature-clear`
**Purpose**: Remove signature from all storage systems
**Response**:
```json
{
  "success": true,
  "message": "Signature cleared successfully"
}
```

## Features

✓ **Auto-Population**: Signature loads automatically when memo approval is initiated
✓ **Smart Dialog**: If signature exists, dialog doesn't show - approval happens instantly
✓ **Manual Override**: Users can create new signature even if one exists
✓ **Permanent Storage**: Signatures persist in user_profiles table
✓ **Cloud Backup**: Vercel Blob stores actual PNG files
✓ **Multi-Workflow**: Works for payment advice, loans, leave, deferments, recalls

## Implementation Checklist

- [x] Migration: Added signature columns to user_profiles
- [x] API: Created /signature-save endpoint (POST/GET)
- [x] API: Created /signature-clear endpoint (DELETE)
- [x] API: Created /signature-auto-populate endpoint (GET)
- [x] Component: SignatureRequiredDialog with auto-population logic
- [x] Integration: Connected to payment-advice-client
- [x] Integration: Connected to HR signature workflows
- [x] Profile: Signature save/update in Profile Settings

## Testing

### Test Case 1: Auto-Populate Existing Signature
1. Save signature in Profile
2. Go to approve a memo
3. SignatureRequiredDialog should NOT show (auto-proceeds)
4. Memo approved with saved signature ✓

### Test Case 2: No Signature Yet
1. Don't save signature in Profile
2. Go to approve a memo
3. SignatureRequiredDialog shows drawing interface
4. Draw signature and save
5. Memo approved ✓

### Test Case 3: Change Signature
1. Update signature in Profile
2. Go to approve memo
3. New signature auto-loads
4. Memo approved with new signature ✓

## Performance Considerations

- **Caching**: Signature fetched once per dialog open (no repeated queries)
- **Async Loading**: Auto-populate happens while dialog is opening
- **Fast Approvals**: With saved signature, approval takes <1 second
- **Database**: Index on `user_profiles(id)` WHERE `signature_data_url IS NOT NULL`

## Security

- ✓ User authentication required
- ✓ RLS enforced on user_profiles
- ✓ Signatures stored in Vercel Blob (CDN with HTTPS)
- ✓ Only user can see/modify their own signature
- ✓ Delete removes from all storage systems
