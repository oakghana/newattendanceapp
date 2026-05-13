# Leave Deferment Workflow - Test Simulation

## Objective
Verify that the leave deferment system works correctly for both **STAFF** and **HOD** roles.

---

## Test Scenario 1: STAFF MEMBER DEFERRALS

### Prerequisites
- Staff member has an approved leave request (status: `hr_approved`)
- Leave dates: May 01 - Jun 09, 2026 (30 days)
- Staff role is normalized to exclude HOD/Manager/Admin titles

### Test Steps

#### Step 1: View Approved Leaves in Deferment Tab
**User Action**: Staff opens "Leave Deferment" tab in Leave Management

**Expected Behavior**:
- ✓ API call to `/api/leave/deferment/request?action=approved_leaves`
- ✓ Query executes: `user_id = current_staff_id AND status = "hr_approved"`
- ✓ Approved leave appears: "Annual Leave (May 01 - Jun 09, 2026) - 30 days - Approved"
- ✓ "Defer Leave" and "Download" buttons are visible

**API Flow**:
```javascript
GET /api/leave/deferment/request?action=approved_leaves
→ Fetches leaves where user_id = staff_id and status = "hr_approved"
→ Returns: [{ id, user_id, leave_type_key, preferred_start_date, preferred_end_date, requested_days, status }]
```

#### Step 2: Submit Deferment Request
**User Action**: Staff clicks "Defer Leave" button and fills form:
- Deferment Year: `2027`
- Deferment Period: `Q1 2027`
- Reason: `Planning major project delivery`

**Expected Behavior**:
- ✓ Form validation passes (required fields filled)
- ✓ API call to `POST /api/leave/deferment/request`
- ✓ Authorization check: `user_id = staff_id` (PASSES)
- ✓ Leave request found: status = "hr_approved" (PASSES)
- ✓ HOD lookup: Fetches HOD from staff's department
- ✓ Deferment request created with status: `pending_hod_review`
- ✓ Success toast: "Deferment request submitted"

**API Flow**:
```javascript
POST /api/leave/deferment/request
{
  "leave_plan_request_id": "abc-123",
  "requested_deferment_year": "2027",
  "requested_deferment_period": "Q1 2027",
  "reason": "Planning major project delivery"
}

→ Auth check: user_id = staff_id (✓ PASSES)
→ Leave verification: status = "hr_approved" (✓ PASSES)
→ HOD lookup: department_id from staff's department
  - Query department users with HOD-related roles
  - Find user where role matches: hod, head_of_department, etc.
→ Create leave_deferment_requests record
→ Send notification to HOD
→ Return: { deferment_request_id, status: "pending_hod_review" }
```

#### Step 3: View Deferment Request Status
**User Action**: Staff views "Your Deferment Requests" section

**Expected Behavior**:
- ✓ Deferment request appears with status: "Pending HOD Review"
- ✓ Shows: Original leave (May 01 - Jun 09), Requested period (Q1 2027)
- ✓ "Download Leave Memo" button available

---

## Test Scenario 2: HOD PROCESSES DEPARTMENT STAFF DEFERRALS

### Prerequisites
- HOD has staff members in their department with approved leaves
- HOD role is normalized to: `hod`, `head_of_department`, `manager`, etc.

### Test Steps

#### Step 1: View Department Approved Leaves
**User Action**: HOD opens "Leave Deferment" tab in Leave Management

**Expected Behavior**:
- ✓ API call to `/api/leave/deferment/request?action=approved_leaves`
- ✓ Query executes: 
  - Get HOD's department_id
  - Get all users in department
  - Fetch approved leaves for those user IDs
- ✓ Multiple approved leaves appear (from different staff members):
  - "Annual Leave - STAFF MEMBER 1 (May 01 - Jun 09, 2026) - 30 days"
  - "Sick Leave - STAFF MEMBER 2 (May 15 - May 30, 2026) - 15 days"
  - etc.

**API Flow**:
```javascript
GET /api/leave/deferment/request?action=approved_leaves (HOD user)
→ Check role: normalized role = "hod" or "head_of_department"
→ Get HOD's department_id
→ Get all users in department: [staff1_id, staff2_id, staff3_id, ...]
→ Query: WHERE status = "hr_approved" AND user_id IN (staff_ids)
→ Returns: [multiple approved leaves from different staff]
```

#### Step 2: Submit Deferment for Department Staff
**User Action**: HOD clicks "Defer Leave" for STAFF MEMBER 2's leave and fills form:
- Deferment Year: `2027`
- Deferment Period: `August 2027`
- Reason: `Staff member is leading quarterly planning in July`

