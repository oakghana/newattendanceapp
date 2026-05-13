# Leave Management Workflow Diagrams

## Workflow 1: HOD Date Changes Acknowledgment

### Decision Flow for Staff

```
┌─────────────────────────────────────────────────────────────────┐
│  Staff Member Receives HOD Date Change Notification             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                ┌─────────────────────────────┐
                │  Leave Request Card shows:  │
                │  - Original dates           │
                │  - HOD proposed dates       │
                │  - HOD's reason             │
                │  - Amber alert box          │
                └─────────────────────────────┘
                              │
                ┌─────────────┴──────────────┐
                │                            │
                ▼                            ▼
    ┌──────────────────────────┐  ┌──────────────────────────┐
    │ Accept Changes (GREEN)   │  │ Counter Propose (BLUE)   │
    │                          │  │                          │
    │ Status → hr_forwarded    │  │ Dialog: Enter dates      │
    │ ↓                        │  │ Status → pending_hod     │
    │ HR processes leave       │  │ ↓                        │
    │ ✓ DONE                   │  │ HOD reviews counter      │
    └──────────────────────────┘  │ ↓                        │
                                  │ Can approve or counter   │
                                  │ again                    │
                                  └──────────────────────────┘
```

### Full Status Transition Diagram

```
pending_hod_review
      │
      │ (HOD proposes changes)
      ▼
hod_changes_pending_acceptance
      │
      ├─────────────────────────────────────┐
      │                                     │
      │ (Staff accepts)          (Staff counters)
      ▼                                     ▼
hr_office_forwarded                  pending_hod_review
      │                                     │
      │ (HR approves)           (HOD re-reviews & decides)
      ▼                                     │
 hr_approved                      ┌────────┴────────┐
      │                           │                 │
      │ (Process leave)    (Approves)         (Counters again)
      ▼                           ▼                 ▼
   memo_issued            hr_office_forwarded  pending_hod
                                │
                          (HR approves)
                                ▼
                            hr_approved
```

---

## Workflow 2: Leave Deferment Request System

### User Decision Flow

```
┌─────────────────────────────────────────────────────┐
│  Staff navigates to "Leave Deferment" tab           │
└─────────────────────────────────────────────────────┘
                          │
                          ▼
            ┌──────────────────────────┐
            │  Check approved leaves   │
            └──────────────────────────┘
                    │            │
        ┌───────────┘            └────────────┐
        │                                     │
        ▼                                     ▼
   ✓ Has approved                    ✗ No approved
   (hr_approved)                        leave
        │                                  │
        ▼                                  ▼
    [Show leaves]                   [Show alert]
    [Submit button ENABLED]         [Button DISABLED]
        │                                  │
        ▼                                  ▼
    Select leave        ═════════════════► "You don't have
    Enter period                          any approved
    Enter reason                          leave to defer"
        │
        ▼
    [Submit Button]
        │
        ▼
Status → pending_hod_review
Notification → HOD/RM
```

### HOD/RM Decision Flow

```
┌─────────────────────────────────────────────────────┐
│  HOD receives "Leave Deferment Request" email       │
└─────────────────────────────────────────────────────┘
                          │
                          ▼
            ┌──────────────────────────┐
            │  Reviews deferment tab   │
            └──────────────────────────┘
                    │
        ┌───────────┼───────────┐
        │           │           │
        ▼           ▼           ▼
    [Approve]  [Reject]   [Request Changes]
        │           │           │
        ▼           ▼           ▼
    Email:    Email:      Dialog:
    "Approved" "Rejected"  Enter new period
        │           │           │
        ▼           ▼           ▼
    Status:     Status:     Email:
    hod_app     rejected    "Please review
    roved                   period: Q2 2027"
        │           │           │
        ▼           ▼           ▼
    To HR    Staff keeps   Staff accepts
             original leave or counters
```

### Full Approval Chain

```
STAFF SUBMITS DEFERMENT REQUEST
            │
            ▼
        pending_hod_review
            │
      (HOD Reviews)
            │
   ┌────────┴────────┐
   │                 │
   ▼                 ▼
hod_approved      rejected ──→ END (Staff notified)
   │
   │ (HOD approves)
   ▼
hr_office_forwarded
   │
   │ (HR Leave Office receives)
   ▼
PENDING HR REVIEW
   │
   ├──────────┬──────────┐
   │          │          │
   ▼          ▼          ▼
approved   rejected    on_hold
   │          │          │
   ▼          ▼          ▼
Memo    Staff notified  Waiting
issued  (keep original)
   │
   ▼
deferred
   │
DEFERMENT COMPLETE
Leave now scheduled for: [New Period]
Memo reference: [Link]
```

---

## Email Notification Triggers

