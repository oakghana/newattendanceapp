# Inactive HOD Linkage Validation & Cleanup

## Problem

Previously, inactive department heads and staff members could be assigned as HODs or linked to HODs, which violates data integrity rules. An inactive member should NEVER be:
- Assigned as an HOD
- Linked to an HOD
- Used as a reviewer for leave requests

## Solution

We've implemented comprehensive validation across the system:

### 1. **Auto-Link HOD Endpoint** (`/api/admin/auto-link-hods`)

**Fixed to:**
- Only link ACTIVE staff members (not inactive ones)
- Only assign ACTIVE HODs (not inactive ones)
- Validate `is_active=true` for both staff and HOD

**Changes Made:**
```typescript
// Staff members being linked MUST be active
.eq("is_active", true)

// HODs being assigned MUST be active
.eq("is_active", true)
```

### 2. **Cleanup Endpoint** (`/api/admin/cleanup-inactive-hod-linkages`)

New DELETE endpoint that removes all invalid linkages where either party is inactive.

**Removes linkages where:**
- Staff member has `is_active=false`
- HOD has `is_active=false`

**Usage:**
```bash
curl -X DELETE \
  https://your-app.com/api/admin/cleanup-inactive-hod-linkages \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "message": "Removed 42 invalid HOD linkages",
  "stats": {
    "total": 2150,
    "removed": 42,
    "checked": 2150
  },
  "removedLinkages": [
    {
      "staffId": "uuid-123",
      "hodId": "uuid-456",
      "reason": "Staff inactive"
    },
    {
      "staffId": "uuid-789",
      "hodId": "uuid-012",
      "reason": "HOD inactive"
    }
  ]
}
```

### 3. **Existing Validation** (Already in place)

The following endpoints already had proper `is_active` validation:
- `/api/loan/request/route.ts` - Queries HODs with `is_active=true`
- `/api/leave/planning/backfill-reviewers/route.ts` - Filters HODs with `is_active=true`

## How to Use

### Option 1: Run Cleanup After Deactivating Users

When an admin deactivates a department head or staff member:

1. Go to Staff Management page
2. Deactivate the user (set `is_active=false`)
3. Call the cleanup endpoint to remove their invalid linkages

```bash
# Via API
POST /api/admin/cleanup-inactive-hod-linkages

# Or via admin dashboard (when UI is added)
Admin → Staff Management → Maintenance → Cleanup Inactive Linkages
```

### Option 2: Run Periodic Cleanup

Schedule a cron job to run cleanup weekly:

```typescript
// In your cron endpoint, e.g., /api/cron/cleanup-hods
const response = await fetch("https://your-app.com/api/admin/cleanup-inactive-hod-linkages", {
  method: "DELETE",
  headers: {
    "Authorization": `Bearer ${INTERNAL_API_KEY}`
  }
})
```

### Option 3: Manual Verification

View all invalid linkages using this SQL query in Supabase:

```sql
-- Find linkages where staff is inactive
SELECT 
  l.id,
  l.staff_user_id,
  sp.first_name as staff_first_name,
  sp.is_active as staff_active,
  l.hod_user_id,
  hp.first_name as hod_first_name,
  hp.is_active as hod_active
FROM loan_hod_linkages l
LEFT JOIN user_profiles sp ON l.staff_user_id = sp.id
LEFT JOIN user_profiles hp ON l.hod_user_id = hp.id
WHERE sp.is_active = false OR hp.is_active = false;

-- Delete invalid linkages
DELETE FROM loan_hod_linkages
WHERE staff_user_id IN (
  SELECT id FROM user_profiles WHERE is_active = false
)
OR hod_user_id IN (
  SELECT id FROM user_profiles WHERE is_active = false
);
```

## Data Integrity Rules

After these fixes, the system enforces:

1. ✅ **No Inactive HOD Assignment** - Only active users with HOD roles can be assigned as HODs
2. ✅ **No Inactive Staff Linking** - Only active staff members can be linked to HODs
3. ✅ **No Inactive Reviewer Assignments** - Leave reviews are only assigned to active HODs
4. ✅ **Automatic Cleanup** - Run cleanup endpoint after deactivating users
5. ✅ **No Orphan Linkages** - All linkages have valid active users on both ends

## Testing the Fix

### Test 1: Verify Auto-Link Excludes Inactive

1. Create an inactive staff member and inactive HOD
2. Run Auto-Link HODs
3. Verify no linkages are created for inactive users
4. Check logs: "Skipped: X" should include inactive staff

### Test 2: Run Cleanup After Deactivation

1. Auto-link some active staff to HODs
2. Deactivate one of the HODs
3. Call cleanup endpoint
4. Verify linkage was removed

### Test 3: Verify Existing Linkages

```bash
# Get stats on current linkages
SELECT 
  COUNT(*) as total_linkages,
  SUM(CASE WHEN sp.is_active AND hp.is_active THEN 1 ELSE 0 END) as valid_linkages,
  SUM(CASE WHEN NOT sp.is_active OR NOT hp.is_active THEN 1 ELSE 0 END) as invalid_linkages
FROM loan_hod_linkages l
LEFT JOIN user_profiles sp ON l.staff_user_id = sp.id
LEFT JOIN user_profiles hp ON l.hod_user_id = hp.id;
```

## Related Components

- **Auto-Link HOD Button**: `components/admin/auto-link-hod-button.tsx`
- **Auto-Link HOD Endpoint**: `app/api/admin/auto-link-hods/route.ts`
- **Cleanup Endpoint**: `app/api/admin/cleanup-inactive-hod-linkages/route.ts`
- **Backfill Reviewers**: `app/api/leave/planning/backfill-reviewers/route.ts`

## Deployment Notes

1. Deploy the new cleanup endpoint first
2. Update the auto-link endpoint with the new validation
3. Run cleanup endpoint once to remove any existing invalid linkages
4. Add UI button for cleanup in Staff Management (optional)
5. Monitor logs for any invalid linkage attempts

## FAQ

**Q: Can I still query old linkages with inactive users?**
A: No, the cleanup endpoint removes them. If you need audit trails, export before cleanup.

**Q: What if an HOD becomes inactive while they have pending leave reviews?**
A: The backfill-reviewers endpoint will skip inactive HODs and reassign reviews to other valid HODs.

**Q: Can I restore linkages after cleanup?**
A: No, deleted linkages are permanent. Re-activate the users and run auto-link again.

**Q: What happens during auto-link if no active HODs exist in a location?**
A: Those staff members are skipped with reason "No HODs found in department/location".
