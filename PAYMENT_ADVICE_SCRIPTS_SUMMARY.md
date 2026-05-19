# Payment Advice Feature - Complete Scripts List & Execution Guide

## Executive Summary
The Payment Advice feature generates **THREE separate memos per month** (one for each staff category):
- **Manager Category Memo** - Lists all managers on annual leave for the selected month
- **Senior Staff Category Memo** - Lists all senior staff on annual leave for the selected month
- **Junior Staff Category Memo** - Lists all junior staff on annual leave for the selected month

---

## All Scripts & Execution Order

### ✅ PHASE 1: DATABASE SETUP (Run First)

#### Script 1: Database Schema Verification & Index Creation
**File:** `scripts/067_payment_advice_database_setup.sql`
**Purpose:** Prepares database for Payment Advice feature
**Status:** ✓ Ready to run
**Execution:**
```bash
psql $DATABASE_URL -f scripts/067_payment_advice_database_setup.sql
```

**What it does:**
1. Verifies `leave_payment_memos` table exists with correct structure
2. Verifies `staff_category` column in `leave_plan_requests`
3. Creates database indexes for fast queries:
   - `idx_leave_plan_requests_category_dates` - Speeds up staff detection
   - `idx_leave_payment_memos_staff_category` - Speeds up memo retrieval
4. Creates PostgreSQL view `v_payment_advice_staff` for easy staff queries
5. Inserts 3 payment advice memo templates (if not exists):
   - `payment_advice_manager` - Template for Manager memos
   - `payment_advice_senior` - Template for Senior Staff memos
   - `payment_advice_junior` - Template for Junior Staff memos
6. Shows summary of staff by category

**Output:**
```
staff_category | count
===============|=======
Manager        |   n
Senior         |   n
Junior         |   n
```

**Duration:** ~2-5 seconds

---

#### Script 2: Test Data Creation (Optional - For Testing Only)
**File:** `scripts/068_payment_advice_test_data.sql`
**Purpose:** Creates sample staff and leave records for testing
**Status:** ✓ Ready to run (OPTIONAL)
**Execution:**
```bash
# Only if you need test data - OPTIONAL
psql $DATABASE_URL -f scripts/068_payment_advice_test_data.sql
```

**What it does:**
1. Creates 5 test Manager staff:
   - Employee IDs: MGR001 - MGR005
   - On annual leave: May 1-15, 2026
2. Creates 8 test Senior staff:
   - Employee IDs: SNR001 - SNR008
   - On annual leave: May 5-20, 2026
3. Creates 12 test Junior staff:
   - Employee IDs: JNR001 - JNR012
   - On annual leave: May 10-25, 2026
4. Creates `leave_plan_requests` with approved status for all
5. Creates daily `leave_status` records for tracking
6. Generates summary queries showing all test data

**Output:**
```
Total staff created: 25
- Managers: 5
- Senior: 8
- Junior: 12

All with approved annual leave status for May 2026
```

**Duration:** ~3-8 seconds

---

### ✅ PHASE 2: VERIFICATION & TESTING

#### Script 3: Verify Database Setup
**Command:**
```bash
# Verify indexes created
psql $DATABASE_URL -c "SELECT indexname FROM pg_indexes WHERE tablename IN ('leave_payment_memos', 'leave_plan_requests');"

# Verify view exists
psql $DATABASE_URL -c "SELECT * FROM information_schema.views WHERE table_schema='public' AND table_name='v_payment_advice_staff';"

# Count staff by category
psql $DATABASE_URL -c "SELECT staff_category, COUNT(*) FROM leave_plan_requests WHERE status='approved' GROUP BY staff_category;"
```

**Expected Output:**
```
✓ Indexes: idx_leave_plan_requests_category_dates, idx_leave_payment_memos_staff_category
✓ View: v_payment_advice_staff exists
✓ Staff counts: Manager: n, Senior: n, Junior: n
```

---

### ✅ PHASE 3: APPLICATION DEPLOYMENT

