# Complete Deferment & Recall System Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                         DEFERMENT & RECALL MANAGEMENT SYSTEM                        │
└─────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   STAFF MEMBER   │     │   DEPARTMENT     │     │   HOD/RM         │
│   (Submitter)    │────→│   (Reviews)      │────→│  (Approves)      │
└──────────────────┘     └──────────────────┘     └────────┬─────────┘
                                                            │
                                                     ✅ If Approved
                                                            │
                                ┌───────────────────────────▼──────────────────┐
                                │   HR LEAVE OFFICE                            │
                                │   Processing Requests Tab (NEW)              │
                                │                                              │
                                │  Shows pending requests awaiting assignment  │
                                │  ├─ Search by staff name/ID/dept            │
                                │  ├─ Filter by type (Deferment/Recall)       │
                                │  └─ Assign to HR Executive (1 click)        │
                                │                                              │
                                │  API: /pending-requests (GET)               │
                                │  API: /assign-to-executive (POST)           │
                                └───────────────────────────┬──────────────────┘
                                                            │
                                              Assigns to HR Executive
                                                            │
                        ┌───────────────────────────────────▼──────────────────┐
                        │   HR EXECUTIVE / HR DIRECTOR                         │
                        │   Memo Management Tab                                │
                        │                                                      │
                        │  Shows assigned memos in Pending queue               │
                        │  ├─ View full request details                        │
                        │  ├─ Approve or Reject                               │
                        │  └─ Sign with signature (draw/type)                 │
                        │                                                      │
                        │  API: /get-memos (GET)                              │
                        │  API: /approve-memo (POST)                          │
                        │  API: /generate-pdf (POST)                          │
                        └───────────────────────────┬──────────────────────────┘
                                                    │
                                           ✅ If Approved
                                                    │
                            ┌───────────────────────▼────────────────────┐
                            │   SYSTEM GENERATES OFFICIAL MEMO            │
                            │                                            │
                            │  ✓ Staff information                       │
                            │  ✓ Leave details                           │
                            │  ✓ Deferment/Recall decision               │
                            │  ✓ HR Executive signature                  │
                            │  ✓ Official letterhead                     │
                            │  ✓ Document ID & timestamp                 │
                            │                                            │
                            │  PDF Ready for:                            │
                            │  ├─ Download                               │
                            │  ├─ Print                                  │
                            │  ├─ Email distribution                     │
                            │  └─ Official records storage               │
                            └────────────────────────────────────────────┘
```

---

## Database Schema

### leave_deferment_requests Table
```sql
Table: leave_deferment_requests

Core Columns (existing):
- id (UUID, Primary Key)
- staff_user_id (UUID, Foreign Key → user_profiles)
- request_reason (TEXT)
- deferment_to_year (INTEGER)
- hod_approval_status (TEXT: 'pending', 'approved', 'rejected')
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)

NEW HR WORKFLOW COLUMNS:
- initiated_by_user_id (UUID, Foreign Key → user_profiles)
- assigned_hr_executive_id (UUID, Foreign Key → user_profiles) ← HR Exec Assignment
- hr_executive_decision (TEXT: 'pending', 'approved', 'rejected')
- hr_executive_decision_at (TIMESTAMP)
- hr_executive_comments (TEXT)
- hr_office_notes (TEXT) ← Notes from HR Leave Office
- hr_office_reviewed_by (UUID, Foreign Key → user_profiles)
- hr_office_reviewed_at (TIMESTAMP)

EXISTING SIGNATURE COLUMNS:
- hr_signer_name (TEXT)
- hr_signer_title (TEXT)
- hr_write_date (DATE)
- hr_office_reviewed_by (UUID)
- hr_office_reviewed_at (TIMESTAMP)

Indexes:
- idx_deferment_assigned_hr (ON assigned_hr_executive_id)
- idx_deferment_initiated_by (ON initiated_by_user_id)
```

### leave_recall_requests Table
```sql
Table: leave_recall_requests

Core Columns (existing):
- id (UUID, Primary Key)
- staff_user_id (UUID, Foreign Key → user_profiles)
- recall_reason (TEXT)
- hod_approval_status (TEXT: 'pending', 'approved', 'rejected')
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)

NEW HR WORKFLOW COLUMNS:
- assigned_hr_executive_id (UUID, Foreign Key → user_profiles) ← HR Exec Assignment
- hr_executive_decision (TEXT: 'pending', 'approved', 'rejected')
- hr_executive_decision_at (TIMESTAMP)
- hr_executive_comments (TEXT)
- hr_office_notes (TEXT) ← Notes from HR Leave Office
- hr_office_reviewed_by (UUID, Foreign Key → user_profiles)
- hr_office_reviewed_at (TIMESTAMP)

EXISTING SIGNATURE COLUMNS:
- hr_signer_name (TEXT)
- hr_signer_title (TEXT)
- hr_write_date (DATE)