### HOD Date Changes Workflow

```
HOD clicks "Adjust Dates"
            ▼
    [Dialog: Change dates]
            ▼
HOD submits changes
            ▼
API: /api/leave/planning/review (POST)
            ▼
DATABASE UPDATE:
  - status → hod_changes_pending_acceptance
  - hod_proposed_start_date
  - hod_proposed_end_date
            ▼
EMAIL SENT: notifyLeaveHodChangesProposed()
  To: Staff member
  Subject: "HOD Has Proposed Changes"
  Content: Original vs Proposed dates
            ▼
STAFF RECEIVES EMAIL
  [View] → [Accept] or [Counter-Propose]
```

### Leave Deferment Workflow

```
STAFF SUBMITS REQUEST
        ▼
API: /api/leave/deferment/request (POST)
        ▼
DATABASE INSERT:
  - leave_deferment_requests
  - status → pending_hod_review
        ▼
EMAIL #1: notifyLeaveHodDefermentRequest()
  To: HOD/Regional Manager
  Subject: "Leave Deferment Request from [Staff Name]"
  
HOD REVIEWS & DECIDES
        ▼
API: /api/leave/deferment/hod-approval (POST)
        ▼
DATABASE UPDATE:
  - leave_deferment_requests status
  - hod_decision
  - hod_notes
        ▼
EMAIL #2: notifyLeaveDefermentApprovedByHod()
  OR notifyLeaveDefermentRejectedByHod()
  To: Staff member
        ▼
IF APPROVED:
  HR RECEIVES
        ▼
  API: /api/leave/deferment/hr-approval (POST)
        ▼
  DATABASE UPDATE:
    - status → hr_office_approved
    - status → deferred
    - memo_issued_at
        ▼
  EMAIL #3: notifyLeaveDefermentFinalApproval()
    To: Staff member
    Subject: "Your Leave Deferment Is Approved"
```

---

## Database State Transitions

### Leave Plan Request States

```
SUBMITTED
    │
    ├─→ pending_hod_review
    │       │
    │       ├─→ hod_recommended_approved
    │       │
    │       ├─→ hod_changes_pending_acceptance ◄─── (NEW - Wait for staff)
    │       │       │
    │       │       ├─→ hr_office_forwarded (Accept)
    │       │       │
    │       │       └─→ pending_hod_review (Counter-propose)
    │       │
    │       ├─→ rejected
    │       │
    │       └─→ withdrawn
    │
    ├─→ hr_office_forwarded
    │       │
    │       ├─→ hr_approved ◄─── Can be deferred from here
    │       │
    │       ├─→ rejected
    │       │
    │       └─→ memo_issued ◄─── Final approval
    │
    └─→ cancelled
```

### Leave Deferment Request States (NEW)

```
STAFF SUBMITS DEFERMENT
        │
        ▼
pending_hod_review
        │
   ┌────┴─────┬────────┐
   │           │        │
   ▼           ▼        ▼
approved    rejected  request_changes
   │           │           │
   ▼           ▼           ▼
hod_app     END      Staff counters
roved                 back to
   │              pending_hod
   ▼
hr_office_forwarded
        │
   ┌────┴─────┬────────┐
   │           │        │
   ▼           ▼        ▼
approved    rejected  on_hold
   │           │        │
   ▼           ▼        ▼
deferred     END      END
(Complete)
```

---

## Tab Availability Matrix

```
┌─────────────────────┬──────────────────────────────────────┐
│ User Role           │ Tab Visibility & Functionality       │
├─────────────────────┼──────────────────────────────────────┤
│ Staff               │ ✓ Leave Deferment tab visible       │
│ (Regular)           │   - Only if has hr_approved leave   │
│                     │   - Can submit deferments           │
│                     │   - Can view own deferrals          │
├─────────────────────┼──────────────────────────────────────┤
│ HOD / Regional Mgr  │ ✓ Leave Deferment tab visible       │
│                     │   - Only if staff have approved     │
│                     │   - Can review deferrals            │
│                     │   - Can approve/reject/counter      │
├─────────────────────┼──────────────────────────────────────┤
│ HR Leave Office     │ ✓ Leave Deferment tab visible       │
│                     │   - Can see all deferrals           │
│                     │   - Can approve/issue memos         │
│                     │   - Can generate reports            │
├─────────────────────┼──────────────────────────────────────┤
│ Admin               │ ✓ Leave Deferment tab visible       │
│                     │   - Full access                     │
│                     │   - Can override decisions          │
└─────────────────────┴──────────────────────────────────────┘
```

---

## Permission Matrix