#### Script 4: Start Development Server
**Command:**
```bash
cd /vercel/share/v0-project
pnpm dev
```

**Expected Output:**
```
Ready in 2.5s
▲ Next.js 14.x
- Local: http://localhost:3000
```

---

### ✅ PHASE 4: API ENDPOINT VERIFICATION

#### Script 5: Test API Endpoints
**Command - Detect Staff:**
```bash
curl -X GET 'http://localhost:3000/api/leave/payment-advice/detect-staff?month=2026-05' \
  -H 'Authorization: Bearer YOUR_TOKEN'
```

**Expected Response:**
```json
{
  "manager": [
    {
      "id": "uuid",
      "full_name": "Manager Test1",
      "employee_id": "MGR001",
      "staff_category": "Manager",
      "start_date": "2026-05-01",
      "end_date": "2026-05-15",
      "entitlement_days": 15
    }
  ],
  "senior": [...],
  "junior": [...]
}
```

**Command - Generate Memo:**
```bash
curl -X POST 'http://localhost:3000/api/leave/payment-advice/generate-memo' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -d '{"month": "2026-05", "staff_category": "manager", "staff_list": [...]}'
```

**Expected Response:**
```json
{
  "memo_id": "uuid",
  "subject": "PAYMENT ADVICE - MANAGER ANNUAL LEAVE MAY 2026",
  "total_staff": 5,
  "status": "draft"
}
```

---

## Complete Setup Checklist

### Database Setup
- [ ] Run `scripts/067_payment_advice_database_setup.sql`
- [ ] Verify indexes exist
- [ ] Verify view `v_payment_advice_staff` exists
- [ ] Verify memo templates inserted

### Optional Test Data
- [ ] Run `scripts/068_payment_advice_test_data.sql` (if testing)
- [ ] Verify 5 Manager, 8 Senior, 12 Junior staff created
- [ ] Verify all have approved annual leave status

### Application Setup
- [ ] Start dev server: `pnpm dev`
- [ ] Login as manager user
- [ ] Navigate to: Dashboard > Leave Management
- [ ] Verify "Payment Advice" tab appears

### Feature Testing
- [ ] Select month (May 2026 for test data)
- [ ] Click "Detect Staff" button
- [ ] Verify three categories found: Manager (5), Senior (8), Junior (12)
- [ ] Generate memo for each category
- [ ] Submit memos
- [ ] Export staff lists (Excel/PDF)
- [ ] Verify memos saved to database

---

## Quick Start Command (All-in-One)

```bash
#!/bin/bash
set -e

echo "Step 1: Setting up database..."
psql $DATABASE_URL -f scripts/067_payment_advice_database_setup.sql

echo "Step 2: Creating test data..."
psql $DATABASE_URL -f scripts/068_payment_advice_test_data.sql

echo "Step 3: Starting development server..."
cd /vercel/share/v0-project
pnpm dev

echo ""
echo "✓ Setup complete!"
echo "Access the app at: http://localhost:3000"
echo "Navigate to: Dashboard > Leave Management > Payment Advice tab"
```

---

## Database Changes Summary

### Tables Modified
None - All tables already exist

### Tables Checked/Verified
- `leave_plan_requests` - Contains staff_category field
- `leave_payment_memos` - Stores generated memos
- `user_profiles` - Staff details (employee_id, position, department)
- `leave_status` - Daily leave tracking
- `departments` - Department information

### Indexes Created
1. `idx_leave_plan_requests_category_dates`
   - Columns: `(staff_category, status, preferred_start_date, preferred_end_date)`
   - Improves: Staff detection queries

2. `idx_leave_payment_memos_staff_category`
   - Columns: `(staff_category, created_at DESC)`
   - Improves: Memo retrieval by category

### Views Created
1. `v_payment_advice_staff` - Easy access to staff on annual leave
   - Joins: `leave_plan_requests` + `user_profiles` + `departments`
   - Filters: Approved annual leave only

