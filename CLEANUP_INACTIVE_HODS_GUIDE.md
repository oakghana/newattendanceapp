# Cleanup Inactive HODs - Complete Guide

This guide provides multiple methods to remove inactive HOD linkages from your database.

## Quick Start (Recommended)

Run the automated cleanup script:

```bash
npm run cleanup:inactive-hods
```

This script will:
1. ✅ Connect to Supabase
2. ✅ Find all linkages with inactive staff or HOD
3. ✅ Display details of what will be removed
4. ✅ Remove the invalid linkages
5. ✅ Verify the removal
6. ✅ Show final statistics

---

## Method 1: Automated Node.js Script (Fastest)

### Prerequisites
Ensure `.env.development.local` has these variables:
```
NEXT_PUBLIC_SUPABASE_URL=your_url
SUPABASE_SERVICE_ROLE_KEY=your_key
```

### Command
```bash
npm run cleanup:inactive-hods
```

### What Happens
```
[v0] Starting inactive HOD linkage cleanup...
[v0] Step 1: Fetching all HOD linkages...
[v0] ✅ Found 1234 total linkages

[v0] Step 2: Extracting user IDs...
[v0] ✅ Found 567 unique users

[v0] Step 3: Fetching user profiles...
[v0] ✅ Fetched 567 user profiles

[v0] Step 4: Analyzing linkages...
Found 45 invalid linkages to remove

[v0] Step 5: Details of linkages to remove:
  1. Staff: john@company.com (INACTIVE) → HOD: jane@company.com (ACTIVE)
  2. Staff: mike@company.com (ACTIVE) → HOD: bob@company.com (INACTIVE)
  ...

[v0] Step 6: Removing invalid linkages...
[v0] ✅ Removed 45 invalid linkages

[v0] Step 7: Verifying removal...
[v0] ✅ Verification complete

========================================================
📊 CLEANUP REPORT
========================================================
Total linkages before cleanup: 1234
Invalid linkages removed: 45
Valid linkages remaining: 1189
Removed percentage: 3.65%
========================================================

[v0] ✅ Cleanup completed successfully!
```

---

## Method 2: SQL Queries (Manual Control)

Use this method if you want to see exactly what will be removed before deletion.

### Step 1: View Invalid Linkages (Safe - No Changes)

Go to Supabase Dashboard → SQL Editor and run:

```sql
SELECT 
  l.id as linkage_id,
  l.staff_user_id,
  sp.email as staff_email,
  sp.first_name as staff_name,
  sp.is_active as staff_active,
  l.hod_user_id,
  hp.email as hod_email,
  hp.first_name as hod_name,
  hp.is_active as hod_active,
  l.created_at,
  CASE 
    WHEN sp.is_active = false AND hp.is_active = false THEN 'Both inactive'
    WHEN sp.is_active = false THEN 'Staff inactive'
    WHEN hp.is_active = false THEN 'HOD inactive'
    ELSE 'Unknown'
  END as reason
FROM loan_hod_linkages l
LEFT JOIN user_profiles sp ON l.staff_user_id = sp.id
LEFT JOIN user_profiles hp ON l.hod_user_id = hp.id
WHERE sp.is_active = false OR hp.is_active = false
ORDER BY l.created_at DESC;
```

This shows you exactly which linkages will be removed and why.

### Step 2: Get Count (Verify Scale)

```sql
SELECT 
  COUNT(*) as total_invalid_linkages,
  SUM(CASE WHEN sp.is_active = false AND hp.is_active = false THEN 1 ELSE 0 END) as both_inactive,
  SUM(CASE WHEN sp.is_active = false AND hp.is_active = true THEN 1 ELSE 0 END) as staff_inactive_only,
  SUM(CASE WHEN sp.is_active = true AND hp.is_active = false THEN 1 ELSE 0 END) as hod_inactive_only
FROM loan_hod_linkages l
LEFT JOIN user_profiles sp ON l.staff_user_id = sp.id
LEFT JOIN user_profiles hp ON l.hod_user_id = hp.id
WHERE sp.is_active = false OR hp.is_active = false;
```

### Step 3: Delete Invalid Linkages

Once you've verified the data, run:

```sql
DELETE FROM loan_hod_linkages
WHERE id IN (
  SELECT l.id
  FROM loan_hod_linkages l
  LEFT JOIN user_profiles sp ON l.staff_user_id = sp.id
  LEFT JOIN user_profiles hp ON l.hod_user_id = hp.id
  WHERE sp.is_active = false OR hp.is_active = false
);
```

### Step 4: Verify Deletion

```sql
SELECT COUNT(*) as remaining_invalid_linkages
FROM loan_hod_linkages l
LEFT JOIN user_profiles sp ON l.staff_user_id = sp.id
LEFT JOIN user_profiles hp ON l.hod_user_id = hp.id
WHERE sp.is_active = false OR hp.is_active = false;
```

Expected result: `0`

### Step 5: Check Results

