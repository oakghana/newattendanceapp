# Payment Advice Feature - Quick Reference Card

## 🚀 Quick Start (Copy & Paste)

```bash
# Step 1: Database setup
psql $DATABASE_URL -f scripts/067_payment_advice_database_setup.sql

# Step 2: Test data (optional)
psql $DATABASE_URL -f scripts/068_payment_advice_test_data.sql

# Step 3: Start app
cd /vercel/share/v0-project && pnpm dev

# Then: Open http://localhost:3000 → Dashboard → Leave Management → Payment Advice tab
```

---

## 📋 Scripts Overview

| Script | Purpose | Run? |
|--------|---------|------|
| `067_payment_advice_database_setup.sql` | Creates indexes & views | ✓ **MUST** |
| `068_payment_advice_test_data.sql` | Test staff & leave | ○ Optional |
| `067_payment_advice_setup.sh` | Orchestrates setup | ○ Reference |

---

## 📊 What Gets Created

### Database
- **2 Indexes** for fast queries
- **1 View** `v_payment_advice_staff`
- **3 Memo Templates** (Manager/Senior/Junior)

### Test Data (Optional)
- **5 Manager** staff on leave May 1-15
- **8 Senior** staff on leave May 5-20
- **12 Junior** staff on leave May 10-25

### Application
- **Payment Advice Tab** in Leave Management
- **4 API Endpoints** for CRUD operations
- **Export Feature** (Excel/PDF)

---

## 🔄 Three-Memo Per Month Generation

**Example: May 2026**

```
Input: Select month "May 2026"
        ↓
Detect all staff on annual leave in May
        ↓
Split into 3 categories:
├─ Manager: 5 staff
├─ Senior: 8 staff
└─ Junior: 12 staff
        ↓
Generate 3 separate memos
├─ Memo 1: PAYMENT ADVICE - MANAGER (5 staff)
├─ Memo 2: PAYMENT ADVICE - SENIOR (8 staff)
└─ Memo 3: PAYMENT ADVICE - JUNIOR (12 staff)
        ↓
Output: 3 PDF/Excel files ready for Finance
```

---

## ✅ Verification Checklist

After running scripts:
```bash
# Check indexes
psql $DATABASE_URL -c "SELECT indexname FROM pg_indexes WHERE tablename IN ('leave_payment_memos', 'leave_plan_requests');"

# Check view
psql $DATABASE_URL -c "SELECT to_regclass('v_payment_advice_staff');"

# Check templates
psql $DATABASE_URL -c "SELECT COUNT(*) FROM leave_memo_templates WHERE template_key LIKE 'payment_advice%';"

# Check staff by category
psql $DATABASE_URL -c "SELECT staff_category, COUNT(*) FROM leave_plan_requests WHERE status='approved' GROUP BY staff_category;"
```

---

## 🐛 Common Issues & Fixes

| Issue | Fix |
|-------|-----|
| "staff_category not found" | `ALTER TABLE leave_plan_requests ADD COLUMN staff_category VARCHAR(50);` |
| "No staff detected" | Verify leave overlaps selected month |
| "Permission denied" | Use admin/superuser account |
| "API 401 error" | Login as manager/HR staff |
| "Export not working" | Verify browser download settings |

---

## 📱 API Endpoints

```bash
# Detect staff
GET /api/leave/payment-advice/detect-staff?month=2026-05

# Generate memo
POST /api/leave/payment-advice/generate-memo

# Submit memo
POST /api/leave/payment-advice/submit-memo

# Export
GET /api/leave/payment-advice/export?month=2026-05&format=excel&category=manager
```

---

## 📁 File Locations

```
📦 Project Root
├── scripts/
│   ├── 067_payment_advice_database_setup.sql  ← Run first
│   ├── 068_payment_advice_test_data.sql       ← Run second (optional)
│   └── 067_payment_advice_setup.sh            ← Reference
├── lib/
│   └── payment-advice-service.ts
├── components/leave/
│   └── payment-advice-client.tsx
├── app/api/leave/payment-advice/
│   ├── detect-staff/route.ts
│   ├── generate-memo/route.ts
│   ├── submit-memo/route.ts
│   └── export/route.ts
├── PAYMENT_ADVICE_SETUP.md                    ← Full guide
├── PAYMENT_ADVICE_SCRIPTS_SUMMARY.md          ← Detailed reference
└── PAYMENT_ADVICE_SCRIPTS_SUMMARY.md          ← This file
```

---

## 🎯 Feature Capabilities

✓ Detects all staff on approved annual leave for selected month
✓ Groups staff into 3 categories (Manager/Senior/Junior)
✓ Generates 3 separate payment advice memos per month
✓ Editable memo content before submission
✓ Export staff list as Excel or PDF
✓ Stores memos in database
✓ Sends notifications to Finance/Deputy Director
✓ Full audit trail of all operations

---

## 📞 Support

**For detailed info:** See `PAYMENT_ADVICE_SCRIPTS_SUMMARY.md`
**For setup guide:** See `PAYMENT_ADVICE_SETUP.md`
**For code:** See `lib/payment-advice-service.ts`

---

## 🔑 Key Facts

- **3 Memos Generated:** One per staff category per month
- **Database Ready:** All tables already exist
- **Test Data:** 25 sample staff with approved leave
- **APIs:** 4 endpoints for full CRUD
- **Exports:** Excel and PDF formats
- **Status:** Production Ready
