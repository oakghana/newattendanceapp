# Cleanup Inactive HODs - Scripts Summary

## Overview

Complete solution for removing inactive HOD linkages from your database with three methods.

---

## Available Scripts

### 1. **Automated Node.js Script** (Recommended)

**File:** `scripts/cleanup-inactive-hods.mjs`

**Command:**
```bash
npm run cleanup:inactive-hods
```

**What it does:**
- Connects to Supabase using service role key
- Fetches all loan_hod_linkages (up to 10,000)
- Identifies linkages where staff OR HOD is inactive
- Shows detailed list of what will be removed
- Removes invalid linkages
- Verifies removal
- Displays comprehensive statistics

**Best for:** Admins who want automated, hands-off cleanup

**Prerequisites:**
- `.env.development.local` with:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`

**Output:**
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

📊 CLEANUP REPORT
Total linkages before cleanup: 1234
Invalid linkages removed: 45
Valid linkages remaining: 1189
Removed percentage: 3.65%

[v0] ✅ Cleanup completed successfully!
```

---

### 2. **SQL Queries**

**File:** `scripts/cleanup-inactive-hods.sql`

**Where to run:** Supabase Dashboard → SQL Editor

**Included steps:**
1. **STEP 1:** Audit - View invalid linkages (safe, no changes)
2. **STEP 2:** Count - See statistics before deletion
3. **STEP 3:** Get IDs - Extract linkage IDs to delete
4. **STEP 4:** Delete - Remove invalid linkages (commented out for safety)
5. **STEP 5:** Verify - Confirm deletion worked
6. **STEP 6:** Summary - Get final statistics
7. **Optional:** Find unlinked staff
8. **Optional:** Re-link staff to HODs

**Best for:** Admins who want full control and verification

**Safety features:**
- All destructive queries are commented out by default
- Must explicitly uncomment DELETE to execute
- Each step can be run independently
- Verification queries included

---

### 3. **API Endpoint** (Already exists)

**Endpoint:** `DELETE /api/admin/cleanup-inactive-hod-linkages`

**Usage:**
```bash
curl -X DELETE \
  https://your-app.com/api/admin/cleanup-inactive-hod-linkages \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Best for:** Programmatic cleanup integrated into workflows

---

## Documentation

### Quick Reference
**File:** `CLEANUP_QUICK_REFERENCE.md`

One-page reference card with:
- All three methods summarized
- Common commands
- Quick issues/solutions table

### Complete Guide
**File:** `CLEANUP_INACTIVE_HODS_GUIDE.md`

Comprehensive guide (378 lines) covering:
- Quick start
- All 3 cleanup methods with step-by-step
- Before/after examples
- Common scenarios
- Troubleshooting
- Monitoring & auditing
- Best practices

### Inactive HOD Info
**File:** `INACTIVE_HOD_FIX_SUMMARY.md`

Detailed explanation of:
- Why this was needed
- What was fixed
- Data integrity rules
- Deployment procedures
- Testing methods

---

## What Gets Removed

Linkages are removed where:
✓ Staff member is_active = false
✓ HOD is_active = false
✓ Both are inactive

---

## Usage Comparison

| Task | Command |
|------|---------|
| **Quick cleanup** | `npm run cleanup:inactive-hods` |
| **See what's removed** | Run SQL STEP 1 query |
| **Count invalid** | Run SQL STEP 2 query |
| **Manual delete** | Uncomment/run SQL STEP 4 |
| **Verify after cleanup** | Run SQL STEP 5 query |
| **Re-link staff** | `npm run auto-link:hods` |
| **API cleanup** | `curl -X DELETE /api/admin/cleanup-inactive-hod-linkages` |

---

## Integration with Other Scripts

### Auto-Link HODs
After cleanup, staff may have no HOD assignments:
```bash
npm run auto-link:hods
```

This automatically links staff to available active HODs.

### Test Simulation
To verify cleanup effectiveness:
```bash
npm run simulate
```

---

## Deployment Checklist

Before running cleanup in production:

- [ ] Backup database
- [ ] Run in maintenance window
- [ ] Use STEP 1 query to verify what will be removed
- [ ] Get approval from stakeholders
- [ ] Run cleanup script
- [ ] Verify removal with STEP 5 query
- [ ] Re-link unlinked staff if needed
- [ ] Monitor for issues
- [ ] Update logs/documentation

---

## Files Added

**Scripts:**
- `scripts/cleanup-inactive-hods.mjs` (142 lines)
- `scripts/cleanup-inactive-hods.sql` (140 lines)

**Documentation:**
- `CLEANUP_INACTIVE_HODS_GUIDE.md` (378 lines)
- `CLEANUP_QUICK_REFERENCE.md` (162 lines)
- `SCRIPTS_SUMMARY.md` (this file)

**Modified:**
- `package.json` - Added cleanup:inactive-hods script

---

## Quick Start

1. **Read:** `CLEANUP_QUICK_REFERENCE.md` (2 minutes)
2. **Run:** `npm run cleanup:inactive-hods` (1 minute)
3. **Verify:** Check SQL query result (1 minute)
4. **Done!** Total time: ~4 minutes

---

## Support & Troubleshooting

See `CLEANUP_INACTIVE_HODS_GUIDE.md` for:
- Detailed troubleshooting section
- Common scenarios & solutions
- Monitoring procedures
- Best practices

---

## Related Documentation

- `INACTIVE_HOD_FIX_SUMMARY.md` - Why this fix was needed
- `VERIFY_INACTIVE_HOD_FIX.md` - Testing procedures
- `QUICK_REFERENCE_INACTIVE_HOD.md` - Feature reference
- `INACTIVE_HOD_LINKAGE_VALIDATION.md` - Complete technical docs

