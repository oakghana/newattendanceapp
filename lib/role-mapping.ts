/**
 * Centralized role mapping utilities
 * Handles the mapping between UI display roles and database storage roles
 */

// API role mapping: converts UI roles to database storage format
//
// NOTE: 'accounts' and 'accounts_executive' are DISTINCT roles and must never be
// collapsed into one another here. Accounts staff calculate/forward FD values;
// Accounts Executives review and approve those forwarded FD values before they
// reach the HR Loan Office. Merging them breaks the FD Approval workflow and
// makes the two roles indistinguishable in the UI.
export const API_ROLE_MAPPINGS: Record<string, string> = {
  'hr_executive': 'hr_leave_office',
  'driver': 'driver',
  'managing_director': 'managing_director'
};

// Reverse mapping: converts database roles back to UI display format
const REVERSE_ROLE_MAPPINGS: Record<string, string> = {
  'hr_office': 'hr_leave_office',
  'hr_leave_office': 'hr_leave_office',
};

/**
 * Maps database role to display role
 * Used to show the correct role name in UI components
 */
export function displayRole(dbRole: string | null | undefined): string {
  const normalized = String(dbRole || '').toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (["regional_hr_leave_office", "regional_leave_office"].includes(normalized)) return "regional_hr";
  if (normalized === "administrator") return "admin";
  return REVERSE_ROLE_MAPPINGS[normalized] || normalized;
}

/**
 * Formats role for display (uppercase with spaces)
 */
export function formatRoleForDisplay(dbRole: string | null | undefined): string {
  const mapped = displayRole(dbRole);
  return mapped.replace(/_/g, ' ').toUpperCase();
}

/**
 * Maps UI role selection to database storage format
 * Used by API endpoints when saving role changes
 */
export function mapRoleForDatabase(uiRole: string | null | undefined): string {
  const normalized = String(uiRole || '').toLowerCase().trim();
  return API_ROLE_MAPPINGS[normalized] || normalized;
}
