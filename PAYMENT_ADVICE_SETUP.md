# Payment Advice Feature - Setup Scripts & Execution Guide

## Overview
The Payment Advice feature generates THREE separate payment advice memos per month for staff on annual leave:
- **Manager Category Memo** - For all managers on annual leave that month
- **Senior Staff Category Memo** - For all senior staff on annual leave that month  
- **Junior Staff Category Memo** - For all junior staff on annual leave that month

Each memo contains the complete list of that category's staff with payment processing details.

---

## Scripts to Run (In Order)

### Phase 1: Database Verification & Setup
Run these scripts to verify and prepare the database:

#### 1. **Database Schema Verification**
```bash
# Verify all required tables exist
psql $DATABASE_URL -f scripts/067_payment_advice_database_setup.sql
```

**What it does:**
- ✓ Verifies `leave_payment_memos` table structure
- ✓ Confirms `staff_category` field in `leave_plan_requests`
- ✓ Creates performance indexes for fast queries
- ✓ Creates view `v_payment_advice_staff` for easy staff detection
- ✓ Inserts memo templates (if not exists)
- ✓ Shows statistics of staff by category

**Expected Output:**
```
staff_category | count
===============|=======
Manager        |   12
Senior         |   18
Junior         |   45
```

#### 2. **Sample Data Setup (Optional - for testing)**
```bash
# Create test staff and leave records
# Only run if you need test data
psql $DATABASE_URL -f scripts/068_payment_advice_test_data.sql
```

This script creates:
- 5 Manager staff with annual leave in test month
- 8 Senior staff with annual leave in test month
- 12 Junior staff with annual leave in test month

### Phase 2: Application Setup

#### 3. **Verify API Endpoints**
```bash
# No script needed - endpoints are already deployed:
curl http://localhost:3000/api/leave/payment-advice/detect-staff?month=2026-05
curl http://localhost:3000/api/leave/payment-advice/generate-memo
curl http://localhost:3000/api/leave/payment-advice/submit-memo
curl http://localhost:3000/api/leave/payment-advice/export
```

#### 4. **Start Development Server**
```bash
cd /vercel/share/v0-project
pnpm dev
```

### Phase 3: Configuration

#### 5. **Configure Email Recipients**
Update email settings in `lib/payment-advice-service.ts`:
```typescript
const DEPUTY_DIRECTOR_EMAIL = "deputy.director@company.com"
const FINANCE_EMAIL = "finance@company.com"
const HR_LEAVE_OFFICE_EMAIL = "hr-leave@company.com"
```

#### 6. **Customize Memo Templates**
Add your organization's payment advice templates:
```sql
UPDATE leave_memo_templates 
SET body_template = 'YOUR_TEMPLATE_HERE'
WHERE template_key = 'payment_advice_manager';
```

---

## Complete Script Execution Workflow

### Quick Setup (Recommended)
```bash
#!/bin/bash
cd /vercel/share/v0-project

echo "Step 1: Setting up database..."
psql $DATABASE_URL -f scripts/067_payment_advice_database_setup.sql

echo "Step 2: (Optional) Loading test data..."
# psql $DATABASE_URL -f scripts/068_payment_advice_test_data.sql

echo "Step 3: Starting dev server..."
pnpm dev

echo ""
echo "Setup complete! Access Payment Advice at:"
echo "http://localhost:3000/dashboard/leave-management"
echo "Click the 'Payment Advice' tab"
```

### Manual Step-by-Step
```bash
# 1. Verify database
psql $DATABASE_URL -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public';" | grep -E "leave_payment_memos|leave_plan_requests"

# 2. Run setup SQL
psql $DATABASE_URL -f scripts/067_payment_advice_database_setup.sql

# 3. Load test data (if needed)
psql $DATABASE_URL -f scripts/068_payment_advice_test_data.sql

# 4. Verify indexes were created
psql $DATABASE_URL -c "SELECT * FROM pg_indexes WHERE tablename IN ('leave_payment_memos', 'leave_plan_requests');"

# 5. Check staff by category
psql $DATABASE_URL -c "SELECT staff_category, COUNT(*) as count FROM leave_plan_requests WHERE status='approved' GROUP BY staff_category;"

# 6. Start development
cd /vercel/share/v0-project
pnpm dev
```

