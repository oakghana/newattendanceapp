# Quick Reference: Inactive HOD Fix

## Problem → Solution

| Issue | Solution |
|-------|----------|
| Inactive HODs were being assigned | ✅ Auto-link now validates `is_active=true` for HODs |
| Inactive staff were being linked | ✅ Auto-link now validates `is_active=true` for staff |
| Invalid linkages existed in database | ✅ New cleanup endpoint removes them |
| No way to fix existing bad data | ✅ Cleanup endpoint fixes existing issues |

## One-Command Deployment

```bash
# Deploy fix
npm run build

# Run cleanup (removes invalid linkages)
curl -X DELETE https://your-app.com/api/admin/cleanup-inactive-hod-linkages

# Verify (should return 0)
SELECT COUNT(*) FROM loan_hod_linkages l
LEFT JOIN user_profiles sp ON l.staff_user_id = sp.id
LEFT JOIN user_profiles hp ON l.hod_user_id = hp.id
WHERE sp.is_active = false OR hp.is_active = false;
```

## Data Integrity Checks

✅ Staff being linked: `is_active = true`
✅ HODs being assigned: `is_active = true`
✅ Linkages created: Both parties must be active
✅ Cleanup: Removes inactive party linkages
✅ Existing routes: Already have proper filters

## API Endpoints

| Endpoint | Method | Purpose | Access |
|----------|--------|---------|--------|
| `/api/admin/auto-link-hods` | POST | Link active staff to active HODs | Admin |
| `/api/admin/cleanup-inactive-hod-linkages` | DELETE | Remove invalid linkages | Admin |

## Key Changes

```typescript
// BEFORE: No validation
const { data: hods } = await supabase
  .from("user_profiles")
  .select("...")
  .in("role", ALLOWED_HOD_ROLES)

// AFTER: Validates both parties are active
const { data: hods } = await supabase
  .from("user_profiles")
  .select("...")
  .in("role", ALLOWED_HOD_ROLES)
  .eq("is_active", true) // ← Added validation

// ALSO: Staff being linked must be active
.eq("is_active", true)
```

## Test Scenarios (5 minutes)

1. **Create inactive HOD** → Auto-link → Verify NOT linked
2. **Create inactive staff** → Auto-link → Verify NOT linked
3. **Create invalid linkage** → Run cleanup → Verify removed
4. **Run cleanup twice** → Verify no errors (idempotent)

## Monitoring

```sql
-- Check status
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN sp.is_active AND hp.is_active THEN 1 ELSE 0 END) as valid,
  SUM(CASE WHEN NOT sp.is_active OR NOT hp.is_active THEN 1 ELSE 0 END) as invalid
FROM loan_hod_linkages l
LEFT JOIN user_profiles sp ON l.staff_user_id = sp.id
LEFT JOIN user_profiles hp ON l.hod_user_id = hp.id;

-- Expected: invalid = 0
```

## Rollback (If Needed)

```bash
git revert HEAD
npm run build
# Restore linkages from backup if needed
```

## Documentation

- **Detailed**: `INACTIVE_HOD_LINKAGE_VALIDATION.md`
- **Testing**: `VERIFY_INACTIVE_HOD_FIX.md`
- **Summary**: `INACTIVE_HOD_FIX_SUMMARY.md`

## Build Status

✅ 20.9s - Success
✅ No errors
✅ Ready to deploy

## After Deployment (2 steps)

1. **Run cleanup**: `DELETE /api/admin/cleanup-inactive-hod-linkages`
2. **Verify**: Check SQL query above returns 0 invalid

Done! ✅
