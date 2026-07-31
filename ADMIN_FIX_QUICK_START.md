# Admin Menu Access Fix - Quick Start

## 🚀 Fastest Solution (30 seconds)

### Run This Command:
```bash
npm run fix:admin-menu
```

That's it! The script will:
1. ✅ Check current admin users
2. ✅ Normalize their roles
3. ✅ Verify it worked
4. ✅ Tell you what to do next

---

## 📋 If You Prefer SQL (2 minutes)

Go to: https://app.supabase.com/ → SQL Editor → New Query

**Run these 3 queries in order:**

### Query 1: Check current state
```sql
SELECT id, email, role FROM user_profiles
WHERE LOWER(TRIM(role)) LIKE '%admin%';
```

### Query 2: Fix the roles
```sql
UPDATE user_profiles
SET role = 'admin'
WHERE LOWER(TRIM(role)) LIKE '%admin%'
  AND LOWER(TRIM(role)) != 'admin';
```

### Query 3: Verify it worked
```sql
SELECT id, email, role FROM user_profiles
WHERE role = 'admin';
```

---

## ✅ Activate Changes

After running either method above:

1. **Clear browser cache**
   - Windows/Linux: `Ctrl + Shift + Delete`
   - Mac: `Cmd + Shift + Delete`

2. **Restart dev server**
   ```bash
   npm run dev
   ```

3. **Test access**
   - Log in as admin
   - Check sidebar for "Memo Console" and "Disbursement Confirmation"
   - Both should be visible now ✅

---

## 🆘 Still Not Working?

**Step 1: Check the fix took effect**
```sql
SELECT email, role FROM user_profiles WHERE role = 'admin';
```
Should show your admin users with `role = 'admin'`.

**Step 2: Log out completely**
- Clear all cookies
- Close browser
- Reopen and log in again

**Step 3: Check browser console**
- Press F12
- Go to Console tab
- Look for messages with `[v0] Disbursement visibility check`
- Verify it shows `effectiveRole: "admin"`

**Step 4: Read full guide**
- See `ADMIN_ACCESS_FIX.md` for detailed troubleshooting

---

## 📂 Files Provided

| File | Use When |
|------|----------|
| `fix-admin-template.js` | Prefer automated solutions |
| `fix-admin-queries.sql` | Prefer manual SQL control |
| `ADMIN_ACCESS_FIX.md` | Need detailed guide |
| `scripts/fix-admin-menu-access.mjs` | Want setup documentation |

---

## What Gets Fixed

✅ **Memo Console** → Admin can now access `/dashboard/secretary-memos`
✅ **Disbursement Confirmation** → Admin can now access `/dashboard/disbursement-confirmation`

---

## Why This Happens

The sidebar checks if a user's role matches one of the allowed roles:
- **Menu requires:** `role === "admin"` (lowercase, no spaces)
- **Database may have:** `"Admin"`, `"ADMIN"`, `"AdminUser"`, etc.
- **Result:** Role doesn't match, so menu isn't shown

The fix normalizes all admin-related roles to exactly `"admin"`.

---

## Next Steps

1. Run: `npm run fix:admin-menu`
2. Wait for confirmation
3. Clear browser cache
4. Restart dev server
5. Refresh browser
6. Test access

Done! ✅
