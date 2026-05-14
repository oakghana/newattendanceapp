import { LeaveManagementModuleClient } from "./leave-management-module-client"

// MOCK DATA - Database calls disabled for debugging
const MOCK_USER_ID = "mock-user-001"
const MOCK_STAFF_REQUESTS = [
  {
    id: "1",
    user_id: MOCK_USER_ID,
    start_date: "2026-06-01",
    end_date: "2026-06-05",
    reason: "Annual family vacation",
    leave_type: "annual",
    status: "pending_hod_review",
    created_at: "2026-05-10T10:00:00Z",
  },
  {
    id: "2",
    user_id: MOCK_USER_ID,
    start_date: "2026-07-15",
    end_date: "2026-07-15",
    reason: "Medical appointment",
    leave_type: "sick",
    status: "approved",
    created_at: "2026-05-08T09:00:00Z",
  },
]

const MOCK_MANAGER_NOTIFICATIONS = [
  {
    id: "notif-1",
    leave_plan_request_id: "3",
    status: "pending_hod_review",
    review_decision: "pending",
    requester_role: "staff",
    requester_name: "John Mensah",
    waiting_days: 3,
    leave_requests: {
      id: "3",
      user_id: "user-002",
      start_date: "2026-06-10",
      end_date: "2026-06-12",
      reason: "Personal matters",
      leave_type: "annual",
      status: "pending_hod_review",
      created_at: "2026-05-11T14:00:00Z",
    },
  },
]

const MOCK_APPROVED_REQUESTS = [
  {
    id: "4",
    user_id: "user-003",
    start_date: "2026-05-20",
    end_date: "2026-05-25",
    reason: "Study leave for exams",
    leave_type: "study",
    status: "approved",
    created_at: "2026-05-01T08:00:00Z",
    user_name: "Kwame Asante",
    rank: "Senior Officer",
    location: "Head Office",
  },
]

export default async function LeaveManagementPage() {
  // ALL DATABASE CALLS DISABLED - Using mock data for debugging
  // TODO: Re-enable database calls after page loads successfully
  
  return (
    <div className="leave-theme">
      <LeaveManagementModuleClient
        userId={MOCK_USER_ID}
        userRole="admin"
        userDepartment="dept-001"
        userFirstName="Test"
        userLastName="User"
        inactivityDays={5}
        userDepartmentName="Information Technology"
        userDepartmentCode="IT"
        hasHodLinkage={true}
        initialStaffRequests={MOCK_STAFF_REQUESTS}
        initialManagerNotifications={MOCK_MANAGER_NOTIFICATIONS}
        initialApprovedStaffRequests={MOCK_APPROVED_REQUESTS}
      />
    </div>
  )
}
