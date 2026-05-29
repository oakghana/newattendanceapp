# Quick Signature Reference - For Developers

## System Overview
Signatures saved in user profile automatically populate when signers approve memos.

## Key Files

### 1. Components
- `components/leave/signature-required-dialog.tsx` - Main dialog with auto-population
- `components/leave/signature-pad.tsx` - Signature canvas/drawing
- `components/profile/profile-client.tsx` - Profile signature section

### 2. APIs
- `app/api/user/signature-save/route.ts` - Save/fetch signature
- `app/api/user/signature-clear/route.ts` - Clear signature
- `app/api/user/signature-auto-populate/route.ts` - Auto-populate for memos

### 3. Database
- Table: `user_profiles`
- Columns: `signature_data_url`, `signature_updated_at`, `signature_mode`

## How It Works

```typescript
// In SignatureRequiredDialog (components/leave/signature-required-dialog.tsx)

// 1. Fetch saved signature
const fetchExistingSignature = async () => {
  const res = await fetch("/api/user/signature-save", { method: "GET" })
  const data = await res.json()
  setExistingSignature(data.signature?.signature_data_url)
}

// 2. Auto-proceed if signature exists
useEffect(() => {
  if (existingSignature && open) {
    setTimeout(() => handleUseExistingSignature(), 300)
  }
}, [existingSignature, open])

// 3. Approve memo with saved signature
const handleUseExistingSignature = () => {
  toast({ title: "Using your saved signature" })
  onSignatureSaved() // Proceeds with approval
}
```

## Integration Points

### Payment Advice Approvals
```
payment-advice-client.tsx
  → User clicks "Approve"
  → setShowSignatureRequiredDialog(true)
  → SignatureRequiredDialog opens
  → Auto-fetches signature
  → If exists → Auto-approves
```

### Loan Application Approvals
```
loan-app/page.tsx
  → User clicks "Approve"
  → SignatureRequiredDialog opens
  → Auto-fetches signature
  → Memo approved with saved signature
```

## Testing

### Test 1: Auto-Population Works
```bash
1. Go to Profile > Signature
2. Draw/Upload signature → Click Save
3. Go to Payment Advice approvals
4. Click Approve
✓ Dialog should NOT show (auto-closes)
✓ Toast says "Using your saved signature"
✓ Memo approved instantly
```

### Test 2: Manual Signature Still Works
```bash
1. NO signature saved in Profile
2. Go to Payment Advice approvals
3. Click Approve
✓ Dialog shows with drawing interface
4. Draw signature → Click Save
✓ Approved with new signature
```

## Database Queries

### Get User's Saved Signature
```sql
SELECT signature_data_url, signature_mode, signature_updated_at
FROM user_profiles
WHERE id = 'user-id';
```

### Check If Signature Exists
```sql
SELECT COUNT(*) 
FROM user_profiles
WHERE id = 'user-id' AND signature_data_url IS NOT NULL;
```

### Clear Signature
```sql
UPDATE user_profiles
SET signature_data_url = NULL, signature_mode = NULL
WHERE id = 'user-id';
```

## API Responses

### Fetch Signature (GET /api/user/signature-save)
```json
{
  "success": true,
  "signature": {
    "id": "user-id",
    "signature_data_url": "https://blob.vercel-storage.com/...",
    "signature_mode": "draw",
    "updated_at": "2026-05-29T10:00:00Z"
  }
}
```

### No Signature
```json
{
  "success": true,
  "signature": null,
  "message": "No signature saved yet"
}
```

### Auto-Populate (GET /api/user/signature-auto-populate)
```json
{
  "success": true,
  "hasSignature": true,
  "signature": {
    "signature_data_url": "https://blob.vercel-storage.com/...",
    "signer_name": "John Doe",
    "signer_position": "HR Director"
  }
}
```

## Common Issues & Solutions

### Issue: Signature not appearing in memo approval
**Solution**: Check that:
1. User saved signature in Profile (not just drew it)
2. Signature exists in `user_profiles.signature_data_url`
3. `/api/user/signature-save` returns the signature in GET request

### Issue: Dialog still shows when signature should auto-populate
**Solution**: Check:
1. `fetchExistingSignature()` was called (line 36-57)
2. `existingSignature` state was set correctly
3. useEffect dependency includes both `[existingSignature, open]`

### Issue: Signature shows but doesn't apply to memo
**Solution**: Verify:
1. `handleUseExistingSignature()` calls `onSignatureSaved()`
2. Parent component handles `onSignatureSaved` callback
3. Approval API receives the signature

## Performance Tips

- Fetch happens async while dialog is opening
- Use signature URL directly (no base64 conversion needed)
- Index on `user_profiles(id)` WHERE signature exists
- Cache signature in React state to avoid re-fetches

## Adding to New Memo Types

To add auto-population to a new memo type:

```tsx
// 1. Import dialog
import { SignatureRequiredDialog } from "@/components/leave/signature-required-dialog"

// 2. Add state
const [showSignatureDialog, setShowSignatureDialog] = useState(false)

// 3. Show dialog on approve
const handleApprove = () => {
  setShowSignatureDialog(true)
}

// 4. Handle completion
const handleSignatureSaved = async () => {
  setShowSignatureDialog(false)
  // Proceed with approval
  await approveNewMemoType()
}

// 5. Render dialog
<SignatureRequiredDialog
  open={showSignatureDialog}
  onOpenChange={setShowSignatureDialog}
  hrName={signerName}
  onSignatureSaved={handleSignatureSaved}
/>
```

Done! Auto-population works automatically.
