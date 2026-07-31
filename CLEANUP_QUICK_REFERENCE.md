# Cleanup Inactive HODs - Quick Reference Card

## One-Line Command (Fastest)

```bash
npm run cleanup:inactive-hods
```

That's it! The script will:
- Find all linkages with inactive staff/HOD
- Show you what will be removed
- Remove them
- Show final statistics

---

## Three Methods Comparison

| Method | Speed | Control | Skill Level |
|--------|-------|---------|-------------|
| **Node.js Script** | ⚡ Fast | Automatic | Beginner |
| **SQL Queries** | 🐢 Slow | Full Control | Intermediate |
| **API Endpoint** | ⚙️ Programmatic | Custom | Advanced |

---

## Method 1: Automated Script (Recommended)

```bash
npm run cleanup:inactive-hods
```

**Output:**
```
[v0] Starting cleanup...
[v0] Found 1234 total linkages
[v0] Found 45 invalid linkages to remove
[v0] Details of linkages to remove:
  1. john@company.com (INACTIVE) → jane@company.com (ACTIVE)
  2. mike@company.com (ACTIVE) → bob@company.com (INACTIVE)
...
[v0] ✅ Removed 45 invalid linkages
📊 Total linkages before: 1234
📊 Removed: 45
📊 Remaining: 1189
[v0] ✅ Cleanup completed successfully!
```

---

## Method 2: SQL (Manual)

### View what will be removed:
```sql
SELECT 
  sp.email as staff_email,
  hp.email as hod_email,
  CASE 
    WHEN sp.is_active = false THEN 'Staff inactive'
    WHEN hp.is_active = false THEN 'HOD inactive'
  END as reason
FROM loan_hod_linkages l
LEFT JOIN user_profiles sp ON l.staff_user_id = sp.id
LEFT JOIN user_profiles hp ON l.hod_user_id = hp.id
WHERE sp.is_active = false OR hp.is_active = false;
```

### Delete invalid linkages:
```sql
DELETE FROM loan_hod_linkages
WHERE id IN (
  SELECT l.id FROM loan_hod_linkages l
  LEFT JOIN user_profiles sp ON l.staff_user_id = sp.id
  LEFT JOIN user_profiles hp ON l.hod_user_id = hp.id
  WHERE sp.is_active = false OR hp.is_active = false
);
```

### Verify:
```sql
SELECT COUNT(*) as remaining_invalid
FROM loan_hod_linkages l
LEFT JOIN user_profiles sp ON l.staff_user_id = sp.id
LEFT JOIN user_profiles hp ON l.hod_user_id = hp.id
WHERE sp.is_active = false OR hp.is_active = false;
```

Expected result: `0`

---

## Method 3: API Endpoint

```bash
curl -X DELETE \
  https://your-app.com/api/admin/cleanup-inactive-hod-linkages \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Response:
```json
{
  "success": true,
  "message": "Removed 45 invalid HOD linkages",
  "stats": {
    "total": 1234,
    "removed": 45,
    "checked": 1234
  }
}
```

---

## After Cleanup

### Re-link unlinked staff:
```bash
npm run auto-link:hods
```

### Find staff with no HOD:
```sql
SELECT up.id, up.email
FROM user_profiles up
LEFT JOIN loan_hod_linkages l ON up.id = l.staff_user_id
WHERE up.is_active = true
  AND up.role NOT IN (...)
GROUP BY up.id, up.email
HAVING COUNT(l.id) = 0;
```

---

## Common Issues

| Issue | Solution |
|-------|----------|
| Missing env vars | Check `.env.development.local` |
| Script fails | Ensure SUPABASE_SERVICE_ROLE_KEY is set |
| Access denied | User must be admin |
| 0 invalid linkages | Good! All linkages are valid |
| Large number removed | Review which users got deactivated |

---

## When to Run

- ✅ After deactivating staff members
- ✅ After deactivating HODs/department heads
- ✅ Weekly maintenance
- ✅ Before bulk deactivations
- ✅ During system maintenance window

---

## Full Documentation

For complete details, see: `CLEANUP_INACTIVE_HODS_GUIDE.md`

For all inactive HOD information, see: `INACTIVE_HOD_FIX_SUMMARY.md`
