# Leave Type and Date Format Migration Guide

## Overview

This migration updates the leave management system with the following changes:

1. **Leave Type Labels**: Separate "Special Leave" from "Leave Without Pay"
2. **Date Format**: Change all dates to dd/mm/yyyy format
3. **Labels**: Rename "Return to work" to "Resumption date"

## What's Changed

### 1. Leave Type Updates

| Leave Type | Old Label | New Label | Database Key |
|-----------|-----------|-----------|--------------|
| Unpaid | "Unpaid Leave" | "Leave Without Pay" | `unpaid` |
| Special | "Special Leave" | "Special Leave" | `special` |

**Impact**: Staff and HR will see clearer leave type descriptions in all modules.

### 2. Date Format Changes

**Old Format**: Long date with month name (e.g., "15 January, 2025")
**New Format**: dd/mm/yyyy (e.g., "15/01/2025")

**Files Updated**:
- `app/dashboard/leave-planning/leave-planning-client.tsx`
  - `fmtLongDate()` - General date display
  - `fmtFormalDate()` - Formal date display
  - `fmtFormalDateWithWeekday()` - Weekday + date display

**Impact**: All leave dates throughout the system will display as dd/mm/yyyy.

### 3. Label Changes

**Old Label**: "Return to work"
**New Label**: "Resumption date"

**Files Updated**:
- `app/dashboard/leave/deferment-recall/page.tsx`

**Impact**: More formal and HR-appropriate terminology in leave interfaces.

## Installation Steps

### Option 1: Automatic Migration (Recommended)

#### For Local Development:

```bash
# 1. Ensure you're in project root
cd /path/to/v0-project

# 2. Make scripts executable
chmod +x scripts/migrate-leave-dates.sh

# 3. Run the migration script
bash scripts/migrate-leave-dates.sh

# 4. Restart dev server
npm run dev
```

#### For Node.js Script (Cross-platform):

```bash
# 1. Install dotenv if not installed
npm install --save-dev dotenv

# 2. Run the Node.js migration
node scripts/migrate-leave-dates.js

# 3. Restart dev server
npm run dev
```

### Option 2: Manual Database Migration

If scripts don't work, run this SQL directly in Supabase:

```sql
-- Update unpaid leave label
UPDATE leave_policies
SET leave_type_label = 'Leave Without Pay'
WHERE leave_type_key = 'unpaid'
AND leave_type_label IN ('Unpaid Leave', 'unpaid_leave');

-- Verify the changes
SELECT leave_type_key, leave_type_label, entitlement_days, is_enabled
FROM leave_policies
WHERE leave_type_key IN ('unpaid', 'special')
ORDER BY leave_type_key;
```

