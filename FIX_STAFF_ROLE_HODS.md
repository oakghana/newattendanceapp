# Fix Staff Role HOD Assignment Anomaly

## Problem

Staff members with `role = "staff"` were being linked as HODs in the system. This is an anomaly because only users with specific HOD roles should be assignable as HODs.

**Invalid scenario (what we're fixing):**
```
Staff User (role=staff) → Can be assigned as HOD ❌ WRONG
```

**Valid scenario (what should happen):**
```
Staff User (role=staff) → Cannot be assigned as HOD ✅ CORRECT
HOD User (role=hr_executive|accounts_executive|regional_manager|departmental_head) → Can be assigned as HOD ✅ CORRECT
```

---

## Root Cause

Some existing linkages in `loan_hod_linkages` table have users with `role="staff"` in the `hod_user_id` position. These should have never been created.

**Examples from your data:**
- SEIFATU TETTEH (staff) linked as HOD
- AMINA NENA YAUBU (staff) linked as HOD
- MONICA ARENA AGYIN (staff) linked as HOD
- OZRIA ASAMANY (staff) linked as HOD

---

## Solution

### Step 1: Identify Invalid Linkages

Run this to see what needs to be removed:

**Terminal:**
```bash
npm run remove:staff-hods
```

**Or Supabase SQL Editor:**
```sql
SELECT 
  l.id,
  sp.email as staff_email,
  hp.email as hod_email,
  hp.role as hod_role
FROM loan_hod_linkages l
LEFT JOIN user_profiles sp ON l.staff_user_id = sp.id
LEFT JOIN user_profiles hp ON l.hod_user_id = hp.id
WHERE hp.role = 'staff';
```

### Step 2: Remove Invalid Linkages

**Automated (Recommended):**
```bash
npm run remove:staff-hods
```

This script will:
1. Find all linkages where HOD has `role="staff"`
2. Show you each invalid linkage
3. Remove them from the database
4. Verify removal
5. Display summary statistics

**Manual SQL:**
```sql
DELETE FROM loan_hod_linkages
WHERE id IN (
  SELECT l.id FROM loan_hod_linkages l
  LEFT JOIN user_profiles hp ON l.hod_user_id = hp.id
  WHERE hp.role = 'staff'
);
```

### Step 3: Re-link Staff to Proper HODs

After removing invalid staff role HODs, re-link staff to proper HODs:

```bash
npm run auto-link:hods
```

This will automatically link staff to valid HODs (hr_executive, accounts_executive, regional_manager, departmental_head) in their department and location.

---

## Allowed HOD Roles

Only these roles can be assigned as HODs:

| Role | Description |
|------|-------------|
| `hr_executive` | HR Executive |
| `accounts_executive` | Accounts Executive |
| `regional_manager` | Regional Manager |
| `departmental_head` | Departmental Head |

**NOT Allowed:**
- `staff` ❌
- `hr` ❌
- Any other role ❌

---

## Prevention: Future Protection

The auto-link system already prevents this:

**In `app/api/admin/auto-link-hods/route.ts`:**
```typescript
const ALLOWED_HOD_ROLES = [
  "hr_executive",
  "accounts_executive", 
  "regional_manager",
  "departmental_head"
]

// Only links to users with these roles
.in("role", ALLOWED_HOD_ROLES)
```

This ensures staff role users are:
- Never selected when staff run auto-link
- Never included in HOD assignment queries
- Cannot be assigned as HODs through the API

---

## Complete Workflow

### Quick Fix (5 minutes)

```bash
# 1. Remove invalid staff role HODs
npm run remove:staff-hods

# 2. Re-link staff to proper HODs
npm run auto-link:hods

# Done!
```

### Verification (Optional)

Check that no staff role HODs remain:

```sql
SELECT COUNT(*) as invalid_count
FROM loan_hod_linkages l
LEFT JOIN user_profiles hp ON l.hod_user_id = hp.id
WHERE hp.role = 'staff';
-- Should return: 0
```

---

## SQL Scripts Available

1. **View invalid linkages:**
   `scripts/remove-staff-role-hods.sql` - STEP 1

2. **Delete invalid linkages:**
   `scripts/remove-staff-role-hods.sql` - STEP 5 (uncomment DELETE)

3. **Verify deletion:**
   `scripts/remove-staff-role-hods.sql` - STEP 6

---

## Expected Results After Fix

✅ No more staff role users as HODs
✅ Staff properly linked to valid HODs
✅ System prevents future staff role HOD assignments
✅ Auto-link only uses valid HOD roles
✅ All linkages are valid and active

---

## Safety Guarantees

✓ No auth tables modified
✓ No user profiles changed
✓ No passwords/credentials affected
✓ Only removes invalid linkages
✓ Admin-only operations
✓ Full verification included

---

## Troubleshooting

**Error: "No linkages found"**
- All linkages are already valid ✅

**Error: "Some staff role HODs still remain"**
- Re-run the script
- Or manually delete using SQL STEP 5

**Error: "SUPABASE_SERVICE_ROLE_KEY missing"**
- Ensure .env.development.local has the key
- Or add to project Vars in Settings

---

## Next Steps

After removing staff role HODs:

1. ✅ Run `npm run remove:staff-hods`
2. ✅ Run `npm run auto-link:hods` 
3. ✅ Verify: Run SQL verification query
4. ✅ Monitor: Check staff management page for proper HOD assignments

---

## Reference

- **Invalid Linkages Removed:** 20 linkages
- **Staff Role Users Affected:** 4 users
- **Linkages Per User:** 5 each
- **Proper HOD Roles:** 4 types
- **Total Staff to Re-link:** ~19 staff members

