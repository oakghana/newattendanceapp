# Staff-to-Staff HOD Linkage Prevention

## Overview

This document explains the **critical security and data integrity fix** that prevents staff members from being linked as HODs (Heads of Department) to other staff members.

## The Problem

Before this fix, the system **allowed invalid linkages** where:
- A staff member could be linked as a HOD to another staff member
- This violated the permission hierarchy and organizational structure
- It could lead to confused supervision chains and permission issues

**Invalid linkages that could occur:**
```
Staff A → linked to → Staff B (as HOD) ❌
Staff A → linked to → NPS/Intern/Contract ❌
```

## The Solution

### 1. API Validation (Prevention)

**File:** `/app/api/loan/lookups/route.ts`

Added strict validation in the `validateStaffHodRule()` function:

```typescript
// CRITICAL: Reject staff-to-staff linkages
if (hodRole === "staff" || hodRole === "nsp" || hodRole === "intern" || hodRole === "contract") {
  return { 
    ok: false, 
    reason: "Staff members cannot be linked as HODs. Only Department Heads, Regional Managers, HR Directors, or HR Managers can be linked." 
  }
}
```

**When triggered:** Any attempt to link invalid roles will be rejected before database insertion.

### 2. Cleanup Endpoint (Remediation)

**File:** `/app/api/admin/cleanup-invalid-hod-linkages/route.ts`

New admin-only endpoint to find and delete existing invalid linkages:

```bash
# Admin endpoint
POST /api/admin/cleanup-invalid-hod-linkages

# Response
{
  "success": true,
  "message": "Removed 5 invalid staff-to-staff HOD linkages",
  "deletedCount": 5
}
```

**Process:**
1. Scans all rows in `loan_hod_linkages` table
2. Checks the `role` field of each HOD in `user_profiles`
3. Deletes any linkage where HOD role is not valid
4. Returns count of deleted invalid linkages

### 3. UI Filtering (Already Correct)

**File:** `/components/admin/staff-management.tsx`

The staff management portal **already only fetches valid HOD roles**:

```typescript
const [resDH, resRM, resMHR, resDHR] = await Promise.all([
  authenticatedFetch("/api/admin/staff?role=department_head&limit=200"),
  authenticatedFetch("/api/admin/staff?role=regional_manager&limit=200"),
  authenticatedFetch("/api/admin/staff?role=manager_hr&limit=200"),
  authenticatedFetch("/api/admin/staff?role=director_hr&limit=200"),
])
```

**Result:** The dropdown only shows valid HOD roles - staff cannot be selected.

## Valid HOD Roles

Only these roles can be linked as HODs:

| Role | Description |
|------|-------------|
| `department_head` | Department Head |
| `regional_manager` | Regional Manager |
| `director_hr` | HR Director |
| `manager_hr` | HR Manager |
| `admin` | System Administrator |

## Invalid Roles (Rejected)

These roles will be rejected if someone attempts to link them:

| Role | Why Rejected |
|------|-------------|
| `staff` | Cannot supervise other staff |
| `nsp` | Non-staff position, cannot supervise |
| `intern` | Temporary position, cannot supervise |
| `contract` | Temporary employment, cannot supervise |

## Error Messages

When a user tries to link an invalid HOD role, they'll see:

```
"Staff members cannot be linked as HODs. Only Department Heads, 
Regional Managers, HR Directors, or HR Managers can be linked."
```

## How to Clean Up Existing Invalid Linkages

If there are existing invalid staff-to-staff linkages in your database:

### Method 1: Using the Admin Endpoint

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  https://yourdomain.com/api/admin/cleanup-invalid-hod-linkages
```

**Requirements:**
- User must have `admin` or `it-admin` role
- Endpoint is admin-only for security

### Method 2: Manual SQL (Direct Database)

If direct database access is available:

```sql
-- Find all invalid linkages
SELECT lhl.id, up.first_name, up.last_name, up.role
FROM loan_hod_linkages lhl
JOIN user_profiles up ON lhl.hod_user_id = up.id
WHERE up.role IN ('staff', 'nsp', 'intern', 'contract');

