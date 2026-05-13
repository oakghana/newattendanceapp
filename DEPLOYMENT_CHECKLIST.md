# HR Leave Office Role - Deployment Checklist

## Pre-Deployment

### Code Review
- [ ] Review all code changes in commits
- [ ] Verify no sensitive data in migrations
- [ ] Check all database permissions are appropriate
- [ ] Ensure role naming is consistent

### Testing
- [ ] Build passes locally: `pnpm build`
- [ ] Dev server runs without errors: `npm run dev`
- [ ] No TypeScript errors
- [ ] No console errors in dev tools

### Documentation
- [ ] All documentation files created
- [ ] Setup guide is clear and complete
- [ ] Troubleshooting guide covers common issues
- [ ] Database migration is documented

## Deployment Steps

### Step 1: Staging Deployment
```bash
# 1. Push to staging branch
git push origin staging

# 2. Verify staging deployment completes
# Check: https://staging.yourapp.com

# 3. Run database migration on staging
# Via Supabase: Execute supabase/migrations/add_hr_leave_office_role_to_roles_table.sql

# 4. Test on staging
# - Create test user with HR Leave Office role
# - Verify sidebar navigation
# - Test leave management access
# - Verify tabs are hidden correctly
```

### Step 2: Create Test User

In staging Staff Management:
```
Name: Test HR Leave Office
Email: test-hrlo@company.com
Role: HR Leave Office
Department: HR
Status: Active
```

### Step 3: Staging Testing

- [ ] User can login
- [ ] Sidebar menu is visible
- [ ] All 6 menu items appear
- [ ] Leave Administration is clickable
- [ ] Leave Management tab is visible
- [ ] Leave Planning tab is visible
- [ ] Leave Analytics tab is visible
- [ ] Balance & Calendar tab is visible
- [ ] Holiday Management tab is HIDDEN
- [ ] Leave Policy tab is HIDDEN
- [ ] No authorization errors in console
- [ ] User can process leave requests
- [ ] User can view analytics

### Step 4: Production Deployment

```bash
# 1. Merge to main branch
git checkout main
git merge v0/ohemengappiah-2060-892a3892
git push origin main

# 2. Verify production deployment
# Check: https://yourapp.com

# 3. Run database migration on production
# Via Supabase Production: Execute supabase/migrations/add_hr_leave_office_role_to_roles_table.sql

# 4. Verify database migration
SELECT id, name, display_name, is_active FROM roles WHERE name = 'hr_leave_office';
# Should return 1 row
```

## Post-Deployment

### Verification
- [ ] Database migration executed successfully
- [ ] Role appears in roles table
- [ ] User can be assigned to HR Leave Office role
- [ ] Test user login works
- [ ] Sidebar navigation is correct
- [ ] Leave Management tabs are correct
- [ ] No errors in production logs

### User Onboarding
- [ ] Assign production users to HR Leave Office role
- [ ] Send users the setup documentation
- [ ] Provide support contact information
- [ ] Monitor for issues in first week

### Monitoring
- [ ] Check error logs for authorization issues
- [ ] Monitor user feedback
- [ ] Track usage patterns
- [ ] Verify no performance degradation

## Rollback Plan

If issues occur, rollback with:

```bash
# 1. Revert database changes
DELETE FROM roles WHERE name = 'hr_leave_office';

# 2. Revert code changes
git revert <commit-hash>
git push origin main

# 3. Redeploy
# Wait for deployment to complete
```

## Documentation for Users

After deployment, share these files:
- HR_LEAVE_OFFICE_ROLE_GUIDE.md - Role overview
- HR_LEAVE_OFFICE_COMPLETE_SETUP.md - Setup guide
- HR_LEAVE_OFFICE_TROUBLESHOOTING.md - Debugging

## Sign-Off

- [ ] Developer: Code changes reviewed and tested
- [ ] QA: All tests passed
- [ ] DevOps: Deployment verified
- [ ] Product: Feature approved for production

## Deployment Date

**Planned Date**: [To be determined]
**Actual Date**: _______________
**Deployed By**: _______________
**Status**: [ ] Successful [ ] Rolled Back

## Notes

```
[Add any deployment notes here]
```

---

## Quick Reference

### Files Changed
- components/dashboard/sidebar.tsx
- proxy.ts (already updated in previous commits)
- app/dashboard/leave-management/leave-management-module-client.tsx (already updated)

### New Files
- supabase/migrations/add_hr_leave_office_role_to_roles_table.sql

### Database Operations
- INSERT: New role in roles table
- No DELETE or UPDATE of existing data

### Environment Variables
- No new environment variables required

### Breaking Changes
- None

### API Changes
- None

### Permissions Required
- Supabase: Execute migrations
- Production database: INSERT to roles table

---

**Last Updated**: 2025-05-13
**Prepared By**: v0 AI Assistant
**For**: HR Leave Office Role Implementation
