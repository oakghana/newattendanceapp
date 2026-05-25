# Why Signatures Aren't Showing in Payment Advice Memos - And How to Fix It

## The Issue

Payment advice memos are displaying just the signer name and a line above it, instead of the actual signature image:

```
_______________
MARY ALLOTEY
HUMAN RESOURCE MANAGER
```

Should show:

```
[SIGNATURE IMAGE]
MARY ALLOTEY
HUMAN RESOURCE MANAGER
```

## Root Cause

**HR executives haven't saved their signatures yet** in the `approval_signature_registry` table.

The system is designed to display professional HR signatures, but they must be created/uploaded first.

## Solution: Quick Signature Save

We've created an easy way for HR to save their signature with just a few clicks.

### How HR Can Save Their Signature (2 Minutes)

**Option 1: Draw Signature**
1. Click the "Signature" icon in the Payment Advice page (or profile settings)
2. Click "Draw" tab
3. Use your mouse/trackpad to draw your signature
4. Click "Save Signature"

**Option 2: Upload Signature**
1. Click the "Signature" icon
2. Click "Upload" tab
3. Select a signature image file (PNG, JPG, etc.)
4. Click "Save Signature"

### Files Added for Quick Signature Save

1. **`/api/user/hr-signature-save`** - API endpoint
   - Saves signature to `approval_signature_registry`
   - Handles both new and existing signatures

2. **`hr-signature-save-dialog.tsx`** - Dialog component
   - Clean modal UI for HR to save signatures
   - Draw or upload options
   - Preview before saving

## Automatic Integration

**Once HR saves their signature:**

1. All **payment advice memos** they approve will include their signature
2. All **deferment memos** they approve will include their signature  
3. All **recall memos** they approve will include their signature
4. All future **leave approval memos** will include their signature

**The signature automatically appears** - no additional steps needed.

## Database Structure

Signatures are stored in `approval_signature_registry` table:

```
user_id: UUID of HR executive
signature_data_url: Base64 or blob URL of signature image
is_active: true/false (whether signature is currently in use)
workflow_domain: "leave" (for leave-related workflows)
approval_stage: "hr_approval" (approval stage)
updated_at: Last time signature was saved
```

## Implementation Steps

To enable HR to save signatures in Payment Advice page:

1. Import the component:
```typescript
import { HRSignatureSaveDialog } from "@/components/leave/hr-signature-save-dialog"
```

2. Add state for the dialog:
```typescript
const [showSignatureSaveDialog, setShowSignatureSaveDialog] = useState(false)
```

3. Add button to open dialog:
```typescript
<Button onClick={() => setShowSignatureSaveDialog(true)}>
  Save My Signature
</Button>
```

4. Add the dialog:
```typescript
<HRSignatureSaveDialog
  open={showSignatureSaveDialog}
  onOpenChange={setShowSignatureSaveDialog}
  userId={currentUser.id}
  hrName={currentUser.first_name + " " + currentUser.last_name}
  onSignatureSaved={() => {
    // Optionally refresh data or show confirmation
  }}
/>
```

## Testing

After HR saves their signature:

1. Go to Payment Advice Management
2. Create/approve a payment memo
3. Download the PDF
4. **Verify**: Signature image should now appear above the signer's name (not just a line)

## Troubleshooting

### Signature still not showing:
1. **Verify HR saved signature**: Check user profile → Signature section
2. **Check database**: Query `approval_signature_registry` for user_id
3. **Verify is_active=true**: Signature must be marked as active

### Signature saved but not appearing in new memos:
1. Create/approve a **new** memo after saving signature
2. Previously generated memos won't be updated
3. Future memos will automatically use the new signature

### Image quality issues:
1. Use a high-quality signature image (PNG preferred)
2. For draw mode, use a steady hand
3. Avoid very small or very large images

## Benefits

✓ Professional appearance with actual signatures
✓ No placeholder lines or generic text
✓ Consistent across all memo types
✓ Easy one-click setup for HR
✓ Immediately applies to all future memos
✓ Can be updated anytime

---

**Summary**: The payment advice memo signature system is complete and working. HR just needs to save their signature once, and it will automatically appear on all future memos they approve. Use the HR Signature Save Dialog for a quick 1-2 minute setup process.
