# Memo Status Fix - Approved Memos & Deferment/Recall Population

## Issue
- **Approved Memos tab** showed leave requests marked as "Approved" with status badge "Yet to Sign"
- **Deferment and Recall tabs** remained empty because they filtered for approved leave, but the database had unapproved or unsigned memos

## Root Cause
The system treats two things differently:
1. **Leave Request Status** (`leave_plan_requests.status`) - Set to "approved" or "hr_approved"
2. **Memo Signing Status** - Determined by presence of `hr_signature_image_url` and `hr_signature_data_url`

Memos were showing as "Yet to Sign" because they lacked signature data, even though the leave request was marked as "approved".

## Solution Applied
Updated three queries to ONLY show truly approved leave (both approved status AND signed with HR signature):

### 1. HR Executives' Approved Memos (`/api/leave/staff-approved-memos/route.ts`)
Added filter: `.not("hr_signature_image_url", "is", null)`
- Only shows leave requests that have HR signature

### 2. HOD/RM's Approved Memos (`/api/leave/staff-approved-memos/route.ts`)
Added filter: `.not("hr_signature_image_url", "is", null)`
- Only shows their staff's leave requests that are truly signed

### 3. Deferment/Recall Selection (`/app/dashboard/leave-management/page.tsx`)
Added filter: `.not("hr_signature_image_url", "is", null)`
- Only populates the deferment/recall staff dropdown with truly approved (signed) leave

## Result
- **Approved Memos tab** now ONLY shows memos that are both approved AND signed (no more "Yet to Sign" status)
- **Deferment & Recall tabs** now populate correctly with staff who have truly approved leave
- No more inconsistency between approval status and memo signing status

## Data Requirements
For the system to work correctly:
- Leave request must have `status = "approved"` or `status = "hr_approved"`
- Leave request must have `hr_signature_image_url` populated (or `hr_signature_data_url`)
- Only then will it appear in "Approved Memos" and become available for deferment/recall
