# Digital Signature Storage System - Database & Implementation Guide

## Overview
This document explains the permanent digital signature storage system for QCC Attendance & Leave Management System.

## Database Schema

### user_profiles Table - Signature Fields

Three new columns added to store permanent user signatures:

#### 1. `signature_data_url` (TEXT)
- **Purpose**: Store the permanent URL of the user's digital signature image
- **Storage**: Vercel Blob storage (public URL)
- **Size**: TEXT (supports URLs up to ~65KB)
- **Usage**: Primary source for user signatures
- **When Populated**: When user saves a signature via Profile > Signature tab
- **Persistence**: Permanent until user updates or clears

#### 2. `signature_updated_at` (TIMESTAMP WITH TIME ZONE)
- **Purpose**: Track when the signature was last saved or updated
- **Default**: NOW() (current timestamp)
- **Usage**: For auditing and determining signature age
- **Auto-Updated**: Every time signature is saved/cleared

#### 3. `signature_mode` (CHARACTER VARYING)
- **Purpose**: Track how the signature was created
- **Values**: `'draw'` or `'upload'`
- **Default**: `'draw'`
- **Usage**: For UI/UX consistency when displaying signature options

### Migration SQL

```sql
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS signature_data_url TEXT;

ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS signature_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS signature_mode CHARACTER VARYING DEFAULT 'draw';

CREATE INDEX IF NOT EXISTS idx_user_profiles_signature_data_url 
ON user_profiles(id) WHERE signature_data_url IS NOT NULL;
```

## API Endpoints

### 1. POST /api/user/signature-save
**Purpose**: Save a new signature or update existing one

**Request Body**:
```json
{
  "signature_data_url": "data:image/png;base64,iVBORw0KGgo..."
}
```

**Response**:
```json
{
  "success": true,
  "message": "Signature saved successfully",
  "signature": {
    "id": "uuid",
    "signature_data_url": "https://blob-storage.vercel-storage.com/signatures/..."
  }
}
```

**Process**:
1. Converts base64 data URL to binary
2. Uploads to Vercel Blob storage
3. **Saves to user_profiles** (permanent storage) ✓
4. Saves to approval_signature_registry (for backward compatibility)
5. Returns the saved signature

### 2. GET /api/user/signature-save
**Purpose**: Retrieve user's saved signature

**Response**:
```json
{
  "success": true,
  "signature": {
    "signature_data_url": "https://blob-storage.vercel-storage.com/signatures/...",
    "signature_mode": "draw",
    "updated_at": "2024-05-29T10:30:00Z",
    "source": "user_profiles"
  }
}
```

**Logic** (Priority order):
1. Check `user_profiles.signature_data_url` (primary source)
2. Fallback to `approval_signature_registry` (backward compatibility)
3. Return null if no signature found

### 3. DELETE /api/user/signature-clear
**Purpose**: Clear/remove user's saved signature

**Response**:
```json
{
  "success": true,
  "message": "Signature cleared successfully"
}
```

**Process**:
1. Deletes from Vercel Blob storage
2. Clears `user_profiles.signature_data_url` to NULL
3. Clears `approval_signature_registry` entries
4. Returns success confirmation

## Blob Storage Structure

Signatures are stored in Vercel Blob with the following path structure:

```
signatures/
├── {user_id}/
│   ├── 1621234567890.png  (timestamp of upload)
│   ├── 1621234567891.png
│   └── ...
```

**Features**:
- Public access (can be displayed in memos/documents)
- PNG format (lossless compression)
- Automatic cleanup of old signatures when new one is uploaded
- URL format: `https://{blob-domain}.vercel-storage.com/signatures/{user_id}/{timestamp}.png`

## Frontend Implementation

### Profile Component (`components/profile/profile-client.tsx`)

**Key Functions**:

1. **Load Signature on Tab Switch**
```typescript
useEffect(() => {
  if (activeTab === "signature") {
    loadExistingSignature()
  }
}, [activeTab])

const loadExistingSignature = async () => {
  const res = await fetch("/api/user/signature-save", { method: "GET" })
  const data = await res.json()
  if (data.signature?.signature_data_url) {
    setSignatureDataUrl(data.signature.signature_data_url)
  }
}
```

