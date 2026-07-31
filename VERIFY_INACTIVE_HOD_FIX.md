# Verification Guide: Inactive HOD Linkage Fix

## Quick Verification

### Step 1: Test Auto-Link Validation

```bash
# 1. Go to Staff Management page
# 2. Find an inactive department head (is_active = false)
# 3. Click "Auto-Link HODs"
# 4. Verify in results:
#    - No linkages created for inactive HODs
#    - No linkages created to inactive staff
#    - Stats show "Skipped: X"
```

### Step 2: Test Cleanup Endpoint

```bash
# Call cleanup endpoint to remove any invalid linkages
curl -X DELETE \
  https://your-app.com/api/admin/cleanup-inactive-hod-linkages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN"

# Response should show:
# {
#   "success": true,
#   "stats": {
#     "total": 2150,
#     "removed": 0 (or count if invalid linkages exist),
#     "checked": 2150
#   }
# }
```

### Step 3: Verify Database

```sql
-- Check for any remaining invalid linkages (should be empty)
SELECT COUNT(*) as invalid_linkage_count
FROM loan_hod_linkages l
LEFT JOIN user_profiles sp ON l.staff_user_id = sp.id
LEFT JOIN user_profiles hp ON l.hod_user_id = hp.id
WHERE sp.is_active = false OR hp.is_active = false;

-- Should return: 0

-- Check total valid linkages
SELECT COUNT(*) as valid_linkage_count
FROM loan_hod_linkages l
LEFT JOIN user_profiles sp ON l.staff_user_id = sp.id
LEFT JOIN user_profiles hp ON l.hod_user_id = hp.id
WHERE sp.is_active = true AND hp.is_active = true;

-- Should return: positive number
```

## Detailed Test Scenarios

### Scenario A: Auto-Link Skips Inactive HODs

1. Create test data:
   - Staff member: "Test Staff" (is_active = true)
   - HOD: "Inactive HOD" (is_active = false)
   - Same department, same location

2. Run Auto-Link
3. Expected: Staff NOT linked to inactive HOD
4. Check logs: Should see "Skipped" count

### Scenario B: Auto-Link Skips Inactive Staff

1. Create test data:
   - Staff member: "Inactive Staff" (is_active = false)
   - HOD: "Active HOD" (is_active = true)
   - Same department, same location

2. Run Auto-Link
3. Expected: Inactive staff NOT linked
4. Check logs: Should see "Skipped" count

### Scenario C: Cleanup Removes Existing Invalid Linkages

1. Manually create an invalid linkage via SQL:
   ```sql
   INSERT INTO loan_hod_linkages (staff_user_id, hod_user_id, location_id, created_by)
   VALUES (inactive_staff_id, active_hod_id, location_id, admin_id);
   ```

2. Run Cleanup endpoint
3. Expected: Linkage removed
4. Verify: Query database confirms deletion

## Validation Points

- [x] Auto-link endpoint validates `staff.is_active = true`
- [x] Auto-link endpoint validates `hod.is_active = true`
- [x] Cleanup endpoint removes linkages with inactive staff
- [x] Cleanup endpoint removes linkages with inactive HOD
- [x] Existing leave request route has `is_active=true` filter
- [x] Existing backfill-reviewers route has `is_active=true` filter
- [x] No new linkages created with inactive users
- [x] Valid linkages remain untouched

## Performance Check

After running cleanup on 2000+ staff:

```bash
# Should complete in < 2 seconds
Time taken: ~1s
Linkages checked: 2000+
Linkages removed: X
Invalid linkages remaining: 0
```

## Rollback (If Needed)

If issues occur:

1. Query current linkage state:
   ```sql
   SELECT id, staff_user_id, hod_user_id, created_at
   FROM loan_hod_linkages
   ORDER BY created_at DESC
   LIMIT 100;
   ```

2. Restore from backups if necessary
3. Re-run auto-link after fixing staff/HOD status

## Sign-Off Checklist

- [ ] Auto-link endpoint filters by is_active=true
- [ ] Cleanup endpoint successfully removes invalid linkages
- [ ] Database has no invalid linkages
- [ ] Auto-link with mixed active/inactive users works correctly
- [ ] Leave workflow functions normally with cleaned data
- [ ] No errors in logs related to HOD linkages
- [ ] Performance is acceptable (< 2s for 2000+ staff)

## Documentation

Complete details in: `INACTIVE_HOD_LINKAGE_VALIDATION.md`

Run: `npm run build` to verify no TypeScript errors
