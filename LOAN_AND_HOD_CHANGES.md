# Loan Application & HOD Review Changes

## Summary
Implementation of critical changes to the loan application process and HOD review workflow:
1. **No default loan selection** - Staff must actively search and select their desired loan
2. **HOD Review - No rejection** - HOD managers can only endorse, not reject

---

## Loan Application Form Changes

### What Changed
Staff can no longer see "Car Loan (Junior)" (or any loan) pre-selected by default. Instead:
- Empty selection field
- Placeholder text: "Search and select the loan you want to apply for"
- Staff must use the search box to find and select their desired loan

### Implementation Details
Removed auto-selection logic from three places in `/app/dashboard/loan-app/page.tsx`:

1. **loadData() function** (Line ~1417)
   - Previously: Auto-selected first loan type when data loaded
   - Now: No auto-selection; field remains empty

2. **resetForm() function** (Line ~1449)
   - Previously: Auto-selected first loan type when form reset
   - Now: Resets loan selection to empty string

3. **useEffect hook** (Line ~1459)
   - Previously: Auto-selected first loan when filtered loans changed
   - Now: Removed entire useEffect; no auto-selection

### User Experience
**Before:**
```
Loan Type: [Car Loan (Junior)] ▼
- Staff sees a pre-selected loan
- Must manually change if they need different loan
- May accidentally apply for wrong loan
```

**After:**
```
Loan Type: [Search and select the loan you want to apply for] ▼
- Field is empty
- Staff searches for their specific loan
- Active choice prevents mistakes
```

---

## HOD Review - Rejection Disabled

### What Changed
**Loan HOD Review** (`/app/dashboard/loan-app/page.tsx`):
- Removed "Reject" option from decision dropdown
- Only "Endorse" option available
- HOD managers can add notes/comments but cannot reject loans

**Leave HOD Review** (`/app/dashboard/leave-planning/leave-planning-client.tsx`):
- Already configured correctly
- Only options: "Endorse" or "Adjust Dates"
- No rejection capability

### Implementation Details

**Loan HOD Review** (Lines 4565-4577):
```typescript
// BEFORE: Had both options
<SelectItem value="approve">Endorse</SelectItem>
<SelectItem value="reject">Reject</SelectItem>

// AFTER: Only Endorse
<SelectItem value="approve">Endorse</SelectItem>
```

**HOD Button** (Lines 4725-4733):
```typescript
// BEFORE: Conditional text based on decision
{modalDecision === "approve" ? "Endorse" : "Reject"}

// AFTER: Always Endorse
Endorse
```

### Workflow Impact

**Loan Workflow:**
1. Staff submits loan request
2. HOD reviews → Can only "Endorse" ✓
3. If HOD needs adjustments → Use notes field
4. Forwarded to Loan Office/Committee
5. They can approve or reject

**Leave Workflow:**
1. Staff submits leave request
2. HOD reviews → Can "Endorse" or "Adjust Dates" ✓
3. No rejection option
4. Forwarded to HR-Leave-Office-Admin
5. HR can approve or reject

---

## Files Modified
- `/app/dashboard/loan-app/page.tsx` - Removed default loan selection & HOD rejection
- No changes needed for leave HOD review (already correct)

## Database Schema
- No schema changes required
- Changes are UI-level only
- All data validation remains the same

## Testing Checklist

### Loan Application Form
- [ ] Navigate to New Loan Request
- [ ] Verify loan type field is empty (no default)
- [ ] Verify placeholder shows: "Search and select the loan you want to apply for"
- [ ] Search for "Car Loan" and verify results
- [ ] Select a loan and verify form populates correctly
- [ ] Clear selection and verify field is empty again
- [ ] Submit loan and verify it goes to HOD queue

### HOD Review - Loans
- [ ] HOD navigates to "HOD Review Queue"
- [ ] Opens a loan request for review
- [ ] Verify "Decision" dropdown ONLY shows "Endorse" option
- [ ] Verify no "Reject" option appears
- [ ] Can add notes in the text area
- [ ] Click "Endorse" button - loan goes to next stage
- [ ] Verify "Endorse" button text is always visible

### HOD Review - Leaves
- [ ] HOD navigates to "HOD Review" tab in leave-management
- [ ] Opens a leave request for review
- [ ] Verify only "Endorse" and "Adjust Dates" buttons appear
- [ ] Verify no rejection option
- [ ] Can recommend date adjustments if needed
- [ ] Click "Endorse" - leave goes to HR approval stage

---

## Related Documentation
- `/ROLE_BASED_ACCESS_CONTROL.md` - HR-Leave-Office-Admin permissions
- `/ANNUAL_LEAVE_VALIDATION_AND_CALCULATIONS.md` - Leave workflow
- `/HR_LEAVE_OFFICE_ADMIN_ROLE.md` - Leave admin role details

---

## Contact & Support
For issues or questions about these changes, refer to the active plan file at `/v0_plans/leave-admin-loan-updates.md`
