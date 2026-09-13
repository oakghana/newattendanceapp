# QCC Electronic System — Comprehensive User Training & Workflow Guide
**Modules Covered:** Leave Management · Loan Administration · Transport & Fleet Management

---

## Executive Overview
This guide provides an end-to-end operational manual for all staff, supervisors (HODs / Regional Managers), HR officers, Accounts Executives, Transport Officers, and Executive Approvers. It outlines the step-by-step workflow for each module, role responsibilities, critical rules, and essential **DOs and DON'Ts**.

---

# 1. LEAVE MANAGEMENT MODULE

## 1.1 Purpose & Scope
The Leave Management Module manages staff annual leave planning, casual/sick/maternity/compassionate leaves, deferments, recalls, return-to-work resumption tracking, and check-in verifications.

---

## 1.2 Step-by-Step Flow of Work

```
[Staff Member]
  │ Submits Leave Plan / Request
  ▼
[HOD / Regional Manager]
  │ Reviews, recommends, or rejects
  ▼
[HR Leave Office]
  │ Verifies leave balance, entitlements & calculates days
  ▼
[HR Executive / Director HR]
  │ Final Approval, Digital Sign-off & Memo Generation
  ▼
[Staff on Leave]
  │ Enjoys Leave (Status: on_leave / active)
  ▼
[Resumption Day: Staff Checks In]
  │ Staff clocks in on/after resumption date
  │ System triggers: 'leave_resumption_notifications' & 'pending_hod_rm'
  ▼
[HOD / Regional Manager]
  │ Verifies physical presence on "All Requests" tab ("Verify Resumption")
  ▼
[HR Leave Office & System]
  │ Resumption Officially Confirmed & Memo Generated
```

### Step 1: Request Submission (Staff)
- **Where to start:** `Dashboard` → `Leave Administration` / `Leave Planning` → `Submit Request`.
- **Fields required:** Leave Type (Annual, Casual, Sick, Maternity, Study, Compassionate), Start Date, End Date, Reliever/Handover notes, and optional supporting documents (e.g., medical report for sick leave).
- **Initial Status:** `pending_hod` / `pending_review`.

### Step 2: HOD / Regional Manager Endorsement
- **Where to act:** `Dashboard` → `Leave Administration` → `Pending Approval`.
- **Actions:**
  - **Approve:** Forwards request to HR Leave Office.
  - **Reject:** Closes request with written justification.
  - **Adjust Dates:** Suggests modified dates if operational constraints require.

### Step 3: HR Leave Office Processing
- **Where to act:** `Dashboard` → `Leave Administration` → `HR Processing Queue`.
- **Actions:** Computes accumulated days, confirms prior leave history, and prepares the official leave memo.

### Step 4: HR Executive / Director Approval & Memo Sign-off
- **Where to act:** `Dashboard` → `Leave Administration` → `Executive Approval`.
- **Actions:** Signs with saved/drawn digital signature. The official leave approval letter is generated and made downloadable for the staff member.

### Step 5: Leave Resumption Notice & Check-In Confirmation
1. **5 Days Prior to End Date:** System countdown widget alerts staff and supervisors of upcoming return date.
2. **On Resumption Date:** When the staff member checks in via standard or fast check-in:
   - Resumption status switches to `pending_hod_rm`.
   - In-app alerts are dispatched to HOD/RM, Staff, and HR Leave Office.
3. **Supervisor Verification:**
   - HOD/RM navigates to `Leave Administration` → `All Requests` or `HOD Resumptions`.
   - Clicks **Verify Resumption** / **Confirm Return** once staff is physically present.
   - If staff fails to report within 5 days, status escalates to **HR Verify** for administrative follow-up.

---

## 1.3 Leave Deferment & Recall Workflows
- **Staff Deferment:** Staff with approved leave who cannot proceed due to urgent exigencies of service can apply for deferment to the following year via `Leave Management` → `Deferments`. Requires HOD recommendation and HR Executive approval.
- **Management Recall:** When urgent duty requires recalling a staff on leave, HR Leave Office issues a formal recall notice. The unused leave days are automatically credited back to the staff's balance.

---

## 1.4 DOs and DON'Ts (Leave Module)

