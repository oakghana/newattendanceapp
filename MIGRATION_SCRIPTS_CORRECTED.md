# Leave Management Migration - Corrected Scripts

## Issues Fixed

### ❌ Previous Issue
The initial migration script referenced a non-existent table: `leave_policies`

```sql
-- INCORRECT (table doesn't exist)
UPDATE leave_policies
SET leave_type_label = 'Leave Without Pay'
WHERE leave_type_key = 'unpaid';
```

### ✅ Corrected
Now uses the correct table: `leave_policy_catalog`

```sql
-- CORRECT
UPDATE leave_policy_catalog
SET leave_type_label = 'Leave Without Pay'
WHERE leave_type_key = 'unpaid'
AND leave_type_label IN ('Unpaid Leave', 'unpaid_leave');
```

---

## Running the Migration

Choose ONE method to run the migration:

### Method 1: Node.js Script (Recommended)

```bash
# From project root
node scripts/migrate-leave-dates.js
```

**What it does:**
- Connects to Supabase using service role key
- Updates `leave_policy_catalog` table
- Changes "Unpaid Leave" → "Leave Without Pay"
- Displays verification results
- Shows summary and next steps

**Requirements:**
- `.env.local` must have `SUPABASE_SERVICE_ROLE_KEY` set
- Node.js installed

### Method 2: Bash Script

```bash
# From project root
bash scripts/migrate-leave-dates.sh
```

**What it does:**
- Runs the Node.js script in a shell wrapper
- Validates environment before running
- Same result as Method 1

**Requirements:**
- Bash shell
- `.env.local` configured

### Method 3: Direct SQL (Supabase Console)

1. Go to Supabase Dashboard → SQL Editor
2. Create new query
3. Copy and run this SQL:

```sql
-- Update leave_policy_catalog table
UPDATE leave_policy_catalog
SET leave_type_label = 'Leave Without Pay'
WHERE leave_type_key = 'unpaid'
AND leave_type_label IN ('Unpaid Leave', 'unpaid_leave');

-- Ensure Special Leave is correctly labeled
UPDATE leave_policy_catalog
SET leave_type_label = 'Special Leave'
WHERE leave_type_key = 'special'
AND leave_type_label NOT IN ('Special Leave');

-- Verify changes
SELECT leave_type_key, leave_type_label FROM leave_policy_catalog 
WHERE leave_type_key IN ('unpaid', 'special') 
ORDER BY leave_type_key;
```

---

## Changes Completed

### ✅ Code Changes
- **File**: `app/dashboard/leave-management/hr-leave-analytics-panel.tsx`
- **Change**: Updated `LEAVE_TYPE_LABELS` object
  ```typescript
  unpaid: "Leave Without Pay"  // Changed from "Unpaid Leave"
  special: "Special Leave"     // Unchanged
  ```

### ✅ Date Format Changes
- **Files**: `app/dashboard/leave-planning/leave-planning-client.tsx`
- **Changed**: `fmtLongDate()`, `fmtFormalDate()`, `fmtFormalDateWithWeekday()`
- **Format**: Now displays as `dd/mm/yyyy` (e.g., `15/01/2025`)

### ✅ Label Changes
- **File**: `app/dashboard/leave/deferment-recall/page.tsx`
- **Changed**: "Return to work" → "Resumption date"

### ✅ Staff Management Roles
- **File**: `components/admin/staff-management.tsx`
- **Added**: "HR Leave Office" role to all dropdowns
  - Role filter dropdown
  - Add Staff modal
  - Edit Staff modal

---

## Database Table Reference

**Correct Table Name**: `leave_policy_catalog`

**Table Structure**:
```
leave_policy_catalog:
├── id (uuid)
├── leave_type_key (varchar) - e.g., "unpaid", "special"
├── leave_type_label (varchar) - e.g., "Leave Without Pay", "Special Leave"
├── leave_year_period (varchar)
├── entitlement_days (integer)
├── is_enabled (boolean)
├── is_active_period (boolean)
├── sort_order (integer)
├── created_at (timestamp)
├── updated_at (timestamp)
└── created_by (uuid)
```

---

## After Migration

1. **Restart Dev Server**
   ```bash
   npm run dev
   ```

2. **Clear Browser Cache**
   - Hard refresh: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
   - Or clear all site data in browser settings

3. **Test in Leave Management Module**
   - Navigate to Leave Management
   - Check that leave types display correctly
   - Verify "Leave Without Pay" appears instead of "Unpaid Leave"

4. **Verify Date Format**
   - Dates should show as `dd/mm/yyyy` (15/01/2025)
   - Not as long format (15 January, 2025)

5. **Check Staff Management**
   - Open Staff Management
   - Verify "HR Leave Office" appears in role dropdowns

---

## Troubleshooting

### Error: "relation 'leave_policies' does not exist"
**Solution**: Use the corrected scripts. They now reference `leave_policy_catalog`.

### Migration didn't work
**Try**: Run the migration again with the corrected script:
```bash
node scripts/migrate-leave-dates.js
```

### Date format still showing old format
**Solution**: 
1. Clear browser cache completely
2. Hard refresh: `Ctrl+Shift+R`
3. Restart dev server: `npm run dev`

### Can't find `leave_policy_catalog` table
**Verify**:
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'leave%';
```

Should show: `leave_policy_catalog` (among others)

---

## Files Modified

```
Code Changes:
✓ app/dashboard/leave-management/hr-leave-analytics-panel.tsx
✓ app/dashboard/leave-planning/leave-planning-client.tsx
✓ app/dashboard/leave/deferment-recall/page.tsx
✓ components/admin/staff-management.tsx

Migration Scripts (CORRECTED):
✓ supabase/migrations/update_leave_type_labels.sql
✓ scripts/migrate-leave-dates.js
✓ scripts/migrate-leave-dates.sh

Documentation:
✓ LEAVE_DATE_MIGRATION_GUIDE.md (original)
✓ MIGRATION_SCRIPTS_CORRECTED.md (this file)
```

---

## Summary

All migration scripts have been corrected to use the proper `leave_policy_catalog` table. You can now safely run any of the three migration methods to update your leave type labels from "Unpaid Leave" to "Leave Without Pay" and enjoy the updated date format and terminology throughout the leave management system.
