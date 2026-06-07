# HR Leave Office Deferment & Recall Request Processing Workflow

## Overview

This guide explains the **simplified workflow** for HR Leave Office staff to process pending deferment and recall requests by assigning them to HR executives for final approval and memo generation.

---

## Workflow Steps

### Step 1: Access Processing Requests Dashboard
1. Log in as **HR Leave Office** staff
2. Navigate to **Leave Management** section
3. Click the **"Processing Requests"** tab (indigo/blue colored tab with send icon)
4. You will see all pending deferment and recall requests awaiting signer assignment

### Step 2: Review Pending Requests
The dashboard displays:
- **Deferment Requests** (amber colored section)
  - Staff name and employee ID
  - Department and position
  - Leave type and deferment year
  - Request reason

- **Recall Requests** (rose/pink colored section)
  - Staff name and employee ID
  - Department and position
  - Leave type
  - Recall reason

### Step 3: Search & Filter (Optional)
- **Search by Staff Name**: Type staff name, ID, or department
- **Filter by Request Type**: View all, deferments only, or recalls only
- **Reset Filters**: Clear all filters to see all pending requests

### Step 4: Assign Request to HR Executive
1. **Click the "Assign" Button** on any request card
2. A modal dialog will open showing:
   - Staff summary (name, ID, department)
   - Request type and leave details
   - HR Executive dropdown selector
   - Optional internal notes field

3. **Select HR Executive**:
   - Click the dropdown under "Select HR Executive"
   - Choose from active HR executives/directors
   - Each executive shows their name, title, and department

4. **Add Notes (Optional)**:
   - Type any internal notes for the HR executive
   - Example: "Staff urgent case" or "Priority processing"

5. **Click "Assign & Forward"** button
   - The request is immediately forwarded to the selected HR executive
   - Success notification appears
   - Request disappears from your pending list

### Step 5: HR Executive Receives Request
Once you assign a request:
- The HR executive sees it in their **"Memo Management"** tab
- Status shows as "Pending" (awaiting their review)
- They can click to view full request details
- They can then approve or reject with a signature

### Step 6: Monitor Progress
To track requests:
1. Refresh the **"Processing Requests"** tab to see updated pending count
2. When all requests are assigned, you'll see a success message
3. To view approved memos, navigate to **"Memo Management"** tab (if you have access)

---

## Key Features

### Dashboard Overview Cards
- **Total Pending**: Shows combined count of all pending requests
- **Deferments**: Count of pending deferment requests only
- **Recalls**: Count of pending recall requests only

### Request Card Information
Each request card displays:
- Staff name and ID
- Department assignment
- Position title
- Leave type (Annual, Sick, etc.)
- Leave period (start month/year)
- Request reason (truncated for space)
- **Assign Button**: Click to start assignment process

### Assignment Modal
Shows:
- Request summary with all key details
- Searchable dropdown of available HR executives
- Optional notes field for communication
- "Assign & Forward" button to complete action
- "Cancel" button to close without changes

---

## Common Questions

### Q: Can I assign multiple requests to the same HR executive?
**A:** Yes, absolutely. Multiple requests can be assigned to the same executive. The system will queue them all in their Memo Management dashboard.

### Q: What happens after I assign a request?
**A:** 
1. Request is removed from your pending list
2. HR Executive receives it in their "Memo Management" tab
3. They review the request details
4. They approve or reject with a signature
5. System generates official memo for approved requests

### Q: Can I see the memo after it's approved?
**A:** Yes, if you have access to the "Memo Management" tab, you can view all approved memos including those you assigned.

### Q: What if I assign the wrong person?
**A:** Contact your system administrator. The assignment can be manually corrected in the system or you can reassign to the correct person.

### Q: Are there any permissions I need to know?
**A:**
- Only **HR Leave Office** staff can see the "Processing Requests" tab
- Only **HR Executives** can see and approve memos in "Memo Management" tab
- **HR Directors** and **Managers HR** also have access to approve memos
- You cannot approve your own assigned requests (to maintain checks and balances)

---

## Troubleshooting

### Issue: "Processing Requests" tab is not showing
**Solution:** Verify your user role is set to "HR Leave Office" or "HR Officer"

### Issue: No requests appearing in the dashboard
**Solutions:**
- Requests only show if:
  - They have "approved" status from HOD review
  - They have NOT yet been assigned to an HR executive
- Check filters - you may have active search terms
- Click "Reset Filters" to clear all filtering

### Issue: HR Executive dropdown is empty
**Solutions:**
- Make sure there are active HR executives in the system
- Contact administrator to add/activate HR executives
- Check if you have the correct role permissions

### Issue: Assigned request still appears after assignment
**Solution:** This is a display lag. Refresh the page (F5) and it should disappear

### Issue: Getting "Column not found" error
**Solution:** This indicates a database schema issue. Contact technical support

---

## Permission Matrix

| Action | HR Leave Office | HR Executive | HR Director | Admin |
|--------|-----------------|--------------|-------------|-------|
| View Pending Requests | ✅ | ❌ | ❌ | ✅ |
| Assign to Executive | ✅ | ❌ | ❌ | ✅ |
| View Memo Dashboard | ⚠️ | ✅ | ✅ | ✅ |
| Approve Memos | ❌ | ✅ | ✅ | ✅ |
| Download Approved Memos | ✅ | ✅ | ✅ | ✅ |

*⚠️ Only if explicitly granted by administrator*

---

## System Architecture

```
Staff submits Deferment/Recall Request
         ↓
HR Leave Office receives HOD-approved request
         ↓
HR Leave Office staff reviews in "Processing Requests" tab
         ↓
HR Leave Office staff clicks "Assign" → selects HR Executive
         ↓
Request forwarded to HR Executive's "Memo Management" queue
         ↓
HR Executive reviews and approves with signature
         ↓
System generates official memo PDF
         ↓
Memo distributed to staff, HOD, and stored for records
         ↓
HR Leave Office can view/download final memo
```

---

## Related Tabs & Features

### Leave Management Tab
View all your leave-related activities and communications

### Processing Requests Tab (NEW)
**WHERE YOU ARE** - Assign pending deferment/recall requests to HR executives

### Memo Management Tab (for HR Executives)
Where HR Executives review and approve assigned memos

### Carryover & Audit Tab
View leave carryover approvals and audit compliance records

### Leave Analytics Tab
Analytics and reporting on leave usage patterns

---

## Tips for Efficiency

1. **Batch Assign**: Review all pending requests first, then assign them in bulk to appropriate executives
2. **Use Search**: Filter by department to assign requests from specific areas
3. **Add Notes**: Include useful context in notes to speed up HR Executive review
4. **Monitor**: Check the tab regularly for new requests
5. **Prioritize**: Assign urgent requests first if needed

---

## Support & Escalation

For issues or questions:
1. Check this guide first
2. Contact your HR Manager
3. Reach out to IT/System Administrator
4. Submit a support ticket through the Help Center

---

*Last Updated: June 2026*
*Document Version: 1.0*