| Role | DOs | DON'Ts |
|------|-----|--------|
| **Staff** | ✅ Submit leave requests at least 2–4 weeks in advance.<br>✅ Check in on the system immediately upon reporting on your resumption date.<br>✅ Attach medical certificates for sick leave exceeding 2 days. | ❌ Do not proceed on leave before receiving official HR approval.<br>❌ Do not leave station without completing handover notes. |
| **HOD / RM** | ✅ Review leave requests within 48 hours of submission.<br>✅ Verify staff physical presence on the All Requests tab once they check in.<br>✅ Provide clear justification when rejecting or modifying dates. | ❌ Do not confirm resumption for staff who have not physically reported to the office.<br>❌ Do not ignore overdue resumption alerts. |
| **HR Leave Office**| ✅ Audit leave balances before recommending approval.<br>✅ Monitor non-resumption escalations (Day 2 warning, Day 5 letter, Day 10 query memo). | ❌ Do not approve leave exceeding statutory entitlement without written exemption. |

---

# 2. LOAN ADMINISTRATION MODULE

## 2.1 Purpose & Scope
The Loan Administration Module manages the entire staff welfare loan cycle (Salary Advance, Car/Vehicle Loan, Rent/Furnishing, Medical/Emergency, Education, Funeral, Repair, Insurance) from application through financial discipline scoring, multi-tier approvals, disbursement confirmation, and repayment recovery tracking.

---

## 2.2 Step-by-Step Flow of Work

```
[Staff Member]
  │ Submits Loan Application (Loan Type, Amount, Duration, Reason)
  ▼
[HOD / Regional Manager]
  │ Endorsement (Approves or Rejects at Department Level)
  ▼
[Loan Office / HR Loan Office]
  │ Verifies eligibility, rank & salary details
  │ Forwards to Accounts Office for FD calculation
  ▼
[Accounts Loan Office]
  │ Computes Net/Gross Financial Discipline (FD) Score
  │ Live auto-scoring (Half-gross threshold: 39%)
  │ Forwards to Accounts Executive (NO REJECTION AT ACCOUNTS OFFICE)
  ▼
[Accounts Executive]  <--- EXCLUSIVE REJECTION AUTHORITY
  │ Reviews calculation, verification memo & supporting docs
  │ • IF Good FD (≥39%) or Exempt (Funeral/Repair/Insurance): APPROVES
  │ • IF Poor FD (<39%): REJECTS with detailed explanation
  ▼
[Car Loan Committee] (Only applicable to Vehicle/Car loans)
  │ Committee sitting approval / terms endorsement
  ▼
[HR Terms Setup (HR Loan Office)]
  │ Sets Disbursement Date, Recovery Start Date, Recovery Duration
  ▼
[HR Executive & Managing Director]
  │ HR Executive Signs Memo → MD Final Stamp of Approval
  ▼
[Accounts Office: Disbursement Confirmation]
  │ Accounts clicks "Confirm Received" once funds are disbursed
  │ Status moves to: 'partially_recovered' (Active Repayment)
  ▼
[Repayment Tracking]
  │ Monthly deductions tracked until fully recovered ('payment_completed')
```

---

## 2.3 Detailed Stage Guidelines

### Stage 1: Application (Staff)
- **Where to start:** `Dashboard` → `Loan Administration` → `Apply for Loan`.
- **Inputs:** Loan Category, Requested Amount, Recovery Months, Reason, and payslip/supporting documentation.
- **Salary Advance Rule:** Recovery period is strictly **1 to 3 months**.

### Stage 2: HOD / Regional Manager Review
- **Where to act:** `Loan Administration` → `HOD Approvals`.
- **Criteria:** Performance, conduct, and loan necessity.

### Stage 3: Accounts Office FD Calculation (No Rejection Here)
- **Where to act:** `Loan Administration` → `FD Calculation Submission`.
- **Responsibilities:**
  - Input Annual Salary, Consolidated Salary, Allowances, Gross Deductions, and any Outstanding Loan balances.
  - System computes Net Salary, Half-Gross, and Net-to-Gross percentage.
  - **CRITICAL RULE:** Accounts Office only calculates and forwards. They **cannot reject** loans.