```
┌──────────────────────┬────────┬────────┬────────┬──────────┐
│ Action               │ Staff  │ HOD/RM │ HR     │ Admin    │
├──────────────────────┼────────┼────────┼────────┼──────────┤
│ View own deferrals   │   ✓    │   ✗    │   ✓    │    ✓     │
│ View staff deferrals │   ✗    │   ✓    │   ✓    │    ✓     │
│ Submit deferment     │  ✓*    │   ✗    │   ✗    │    ✓     │
│ Approve deferment    │   ✗    │   ✓    │   ✓    │    ✓     │
│ Reject deferment     │   ✗    │   ✓    │   ✓    │    ✓     │
│ Counter-propose      │   ✓    │   ✓    │   ✗    │    ✓     │
│ Issue memo           │   ✗    │   ✗    │   ✓    │    ✓     │
│ Override decision    │   ✗    │   ✗    │   ✗    │    ✓     │
└──────────────────────┴────────┴────────┴────────┴──────────┘
* Only if they have hr_approved leave
```

---

## Component Interaction Diagram

```
leave-management-module-client.tsx
    │
    ├─→ Tabs component
    │   │
    │   ├─→ TabsList
    │   │   ├─→ [My Leaves]
    │   │   ├─→ [Apply for Leave]
    │   │   ├─→ [Leave Planning] (HOD/RM)
    │   │   ├─→ [Leave Deferment] ◄─── NEW
    │   │   └─→ [Analytics] (HR)
    │   │
    │   └─→ TabsContent
    │       └─→ leave-deferment-client.tsx ◄─── NEW
    │           │
    │           ├─→ Alert (if no approved leave)
    │           ├─→ Tabs (Own / Staff Deferrals)
    │           │   │
    │           │   ├─→ DefermentCard
    │           │   │   ├─→ Leave details
    │           │   │   ├─→ Status badge
    │           │   │   ├─→ Decision history
    │           │   │   ├─→ Action buttons
    │           │   │   │   ├─→ [Approve]
    │           │   │   │   ├─→ [Reject]
    │           │   │   │   └─→ [Counter]
    │           │   │   │
    │           │   └─→ HodApprovalPanel
    │           │
    │           └─→ Dialogs
    │               ├─→ SubmitDeferment Dialog
    │               │   ├─→ Leave selector
    │               │   ├─→ Period input
    │               │   └─→ Reason textarea
    │               │
    │               ├─→ HodReview Dialog
    │               │   ├─→ Decision radio
    │               │   └─→ Notes textarea
    │               │
    │               └─→ HrApproval Dialog
    │                   ├─→ Decision radio
    │                   └─→ Notes textarea
```

---

## API Call Flow Diagram

### Deferment Submission

```
FRONTEND
│
└─→ fetch("/api/leave/deferment/request", {
    method: "POST",
    body: {
      leave_plan_request_id,
      requested_deferment_period,
      reason
    }
})
│
BACKEND: /api/leave/deferment/request (POST)
│
├─→ Validate user authenticated
├─→ Fetch leave_plan_request
├─→ Verify status = hr_approved
├─→ Fetch HOD/RM details
│
├─→ INSERT leave_deferment_requests
│   ├─→ status: pending_hod_review
│   └─→ created_at
│
├─→ INSERT leave_deferment_notifications (audit)
│
├─→ EMAIL notifyLeaveHodDefermentRequest()
│   │
│   └─→ Async (non-blocking)
│       ├─→ Get HOD email
│       ├─→ Render HTML
│       └─→ Send email
│
└─→ Response: { success: true, deferment_request_id }
    │
    └─→ FRONTEND
        │
        └─→ toast("Deferment submitted!")
            reload()
```

### HOD Approval

```
FRONTEND
│
└─→ fetch("/api/leave/deferment/hod-approval", {
    method: "POST",
    body: {
      deferment_request_id,
      decision,
      hod_notes
    }
})
│
BACKEND: /api/leave/deferment/hod-approval (POST)
│
├─→ Validate user is HOD/RM
├─→ Fetch deferment_request
├─→ Verify status = pending_hod_review
│
├─→ UPDATE leave_deferment_requests
│   ├─→ hod_reviewer_id: current_user
│   ├─→ hod_decision: decision
│   ├─→ hod_notes
│   ├─→ status: hod_approved/rejected
│   └─→ updated_at
│
├─→ INSERT leave_deferment_notifications (audit)
│
├─→ EMAIL notification
│   ├─→ notifyLeaveDefermentApprovedByHod() [if approved]
│   ├─→ notifyLeaveDefermentRejectedByHod() [if rejected]
│   └─→ Async (non-blocking)
│
└─→ Response: { success: true }
    │
    └─→ FRONTEND
        │
        └─→ toast("Decision recorded!")
            reload()
```

---

*Last Updated: 2026-05-13*