**Expected Behavior**:
- ✓ Authorization check: user_id ≠ HOD_id (but HOD can defer staff leaves)
- ✓ Verification: Staff member (STAFF MEMBER 2) is in HOD's department
- ✓ Leave verification: status = "hr_approved"
- ✓ Deferment request created with status: `pending_hod_review`
- ✓ Success toast: "Deferment request submitted"

**API Flow**:
```javascript
POST /api/leave/deferment/request
{
  "leave_plan_request_id": "def-456",  (STAFF MEMBER 2's leave)
  "requested_deferment_year": "2027",
  "requested_deferment_period": "August 2027",
  "reason": "Staff member is leading quarterly planning in July"
}

→ Auth check: 
  - user_id ≠ staff_id (HOD processing staff leave)
  - Get HOD's role: "hod" or "head_of_department"
  - Verify staff member is in HOD's department (✓ PASSES)
→ Leave verification: status = "hr_approved" (✓ PASSES)
→ HOD lookup: Get HOD for staff's department (already HOD, so approve)
→ Create leave_deferment_requests record
→ Send notification to HR/next reviewer
→ Return success
```

#### Step 3: View All Deferment Requests (HOD perspective)
**User Action**: HOD checks deferment dashboard/list

**Expected Behavior**:
- ✓ Can see pending deferments from their department
- ✓ Shows both:
  - Own deferrals (HOD's personal leaves)
  - Staff deferrals they processed
- ✓ Each deferment shows requestor, status, dates

---

## Critical Test Points

### ✓ Staff Test Checklist
- [ ] Approved leave appears in deferment tab
- [ ] Can submit deferment with valid year/period
- [ ] Cannot access other staff's leaves
- [ ] Receives confirmation after submission
- [ ] Can download leave memo
- [ ] HOD is correctly identified from department

### ✓ HOD Test Checklist
- [ ] Can view all approved leaves in their department
- [ ] Can see staff names with their leaves
- [ ] Can submit deferrals for department staff
- [ ] Cannot access leaves from other departments
- [ ] HOD name is correctly concatenated (first_name + last_name)
- [ ] Department validation prevents cross-dept access

### ✓ Error Handling Checklist
- [ ] "HOD or Manager not found" - Fixed with new lookup method
- [ ] "Leave request not found" - Fixed with flexible authorization
- [ ] "Unauthorized to defer this leave" - Triggers for invalid dept access
- [ ] "Staff member is not in your department" - Triggers for cross-dept
- [ ] Role normalization works for all variations (HOD, hod, Head Of Department, etc.)

---

## Database Query Verification

### Query 1: Fetch Approved Leaves (Staff)
```sql
SELECT id, user_id, leave_type_key, preferred_start_date, preferred_end_date, requested_days, status
FROM leave_plan_requests
WHERE status = 'hr_approved' AND user_id = ?
ORDER BY preferred_start_date DESC
```
**Expected**: Returns staff's approved leaves

### Query 2: Fetch Approved Leaves (HOD)
```sql
-- Step 1: Get HOD's department
SELECT department_id FROM user_profiles WHERE id = ?

-- Step 2: Get department users
SELECT id FROM user_profiles WHERE department_id = ?

-- Step 3: Get their approved leaves
SELECT id, user_id, leave_type_key, preferred_start_date, preferred_end_date, requested_days, status
FROM leave_plan_requests
WHERE status = 'hr_approved' AND user_id IN (...)
ORDER BY preferred_start_date DESC
```
**Expected**: Returns all approved leaves in department

### Query 3: HOD Lookup for Department
```sql
SELECT id, first_name, last_name, email, role
FROM user_profiles
WHERE department_id = ?
-- Filter in application by role normalization
```
**Expected**: Returns HOD with normalized role matching

---

## Expected Outcomes

### Scenario 1 Results (Staff)
✓ Staff submits deferment successfully
✓ Deferment status: `pending_hod_review`
✓ HOD receives notification
✓ Deferment appears in tracking list

### Scenario 2 Results (HOD)
✓ HOD can view all department staff's approved leaves
✓ HOD can submit deferrals for any staff member
✓ HOD can submit own deferrals if they have approved leaves
✓ All deferments properly attributed with correct approver

---

## Rollback/Failure Points

If any test fails:
1. Check that `normalizeRole()` function is working
2. Verify `user_profiles` has correct `department_id` values
3. Ensure HOD's role in database matches normalized patterns
4. Verify `leave_plan_requests` status is exactly `"hr_approved"`
5. Check that foreign key relationships exist

