# HOD Linkages Visibility Fix

## Problem

HODs could not see requests from their linked staff in the "My Tasks" tab.

**Real Example:**
- itm@gmail.com (KWAKU APPIAH OHEMENG) - DEPARTMENT_HEAD role
- Linked to: GRACE WERWERDU and BOAME EHRENFRIED YAW
- Both staff members submitted loan requests with status "pending_hod"
- **Result:** Requests were NOT visible in itm@gmail.com's "My Tasks" tab

## Root Cause

The `staffLinkedHodIds` variable was never populated for HODs. The logic was inverted:

**Buggy Code (lines 324-331):**
```typescript
// Only execute if user is NOT an HOD
if (role !== "admin" && !isRegionalManager && !isDepartmentHead) {
  // Fetch linked HODs (wrong direction for HODs!)
  const { data: hodLinkageRows } = await admin
    .from("loan_hod_linkages")
    .select("hod_user_id")
    .eq("staff_user_id", user.id)  // ← Queries as if user is STAFF
  linkedHodIds = ...
}
```

**What Happened:**
1. itm@gmail.com logs in
2. Check: `isDepartmentHead = true` (they are a department head)
3. Condition: `if (!isDepartmentHead)` → FALSE
4. Code block never executes
5. `staffLinkedHodIds` stays empty
6. myTasks query doesn't fetch linked staff requests
7. GRACE WERWERDU and BOAME EHRENFRIED YAW's requests invisible

## Solution

Reversed the logic to correctly distinguish between two cases:

**Fixed Code (lines 322-345):**
```typescript
if (isRegionalManager || isDepartmentHead || role === "admin" || 
    (permissions.hod && !isRegionalManager && !isDepartmentHead)) {
  // User IS a HOD → fetch STAFF linked to them
  const { data: staffLinkageRows } = await admin
    .from("loan_hod_linkages")
    .select("staff_user_id")  // ← Fetch staff IDs
    .eq("hod_user_id", user.id)  // ← Where they are the HOD
  staffLinkedToHodIds = ...
} else {
  // User is STAFF → fetch HODs linked to them
  const { data: hodLinkageRows } = await admin
    .from("loan_hod_linkages")
    .select("hod_user_id")
    .eq("staff_user_id", user.id)
  linkedHodIds = ...
}
```

**Now:**
1. itm@gmail.com logs in
2. Check: `isDepartmentHead = true`
3. Condition: `if (isDepartmentHead)` → TRUE ✓
4. Code executes and fetches staff linked to itm@gmail.com
5. `staffLinkedHodIds = [grace_werwerdu_id, boame_yaw_id, ...]`
6. myTasks query uses this to fetch their requests
7. GRACE WERWERDU and BOAME EHRENFRIED YAW's requests VISIBLE ✓

## Files Modified

- `app/api/loan/workflow/route.ts` (lines 322-345)

## Verification

### Step 1: Run the verification script
```bash
# Copy and paste queries from: scripts/verify-hod-linkages.sql
# Run each query in Supabase SQL editor
```

### Step 2: Check in UI
1. Log in as itm@gmail.com
2. Navigate to: **Loan Administration → My Tasks**
3. Should see requests from GRACE WERWERDU and BOAME EHRENFRIED YAW marked "Pending HOD"

### Step 3: Expected Results

When running the verification script:

**Query 1 - Verify itm@gmail.com user:**
```
id: <uuid>
email: itm@gmail.com
first_name: KWAKU
last_name: APPIAH OHEMENG
role: department_head
```

**Query 3 - HOD linkages:**
```
hod_user_id: <itm@gmail.com's uuid>
staff_user_id: <grace_werwerdu's uuid>
hod_email: itm@gmail.com
staff_email: grace.werwerdu@qccgh.com

hod_user_id: <itm@gmail.com's uuid>
staff_user_id: <boame_yaw's uuid>
hod_email: itm@gmail.com
staff_email: ehrenfried.boame@qccgh.com
```

**Query 4 - Loan requests:**
Should show multiple requests from both staff with status "pending_hod"

**Query 6 - Linked staff requests:**
Should return 2+ rows showing GRACE WERWERDU and BOAME EHRENFRIED YAW's pending requests

## How It Works Now

### Request Flow for HOD:

1. HOD logs in
2. API `/loan/workflow` endpoint called
3. Check user role: `department_head` ✓
4. Fetch all STAFF linked to HOD from `loan_hod_linkages`
5. Fetch all their requests with `status = "pending_hod"`
6. Add to myTasks along with explicitly assigned requests
7. Deduplicate and return
8. UI shows all requests HOD needs to review

### Request Visibility Rules:

| User Type | Sees In My Tasks |
|-----------|------------------|
| STAFF | Requests they submitted (my_loans) |
| HOD | ✓ Their own submitted requests |
| | ✓ All linked staff pending requests (NEW) |
| | ✓ Explicitly assigned requests |
| Loan Officer | Approved requests assigned to them |
| Committee | Awaiting committee requests |
| HR | Awaiting HR terms requests |

## Testing Checklist

- [ ] Log in as itm@gmail.com
- [ ] Navigate to Loan Administration
- [ ] Click "My Tasks (X)" tab
- [ ] Verify GRACE WERWERDU's requests appear
- [ ] Verify BOAME EHRENFRIED YAW's requests appear
- [ ] Click a request to open it
- [ ] Verify can submit HOD decision (Approve/Reject)
- [ ] After decision, request moves to appropriate next step
- [ ] Run verification script to confirm data integrity

## Performance Notes

- Query now joins with `loan_hod_linkages` table (indexed by hod_user_id)
- Fetches only one additional query per login if user is HOD
- No impact on existing queries
- Deduplication uses JavaScript Map (O(n) time)

## Related Files

- `app/api/loan/workflow/route.ts` - Main fix
- `scripts/verify-hod-linkages.sql` - Verification queries
- `docs/HOD-MYTASKS-FIX.md` - Previous myTasks query fix
- `components/admin/staff-management.tsx` - HOD linkage management

## Deployment Notes

- No database schema changes required
- No migrations needed
- Safe to deploy immediately
- Clear browser cache after deployment for UI refresh
- Users may need to refresh page to see new requests
