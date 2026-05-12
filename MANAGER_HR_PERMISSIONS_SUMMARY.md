# Manager HR Permissions - Parity with Director HR

## Summary
The system has been architected to provide Manager HR role with **full parity** to Director HR role across all modules and features.

## Loan Module ✓

### Permission Function (lib/loan-workflow.ts:78-80)
```typescript
export function canDoDirectorHr(role: string, deptName?: string | null, deptCode?: string | null): boolean {
  return isAdminRole(role) || role === "director_hr" || role === "manager_hr" || role === "hr_director" || (role === "department_head" && isHrDepartment(deptName, deptCode))
}
```

### Loan App Dashboard (app/dashboard/loan-app/page.tsx)
- **HR Office Access**: Line 75 in workflow.ts includes manager_hr
- **Director HR Tab**: Available when `p?.directorHr` is true (which uses canDoDirectorHr)
- **Director HR Data Queries**: Lines 415-425 in workflow/route.ts
- **Director HR Actions**: Can approve/finalize loans
- **Memo CC Editing**: Can edit memo recipients (HR Terms modal)

### Loan API Endpoints (app/api/loan/action/route.ts)
- **Line 69**: Director HR role check includes manager_hr
- **Line 83**: HR access validation includes manager_hr
- **Line 417**: HOD decision handling includes manager_hr
- **Line 622**: HR forwarding decision includes manager_hr
- **Line 628**: Director HR/Manager HR role checks

### Workflow Data (app/api/loan/workflow/route.ts)
- **Line 354**: `directorHr: canDoDirectorHr(role, ...)` - Both roles get this permission
- **Line 387**: `showDirectorHr = permissions.directorHr || viewAllTabs`
- **Lines 415-425**: Director HR requests returned based on showDirectorHr flag

## Leave Management Module ✓

### Leave Management Client (app/dashboard/leave-management/leave-management-client.tsx)
- **Line 352**: `canManageLeave` includes both manager_hr and director_hr
- **Line 397**: Duplicated check also includes both
- **Line 464**: `canUseStaffLeaveHub` includes both manager_hr and director_hr
- **Line 467**: `canViewHrTemplates` includes both manager_hr and director_hr
- **Line 468**: `canEditHrTemplates` includes both manager_hr and director_hr

## Leave API Notifications (app/api/leave/notifications/route.ts:227)
- Both manager_hr and director_hr receive HR officer notifications

## Leave Planning Stagger (app/api/leave/planning/stagger/hr-finalize/route.ts:60-61)
- Both director_hr and manager_hr can finalize leave staggering

## Dashboard Access
Manager HR has access to all the same:
- ✓ Dashboard pages
- ✓ Loan Application views
- ✓ Leave Management views
- ✓ HR approval workflows
- ✓ Staff Management (through admin panel)
- ✓ All approval and decision-making functions

## Verified Permission Parity
| Feature | Director HR | Manager HR | Status |
|---------|------------|-----------|--------|
| Director HR Tab | ✓ | ✓ | Equal |
| Approve Loans | ✓ | ✓ | Equal |
| Set HR Terms | ✓ | ✓ | Equal |
| Edit Memo CC | ✓ | ✓ | Equal |
| Manage Leave | ✓ | ✓ | Equal |
| Edit HR Templates | ✓ | ✓ | Equal |
| View All Loans | ✓ | ✓ | Equal |
| Director Approval | ✓ | ✓ | Equal |

## Conclusion
Manager HR role has **identical permissions and access** to Director HR role throughout the entire system. Both roles can perform all the same actions and view all the same data. The permission system treats them as functional equivalents at the permission level.
