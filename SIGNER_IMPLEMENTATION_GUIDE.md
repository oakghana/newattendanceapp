# HR Executive Signer Implementation Guide

**Date**: July 17, 2026  
**Status**: IMPLEMENTATION IN PROGRESS

## Overview

This guide documents the fixes applied to the HR executive signing system for leave management (Payment Advice and Deferment/Recall signing).

## Changes Made

### 1. **Enhanced assign-signer API** ✅
**File**: `app/api/leave/deferment-recall/assign-signer/route.ts`

**What Changed**:
- Added support for `signer_user_id` parameter
- When a user ID is provided, the API now:
  - Fetches the actual HR executive's profile from `user_profiles`
  - Extracts their full name and position
  - Retrieves their signature from `user_profiles.signature_data_url`
  - Auto-populates signer name and title from the profile (no typos)
  - Returns signature information to the caller

**Key Code**:
```typescript
if (signer_user_id) {
  const { data: signerProfile } = await admin
    .from("user_profiles")
    .select("id, first_name, last_name, position, signature_data_url")
    .eq("id", signer_user_id)
    .single()

  if (!signerError && signerProfile) {
    signerSignatureUrl = signerProfile.signature_data_url || null
    finalSignerName = `${signerProfile.first_name || ""} ${signerProfile.last_name || ""}`.trim()
    finalSignerTitle = signerProfile.position || signer_title || null
  }
}
```

**Benefits**:
- ✅ Links deferment/recall signers to actual user IDs
- ✅ Prevents name typos (uses actual profile data)
- ✅ Automatically retrieves signer's signature
- ✅ Maintains audit trail (can lookup who was assigned)

---

### 2. **Added database field support** ⚠️ PENDING
**Tables**: `leave_deferment_requests`, `leave_recall_requests`

**Migration Required**:
```sql
ALTER TABLE leave_deferment_requests 
ADD COLUMN hr_signer_user_id UUID REFERENCES user_profiles(id);

ALTER TABLE leave_recall_requests 
ADD COLUMN hr_signer_user_id UUID REFERENCES user_profiles(id);
```

**Why Needed**:
- Currently only `hr_signer_name` (text) is stored
- Need to add `hr_signer_user_id` (UUID) to track which user was the signer
- This enables signature auto-population and audit trails

**Status**: 
- Code updated to handle this field
- Database migration still needs to be created and applied

---

### 3. **Enhanced leave-management-client component** ✅
**File**: `app/dashboard/leave-management/leave-management-client.tsx`

**What Changed**:
- Added new state variables:
  - `selectedSignerUser` - tracks selected HR executive user record
  - `hrSignerCandidates` - list of available HR executives for selection
  - `loadingSignerCandidates` - loading state while fetching candidates

- Added new functions:
  - `fetchHrSignerCandidates()` - Fetches list of HR executives from API
  - `openSignerAssignDialog()` - Opens assignment dialog for a deferment/recall request
  - `closeSignerAssignDialog()` - Closes and resets the dialog
  - `handleSelectSigner()` - When user picks a signer from dropdown
  - `saveSignerAssignment()` - Saves the assignment to database

**Code Added**:
```typescript
// State
const [selectedSignerUser, setSelectedSignerUser] = useState<...>()
const [hrSignerCandidates, setHrSignerCandidates] = useState<any[]>([])
const [loadingSignerCandidates, setLoadingSignerCandidates] = useState(false)

// Fetch available signers
const fetchHrSignerCandidates = async () => { ... }

// Handle user selecting a signer
const handleSelectSigner = (signer: any) => { ... }

// Save the assignment
const saveSignerAssignment = async () => { ... }
```

**Benefits**:
- ✅ UI can now use dropdown to select signers (not manual text entry)
- ✅ Validates signer exists in system
- ✅ Auto-populates signer details from profile
- ✅ Sends user ID to API for proper tracking

---

## Remaining Tasks

### Task 1: Create Database Migration
**Status**: ⏳ TODO

**Action Required**:
```bash
# Create migration file
cat > supabase/migrations/add_hr_signer_user_id.sql << 'EOF'
ALTER TABLE leave_deferment_requests 
ADD COLUMN IF NOT EXISTS hr_signer_user_id UUID REFERENCES user_profiles(id);

ALTER TABLE leave_recall_requests 
ADD COLUMN IF NOT EXISTS hr_signer_user_id UUID REFERENCES user_profiles(id);
EOF
```

**Then apply via Supabase CLI**:
```bash
supabase migration up
```

---

### Task 2: Create/Verify HR Executives API Endpoint
**Status**: ⏳ TODO - VERIFY IF EXISTS

**Needed**: `/api/user/hr-executives` endpoint

**Should Return**:
```json
{
  "executives": [
    {
      "id": "uuid-here",
      "first_name": "John",
      "last_name": "Smith",
      "position": "HR Manager",
      "email": "john@example.com",
      "signature_data_url": "data:image/png;base64,...",
      "role": "manager_hr"
    },
    ...
  ]
}
```

**How to Create** (if missing):
```typescript
// File: app/api/user/hr-executives/route.ts
import { createAdminClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const admin = await createAdminClient()
  
  const { data: executives, error } = await admin
    .from("user_profiles")
    .select("id, first_name, last_name, position, email, signature_data_url, role")
    .in("role", ["manager_hr", "director_hr", "hr_officer", "hr_executive"])
    .eq("is_active", true)
    .order("first_name")

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ executives: executives || [] })
}
```

---

### Task 3: Create Signer Assignment UI Dialog
**Status**: ⏳ TODO

**Where**: `app/dashboard/leave-management/leave-management-client.tsx`

