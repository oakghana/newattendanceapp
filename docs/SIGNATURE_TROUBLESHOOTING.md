# Signature Not Appearing in Memos - Troubleshooting Guide

## Quick Checklist

- [ ] Browser console shows `[v0]` logs during memo download?
- [ ] Signature URL is populated (`hasSignatureUrl: true`)?
- [ ] Signature URL format is recognized (data URL or HTTP)?
- [ ] No fetch errors in console for HTTP URLs?
- [ ] jsPDF can add the image to PDF?

## Problem: No Signature in PDF

### Step 1: Check If Signature Exists in Database

Run in browser console while logged in as admin:
```javascript
// Check if current user has signature
fetch('/api/user-profile')
  .then(r => r.json())
  .then(d => console.log('Has signature:', !!d.signature_data_url, 'Length:', d.signature_data_url?.length || 0))
```

**Expected:** `Has signature: true Length: 15240` (or similar number > 0)

**If false:** User needs to upload signature in Profile Settings → Signature tab

### Step 2: Check Memo Data During Download

1. Open **Developer Console** (F12)
2. Go to **Leave Management → Payment & Download**
3. Click download button for a memo
4. Check console for logs starting with `[v0]`

**Look for:**
```
[v0] Single memo - Signer signature data: {
  hasSignatureUrl: true,  // ← Should be TRUE
  signatureLength: 15240, // ← Should be > 0
}
```

**If `hasSignatureUrl: false`:**
- Signature not enriched from API
- Check approved-memos API enrichment logic
- Verify signer_id is correct in memo record

### Step 3: Check Signature Processing

In console logs, look for:
```
[v0] Processing signature URL: data:image/png;base64,...
```

**If you see this:** Signature URL is valid, check next step

**If you don't see this:** Signature URL is empty or not passed to memo generator

### Step 4: Check Image Addition to PDF

Look for:
```
[v0] Signature image added successfully to PDF
```

**If present:** Signature was added - check if it appears in PDF itself

**If missing:** Check for warnings:
- `[v0] jsPDF addImage failed: ...` - jsPDF couldn't add image
- `[v0] Error converting signature blob to image: ...` - Conversion failed
- `[v0] Signature blob is empty (0 bytes)` - Fetch returned empty blob

## Problem: "No signature URL provided" Warning

This is expected if:
- User has no signature saved
- `memo.memo_body.selectedSigner.signature_data_url` is null
- Signature enrichment API didn't populate it

**Solution:** Upload signature in profile first

## Problem: Fetch Error for HTTP URLs

Console shows:
```
[v0] CORS fetch failed, trying without credentials
[v0] Failed to fetch signature: 403 Forbidden
```

**Possible causes:**
1. Supabase URL not accessible
2. CORS not configured
3. Signature URL expired
4. Signature file deleted from storage

**Solution:**
- Verify signature exists in Supabase
- Check bucket permissions allow public read
- Re-upload signature and test

## Problem: "Invalid Image Type" Error

If console shows:
```
[v0] Error converting signature blob to image: Unknown image format
```

**Solution:**
- Check signature is valid PNG or JPEG
- Re-upload signature in correct format
- Verify file isn't corrupted

## Expected Console Output Examples

### ✅ Successful Data URL Signature

```
[v0] Single memo - Signer signature data: {
  signerName: "HRM MARY ALLOTEY",
  hasSignatureUrl: true,
  signatureLength: 19234,
  signaturePreview: "data:image/png;base64,iVBORw0KGgo"
}
[v0] Processing signature URL: data:image/png;base64,iVBORw0KGgo...
[v0] Processing data URL signature
[v0] Adding data URL image: PNG
[v0] Signature image added successfully
```

### ✅ Successful HTTP URL Signature

```
[v0] Single memo - Signer signature data: {
  hasSignatureUrl: true,
  signatureLength: 245,
  signaturePreview: "https://supabase..."
}
[v0] Processing signature URL: https://supabase.../signature_...
[v0] Fetching signature from HTTP URL: https://supabase.../signature_...
[v0] Signature blob received: { size: 19234, type: "image/png" }
[v0] Converting signature: { base64Length: 25645, imageType: "PNG", contentType: "image/png" }
[v0] Adding signature image to PDF at position: { x: 10, y: 245, width: 44, height: 16 }
[v0] Signature image added successfully to PDF
```

### ❌ Missing Signature

```
[v0] Single memo - Signer signature data: {
  hasSignatureUrl: false,
  signatureLength: 0,
  signaturePreview: "NONE"
}
[v0] No signature URL provided for signatory
```

## Recovery Steps

1. **Upload Signature**
   - Go to Profile Settings
   - Upload signature image (PNG or JPEG)
   - Save profile

2. **Refresh Memo Data**
   - Go back to Leave Management
   - Click "Refresh" button
   - Try downloading again

3. **Clear Browser Cache** (if signature still doesn't appear)
   - Ctrl+Shift+Delete (Windows) or Cmd+Shift+Delete (Mac)
   - Clear cache
   - Refresh page

4. **Check Admin Enrichment**
   - Verify `approved-memos` API is enriching signatures
   - Check if memo has `signer_id` populated
   - Verify signer's signature_data_url is not empty

## When to Contact Support

If after all steps signature still doesn't appear:
1. Share console logs (screenshot or paste)
2. Confirm signature is uploaded in user profile
3. Provide memo ID that failed
4. Specify if using data URL or HTTP URL for signature

Include these details from console:
- `[v0]` log showing signature status
- Any error messages starting with `[v0]`
- Browser type and version
- Whether issue happens for all users or specific users only
