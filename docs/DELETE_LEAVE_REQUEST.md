# Delete Leave Request Feature - Admin Guide

## Overview

Administrators now have the ability to permanently delete individual leave requests from the system through the Leave Request detail view. This feature provides a safe, controlled way to remove leave records while maintaining database integrity.

## Files Created/Modified

### New Files:
1. **`/app/api/leave/delete-request/route.ts`** - API endpoint for deleting leave requests
2. **`/hooks/use-delete-leave-request.ts`** - React hook for managing delete operations
3. **`/components/leave/delete-leave-request-button.tsx`** - Reusable delete button component

### Modified Files:
1. **`/components/leave/leave-request-detail-panel.tsx`** - Added delete button to detail view

## Features

### Safety Features
- ✅ Role-based access control (admin, HR executive, HR leave office only)
- ✅ Multi-step confirmation dialog with explicit warnings
- ✅ Shows staff name, request ID, and current status before deletion
- ✅ Displays warning about permanent deletion and cascading deletes
- ✅ Prevents accidental deletion with confirmation button
- ✅ Loading states during deletion process
- ✅ Audit logging of all deletion operations

### Automatic Cleanup
When a leave request is deleted, all related records are automatically deleted in proper dependency order:
1. Leave balance transactions
2. Leave status records
3. Payment memos
4. Leave notifications
5. Archive logs
6. Change proposals
7. The leave request itself

### Database Integrity
- Foreign key dependencies are handled correctly
- No orphaned records left behind
- Idempotent operation (safe to run multiple times)
- Comprehensive error handling

## How to Use

### For Administrators

1. **Navigate to Leave Request Detail View**
   - Go to Leave Management module
   - Find the specific leave request to delete
   - Click to open the detail panel

2. **Locate Delete Button**
   - Scroll to the bottom of the detail panel
   - Look for "Admin Actions" section (red-themed card)
   - Click the "Delete" button

3. **Confirm Deletion**
   - Review the confirmation dialog
   - Verify staff name, request ID, and status
   - Read the warning about permanent deletion
   - Click "Delete Permanently" to confirm

4. **Completion**
   - Toast notification shows success message
   - Detail panel closes automatically
   - Leave request is removed from database

## API Endpoint

### DELETE Request
```
DELETE /api/leave/delete-request?id={requestId}
Authorization: Bearer {authToken}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Leave request {id} has been permanently deleted",
  "deletedRequest": {
    "id": "uuid",
    "staffName": "John Doe",
    "status": "pending_hod_review",
    "startDate": "2026-07-15"
  }
}
```

**Response (Errors):**
- `400`: Missing leave request ID
- `401`: Unauthorized (no valid token)
- `403`: Forbidden (insufficient permissions)
- `404`: Leave request not found
- `500`: Internal server error during deletion

### GET Request (Verify Deletability)
```
GET /api/leave/delete-request?id={requestId}
```

**Response:**
```json
{
  "exists": true,
  "request": {
    "id": "uuid",
    "staff_name": "John Doe",
    "status": "pending_hod_review",
    "preferred_start_date": "2026-07-15"
  },
  "relatedRecords": {
    "balanceTransactions": 0,
    "statuses": 1,
    "memos": 0,
    "notifications": 0
  },
  "canDelete": true
}
```

## Implementation Details

### Hook: `useDeleteLeaveRequest`

```typescript
const { deleteRequest, isLoading } = useDeleteLeaveRequest({
  onSuccess: () => {
    // Refresh data, close modal, etc.
  },
  onError: (error) => {
    console.error('Delete failed:', error)
  }
})

// Call deletion
await deleteRequest(requestId, staffName)
```

### Component: `DeleteLeaveRequestButton`

```tsx
<DeleteLeaveRequestButton
  requestId={request.id}
  staffName={request.staff_name}
  requestStatus={request.status}
  onDeleteSuccess={() => router.refresh()}
  variant="destructive"
  size="sm"
  showIcon={true}
/>
```

