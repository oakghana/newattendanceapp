/**
 * Leave Templates for HR Leave Office
 * These templates are used for generating leave approval memos and payment drafts to accounts
 */

export const leaveTemplates = {
  // Annual Leave Approval
  annual_leave_approval: {
    key: "annual_leave_approval",
    name: "Annual Leave Approval",
    category: "leave_approval",
    subject: "APPLICATION FOR {{leave_type}} — {{leave_year_period}}",
    body: `We refer to your application for {{leave_type}} dated {{submitted_date}} on the above subject and wish to inform you that Management has approved your leave request as follows:

Leave Type: {{leave_type}}
Leave Period: {{leave_start_date}} to {{leave_end_date}}
Approved Days: {{approved_days}} day(s)
{{travelling_days_info}}Return to Work Date: {{return_to_work_date}}

{{adjustment_details}}You can count on our co-operation.`,
    cc: "Managing Director, Deputy Managing Director, HR Head, Accounts Manager",
    placeholder_help: {
      leave_type: "e.g., Annual Leave, Sick Leave",
      leave_year_period: "e.g., 2026/2027",
      submitted_date: "Staff request submission date",
      leave_start_date: "Format: DD/MM/YYYY",
      leave_end_date: "Format: DD/MM/YYYY",
      approved_days: "Number of days approved",
      travelling_days_info: "Only include if applicable: 'Travelling Days: {{travelling_days}} day(s)\n'",
      return_to_work_date: "Format: DD/MM/YYYY",
      adjustment_details: "Only include if HR Leave Office made adjustments with reason",
    },
  },

  // Sick Leave Approval
  sick_leave_approval: {
    key: "sick_leave_approval",
    name: "Sick Leave Approval",
    category: "leave_approval",
    subject: "APPLICATION FOR SICK LEAVE — {{leave_year_period}}",
    body: `We refer to your sick leave application dated {{submitted_date}} and wish to inform you that Management has approved your request as follows:

Leave Type: Sick Leave
Leave Period: {{leave_start_date}} to {{leave_end_date}}
Approved Days: {{approved_days}} day(s)
Return to Work Date: {{return_to_work_date}}

Please ensure to provide the required medical documentation within the approved period.

{{adjustment_details}}You can count on our co-operation.`,
    cc: "Managing Director, Deputy Managing Director, HR Head, Accounts Manager",
  },

  // Leave of Absence
  leave_of_absence: {
    key: "leave_of_absence",
    name: "Leave of Absence Approval",
    category: "leave_approval",
    subject: "APPROVAL FOR LEAVE OF ABSENCE",
    body: `We acknowledge receipt of your letter dated {{submitted_date}} on the above subject and wish to inform you that Management has approved of your request for {{approved_months}} months leave of absence effective {{leave_start_date}}.

Leave Period: {{leave_start_date}} to {{leave_end_date}}

Please note that the period of leave of absence shall not count towards your length of service and placement upon resumption shall be dependent on availability of vacancy at the time.

You are also advised to notify Management one (1) month prior to your resumption of duty for further action.

By copy of this letter, the Accounts Manager is advised to take note and delete your name from the payroll till otherwise advised.

{{adjustment_details}}You can count on our co-operation.`,
    cc: "Managing Director, Deputy Managing Director, HR Head, Accounts Manager",
  },

  // Re-change of Leave Date
  re_change_of_leave_date: {
    key: "re_change_of_leave_date",
    name: "Re-change of Leave Date",
    category: "leave_approval",
    subject: "RE: CHANGE OF LEAVE DATE",
    body: `We acknowledge receipt of your letter dated {{submitted_date}} on the above subject and wish to inform you that Management has granted approval for your {{leave_type}} leave to be rescheduled to {{leave_start_date}} to {{leave_end_date}}.

Accordingly, you will be entitled to {{approved_days}} working days{{travelling_days_info}}.

Your {{leave_type}} leave, therefore, takes effect from {{leave_start_date}} to {{leave_end_date}}, {{leave_year_period}}.

You are expected to resume duty on {{return_to_work_date}}.

{{adjustment_details}}You can count on our co-operation.`,
    cc: "Managing Director, Deputy Managing Director, HR Head, Accounts Manager",
  },

  // Payment to Accounts - Leave Entitlement
  payment_leave_entitlement: {
    key: "payment_leave_entitlement",
    name: "Leave Entitlement Payment Memo",
    category: "payment_memo",
    subject: "PAYMENT OF ACCRUED LEAVE ENTITLEMENT — {{staff_name}} ({{staff_number}})",
    body: `MEMORANDUM

TO: THE ACCOUNTS MANAGER
FROM: HUMAN RESOURCES DEPARTMENT
DATE: {{memo_date}}
RE: PAYMENT OF ACCRUED LEAVE ENTITLEMENT — {{staff_name}} ({{staff_number}})

This is to formally request payment of accrued leave entitlement for {{staff_name}}, Staff Number {{staff_number}}, who has:

- Approved {{approved_days}} days of {{leave_type}}
- Leave Period: {{leave_start_date}} to {{leave_end_date}}
- Basic Salary: GHc {{basic_salary}}
- Calculated Amount: GHc {{payment_amount}}

Please proceed with the above payment and debit the appropriate cost center. Supporting documentation is attached.

Submitted by:
{{hr_officer_name}}
HR Leave Office`,
    cc: "Finance Director, Deputy Finance Director, Audit Manager",
    placeholder_help: {
      staff_name: "Full name of staff member",
      staff_number: "Staff identification number",
      memo_date: "Current date in DD/MM/YYYY format",
      approved_days: "Number of days approved",
      leave_type: "Type of leave",
      leave_start_date: "Leave commencement date",
      leave_end_date: "Leave end date",
      basic_salary: "Staff basic monthly salary in GHc",
      payment_amount: "Calculated amount due",
      hr_officer_name: "Name of HR officer preparing memo",
    },
  },

  // Payment to Accounts - End of Service
  payment_end_of_service: {
    key: "payment_end_of_service",
    name: "End of Service Leave Payment",
    category: "payment_memo",
    subject: "PAYMENT OF OUTSTANDING LEAVE BENEFITS — {{staff_name}} ({{staff_number}})",
    body: `MEMORANDUM

TO: THE ACCOUNTS MANAGER
FROM: HUMAN RESOURCES DEPARTMENT
DATE: {{memo_date}}
RE: PAYMENT OF OUTSTANDING LEAVE BENEFITS — {{staff_name}} ({{staff_number}})

This is to request payment of outstanding leave benefits for {{staff_name}}, Staff Number {{staff_number}}, who is leaving the organization with effect from {{last_working_date}}.

Leave Outstanding:
- Annual Leave: {{annual_days}} days @ GHc {{daily_rate}} = GHc {{annual_amount}}
- Other Leave Entitlements: {{other_amount}}
- Total Amount Due: GHc {{total_payment}}

Please arrange payment to the above staff member. Supporting documentation is attached.

Submitted by:
{{hr_officer_name}}
HR Leave Office`,
    cc: "Finance Director, Personnel Department, Audit Manager",
  },

  // Deferment of Leave
  deferment_of_leave: {
    key: "deferment_of_leave",
    name: "Deferment of Leave Application",
    category: "leave_approval",
    subject: "APPLICATION FOR DEFERMENT OF LEAVE",
    body: `We acknowledge receipt of your application for deferment of {{approved_days}} days {{leave_type}} dated {{submitted_date}}.

Original Leave Period: {{original_start_date}} to {{original_end_date}}
Deferred to: {{new_start_date}} to {{new_end_date}}

Management has approved your request for deferment as stated above. Please note that deferment of leave must be utilized within the same financial year, and no further deferrals will be entertained.

You are expected to take this deferred leave during the new period specified above.

{{adjustment_details}}You can count on our co-operation.`,
    cc: "Managing Director, Deputy Managing Director, HR Head, Accounts Manager",
  },

  // Rejection Notice
  leave_rejection: {
    key: "leave_rejection",
    name: "Leave Request Rejection",
    category: "leave_approval",
    subject: "RE: APPLICATION FOR {{leave_type}}",
    body: `We refer to your application for {{leave_type}} dated {{submitted_date}} and regret to inform you that Management has not approved your request at this time.

Reason for non-approval: {{rejection_reason}}

You may reapply with updated dates or additional documentation where applicable. For further clarification, please contact the Human Resources Department.

Regards,
Human Resources Department
Quality Control Company Limited`,
    cc: "Managing Director, HR Head",
  },
}