**Steps**:
1. Go to [Supabase Console](https://app.supabase.com)
2. Select your project
3. Go to SQL Editor
4. Click "New Query"
5. Paste the SQL above
6. Click "Run"

### Option 3: Using Supabase CLI

```bash
# 1. If migration file exists, apply it
supabase migration up

# 2. Or manually apply the migration file
supabase db push supabase/migrations/update_leave_type_labels.sql
```

## Post-Migration Steps

### 1. Verify Changes

After migration, verify everything worked:

```bash
# Clear Next.js cache
rm -rf .next

# Restart development server
npm run dev
```

### 2. Test Leave Management

1. Go to `/dashboard/leave-management`
2. Check that leave types now show:
   - "Annual Leave"
   - "Sick Leave"
   - "Casual Leave"
   - "Special Leave"
   - "Leave Without Pay" (updated!)
   - Other leave types

3. Verify all dates display as dd/mm/yyyy format

### 3. Test Deferment/Recall

1. Go to `/dashboard/leave/deferment-recall`
2. Verify label shows "Resumption date" instead of "Return to work"

### 4. Clear Browser Cache

For best results, clear browser cache:
- **Chrome**: Ctrl+Shift+Delete (or Cmd+Shift+Delete on Mac)
- **Firefox**: Ctrl+Shift+Delete
- **Safari**: Develop → Empty Caches
- Or simply do a hard refresh: Ctrl+Shift+R (Cmd+Shift+R on Mac)

## Database Schema

The changes affect this table:

```sql
Table: leave_policies
Columns affected:
  - leave_type_key (e.g., 'unpaid', 'special')
  - leave_type_label (updated to new labels)
```

No schema changes required - only data updates.

## Rollback Instructions

If you need to revert these changes:

```sql
-- Rollback unpaid leave label
UPDATE leave_policies
SET leave_type_label = 'Unpaid Leave'
WHERE leave_type_key = 'unpaid'
AND leave_type_label = 'Leave Without Pay';
```

**Code Rollback**:
- Revert commits related to this migration
- Or manually revert the date formatting functions

## Troubleshooting

### Issue: Date format still shows long format

**Solution**: 
- Hard refresh browser (Ctrl+Shift+R)
- Clear `.next` folder: `rm -rf .next`
- Restart dev server: `npm run dev`

### Issue: Leave types not updated in database

**Solution**:
- Verify Supabase connection in `.env.local`
- Check that `SUPABASE_SERVICE_ROLE_KEY` is set correctly
- Manually run the SQL from Option 2 above
- Verify table name is `leave_policies` (not `leave_policy`)

### Issue: Migration script fails with "exec_sql" error

**Solution**:
- The fallback method should work automatically
- Check that your Supabase user has update permissions
- Try Option 2 (manual SQL) instead

### Issue: "Resumption date" label not showing

**Solution**:
- Check that file `app/dashboard/leave/deferment-recall/page.tsx` was updated
- Hard refresh browser
- Check browser console for errors

## Files Modified

```
Code Changes:
✅ app/dashboard/leave-management/hr-leave-analytics-panel.tsx
   - Updated LEAVE_TYPE_LABELS object
   - Changed "Unpaid Leave" to "Leave Without Pay"

✅ app/dashboard/leave-planning/leave-planning-client.tsx
   - Updated fmtLongDate() function
   - Updated fmtFormalDate() function
   - Updated fmtFormalDateWithWeekday() function
   - Changed date format to dd/mm/yyyy

✅ app/dashboard/leave/deferment-recall/page.tsx
   - Changed "Return to work" to "Resumption date"

Migration Scripts:
✅ supabase/migrations/update_leave_type_labels.sql
   - SQL migration file for database update

✅ scripts/migrate-leave-dates.js
   - Node.js migration script (recommended)

✅ scripts/migrate-leave-dates.sh
   - Bash migration script
```

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review file modifications to ensure they were applied correctly
3. Verify database connection and permissions
4. Check browser console for JavaScript errors
5. Contact the development team with error details

## Timeline

- **Deployment Date**: 2025-05-13
- **Migration Scripts Ready**: 2025-05-13
- **Expected Rollout**: Immediate after migration
- **Testing Period**: 1-2 days recommended before production

## Production Deployment

For production environments:

1. **Before deploying**:
   ```bash
   # Test migration locally
   node scripts/migrate-leave-dates.js
   ```

2. **On production**:
   ```bash
   # Option A: Using Supabase CLI
   supabase db push supabase/migrations/update_leave_type_labels.sql
   
   # Option B: Manual SQL (if CLI unavailable)
   # Run SQL from Option 2 in production database
   ```

3. **After deployment**:
   - Restart all backend services
   - Clear caches (CDN, Redis, etc.)
   - Verify in production environment
   - Monitor error logs for 24 hours

## References

- **Leave Management System**: `/dashboard/leave-management`
- **Leave Planning**: `/dashboard/leave-planning`
- **Deferment/Recall**: `/dashboard/leave/deferment-recall`
- **Supabase Docs**: https://supabase.com/docs