### Templates Inserted
1. `payment_advice_manager` - For Manager category memos
2. `payment_advice_senior` - For Senior Staff category memos
3. `payment_advice_junior` - For Junior Staff category memos

---

## Files Created/Updated

### New Setup Scripts
- `scripts/067_payment_advice_database_setup.sql` (114 lines)
- `scripts/068_payment_advice_test_data.sql` (262 lines)
- `scripts/067_payment_advice_setup.sh` (54 lines)
- `PAYMENT_ADVICE_SETUP.md` (322 lines)
- `PAYMENT_ADVICE_SCRIPTS_SUMMARY.md` (this file)

### Existing Files (Already Created)
- `lib/payment-advice-service.ts` - Service layer
- `components/leave/payment-advice-client.tsx` - UI component
- `app/api/leave/payment-advice/detect-staff/route.ts` - Staff detection API
- `app/api/leave/payment-advice/generate-memo/route.ts` - Memo generation API
- `app/api/leave/payment-advice/submit-memo/route.ts` - Memo submission API
- `app/api/leave/payment-advice/export/route.ts` - Export API

---

## Environment Variables

Verify these are set:
```bash
echo $DATABASE_URL           # Supabase PostgreSQL connection
echo $SUPABASE_URL           # Supabase project URL
echo $SUPABASE_SERVICE_ROLE_KEY  # Supabase service key
```

---

## Troubleshooting

### Error: "staff_category field not found"
```sql
ALTER TABLE leave_plan_requests 
ADD COLUMN IF NOT EXISTS staff_category VARCHAR(50);
```

### Error: "No staff detected for month"
- Verify leave dates overlap the selected month
- Check: `SELECT * FROM leave_plan_requests WHERE status='approved' AND leave_type_key='annual';`

### Error: "Permission denied" on indexes
- Use a user with admin privileges
- Or manually create indexes with appropriate permissions

### Error: API returns 401
- Login with a manager or HR Leave Office user
- Check authentication token

---

## Expected Database State After Setup

### Query: Check all components
```sql
-- 1. Indexes
SELECT COUNT(*) FROM pg_indexes 
WHERE tablename IN ('leave_payment_memos', 'leave_plan_requests');
-- Expected: 2

-- 2. View
SELECT * FROM information_schema.views 
WHERE table_name = 'v_payment_advice_staff';
-- Expected: 1 row

-- 3. Templates
SELECT COUNT(*) FROM leave_memo_templates 
WHERE template_key LIKE 'payment_advice%';
-- Expected: 3

-- 4. Staff by category (after test data)
SELECT staff_category, COUNT(*) FROM leave_plan_requests 
WHERE status='approved' 
GROUP BY staff_category;
-- Expected: Manager: 5, Senior: 8, Junior: 12
```

---

## Feature Walkthrough

### User Flow: Generate Payment Advice Memo

1. **Login** as Manager/HR Leave Office user
2. **Navigate** to: Dashboard → Leave Management
3. **Click** "Payment Advice" tab
4. **Select** month (e.g., May 2026)
5. **Click** "Detect Staff on Annual Leave"
   - System queries: All staff approved for annual leave in that month
   - Results: Staff grouped by category (Manager/Senior/Junior)
6. **Review** staff list for each category
7. **Edit** memo content if needed
8. **Click** "Generate Memo" for each category
   - Creates 3 separate memos (one per category)
9. **Submit** memos
   - Saves to `leave_payment_memos` table
   - Sends to Finance/Deputy Director
10. **Export** staff lists (Excel/PDF)
    - Downloads file with all staff and payment details

---

## Support & Contact

For issues:
1. Check troubleshooting section above
2. Verify all scripts ran successfully
3. Check database logs: `psql $DATABASE_URL -f check_errors.sql`
4. Review console output for API errors

---

## Version Info
- **Feature Version:** 1.0
- **Created:** 2026-05-18
- **Last Updated:** 2026-05-18
- **Status:** Production Ready