/**
 * Placeholder descriptions for template customization
 */
export const placeholderDescriptions: Record<string, string> = {
  "{{staff_name}}": "Full name of the staff member",
  "{{staff_number}}": "Staff ID number",
  "{{leave_type}}": "Type of leave (Annual, Sick, Personal, etc.)",
  "{{leave_year_period}}": "Financial year (e.g., 2026/2027)",
  "{{leave_start_date}}": "Leave commencement date (DD/MM/YYYY)",
  "{{leave_end_date}}": "Leave end date (DD/MM/YYYY)",
  "{{approved_days}}": "Number of days approved by HR",
  "{{travelling_days}}": "Number of travelling days added",
  "{{travelling_days_info}}": "Travelling Days: [number] day(s)\\n(only include if applicable)",
  "{{return_to_work_date}}": "Date staff should return to work",
  "{{submitted_date}}": "Date of staff request submission",
  "{{memo_date}}": "Date memo is prepared (current date)",
  "{{adjustment_details}}": "Details of any adjustments made by HR Leave Office",
  "{{rejection_reason}}": "Reason for rejecting the leave request",
  "{{adjustment_reason}}": "Reason why HR Leave Office adjusted the leave dates/days",
  "{{holiday_days_deducted}}": "Number of public holidays deducted",
  "{{travelling_days_added}}": "Number of travelling days added",
  "{{basic_salary}}": "Staff basic monthly salary",
  "{{payment_amount}}": "Calculated payment amount",
  "{{daily_rate}}": "Daily rate of pay",
  "{{annual_amount}}": "Amount for annual leave",
  "{{other_amount}}": "Amount for other leave entitlements",
  "{{total_payment}}": "Total amount to be paid",
  "{{last_working_date}}": "Final date of service",
  "{{hr_officer_name}}": "Name of HR officer",
  "{{original_start_date}}": "Original leave start date",
  "{{original_end_date}}": "Original leave end date",
  "{{new_start_date}}": "New deferred leave start date",
  "{{new_end_date}}": "New deferred leave end date",
  "{{approved_months}}": "Number of months for leave of absence",
}

/**
 * Helper function to replace placeholders in template
 */
export function renderTemplate(
  template: string,
  data: Record<string, string | number | null | undefined>
): string {
  let rendered = template
  Object.entries(data).forEach(([key, value]) => {
    const placeholder = `{{${key}}}`
    const displayValue = value !== null && value !== undefined ? String(value) : ""
    rendered = rendered.replace(new RegExp(placeholder, "g"), displayValue)
  })
  return rendered
}

/**
 * Extract placeholders from template
 */
export function extractPlaceholders(template: string): string[] {
  const regex = /\{\{(\w+)\}\}/g
  const placeholders: string[] = []
  let match
  while ((match = regex.exec(template)) !== null) {
    placeholders.push(match[1])
  }
  return [...new Set(placeholders)] // Remove duplicates
}
