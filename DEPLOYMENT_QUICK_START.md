# Quick Start - Leave Management System Deployment

## Pre-Deployment Checklist

- [ ] Read `LEAVE_SYSTEM_IMPLEMENTATION.md` for full context
- [ ] Have database credentials ready
- [ ] Git branch: `leave-portal-redesign` is up to date
- [ ] Team notified of changes
- [ ] Backup database created

## Step 1: Deploy Database Migrations

Run these in **order** (wait for each to complete):

```bash
# 1. Create outstanding leave balances table
psql -h your-db-host -U your-db-user -d your-db-name < scripts/062_outstanding_leave_tracking.sql

# 2. Enhance leave policy catalog
psql -h your-db-host -U your-db-user -d your-db-name < scripts/063_enhance_leave_policy_catalog.sql

# 3. Extend leave plan requests
psql -h your-db-host -U your-db-user -d your-db-name < scripts/064_extend_leave_plan_requests.sql

# 4. Migrate historical data
psql -h your-db-host -U your-db-user -d your-db-name < scripts/065_migrate_leave_data.sql
```

**✓ Verification:**
```sql
-- Check if migrations worked
SELECT COUNT(*) FROM outstanding_leave_balances; -- Should return 0 initially
SELECT column_name FROM information_schema.columns 
WHERE table_name='leave_plan_requests' AND column_name='auto_calculated_end_date';
```

## Step 2: Deploy Code

Push to production:
```bash
git add -A
git commit -m "feat: Leave management system redesign with auto-calculation"
git push origin leave-portal-redesign
# Create PR and merge to main
```

**Updated Files:**
- `lib/leave-calculation-service.ts` ← NEW
- `app/api/leave/calculate/route.ts` ← NEW
- `components/leave/outstanding-leave-widget.tsx` ← NEW
- `components/leave/leave-request-dialog.tsx` ← UPDATED
- `lib/leave-policy.ts` ← UPDATED
- `app/dashboard/leave-management/leave-management-module-client.tsx` ← UPDATED

## Step 3: Test in Staging

### Test 1: Basic Leave Request
1. Go to Leave Center
2. Click "New Leave Request"
3. Select Annual Leave
4. Pick start date (e.g., Jan 15, 2026)
5. **Verify:** End date auto-calculates (should be around Jan 21, 2026)
6. **Verify:** Calculation summary shows breakdown
7. Submit request

### Test 2: Outstanding Balance Widget
1. Go to Balance & Calendar tab
2. **Verify:** Widget displays with color-coded progress bar
3. **Verify:** Carryover shows if available
4. Check that remaining days are correct

### Test 3: Weekend/Holiday Exclusion
1. Select a leave that spans a weekend (e.g., Fri-Mon)
2. **Verify:** Calculation excludes weekend (shows 2 days, not 4)
3. Test during a public holiday period
4. **Verify:** Holiday is excluded from count

### Test 4: Error Handling
1. Try invalid dates (end before start)
2. **Verify:** Error message appears
3. Try past dates
4. **Verify:** Error message appears

## Step 4: Monitor Production

### Watch for Errors
```bash
# Check logs (adjust for your logging platform)
tail -f logs/production.log | grep "leave-calculation"
tail -f logs/production.log | grep "[v0]"
```

### Key Metrics to Track
- Leave request submission success rate
- API endpoint response times
- Database query performance
- User feedback on new UI

### Quick Health Check Queries
```sql
-- Check calculation data is being stored
SELECT COUNT(*) FROM leave_plan_requests 
WHERE auto_calculated_end_date IS NOT NULL;

-- Check no errors in migrations
SELECT COUNT(*) FROM outstanding_leave_balances;

-- Check balance calculation
SELECT user_id, SUM(entitlement_days) as total_entitlement
FROM outstanding_leave_balances
GROUP BY user_id LIMIT 5;
```

## Rollback Instructions (If Needed)

### Quick Rollback (< 5 minutes)
```bash
# Revert code to previous version
git revert HEAD
git push origin main

# Application will restart with old code
# New tables remain safe - no data lost
```

### Database Rollback
If critical issues with migrations:
```bash
# Drop new table (if needed)
DROP TABLE IF EXISTS outstanding_leave_balances;

-- Revert column additions
ALTER TABLE leave_policy_catalog 
DROP COLUMN IF EXISTS staff_category,
DROP COLUMN IF EXISTS calculation_method,
DROP COLUMN IF EXISTS allow_carryover,
DROP COLUMN IF EXISTS max_carryover_days;

-- Old leave requests table untouched - system continues with old logic
```

## Troubleshooting

### Issue: End date not calculating
- Check if `POST /api/leave/calculate` endpoint is working
- Verify `ghana_public_holidays` table has data
- Check browser console for errors

### Issue: Balance widget showing error
- Verify user has `user_id` in database
- Check if `outstanding_leave_balances` was populated
- Confirm RLS policies allow access

### Issue: Calculation returns 0 days
- Verify weekends being excluded correctly
- Check if all selected dates are weekends/holidays
- Review calculation summary for breakdown

### Issue: Performance slow
- Run: `ANALYZE outstanding_leave_balances;`
- Check indexes are created: `\d outstanding_leave_balances`
- Verify no missing public holidays in database

## Support Contacts

- **Database Issues**: DB Admin
- **API Issues**: Backend Team
- **UI Issues**: Frontend Team
- **General Questions**: Review `LEAVE_SYSTEM_IMPLEMENTATION.md`

## Post-Deployment (Day 1)

- [ ] Monitor error logs
- [ ] Spot-check 5-10 leave requests
- [ ] Confirm balance widget displays for random users
- [ ] Get team feedback
- [ ] Document any issues

## Success Criteria

✅ Leave requests auto-calculate end dates  
✅ No errors in production logs  
✅ Balance widget displays correctly  
✅ Existing leave requests still work  
✅ HR approval workflow unchanged  
✅ Users like the simpler UI  

---

**Questions?** Check `LEAVE_SYSTEM_IMPLEMENTATION.md` or contact the development team.