```sql
SELECT 
  COUNT(*) as total_valid_linkages,
  COUNT(DISTINCT l.staff_user_id) as unique_staff,
  COUNT(DISTINCT l.hod_user_id) as unique_hods
FROM loan_hod_linkages l
LEFT JOIN user_profiles sp ON l.staff_user_id = sp.id
LEFT JOIN user_profiles hp ON l.hod_user_id = hp.id
WHERE sp.is_active = true AND hp.is_active = true;
```

---

## Method 3: API Endpoint (Programmatic)

Use the cleanup endpoint if you want to integrate this into your application:

### Endpoint Details
- **URL**: `/api/admin/cleanup-inactive-hod-linkages`
- **Method**: `DELETE`
- **Auth**: Admin only
- **Response**: JSON with statistics

### Usage

```bash
curl -X DELETE \
  https://your-app.com/api/admin/cleanup-inactive-hod-linkages \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN"
```

### Response Example

```json
{
  "success": true,
  "message": "Removed 45 invalid HOD linkages (where staff or HOD is inactive)",
  "stats": {
    "total": 1234,
    "removed": 45,
    "checked": 1234
  },
  "removedLinkages": [
    {
      "staffId": "user-123",
      "hodId": "user-456",
      "reason": "Staff inactive"
    },
    {
      "staffId": "user-789",
      "hodId": "user-101",
      "reason": "HOD inactive"
    }
  ]
}
```

---

## After Cleanup

### 1. Re-link Unlinked Staff (Optional)

After cleanup, some staff may have no HOD linkages. You can re-link them:

```bash
npm run auto-link:hods
```

This will automatically link staff to available active HODs.

### 2. Find Unlinked Staff

To see who lost their HOD linkages:

```sql
SELECT 
  up.id,
  up.email,
  up.first_name,
  up.last_name,
  up.department_id
FROM user_profiles up
LEFT JOIN loan_hod_linkages l ON up.id = l.staff_user_id
WHERE up.is_active = true
  AND up.role NOT IN ('hr_executive', 'accounts_executive', 'regional_manager', 'departmental_head', 'admin')
GROUP BY up.id, up.email, up.first_name, up.last_name, up.department_id
HAVING COUNT(l.id) = 0
ORDER BY up.created_at DESC;
```

---

## Common Scenarios

### Scenario 1: Deactivated Staff Member

**What happens:**
- Linkage between staff and HOD is removed

**How to handle:**
```bash
npm run cleanup:inactive-hods
```

### Scenario 2: Deactivated Departmental Head (HOD)

**What happens:**
- All linkages to that HOD are removed
- Staff lose their HOD reference

**How to handle:**
1. Run cleanup: `npm run cleanup:inactive-hods`
2. Re-link staff to new HOD: `npm run auto-link:hods`

### Scenario 3: Multiple Deactivations

**What happens:**
- Multiple linkages become invalid
- Cleanup handles all at once

**How to handle:**
```bash
npm run cleanup:inactive-hods
```

---

## Troubleshooting

### Issue: Script fails with "Missing environment variables"

**Solution:**
Ensure `.env.development.local` exists with:
```
NEXT_PUBLIC_SUPABASE_URL=your_url
SUPABASE_SERVICE_ROLE_KEY=your_key
```

### Issue: Script shows 0 invalid linkages

**This is good!** All linkages are valid.
- Both staff and HOD are active
- No cleanup needed

### Issue: API returns "Only admins can cleanup"

**Solution:**
- Log in as admin user
- Ensure `role = 'admin'` in user_profiles
- Pass correct authentication token

### Issue: Large number of invalid linkages (e.g., > 500)

**Solution:**
1. Review which staff/HODs are inactive
2. Consider if they should be reactivated instead
3. Run cleanup in maintenance window
4. Monitor systems afterward

---

## Monitoring & Auditing

### Daily Check

```sql
-- Check for any new invalid linkages
SELECT COUNT(*) as invalid_linkages
FROM loan_hod_linkages l
LEFT JOIN user_profiles sp ON l.staff_user_id = sp.id
LEFT JOIN user_profiles hp ON l.hod_user_id = hp.id
WHERE sp.is_active = false OR hp.is_active = false;
```

### Weekly Report

```sql
-- Show all cleanup candidates
SELECT 
  l.id,
  sp.email as staff_email,
  hp.email as hod_email,
  CASE 
    WHEN sp.is_active = false THEN 'Staff inactive'
    WHEN hp.is_active = false THEN 'HOD inactive'
  END as reason,
  l.created_at
FROM loan_hod_linkages l
LEFT JOIN user_profiles sp ON l.staff_user_id = sp.id
LEFT JOIN user_profiles hp ON l.hod_user_id = hp.id
WHERE sp.is_active = false OR hp.is_active = false
ORDER BY l.created_at DESC;
```

---

## Best Practices

✅ **Do:**
- Run cleanup weekly/monthly
- Review invalid linkages before deletion
- Keep audit trail of cleanups
- Re-link unlinked staff after cleanup
- Monitor for new invalid linkages

❌ **Don't:**
- Skip the verification step
- Run cleanup during peak hours
- Assume zero invalid linkages
- Delete without backup
- Ignore unlinked staff afterward

---

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review database logs for errors
3. Verify user_profiles is_active status
4. Check loan_hod_linkages table integrity

