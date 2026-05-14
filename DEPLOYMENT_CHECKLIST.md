# Complete Deployment & Testing Checklist

## Pre-Deployment

- [ ] **Backup Current Database** (Take snapshot in Supabase)
  - Go to Supabase → Project Settings → Database
  - Click "Take a backup"
  
- [ ] **Review All Changes** 
  - Read: `/FIXES_AND_NEW_FEATURES_SUMMARY.md`
  - Read: `/RUN_MIGRATIONS.md`
  
- [ ] **Test in Staging** (if available)
  - Deploy code to staging first
  - Run migrations in staging database
  - Verify changes work as expected

---

## Stage 1: Run Migrations (5-10 minutes)

### Leave System Migrations (062-065)

**Step 1: Migration 062 - Outstanding Leave Tracking**
```
1. Go to: https://app.supabase.com/project/YOUR-PROJECT/sql/new
2. Copy entire content from: /scripts/062_outstanding_leave_tracking.sql
3. Paste into SQL editor
4. Click "Run"
5. Wait for: "Success" message
6. ✅ Verify: See no errors in output
```

- [ ] Migration 062 executed successfully
  - Error? → Check migration syntax
  - Success? → Move to next

**Step 2: Migration 063 - Enhance Leave Policy**
```
1. Create new query
2. Copy: /scripts/063_enhance_leave_policy_catalog.sql
3. Click "Run"
4. Wait for success
```

- [ ] Migration 063 executed successfully

**Step 3: Migration 064 - Extend Leave Requests**
```
1. Create new query
2. Copy: /scripts/064_extend_leave_plan_requests.sql
3. Click "Run"
4. Wait for success
```

- [ ] Migration 064 executed successfully

**Step 4: Migration 065 - Migrate Leave Data**
```
1. Create new query
2. Copy: /scripts/065_migrate_leave_data.sql
3. Click "Run"
4. Wait for success
```

- [ ] Migration 065 executed successfully

### Verify Leave Migrations
```sql
-- Run this in SQL editor to confirm
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'outstanding_leave_balances';

-- Should return 1 row
```

- [ ] `outstanding_leave_balances` table exists
- [ ] No SQL errors in output

---

## Stage 2: Regional Loan Office Setup (5 minutes)

**Step 1: Run Migration 066**
```
1. Create new query
2. Copy: /scripts/066_create_regional_loan_office_role.sql
3. Click "Run"
4. Wait for success
```

- [ ] Migration 066 executed successfully

### Verify Regional Loan Office Setup
```sql
-- Verify new table exists
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'regional_loan_office_locations';

-- Should return 1 row
```

- [ ] `regional_loan_office_locations` table exists

---

## Stage 3: Code Deployment (2-5 minutes)

**Option A: Using Vercel** (Recommended)
```
1. Push code to GitHub main/deploy branch
2. Vercel auto-deploys
3. Check deployment status: https://vercel.com/dashboard
4. Wait for: "✅ Ready" status
5. Click "Visit" to view live site
```

- [ ] Code pushed to GitHub
- [ ] Vercel deployment triggered
- [ ] Deployment successful (✅ Ready)
- [ ] Live preview loads without errors

**Option B: Manual Deploy**
```
1. Run: npm run build
2. Check for build errors
3. If no errors: npm run deploy
4. Verify deployment succeeded
```

- [ ] Build successful
- [ ] Deploy successful

---

## Stage 4: Test Leave System (10 minutes)

### Basic Functionality
1. **Login as Staff User**
   - [ ] Can access dashboard
   - [ ] No console errors (F12 → Console tab)

2. **Test Leave Request**
   - [ ] Navigate to Leave Management → Leave Center
   - [ ] Click "Request Leave"
   - [ ] Dialog opens without JSON errors
   - [ ] Can select leave type

3. **Test Auto-Calculation** (if you ran migrations)
   - [ ] Select start date
   - [ ] Wait 2 seconds
   - [ ] See "Calculating..." indicator
   - [ ] End date auto-populates
   - [ ] Calculation summary shows
   - [ ] Shows: business days, weekends, holidays breakdown

4. **Manual Date Entry** (if migrations not run)
   - [ ] Can select start date
   - [ ] Can select end date manually
   - [ ] Days calculated correctly
   - [ ] Form submits successfully