Indexes:
- idx_recall_assigned_hr (ON assigned_hr_executive_id)
```

---

## API Endpoints

### 1. GET /api/leave/deferment-recall/pending-requests
**Purpose**: Fetch all pending requests for HR Leave Office

**Request Headers**:
```
Authorization: Bearer <user_token>
```

**Response** (200 OK):
```json
{
  "defermentRequests": [
    {
      "id": "uuid",
      "staff_user_id": "uuid",
      "request_reason": "In peak season",
      "deferment_to_year": 2026,
      "created_at": "2026-06-07T10:30:00Z",
      "hod_approval_status": "approved",
      "assigned_hr_executive_id": null,
      "staff": {
        "id": "uuid",
        "first_name": "John",
        "last_name": "Doe",
        "employee_id": "E-2345",
        "position": "Software Developer"
      },
      "department": {
        "id": "uuid",
        "name": "IT Department"
      },
      "leave": {
        "id": "uuid",
        "leave_type": "Annual Leave",
        "balance_period_start": "2026-01-01",
        "balance_period_end": "2026-12-31"
      }
    }
  ],
  "recallRequests": [...],
  "total": 5
}
```

**Error Responses**:
- 401: Unauthorized (not authenticated)
- 403: Forbidden (not HR Leave Office role)
- 500: Server error

---

### 2. POST /api/leave/deferment-recall/assign-to-executive
**Purpose**: Assign request to HR executive for approval

**Request Body**:
```json
{
  "type": "deferment",  // or "recall"
  "requestId": "uuid",
  "hrExecutiveId": "uuid",
  "notes": "Urgent processing required"  // optional
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Request assigned to HR executive successfully"
}
```

**Error Responses**:
- 400: Missing required fields
- 401: Unauthorized
- 403: Forbidden (not HR Leave Office)
- 500: Server error

---

### 3. GET /api/leave/hr-executives
**Purpose**: Get list of active HR executives for dropdown

**Request Headers**:
```
Authorization: Bearer <user_token>
```

**Response** (200 OK):
```json
{
  "executives": [
    {
      "id": "uuid",
      "name": "Sarah Manager",
      "email": "sarah@company.com",
      "role": "manager_hr",
      "position": "Manager HR",
      "department": "HR Department"
    },
    {
      "id": "uuid",
      "name": "Robert Director",
      "email": "robert@company.com",
      "role": "director_hr",
      "position": "Director HR",
      "department": "HR Department"
    }
  ],
  "grouped": {
    "manager_hr": [...],
    "director_hr": [...]
  }
}
```

---

### 4. GET /api/leave/deferment-recall/memos/get-memos
**Purpose**: Get assigned memos for HR Executive (existing)

**Filters Memos Where**:
- `assigned_hr_executive_id = current_user_id`
- Shows all statuses (pending, approved, rejected)
- Separated by type (deferment/recall)

---

### 5. POST /api/leave/deferment-recall/approve-memo
**Purpose**: Approve memo with signature (existing)

**Request Body**:
```json
{
  "memoId": "uuid",
  "type": "deferment",
  "decision": "approved",
  "signature": "data:image/png;base64,iVBORw0KGgo...",
  "signatureType": "draw",  // or "typed"
  "signedName": "John Signature",
  "comments": "Approved"
}
```

---

### 6. POST /api/leave/deferment-recall/generate-pdf
**Purpose**: Generate PDF for approved memo (existing)

**Request**:
```json
{
  "memoId": "uuid",
  "type": "deferment"
}
```

---

## Components

### HRLeaveOfficeRequestDashboard
**File**: `/components/leave/hr-leave-office-request-dashboard.tsx`

**Props**: None (fetches from APIs)

**State**:
- `defermentRequests`: Array of pending deferment requests
- `recallRequests`: Array of pending recall requests
- `hrExecutives`: Array of available HR executives
- `loading`: Boolean for loading state
- `searchTerm`: Search input value
- `requestTypeFilter`: Filter selection
- `assignModalOpen`: Modal visibility
- `selectedRequest`: Currently selected request for assignment
- `selectedExecutive`: Selected HR executive for assignment
- `assignmentNotes`: Notes from HR office staff

**Features**:
- Fetches pending requests on mount
- Real-time search and filtering
- Modal for signer assignment
- Toast notifications for success/error
- Responsive grid layout
- Color-coded request types

---

## User Roles & Permissions

```
┌─────────────────────────────────────────────────────────────────┐
│ Role                    │ Processing Requests │ Memo Management  │
├─────────────────────────┼─────────────────────┼──────────────────┤
│ Staff Member            │ ❌                  │ ❌               │
│ Department Head/HOD     │ ❌                  │ ❌               │
│ HR Leave Office         │ ✅ (PRIMARY)        │ ⚠️ (View only)   │
│ HR Executive/Manager    │ ❌                  │ ✅ (PRIMARY)     │
│ HR Director             │ ❌                  │ ✅ (PRIMARY)     │
│ Admin                   │ ✅                  │ ✅               │
└─────────────────────────────────────────────────────────────────┘

