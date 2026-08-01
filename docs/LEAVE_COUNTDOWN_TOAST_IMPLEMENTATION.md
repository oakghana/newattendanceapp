# Leave Countdown Toast Notification System

## Overview
A comprehensive leave monitoring system that displays beautiful toast notifications with emojis and live countdown timers when staff are on approved leave. Helps both staff and supervisors (HOD/RM) monitor leave schedules effectively.

## Features Implemented

### 1. Staff Leave Countdown Toast (`components/leave/leave-countdown-toast.tsx`)
**Purpose**: Display an animated toast notification when staff logs in during their approved leave period.

**Key Features**:
- Live countdown timer (updates every minute)
- Dynamic styling based on urgency:
  - **Green (🏖️)**: 5+ days remaining - "Enjoying Your Leave"
  - **Blue (📅)**: 2-5 days remaining - "Leave in Progress"
  - **Amber (⏰)**: 1-2 days remaining - "Leave Ending Soon"
  - **Red (🎉)**: Today - "Resume Work Today!"
  - **Red (🔴)**: Overdue - "Time to Check In"
- Dismissible UI with smooth animations
- Personalized messages based on leave type
- Accessible with ARIA labels and roles

**Props**:
```typescript
{
  leaveStartDate: string;      // ISO date string
  leaveEndDate: string;        // ISO date string
  leaveType: string;           // e.g., "Casual Leave", "Annual Leave"
  staffName: string;           // For personalization
  onDismiss?: () => void;      // Callback when dismissed
}
```

### 2. Toast Utility Functions (`lib/leave-toast-utils.ts`)
**Purpose**: Helper functions for leave-related calculations and styling.

**Functions**:
- `calculateDaysRemaining(endDateString)` - Calculate remaining leave days
- `getToastUrgency(daysRemaining, isEndingToday, isOverdue)` - Determine urgency level
- `getToastMessage()` - Get personalized toast messages and emojis
- `shouldShowCountdownToast()` - Check if toast should be displayed
- `getToastColors()` - Get color config based on urgency

### 3. Dashboard Toast Wrapper (`components/leave/dashboard-leave-toast-wrapper.tsx`)
**Purpose**: Client-side component that manages toast display lifecycle.

**Features**:
- Fetches leave status from server
- Handles toast dismissal with localStorage
- Prevents duplicate toast displays on same day
- Auto-resets daily when date changes

### 4. Staff Leave Monitoring Panel (`components/leave/staff-leave-monitoring-panel.tsx`)
**Purpose**: Display leave schedules for all staff (for HOD/RM/HR).

**Features**:
- Shows all staff currently on leave
- Color-coded urgency indicators
- Leave duration with start/end dates
- Leave type and department information
- Sorting by resume date

**Props**:
```typescript
{
  staffOnLeave: StaffLeave[];
  title?: string;              // Default: "Staff Leave Schedule"
  showCurrentlyOnly?: boolean; // Only show active leave (default: true)
}
```

### 5. Staff Leave Monitoring API (`app/api/leave/staff-monitoring/route.ts`)
**Purpose**: Backend API to fetch staff leave data for supervisors.

**Permissions**:
- Head of Department - See staff in their department
- Regional Manager - See staff in their region
- HR Executive/Leave Office - See all staff leave
- Admin - See all staff leave

**Response**:
```typescript
{
  success: boolean;
  data: {
    id: string;
    user_id: string;
    first_name: string;
    last_name: string;
    department: string;
    leave_type: string;
    leave_start_date: string;
    leave_end_date: string;
    leave_status: string;
  }[];
  count: number;
}
```

### 6. Staff Leave Monitoring Client (`components/leave/staff-leave-monitoring-client.tsx`)
**Purpose**: Client-side component for fetching and displaying staff leave.

**Features**:
- Permission-based rendering (only for HOD/RM/HR)
- Auto-refresh every 5 minutes
- Error handling and loading states
- Gracefully hides if no staff on leave

## Integration Points

### Dashboard Page (`app/dashboard/page.tsx`)
**Changes Made**:
1. Added import for `DashboardLeaveToastWrapper` and `StaffLeaveMonitoringClient`
2. Added `leaveStatusResult` to parallel fetch query
3. Extracted `leaveStatus` from results
4. Rendered `<DashboardLeaveToastWrapper />` after welcome header
5. Rendered `<StaffLeaveMonitoringClient />` after admin alerts

**Data Flow**:
```
Dashboard (Server) 
  ↓ Fetches leave_status
  ↓
DashboardLeaveToastWrapper (Client)
  ↓ Passes data
  ↓
LeaveCountdownToast (Shows to staff)

StaffLeaveMonitoringClient (Client)
  ↓ Calls /api/leave/staff-monitoring
  ↓
StaffLeaveMonitoringPanel (Shows to HOD/RM)
```

## User Experience

### For Staff on Leave
1. Staff logs into dashboard
2. If on approved leave, beautiful toast appears bottom-right
3. Toast shows:
   - Days remaining with large countdown
   - Leave type and resume date
   - Personalized message
   - Color-coded urgency
4. Can dismiss toast (remembered until next day)
5. Toast updates countdown every minute

### For HOD/Regional Manager
1. Dashboard shows "Team Leave Schedule" section
2. Lists all staff currently on leave
3. Shows:
   - Days remaining for each staff
   - Leave period (start - end date)
   - Leave type
   - Department/team
4. Color indicators show urgency (red = ending soon)
5. Automatically refreshes every 5 minutes

## Styling
- Uses Tailwind CSS for responsive design
- Dark mode support throughout
- Smooth animations and transitions
- Glassmorphism effects on dashboard
- Color-coded urgency system (emerald → sky → amber → red)

## Database Fields Used
```
user_profiles:
  - leave_status (on_leave, sick_leave, active)
  - leave_start_date (ISO date string)
  - leave_end_date (ISO date string)
  - leave_reason (leave type description)

Queries:
  - Filter by department_id (for HOD)
  - Filter by region_id (for RM)
  - Order by leave_end_date
```

## Performance Considerations
- Toast updates only every minute (not every second)
- Monitoring panel refreshes every 5 minutes
- Uses localStorage to track dismissed toasts
- Dismissal tracked per leave_end_date (resets daily)
- Parallel data fetching on dashboard

## Accessibility
- Toast has `role="alert"` and `aria-live="polite"`
- Countdown has clear `aria-label`
- Dismissal button has proper `aria-label`
- Color not sole indicator (uses icons + emoji)
- High contrast for readability

## Future Enhancements
1. Email notifications 2 days before leave ends
2. Calendar integration showing team schedules
3. Export leave schedules as CSV/PDF
4. Bulk leave planning for departments
5. Leave balance tracking integration
6. Mobile app push notifications
7. Slack/Teams integration for notifications

## Testing Scenarios
1. Staff with 3 days remaining → Green toast
2. Staff with 1 day remaining → Amber toast
3. Staff resuming today → Red toast
4. Overdue staff → Red "Time to Check In" message
5. HOD viewing team on leave → Monitoring panel shows all
6. RM viewing multiple departments → Filtering by region works
7. Dismiss and re-login → Remembers dismissal
8. Next day → Toast reappears with updated countdown