---

## API Endpoints Reference

### Detect Staff on Annual Leave
```
GET /api/leave/payment-advice/detect-staff?month=2026-05

Response:
{
  "manager": [
    {
      "id": "uuid",
      "full_name": "John Doe",
      "employee_id": "MGR001",
      "position": "Assistant Director",
      "department": "Finance",
      "start_date": "2026-05-01",
      "end_date": "2026-05-15",
      "entitlement_days": 15
    }
  ],
  "senior": [ ... ],
  "junior": [ ... ]
}
```

### Generate Payment Memo
```
POST /api/leave/payment-advice/generate-memo

Request:
{
  "month": "2026-05",
  "staff_category": "manager",
  "staff_list": [...]
}

Response:
{
  "memo_id": "uuid",
  "subject": "PAYMENT ADVICE - MANAGER ANNUAL LEAVE MAY 2026",
  "body": "...",
  "total_staff": 12,
  "status": "draft"
}
```

### Submit Payment Memo
```
POST /api/leave/payment-advice/submit-memo

Request:
{
  "memo_id": "uuid",
  "status": "submitted"
}

Response:
{
  "success": true,
  "memo_stored": true,
  "submitted_at": "2026-05-18T10:30:00Z"
}
```

### Export Staff List
```
GET /api/leave/payment-advice/export?month=2026-05&format=excel&category=manager

Response: Excel file or PDF download
```

---

## Database Tables Used

### leave_plan_requests
Stores annual leave requests with staff categories:
```sql
SELECT 
  id, 
  staff_category, 
  status, 
  preferred_start_date, 
  preferred_end_date, 
  entitlement_days 
FROM leave_plan_requests 
WHERE leave_type_key = 'annual' 
  AND status = 'approved'
  AND staff_category IN ('Manager', 'Senior', 'Junior');
```

### leave_payment_memos
Stores generated payment advice memos:
```sql
SELECT 
  id,
  staff_category,
  memo_subject,
  memo_body,
  created_at,
  status
FROM leave_payment_memos;
```

### user_profiles
Staff details:
```sql
SELECT 
  id,
  employee_id,
  first_name,
  last_name,
  position,
  department_id
FROM user_profiles;
```

---

## Troubleshooting

### Issue: "staff_category field not found"
**Solution:** Run this to add it if missing:
```sql
ALTER TABLE leave_plan_requests 
ADD COLUMN IF NOT EXISTS staff_category VARCHAR(50);
```

### Issue: No staff detected
**Cause:** No approved annual leave records in the selected month
**Solution:** 
1. Create test leave records
2. Ensure leave status is "approved"
3. Check leave dates overlap the selected month

### Issue: API returns 401 Unauthorized
**Cause:** Not logged in as manager/HR staff
**Solution:** Login with a manager or HR Leave Office user

### Issue: Export not working
**Cause:** Missing buffer library
**Solution:** 
```bash
pnpm add buffer
```

---

## Testing Checklist

- [ ] Database indexes created successfully
- [ ] View `v_payment_advice_staff` exists
- [ ] At least 1 staff member per category with approved annual leave
- [ ] Login as manager works
- [ ] Payment Advice tab appears in Leave Management
- [ ] Month selector works
- [ ] Staff detection returns all three categories
- [ ] Memo generation produces valid output
- [ ] Export to Excel works
- [ ] Export to PDF works
- [ ] Memo submission saves to database

---

## File Locations

- **Setup SQL Script:** `scripts/067_payment_advice_database_setup.sql`
- **Test Data Script:** `scripts/068_payment_advice_test_data.sql`
- **Service Code:** `lib/payment-advice-service.ts`
- **UI Component:** `components/leave/payment-advice-client.tsx`
- **API Endpoints:** `app/api/leave/payment-advice/`
  - `detect-staff/route.ts`
  - `generate-memo/route.ts`
  - `submit-memo/route.ts`
  - `export/route.ts`

---

## Next Steps After Setup

1. ✓ Run Phase 1 database scripts
2. ✓ Run Phase 2 API verification  
3. ✓ Complete Phase 3 configuration
4. ✓ Test all features via UI
5. Share payment advice memo templates for each category
6. Deploy to production