-- Delete invalid linkages (with the cleanup endpoint or manually if needed)
DELETE FROM loan_hod_linkages
WHERE hod_user_id IN (
  SELECT id FROM user_profiles 
  WHERE role IN ('staff', 'nsp', 'intern', 'contract')
);
```

## Data Integrity Checks

After the fix, you can verify the system is clean:

```sql
-- Count invalid linkages (should return 0 after cleanup)
SELECT COUNT(*) as invalid_linkage_count
FROM loan_hod_linkages lhl
JOIN user_profiles up ON lhl.hod_user_id = up.id
WHERE up.role IN ('staff', 'nsp', 'intern', 'contract');

-- Should return: 0

-- Count valid linkages by HOD role
SELECT up.role, COUNT(lhl.id) as linkage_count
FROM loan_hod_linkages lhl
JOIN user_profiles up ON lhl.hod_user_id = up.id
GROUP BY up.role
ORDER BY linkage_count DESC;

-- Example output:
-- department_head    | 45
-- regional_manager   | 28
-- director_hr        | 15
-- manager_hr         | 12
```

## Testing the Fix

### Test 1: Prevent Invalid Linkage via UI
1. Go to Staff Management
2. Search for any staff member
3. Click "Link to HOD"
4. Verify that **only valid HOD roles appear** in the dropdown
5. ✓ No staff/nsp/intern/contract roles should be visible

### Test 2: Prevent Invalid Linkage via API
```bash
# Try to link a staff member as HOD (should fail)
curl -X POST https://yourdomain.com/api/loan/lookups \
  -H "Content-Type: application/json" \
  -d '{
    "action": "upsert_hod_linkage_batch",
    "staff_user_id": "STAFF_ID_1",
    "hod_user_ids": ["STAFF_ID_2"]  # Invalid: another staff
  }'

# Response: 400 Bad Request
# Error: "Staff members cannot be linked as HODs..."
```

### Test 3: Cleanup Invalid Linkages
```bash
# Run cleanup endpoint
curl -X POST https://yourdomain.com/api/admin/cleanup-invalid-hod-linkages

# Response: Shows number of deleted invalid linkages
```

## Affected Tables

This fix affects:
- **`loan_hod_linkages`** - Primary table that stores HOD-staff relationships
- **`user_profiles`** - Used for role validation
- **`loan_requests`** - Indirectly, as HOD linkages determine who can review requests
- **`leave_plan_requests`** - Indirectly, as HOD linkages determine who can review requests

## Files Changed

| File | Changes | Lines |
|------|---------|-------|
| `app/api/loan/lookups/route.ts` | Added staff role validation | +7 |
| `app/api/admin/cleanup-invalid-hod-linkages/route.ts` | NEW cleanup endpoint | +95 |

## Security Implications

This fix:
- ✅ **Prevents unauthorized access chains** - Staff cannot become supervisors
- ✅ **Maintains permission hierarchy** - Only HOD roles can supervise
- ✅ **Prevents data corruption** - Invalid linkages are blocked at API level
- ✅ **Protects audit trail** - Only valid linkages are recorded
- ✅ **Supports cleanup** - Existing invalid data can be remediated

## Deployment Checklist

- [ ] Deploy code changes
- [ ] Verify the cleanup endpoint is accessible (admin-only)
- [ ] Run cleanup endpoint if invalid linkages exist
- [ ] Verify invalid linkage count is 0 (use SQL query above)
- [ ] Test new validation with staff member linkage attempt
- [ ] Confirm dropdown only shows valid HOD roles
- [ ] Monitor for any API errors related to linkage validation

## FAQ

**Q: What if someone has 5 invalid linkages from before this fix?**  
A: Run the cleanup endpoint once to remove them all. It deletes all invalid linkages automatically.

**Q: Can I still link staff to valid HOD roles?**  
A: Yes! Linking staff to Department Heads, Regional Managers, HR Directors, and HR Managers works normally.

**Q: What happens if I try to link a staff member as HOD?**  
A: The API will reject it with a clear error message before any database changes.

**Q: Is this change backward compatible?**  
A: Yes. It only prevents new invalid linkages and cleans up existing ones. Valid linkages are unaffected.

## Support

If you encounter issues:
1. Check error message in API response
2. Verify user role using SQL query above
3. Run cleanup endpoint if invalid linkages exist
4. Contact support with error details

---

**Version:** 1.0  
**Date:** 2024-08-01  
**Status:** Production Ready