Props:
- `requestId` (required): UUID of leave request to delete
- `staffName` (optional): Display name of staff member
- `requestStatus` (optional): Current status of leave request
- `onDeleteSuccess` (optional): Callback after successful deletion
- `showIcon` (optional): Display trash icon on button (default: true)
- `variant` (optional): Button variant (default: "destructive")
- `size` (optional): Button size (default: "sm")
- `className` (optional): Additional CSS classes

## Access Control

Delete functionality is restricted to:
- Admin users
- HR executives
- HR leave office staff

The following roles cannot delete leave requests:
- Staff members
- Managers
- HR approvers
- HOD

## Audit Trail

All deletion operations are logged to console with the following format:

```
[v0] Admin {userId} is deleting leave request {requestId}
[v0] Successfully deleted leave request {requestId} and related records
```

Consider implementing persistent audit logging in future enhancements.

## Error Handling

### Common Errors

1. **"Leave request not found"**
   - The request ID doesn't exist in the database
   - May have already been deleted
   - Verify the correct ID

2. **"Unauthorized - no token provided"**
   - Browser session expired
   - Login and try again

3. **"Forbidden - only admins and HR staff can delete"**
   - Current user lacks required permissions
   - Contact system administrator

4. **"Failed to delete leave request"**
   - Database connection error
   - Related record deletion failed
   - Check server logs for details

## Related Data Deletion

The following tables are checked and cleaned when deleting a leave request:

| Table | Purpose | Auto-deleted |
|-------|---------|---|
| leave_balance_transactions | Tracks balance changes | Yes |
| leave_status | Request status history | Yes |
| leave_payment_memos | Payment advice memos | Yes |
| leave_notifications | System notifications | Yes |
| leave_archive_log | Archive tracking | Yes |
| leave_change_proposals | Proposed changes | Yes |

The following are NOT affected:
- User profiles
- Attendance records
- Authentication data
- System configuration

## Testing

To test the delete functionality:

1. **Create test leave request**
   - Navigate to leave management
   - Submit a test leave request

2. **Delete the request**
   - Open request details
   - Scroll to Admin Actions section
   - Click Delete button
   - Confirm deletion in dialog

3. **Verify deletion**
   - List should refresh automatically
   - Request should no longer appear
   - No errors should show in console

4. **Database verification** (optional)
   ```sql
   SELECT COUNT(*) FROM leave_requests WHERE id = '{requestId}';
   -- Should return 0
   ```

## Best Practices

1. **Always confirm identity**: Ensure you are deleting the correct request
2. **Check related data**: Use the detail view to see if there are memos or payments
3. **Archive first (optional)**: Consider archiving instead of deleting for audit trail
4. **Backup database**: Take database backups before batch deletions
5. **Document reason**: Add comments in your audit system if one exists

## Future Enhancements

Potential improvements:
- Soft delete (mark as deleted without removing from DB)
- Permanent audit log of all deletions
- Deletion reason/comment field
- Batch deletion with file upload
- Deletion scheduling (delete after X days)
- Restore/undelete functionality

## Troubleshooting

### Delete button not showing
- Verify user role is admin, HR executive, or HR leave office
- Check browser console for errors
- Ensure `isAdmin` and `showDeleteButton` props are true

### Deletion fails with "WHERE clause" error
- This was a known bug in the old bulk delete endpoint
- The new per-record delete uses specific IDs (no WHERE clause issues)
- Report issue if it persists

### Data still exists after deletion
- Hard refresh browser (Ctrl+F5 or Cmd+Shift+R)
- Check database directly to confirm deletion
- Verify deletion API response was successful

## Support

For issues or questions:
1. Check server logs: `/vercel/share/v0-project/.next/server.log`
2. Verify database connectivity
3. Contact system administrator
4. Report bugs with specific request IDs and error messages