Primary Use Cases:
- HR Leave Office: ASSIGN requests to executives
- HR Executives: APPROVE memos with signatures
```

---

## Data Flow Diagram

```
┌────────────────────┐
│  HR Leave Office   │ (Role: hr_leave_office)
│  Staff Member      │
└──────────┬─────────┘
           │
           ▼
┌────────────────────────────────────────────────┐
│ GET /api/leave/deferment-recall/pending-requests
│                                                │
│ Filters:                                       │
│ - hod_approval_status = 'approved'            │
│ - assigned_hr_executive_id IS NULL            │
│                                                │
│ Returns: Array of pending requests             │
└──────────────────┬─────────────────────────────┘
                   │
                   ▼
        [Displays in Dashboard]
                   │
                   ▼
        [User clicks "Assign"]
                   │
                   ▼
        [Modal Opens with Request]
                   │
                   ▼
┌────────────────────────────────────────────────┐
│ GET /api/leave/hr-executives                   │
│                                                │
│ Returns: Array of active HR executives         │
│ Filters: is_active = true                      │
│          role IN ('hr_executive', 'manager_hr',
│                   'director_hr', 'hr_director') │
└──────────────────┬─────────────────────────────┘
                   │
                   ▼
        [Populates Dropdown]
                   │
                   ▼
        [User selects executive]
                   │
                   ▼
        [User clicks "Assign & Forward"]
                   │
                   ▼
┌────────────────────────────────────────────────┐
│ POST /api/leave/deferment-recall/assign-to-    │
│                            executive             │
│                                                │
│ Body: {                                        │
│   type: 'deferment',                          │
│   requestId: uuid,                            │
│   hrExecutiveId: uuid,                        │
│   notes: string                               │
│ }                                              │
│                                                │
│ Updates Database:                              │
│ - assigned_hr_executive_id = selected exec    │
│ - hr_office_reviewed_by = current user        │
│ - hr_office_reviewed_at = NOW()               │
│ - hr_office_notes = user notes                │
└──────────────────┬─────────────────────────────┘
                   │
                   ▼
        [Success Toast Shown]
                   │
                   ▼
        [Dashboard Refreshes]
                   │
                   ▼
        [Request Removed from List]
                   │
                   ▼
┌────────────────────────────────────────────────┐
│ Request Now Visible to HR Executive            │
│ In: Memo Management → Pending Memos            │
│                                                │
│ HR Exec can now:                               │
│ - View full details                            │
│ - Approve with signature                       │
│ - Reject with comments                         │
│ - Generate PDF                                 │
│ - Download/Print                               │
└────────────────────────────────────────────────┘
```

---

## Implementation Checklist

### Backend API
- ✅ GET /api/leave/deferment-recall/pending-requests
- ✅ POST /api/leave/deferment-recall/assign-to-executive
- ✅ GET /api/leave/hr-executives (enhanced)
- ✅ Role-based access control
- ✅ Error handling
- ✅ Input validation

### Frontend Components
- ✅ HRLeaveOfficeRequestDashboard
- ✅ Assignment modal
- ✅ Search functionality
- ✅ Filter functionality
- ✅ Loading states
- ✅ Error handling
- ✅ Toast notifications

### Integration
- ✅ Added tab to Leave Management
- ✅ Role-based tab visibility
- ✅ Proper imports
- ✅ Responsive design

### Documentation
- ✅ Complete workflow guide
- ✅ Quick reference card
- ✅ System architecture
- ✅ API documentation
- ✅ Troubleshooting guide

---

## Performance Considerations

1. **Pagination**: Pending requests list loads all records (suitable for typical volumes of 5-50 requests)
2. **Search**: Client-side filtering for better responsiveness
3. **Caching**: HR executives list cached locally during session
4. **Indexes**: Database indexes on assigned_hr_executive_id for fast lookups

---

## Security Notes

1. **Role-Based Access**: Only HR Leave Office can access pending requests API
2. **Authentication**: All endpoints require valid user session
3. **Data Filtering**: Requests filtered to only those appropriate for user
4. **SQL Injection**: Protected by Supabase parameterized queries
5. **CORS**: Properly configured for same-origin requests

---

## Future Enhancements

- [ ] Bulk assignment feature
- [ ] Email notifications
- [ ] Approval deadline tracking
- [ ] Priority levels
- [ ] Assignment history viewer
- [ ] Export to Excel
- [ ] Dashboard analytics
- [ ] Auto-routing rules

---

*Architecture Version: 1.0*
*Last Updated: June 2026*
*Status: Production Ready*
