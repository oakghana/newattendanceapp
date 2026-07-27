# Delete Leave Request - Quick Reference

## Quick Start (30 seconds)

1. Open leave request detail view
2. Scroll to bottom → "Admin Actions" section
3. Click "Delete" button
4. Confirm in dialog
5. Done! Record permanently deleted

## Permission Check

Can delete: ✅ Admin, HR Executive, HR Leave Office
Cannot delete: ❌ Staff, Manager, HOD, Approver

## What Gets Deleted

**Deleted automatically:**
- Leave request record
- Balance transactions
- Payment memos
- Notifications
- Archive logs
- Status records
- Change proposals

**NOT deleted (protected):**
- User accounts
- Attendance records
- System settings
- Auth data

## Confirmation Dialog

Before deletion, you'll see:
- Staff name
- Request ID (shortened)
- Current status
- **WARNING**: Permanent deletion notice

## Response Messages

**Success:**
```
"Leave request deleted - All related records have been removed from the database"
```

**Error Examples:**
- "Leave request not found"
- "Unauthorized - no token provided"
- "Forbidden - only admins can delete"

## Undo/Restore

⚠️ **IMPORTANT:** There is NO UNDO!

If needed:
1. Restore database from backup
2. Or contact system administrator
3. Always backup before batch deletions

## API Usage (Developers)

```bash
# Delete a specific request
curl -X DELETE \
  "http://localhost:3000/api/leave/delete-request?id=REQUESTID" \
  -H "Authorization: Bearer TOKEN"

# Check before deleting
curl -X GET \
  "http://localhost:3000/api/leave/delete-request?id=REQUESTID"
```

## Database Query Verification

```sql
-- Confirm deletion
SELECT COUNT(*) FROM leave_requests WHERE id = 'REQUEST_ID';
-- Returns 0 if deleted successfully
```

## Common Issues

| Issue | Solution |
|-------|----------|
| Delete button not visible | Check user role (must be admin/HR) |
| Delete fails silently | Check browser console, verify token valid |
| Record still exists | Hard refresh, check database directly |
| "WHERE clause" error | Use the new API endpoint (not bulk delete) |

## File Locations

- **Button Component**: `components/leave/delete-leave-request-button.tsx`
- **Hook**: `hooks/use-delete-leave-request.ts`
- **API Endpoint**: `app/api/leave/delete-request/route.ts`
- **Detail Panel**: `components/leave/leave-request-detail-panel.tsx`

## Tips

- 💡 Always verify staff name before deleting
- 💡 Check if request has payment memos (shown in detail view)
- 💡 Related records auto-delete (no manual cleanup needed)
- 💡 Operation is idempotent (safe to run multiple times)
- 💡 All deletes are logged (check console)

## Getting Help

1. Check console for error messages
2. Review full docs: `docs/DELETE_LEAVE_REQUEST.md`
3. Verify database connection
4. Check user permissions
5. Contact admin if still stuck