5. **Leave Balance Display**
   - [ ] Can see outstanding leave widget
   - [ ] Shows current year and carryover
   - [ ] Progress bar visible
   - [ ] Color coded (green/amber/red)

6. **Navigation**
   - [ ] Tab renamed to "Leave Center" ✅
   - [ ] Tab renamed to "Planning & Review" ✅

### Test Results
- [ ] All leave tests passed
- [ ] No console errors
- [ ] Page loads under 3 seconds

---

## Stage 5: Test Regional Loan Office (10 minutes)

### User Setup
1. **Create Test RLO User**
   ```sql
   -- In Supabase, find the user and update:
   UPDATE user_profiles
   SET role = 'regional_loan_office'
   WHERE email = 'test.rlo@example.com';
   
   -- Assign locations
   INSERT INTO regional_loan_office_locations 
     (regional_loan_office_id, location_id, location_name, assigned_by)
   VALUES 
     ('rlo-user-uuid', 'location-uuid', 'Test Location', 'admin-uuid');
   ```
   - [ ] User role updated to `regional_loan_office`
   - [ ] Location assigned

2. **Login as RLO User**
   - [ ] Can access regional office dashboard
   - [ ] No errors on page load

### View Loans
- [ ] Click "Loan Requests" tab
- [ ] See loan summary cards (Total, Pending, Approved, Rejected)
- [ ] See loan data table with columns:
  - Request #
  - Staff
  - Loan Type
  - Amount
  - Status
  - Submitted Date
- [ ] At least 1 record visible (or "No records" message)

### View Leaves
- [ ] Click "Leave Requests" tab
- [ ] See leave summary cards
- [ ] See leave data table with columns:
  - Staff
  - Leave Type
  - Start Date
  - End Date
  - Days
  - Status

### Test Refresh
- [ ] Click "Refresh" button on Loans tab
- [ ] Data reloads
- [ ] No errors
- [ ] Loading state shows

### Test Export - CSV
- [ ] Click "Export CSV" on Loans tab
- [ ] File downloads: `regional_loans_report.csv`
- [ ] Open file and verify:
  - [ ] Header row with "Generated by" and date
  - [ ] Column headers correct
  - [ ] Data rows populated
  - [ ] All requested columns present

### Test Export - JSON
- [ ] Click "Export JSON" on Loans tab
- [ ] File downloads: `regional_loans_report.json`
- [ ] Open file and verify:
  - [ ] Valid JSON format
  - [ ] `success: true`
  - [ ] `data` array populated
  - [ ] `summary` with statistics
  - [ ] `count` shows records

### Test Permissions (Security)
- [ ] RLO can view loans/leaves ✅
- [ ] RLO cannot see approve buttons ❌
- [ ] RLO cannot see reject buttons ❌
- [ ] RLO cannot modify any requests ❌
- [ ] Only their assigned location data visible ✅

### Test Results
- [ ] All regional office tests passed
- [ ] CSV export valid
- [ ] JSON export valid
- [ ] Permissions working correctly

---

## Stage 6: Cross-Browser Testing

Test on multiple browsers (optional but recommended):

- [ ] **Chrome**
  - Leave system works
  - Regional office works
  - Exports work

- [ ] **Firefox**
  - Leave system works
  - Regional office works
  - Exports work

- [ ] **Safari** (if available)
  - Leave system works
  - Regional office works
  - Exports work

- [ ] **Mobile Browser**
  - Leave dialog responsive
  - Tables readable on small screen
  - Export buttons work

---

## Stage 7: Error Scenarios

### Simulate Errors (to verify recovery)

1. **Network Error**
   - [ ] Unplug internet/disable network
   - [ ] Try to refresh data
   - [ ] See error message (not crash)
   - [ ] Reconnect and refresh works

2. **Invalid Data**
   - [ ] Try to export with 0 records
   - [ ] System shows "No records" or empty export
   - [ ] No crash

3. **Timeout**
   - [ ] Database slow (if testable)
   - [ ] System shows loading state
   - [ ] Eventually times out gracefully

---

## Stage 8: Performance Testing