### Stage 4: Accounts Executive Review & Decision (Exclusive Rejection Point)
- **Where to act:** `Loan Administration` → `FD Verification Queue` (`accounts-executive-fd-dashboard`).
- **Authority:**
  - **FD Threshold:** Scores **≥ 39%** meet the statutory half-gross test.
  - **FD-Exempt Loans:** Funeral, Vehicle Repair, and Insurance loans **cannot be rejected** on FD score grounds (must be reviewed and forwarded).
  - **Rejection:** If a standard loan has an FD score **< 39%**, only the Accounts Executive can issue the formal rejection memo.

### Stage 5: HR Terms Setup & Executive Sign-off
- **Where to act:** `Loan Administration` → `HR Terms Queue` & `Executive HR`.
- **Actions:** HR sets the specific disbursement month and recovery schedule. HR Executive signs the memo with a digital signature, and the Managing Director issues the final approval stamp.

### Stage 6: Disbursement & Repayment Confirmation
- **Where to act:** `Dashboard` → `Disbursement Confirmation`.
- **Access Control:**
  - **Accounts Executive & Accounts Officers:** Authorized to click **Confirm Received** once funds are transferred.
  - **HR Executive & Loan Office:** Have **View Only** access for tracking.
  - **Outcome:** Updates loan status to `partially_recovered`, generates repayment schedule, and notifies staff.

---

## 2.4 DOs and DON'Ts (Loan Module)

| Role | DOs | DON'Ts |
|------|-----|--------|
| **Staff** | ✅ Ensure monthly repayment installment does not reduce net pay below 50% of gross.<br>✅ Upload accurate pay slips and valid supporting documents.<br>✅ Track repayment progress in "My Loans". | ❌ Do not apply for multiple concurrent loans beyond eligible debt limits.<br>❌ Do not set salary advance recovery beyond 3 months. |
| **Accounts Loan Office** | ✅ Accurately enter all allowances and outstanding loans.<br>✅ Forward all calculated FDs directly to Accounts Executive. | ❌ **NEVER attempt to reject loans at the Accounts Office stage.** Rejection is strictly reserved for Accounts Executive. |
| **Accounts Executive** | ✅ Verify the FD breakdown and supporting documentation.<br>✅ Always forward FD-exempt loans (Funeral/Insurance/Repair).<br>✅ Provide clear notes when rejecting poor FD scores (<39%). | ❌ Do not reject loans with FD score ≥ 39%.<br>❌ Do not reject FD-exempt loans. |
| **HR Loan Office** | ✅ Set realistic disbursement and recovery start dates.<br>✅ Ensure all approver signatures are captured before payment advice is finalized. | ❌ Do not push loans to HR Executive without complete FD verification. |

---

# 3. TRANSPORT & FLEET MANAGEMENT MODULE

## 3.1 Purpose & Scope
The Transport Module coordinates vehicle requisitions, official travel assignments, fleet maintenance, fuel disbursements, and driver mission management for both Regional and Head Office trips.

---

## 3.2 Step-by-Step Flow of Work

```
[Staff / Department Head / Regional HR]
  │ Submits Transport Requisition (Origin, Destination, Purpose, Dates, Passengers)
  ▼
[Transport Officer / Chief Driver]
  │ Checks vehicle availability, assigns Driver & Vehicle
  ▼
[Regional Manager (Regional) / Transport Manager (Head Office)]
  │ Endorses assignment & logistics
  ▼
[Managing Director / Director HR]
  │ Approves requisition & fuel/travel allowance
  ▼
[Driver & Transport Office]
  │ Trip Execution: Vehicle Inspection, Start Mileage & Fuel Log
  ▼
[Trip Completion]
  │ End Mileage, Return Inspection & Incident/Trip Report logged
```

---

## 3.3 Requisition Categories & Routing

### 1. Regional Transport Requests
- **Initiated by:** Regional HR / District Officers / Chief Drivers.
- **Workflow:** Submitting Staff → Chief Driver (Vehicle & Driver Assignment) → Regional Manager (Endorsement) → Managing Director / HR Executive (Approval) → Trip Dispatch.
- **Scope:** Trips within or originating from regional offices (Kumasi, Takoradi, Sunyani, Tamale, etc.).