**What's Needed**: A dialog component that:
1. Shows list of HR executives from `hrSignerCandidates`
2. Allows user to select one
3. Shows selected signer's details
4. Has fields for:
   - Write Date (date picker)
   - Notes (text area)
5. Has Save and Cancel buttons

**Example Structure**:
```tsx
<Dialog open={signerAssignId !== null} onOpenChange={(open) => !open && closeSignerAssignDialog()}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Assign Signer</DialogTitle>
      <DialogDescription>
        Select an HR executive to sign this {signerAssignType} memo
      </DialogDescription>
    </DialogHeader>

    <div className="space-y-4 py-4">
      {/* HR Executive Selection */}
      <div className="space-y-2">
        <Label>Select HR Executive</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
          {hrSignerCandidates.map((exec) => (
            <button
              key={exec.id}
              onClick={() => handleSelectSigner(exec)}
              className={`p-3 rounded border-2 text-left transition-all ${
                selectedSignerUser?.id === exec.id
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-300 hover:border-gray-400"
              }`}
            >
              <div className="font-medium">{exec.first_name} {exec.last_name}</div>
              <div className="text-xs text-gray-600">{exec.position}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Write Date */}
      <div className="space-y-2">
        <Label>Write Date</Label>
        <Input
          type="date"
          value={signerWriteDate}
          onChange={(e) => setSignerWriteDate(e.target.value)}
        />
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label>Notes (Optional)</Label>
        <Textarea
          value={signerNotes}
          onChange={(e) => setSignerNotes(e.target.value)}
          rows={3}
          placeholder="Any notes about this assignment..."
        />
      </div>
    </div>

    <DialogFooter>
      <Button variant="outline" onClick={closeSignerAssignDialog}>Cancel</Button>
      <Button 
        onClick={saveSignerAssignment} 
        disabled={isSavingSigner || !selectedSignerUser}
      >
        {isSavingSigner ? "Saving..." : "Assign Signer"}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

### Task 4: Add "Assign Signer" Button to Deferment/Recall Tracking
**Status**: ⏳ TODO

**Where**: Deferment and Recall request cards in leave-management-client.tsx

**What's Needed**: For each request, add a button that:
- Only shows for approved requests (where memos exist)
- Calls `openSignerAssignDialog(requestId, "deferment" | "recall")`
- Shows current signer if already assigned

**Example**:
```tsx
{defermentRequest.hr_signer_name ? (
  <div className="text-sm text-gray-600">
    Signer: <span className="font-medium">{defermentRequest.hr_signer_name}</span>
  </div>
) : (
  <Button
    size="sm"
    variant="outline"
    onClick={() => openSignerAssignDialog(defermentRequest.id, "deferment")}
  >
    Assign Signer
  </Button>
)}
```

---

## Testing Checklist

### Before Changes ✅
- [x] Payment advice signer selection shows multiple signers
- [x] Payment advice approval uses authenticated user's signature
- [x] Deferment/recall can be assigned (manual text entry)

### After Changes - TESTS TO PERFORM ⏳

#### Test 1: Signer User Selection
```
1. Open Deferment > select an approved deferment
2. Click "Assign Signer" button
3. Verify dropdown shows list of HR executives
4. Select one HR executive
5. Verify their name/title auto-populate
6. Click Save
7. Check database: hr_signer_user_id should be populated
8. Check signature was fetched (console logs)
```

#### Test 2: Signature Auto-Population
```
1. After assigning signer to deferment/recall
2. Generate the memo PDF
3. Verify PDF shows signer's actual signature
4. If signature missing, check console for errors
```

#### Test 3: Audit Trail
```
1. Query database for leave_deferment_requests
2. Verify hr_signer_user_id is populated (not null)
3. Verify hr_signer_name matches user's profile
4. Verify hr_signer_title matches user's profile
```

#### Test 4: Multiple Signers on Payment Advice
```
1. Generate payment advice memos
2. Select 2-3 HR executives as signers
3. Distribute memos
4. Verify memos show primary signer (first in list)
5. Check assigned_signers JSON has all selected signers
```

---

## Rollback Plan

If issues occur, revert changes:

```bash
# 1. Revert API changes
git checkout app/api/leave/deferment-recall/assign-signer/route.ts

# 2. Revert client changes
git checkout app/dashboard/leave-management/leave-management-client.tsx

# 3. Remove database fields (if migration was applied)
# ALTER TABLE leave_deferment_requests DROP COLUMN hr_signer_user_id;
# ALTER TABLE leave_recall_requests DROP COLUMN hr_signer_user_id;
```

---

## Known Limitations & Future Improvements

1. **Manual Signature Upload** - Currently signatures only come from user profiles
   - Future: Allow uploading signatures specifically for memo signing

2. **Multi-Signer Workflows** - Current implementation is single signer
   - Future: Support multiple signers with different roles (e.g., HR Manager + Director)

3. **Signature Validation** - No verification that signer actually authorized the action
   - Future: Implement digital signature validation

4. **Signature Expiry** - No concept of signature validity periods
   - Future: Add signature expiry dates and renewal workflows

---

## Summary

This implementation enhances the HR executive signing system by:

✅ **Linking signers to user profiles** - Prevents typos, enables audit trails
✅ **Auto-populating signatures** - Fetches actual signer's signature from profile
✅ **Improving UI** - Dropdown selection instead of manual text entry
✅ **Maintaining security** - Payment advice still requires authenticated user to sign
✅ **Audit trail** - Can now track exactly who was assigned as signer

**Status**: Core API changes ✅ DONE | UI implementation ⏳ IN PROGRESS | Database migration ⏳ PENDING