2. **Save Signature**
```typescript
const response = await fetch("/api/user/signature-save", {
  method: "POST",
  body: JSON.stringify({ signature_data_url: signatureDataUrl })
})
```

3. **Clear Signature**
```typescript
const response = await fetch("/api/user/signature-clear", {
  method: "DELETE"
})
```

## Data Flow Diagram

```
User Action (Profile > Signature Tab)
        ↓
    Draw/Upload Signature
        ↓
    Save Signature Button
        ↓
POST /api/user/signature-save
        ↓
    Upload to Vercel Blob
        ↓
    Save URL to user_profiles ✓ (PRIMARY)
    Save to approval_signature_registry (backup)
        ↓
    Return URL to Frontend
        ↓
    Display Success Message
        ↓
User leaves Profile page
        ↓
User returns to Profile > Signature Tab
        ↓
    Component mounts & loads Signature Tab
        ↓
GET /api/user/signature-save
        ↓
    Query user_profiles.signature_data_url ✓
    (OR fallback to approval_signature_registry)
        ↓
    Return signature_data_url
        ↓
    Display saved signature ✓ PERSISTENT
```

## Usage in Payment Advice Memos

When HR executives approve payment advice memos:

1. System queries `user_profiles.signature_data_url`
2. Auto-populates signature in memo
3. Displays signature in PDF/document
4. Marks memo as "signed_by_hr_executive"

## Backup & Redundancy

**Two Storage Systems**:

| Storage | Purpose | Persistence |
|---------|---------|-------------|
| `user_profiles` | User-accessible, permanent | Yes - Primary |
| `approval_signature_registry` | Workflow-specific, auditing | Yes - Backup |
| Vercel Blob | Image file storage | Yes - Cloud |

**Recovery**:
- If `user_profiles` corrupted → fallback to `approval_signature_registry`
- If Blob URL broken → regenerate upload
- If user deletes → both tables and Blob are cleared

## Security Considerations

1. **Row-Level Security (RLS)**: Users can only access their own signature
2. **Public URLs**: Signature images have public read access (needed for memos)
3. **HTTPS**: All Blob URLs are HTTPS secured
4. **Deletion**: Permanent deletion from all systems when user clears signature

## Performance

- **Load time**: O(1) - single user_profiles lookup
- **Save time**: O(1) + Blob upload time (~100-500ms)
- **Storage**: ~50-200KB per signature (PNG format)
- **Query optimization**: Index on `signature_data_url` WHERE clause

## Testing

### Verify Persistence
```sql
-- Check if signature saved to user_profiles
SELECT id, email, signature_data_url, signature_updated_at 
FROM user_profiles 
WHERE id = 'user-uuid';

-- Verify URL is accessible
-- Open URL in browser or use: curl https://blob-url.png
```

### Test Scenario
1. Save signature via Profile UI
2. Refresh page → signature should still show
3. Close browser → reopen → navigate to Profile > Signature → signature should load
4. Change to different user → logout/login → signature should be user-specific
5. Clear signature → signature removed from all systems

## Troubleshooting

**Signature not persisting after page refresh?**
- Check browser console for API errors
- Verify `signature_data_url` is populated in `user_profiles` table
- Check Blob storage URL is still accessible

**Signature not showing in memo approval?**
- Verify HR executive saved signature in Profile
- Check `user_profiles.signature_data_url` is not NULL
- Verify Blob storage access permissions

**Old signature still showing after update?**
- Clear browser cache (Ctrl+Shift+Delete)
- Verify new signature in database: `SELECT signature_updated_at FROM user_profiles`
- Check old Blob URL is deleted

## Future Enhancements

- [ ] Signature versioning (keep history of changes)
- [ ] Signature templates (organization branding)
- [ ] Bulk signature upload for new hires
- [ ] Signature validation (ensure legibility/minimum size)
- [ ] Automated signature renewal (annual updates)