- [ ] Leave Management page loads in < 2 seconds
- [ ] Regional Office dashboard loads in < 2 seconds
- [ ] Export CSV with 100+ records in < 5 seconds
- [ ] No memory leaks (check DevTools)
- [ ] No N+1 queries in database

---

## Final Verification

Before going live, verify:

### Database
```sql
-- Check all new tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_name IN (
  'outstanding_leave_balances',
  'regional_loan_office_locations'
);

-- Should return 2 rows

-- Check regional_loan_office role can be assigned
UPDATE user_profiles 
SET role = 'regional_loan_office' 
WHERE email = 'test@example.com'
RETURNING id, role;
```

- [ ] Both tables exist
- [ ] Role assignment works

### Code
- [ ] All files deployed to production
- [ ] No 404 errors on API endpoints
- [ ] Console shows no JavaScript errors
- [ ] Network tab shows 200 responses

### API Endpoints
```bash
# Test calculate endpoint
curl -X POST \
  https://yourapp.com/api/leave/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2026-01-20",
    "leaveType": "annual",
    "leaveYearPeriod": "2026"
  }'

# Should return: 200 with calculation data
```

- [ ] `/api/leave/calculate` returns 200
- [ ] `/api/loan/regional-office` returns 200
- [ ] `/api/leave/regional-office` returns 200
- [ ] `/api/regional-office/export` returns 200

---

## Deployment Complete Checklist

- [ ] All migrations (062-066) executed successfully
- [ ] Code deployed to production
- [ ] Leave management page works without errors
- [ ] Auto-calculation works (if migrations run)
- [ ] Regional Loan Office users can view data
- [ ] Export functionality works (CSV & JSON)
- [ ] No permission leaks (RLO can't approve)
- [ ] Performance acceptable
- [ ] Cross-browser tested
- [ ] Error handling verified

---

## Post-Deployment

### Monitor for Issues
- [ ] Check error logs daily for 1 week
- [ ] Monitor performance metrics
- [ ] Gather user feedback
- [ ] Watch for database query performance

### Communicate with Users
- [ ] Send email about new features
- [ ] Point to documentation
- [ ] Provide support contact info

### Documentation
- [ ] Update user guide (if any)
- [ ] Add FAQs from questions
- [ ] Document any custom changes

### Follow-Up Tasks
- [ ] [ ] Schedule review meeting
- [ ] [ ] Plan next enhancements
- [ ] [ ] Archive old documentation

---

## Rollback Plan

If critical issue found:

### Quick Rollback
1. Revert code to previous version in Vercel
2. Database changes stay (they're additive, non-breaking)
3. Users experience normal function

### Full Rollback (if needed)
1. Stop users from using new features
2. Drop new tables:
   ```sql
   DROP TABLE IF EXISTS outstanding_leave_balances CASCADE;
   DROP TABLE IF EXISTS regional_loan_office_locations CASCADE;
   ```
3. Redeploy previous code version
4. Notify users

---

## Help & Support

### If migrations fail:
→ Check `/RUN_MIGRATIONS.md` → Troubleshooting section

### If page doesn't load:
→ Clear browser cache (Ctrl+Shift+Del)
→ Check console (F12)
→ Check network tab for 404s

### If JSON errors appear:
→ Make sure migrations 062-065 were run
→ Check `/RUN_MIGRATIONS.md` → Verify section

### If Regional Office doesn't show data:
→ Verify user role is `regional_loan_office`
→ Verify locations were assigned
→ Check browser console for API errors

---

## Documentation Reference

All documentation is in project root:
- **RUN_MIGRATIONS.md** - How to run migrations
- **FIXES_AND_NEW_FEATURES_SUMMARY.md** - What changed
- **REGIONAL_LOAN_OFFICE_FEATURE.md** - RLO detailed docs
- **LEAVE_SYSTEM_IMPLEMENTATION.md** - Leave system docs
- **SYSTEM_ARCHITECTURE.md** - Architecture overview
- **DEPLOYMENT_QUICK_START.md** - Quick reference

---

**Estimated Total Time**: 45-60 minutes  
**Risk Level**: Low (all backward compatible)  
**Go/No-Go Decision**: Ready when all checkboxes above are checked ✅
