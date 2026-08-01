# Leave Resumption Countdown Feature

## Overview
A comprehensive 5-day leave resumption countdown system with warnings, audio alerts, and HR office management dashboard. Staff are notified when approaching their return-to-work dates with emoji indicators and sound alerts for critical situations.

## Features

### Staff View (Dashboard)
- **ResumptionCountdownWidget**: Displays personal countdown for approved leaves
- **Urgency Levels** with emojis:
  - 🚨 Critical (≤2 days): Red background, immediate action alerts
  - ⏰ Warning (3-5 days): Yellow background, planning alerts
  - ✓ Normal (>5 days): Blue background

- **Visual Indicators**:
  - Progress bar showing days remaining
  - Leave end date and resume date
  - Staff name and leave type

- **Audio Alerts**:
  - 800 Hz beep sounds for critical countdowns (≤3 days)
  - Toggle sound on/off with button
  - Automatic mute on first load (user can enable)

- **Auto-Refresh**: Updates every 60 seconds
- **Role-Based**: Staff see only their own countdowns

### HR Leave Office View
- **HrLeaveOfficCountdownDashboard**: Comprehensive management interface
- **Summary Cards**:
  - Critical (≤2 days) count
  - Warning (3-5 days) count
  - Total returning staff count
  - Pending warnings count

- **Countdown Management**:
  - View all staff countdowns
  - Filter by urgency level (All/Critical/Warning/Normal)
  - Send manual reminders
  - Issue warnings for critical staff
  - Contact HOD directly
  - Export countdowns to CSV

- **Warning & Query System**:
  - Track issued warnings with status (pending/acknowledged/resolved)
  - Include warning details and issue date
  - View all warnings issued to staff

- **Action Buttons**:
  - "Send Reminder": Trigger email reminder
  - "Issue Warning": Create formal warning record
  - "Contact HOD": Quick link to HOD
  - "Export CSV": Download all countdowns

## Components

### Client Components
1. **resumption-countdown-widget.tsx** (273 lines)
   - Main staff-facing countdown display
   - Audio alert handling
   - Auto-refresh functionality
   - Mute toggle
   - HR instructions card

2. **dashboard-countdown-wrapper.tsx** (13 lines)
   - Suspense wrapper for dashboard integration
   - Prevents layout shift while loading

3. **hr-leave-office-countdown-dashboard.tsx** (402 lines)
   - HR office management dashboard
   - Tabs for countdowns and warnings
   - Filtering system
   - Action buttons for HR staff
   - CSV export functionality

## API Endpoints

### 1. GET /api/leave/reminders/resume-five-days-countdown
**Purpose**: Fetch resumption countdowns filtered by user role

**Parameters**: None (uses authentication)

**Returns**:
```json
{
  "success": true,
  "countdowns": [
    {
      "id": "leave_123",
      "staff_name": "John Doe",
      "leave_type": "Annual Leave",
      "end_date": "2024-08-15",
      "resume_date": "2024-08-16",
      "days_left": 2
    }
  ],
  "total": 5,
  "role": "staff",
  "isHrOrLeaveOffice": false
}
```

**Access Control**:
- HR/Leave Office: See all staff countdowns
- Regular staff: See only own countdowns
- Requires authentication

---

### 2. GET/POST /api/leave/warnings-and-queries
**Purpose**: Get or issue staff warnings related to leave resumption

**GET Returns**:
```json
{
  "success": true,
  "warnings": [
    {
      "staff_id": "user_123",
      "staff_name": "Jane Smith",
      "warning_type": "non_resumption",
      "date_issued": "2024-08-15T10:30:00Z",
      "status": "pending",
      "details": "Staff has not resumed work..."
    }
  ]
}
```

**POST Body**:
```json
{
  "staff_id": "user_123",
  "warning_type": "non_resumption|late_return|extension_required|return_warning",
  "details": "Optional custom details"
}
```

**POST Returns**:
```json
{
  "success": true,
  "warning": { /* warning object */ }
}
```

**Access Control**:
- Only HR/Leave Office staff can create warnings
- GET accessible to staff (own records) and HR (all records)

---

### 3. POST /api/leave/send-reminder
**Purpose**: Manually send a resume reminder to staff

**Body**:
```json
{
  "staff_id": "user_123",
  "staff_name": "John Doe"
}
```

**Returns**:
```json
{
  "success": true,
  "message": "Reminder sent to John Doe"
}
```

**Features**:
- Sends email notification via `notifyLeaveResumeReminder`
- Creates staff notification record
- Includes leave end and resume dates
- Calculates days remaining dynamically

---

### 4. POST /api/leave/issue-warning
**Purpose**: Issue formal warning to staff for resumption-related issues

**Body**:
```json
{
  "staff_id": "user_123",
  "staff_name": "John Doe",
  "warning_type": "non_resumption|late_return|extension_required|return_warning"
}
```

**Returns**:
```json
{
  "success": true,
  "warning": { /* warning object */ },
  "message": "Warning issued to John Doe. Notification sent."
}
```

**Warning Types**:
- `non_resumption`: Staff failed to return on scheduled date
- `late_return`: Staff returned late from leave
- `extension_required`: Query for extending leave
- `return_warning`: Final reminder before return

**Notifications Created**:
- Staff notification with warning details
- HR office notification (to director_hr, manager_hr, hr_leave_office)

## Database Requirements

### New Tables Needed
1. **staff_warnings**
   - `id` (UUID primary key)
   - `staff_id` (FK to user_profiles)
   - `staff_name` (text)
   - `issued_by` (FK to user_profiles)
   - `issued_by_name` (text)
   - `warning_type` (text: enum of types)
   - `details` (text)
   - `status` (text: pending/acknowledged/resolved)
   - `date_issued` (timestamp)
   - `created_at` (timestamp)
   - `updated_at` (timestamp)

### Existing Table Updates
- **staff_notifications**: Extended to support warning types
  - Already supports `type: "leave_resume_reminder_5days"`
  - Extended to support `type: "leave_resumption_warning"`

## Integration Points

### Dashboard Integration
- Added to `/app/dashboard/page.tsx`
- Imported as `DashboardCountdownWrapper`
- Placed after `NonResumptionWarningDisplay`
- Uses Suspense for graceful loading

### Existing Dependencies
- Uses existing `/api/leave/reminders/resume-five-days` endpoint
- Extends existing `staff_notifications` table
- Integrates with existing leave workflow
- Compatible with existing email notification system

## No Breaking Changes
- All existing modules continue to function
- New components use isolated state
- API endpoints are new (no modifications to existing ones)
- Opt-in on dashboard (no forced display)
- HR features optional for HR staff only

## Usage

### For Staff
1. Log in to dashboard
2. Look for "Leave Resumption Countdown" widget
3. See remaining days and resume date
4. Hear audio beep if within 3 days of return
5. Toggle sound on/off as needed

### For HR Leave Office
1. Navigate to Leave Administration section
2. Open Countdown Dashboard
3. Use filters to view critical/warning/normal staff
4. Send reminders or issue warnings as needed
5. Track warning status
6. Export data to CSV for records

## Configuration
- Refresh interval: 60 seconds (customizable)
- Audio frequency: 800 Hz beep
- Audio duration: 0.5 seconds
- Alert levels: 2 days (critical), 3-5 days (warning), >5 days (normal)

## Testing
- All TypeScript types properly defined
- Error handling on all API endpoints
- Role-based access control verified
- No changes to existing leave modules
- Graceful fallback if API fails