### 2. Head Office & Non-Regional Requests
- **Initiated by:** Department Heads / Unit Leaders at Swanzy Arcade / Head Office.
- **Workflow:** Department Head → Transport Manager (Assignment) → Director HR / Managing Director (Approval) → Trip Dispatch.
- **Scope:** Nationwide assignments, inter-regional missions, and Head Office operations.

---

## 3.4 Key Operational Stages

### Stage 1: Vehicle & Driver Assignment
- **Where to act:** `Dashboard` → `Transport` → `Fleet & Assignments`.
- **Assignment Parameters:** Vehicle registration number, vehicle model/capacity, assigned driver name & license details, expected mileage, and fuel allocation.

### Stage 2: Executive Approval & Reference Numbering
- **Where to act:** `Transport` → `Executive Approvals`.
- **Approval Actions:** Approvers verify travel justification, route, and financial implications. Upon approval, a formal transport reference number (e.g., `QCC/TRP/...`) is stamped on the requisition.

### Stage 3: Trip Logging & Closure
- **Driver Action:** Driver enters departure odometer reading and logs fuel vouchers.
- **On Return:** Driver enters return odometer reading, trip notes, and maintenance flags (if any). Status updates to `completed`.

---

## 3.5 DOs and DON'Ts (Transport Module)

| Role | DOs | DON'Ts |
|------|-----|--------|
| **Requisitioning Staff** | ✅ Submit transport requests at least 48 hours prior to planned journey (except emergencies).<br>✅ Specify exact itinerary, passenger list, and official purpose. | ❌ Do not use official vehicles for unauthorized private activities.<br>❌ Do not embark on official trips without an approved requisition. |
| **Chief Driver / Transport Officer** | ✅ Verify roadworthiness, insurance, and vehicle service schedule before assignment.<br>✅ Match passenger count and terrain to suitable vehicle types (4x4, bus, saloon). | ❌ Do not assign vehicles with known mechanical defects or expired insurance.<br>❌ Do not exceed recommended fuel allocation caps without prior approval. |
| **Drivers** | ✅ Perform pre-trip vehicle walkaround and tire pressure checks.<br>✅ Accurately record start and end mileage on the trip log.<br>✅ Report all incidents or breakdowns immediately. | ❌ Do not drive recklessly or exceed highway speed limits.<br>❌ Do not carry unauthorized non-staff passengers. |
| **Approving Managers** | ✅ Ensure journeys are operationally essential and combined where possible.<br>✅ Verify budget allocation for fuel and driver per-diem. | ❌ Do not approve retroactive transport requests after the journey has already occurred. |

---

# 4. Master Role & Permissions Matrix

| Capability / Action | Staff | HOD / RM | HR Office | HR Exec / MD | Accounts Office | Accounts Exec | Transport / Chief Driver |
|:-------------------|:-----:|:--------:|:---------:|:------------:|:---------------:|:-------------:|:------------------------:|
| **Apply for Leave** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **HOD Leave Endorsement** | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Leave Resumption Check-in** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Verify Staff Resumption** | ❌ | ✅ | ✅ (Escalated) | ❌ | ❌ | ❌ | ❌ |
| **Apply for Loan** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Calculate FD Score** | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Reject Loan on FD Grounds** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Sign Loan Approval Memo** | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Confirm Loan Disbursement**| ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| **Create Transport Requisition**| ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Assign Vehicle & Driver** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Approve Transport Trip** | ❌ | ✅ (RM) | ❌ | ✅ (MD) | ❌ | ❌ | ❌ |

---

# 5. Quick Support & Troubleshooting

- **Check-in Resumption Not Showing:** Ensure you clock in on or after your leave end date. The HOD will immediately see your record under `All Requests` with a highlighted orange verification button.
- **Loan Disbursed but not Active:** Ensure Accounts Executive or Accounts Officer clicks **Confirm Received** on `Dashboard/Disbursement-Confirmation`.
- **System Assistance:** For password resets, role alignment, or technical support, contact the IT Systems Administrator at `ohemengappiah@qccgh.com`.
