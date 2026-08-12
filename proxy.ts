import { updateSession } from "@/lib/supabase/middleware";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Define route protection rules: [pathPattern] => [allowedRoles]
const PROTECTED_ROUTES: Record<string, string[]> = {
  // Admin pages
  "/admin": ["admin"],
  "/dashboard/admin": ["admin"],
  "/dashboard/settings": ["admin"],
  "/dashboard/loan-app": ["admin", "it-admin", "regional_manager", "department_head", "staff", "loan_office", "hr_loan_office", "accounts_loan_office", "accounts", "accounts_executive", "director_hr", "manager_hr", "hr_office", "hr_leave_office", "hr_records", "regional_hr_leave_office", "regional_hr", "audit_staff", "nsp", "intern", "contract", "managing_director", "secretary", "hr_executive"],
  
  // HR/Leave Management — every authenticated role may access this page
  "/dashboard/leave-management": [
    "admin",
    "staff",
    "nsp",
    "intern",
    "it-admin",
    "department_head",
    "regional_manager",
    "loan_office",
    "hr_loan_office",
    "accounts_loan_office",
    "accounts",
    "accounts_executive",
    "director_hr",
    "manager_hr",
    "hr_officer",
    "hr_leave_office",
    "hr_records",
    "regional_hr_leave_office",
    "hr_office",
    "hr_executive",
    "audit_staff",
    "contract",
    "managing_director",
    "secretary",
    "regional_hr",
    "leave_admin",
  ],
  "/dashboard/leave-planning": [
    "admin",
    "staff",
    "nsp",
    "intern",
    "it-admin",
    "department_head",
    "regional_manager",
    "loan_office",
    "hr_loan_office",
    "accounts_loan_office",
    "accounts",
    "accounts_executive",
    "director_hr",
    "manager_hr",
    "hr_officer",
    "hr_leave_office",
    "hr_records",
    "regional_hr_leave_office",
    "hr_office",
    "hr_executive",
    "audit_staff",
    "contract",
    "managing_director",
    "secretary",
    "regional_hr",
    "leave_admin",
  ],
  
  // Attendance check-in — the universal landing page for every role after login
  "/dashboard/attendance": ["staff", "nsp", "intern", "it-admin", "department_head", "regional_manager", "admin", "loan_office", "hr_loan_office", "accounts_loan_office", "accounts", "accounts_executive", "director_hr", "manager_hr", "hr_officer", "hr_leave_office", "hr_records", "regional_hr_leave_office", "hr_executive", "audit_staff", "contract", "loan_committee", "committee", "managing_director", "secretary", "regional_hr", "leave_admin"],

  // Staff Dashboard root — all roles
  "/dashboard": ["staff", "nsp", "intern", "it-admin", "department_head", "regional_manager", "admin", "loan_office", "hr_loan_office", "accounts_loan_office", "accounts", "accounts_executive", "director_hr", "manager_hr", "hr_officer", "hr_leave_office", "hr_records", "regional_hr_leave_office", "hr_executive", "audit_staff", "contract", "loan_committee", "committee", "managing_director", "secretary", "regional_hr", "leave_admin"],
  
  // HR Records reference-management queue
  "/dashboard/hr-records": ["admin", "hr_records", "it-admin", "system_admin"],

  // Regional Manager pages
  "/dashboard/regional": ["admin", "regional_manager"],
  "/dashboard/department": ["admin", "department_head", "regional_manager"],
  
  // Accounts pages
  "/dashboard/accounts": ["admin", "accounts"],
  
  // Audit pages
  "/dashboard/audit": ["admin", "audit_staff"],

  // MD Approval Hub — restricted to the Managing Director and administrators
  "/dashboard/md-approvals": ["managing_director", "admin"],

  // Secretary Memo Hub — restricted to the Secretary and administrators
  "/dashboard/secretary-memos": ["secretary", "admin"],

  // Overview dashboard — all roles
  "/dashboard/overview": ["staff", "nsp", "intern", "it-admin", "department_head", "regional_manager", "admin", "loan_office", "hr_loan_office", "accounts_loan_office", "accounts", "accounts_executive", "director_hr", "manager_hr", "hr_officer", "hr_leave_office", "hr_records", "regional_hr_leave_office", "hr_executive", "audit_staff", "contract", "loan_committee", "committee", "managing_director", "secretary", "regional_hr", "leave_admin"],
};

function normalizeRole(role: string | null | undefined): string {
  return (role || "").toLowerCase().trim().replace(/[-\s]+/g, "_");
}

function isProtectedRoute(pathname: string): boolean {
  return Object.keys(PROTECTED_ROUTES).some(
    (pattern) => pathname === pattern || pathname.startsWith(pattern + "/"),
  );
}

function isAuthorizedForRoute(userRole: string | null | undefined, pathname: string): boolean {
  const normalized = normalizeRole(userRole)
  const effectiveRole = normalized === "administrator" ? "admin" : normalized;

  // Sort patterns longest-first so more specific routes take priority over
  // parent patterns (e.g. /dashboard/md-approvals beats /dashboard).
  const sortedEntries = Object.entries(PROTECTED_ROUTES).sort(
    ([a], [b]) => b.length - a.length
  );

  for (const [pattern, allowedRoles] of sortedEntries) {
    // Exact match
    if (pathname === pattern) {
      return allowedRoles.some(r => normalizeRole(r) === effectiveRole);
    }

    // Prefix match (pathname starts with pattern + "/")
    if (pathname.startsWith(pattern + "/")) {
      return allowedRoles.some(r => normalizeRole(r) === effectiveRole);
    }
  }

  // If not in protected routes, allow access (public pages)
  return true;
}

export default async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  
  // Skip auth check for public paths, API routes, and static files
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/public/") ||
    pathname.startsWith("/demo/") ||
    pathname === "/" ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/images/") ||
    pathname.startsWith("/fonts/") ||
    pathname.match(/\.\w+$/) // Files with extensions
  ) {
    return await updateSession(request);
  }

  try {
    // Refresh/propagate auth cookies first
    const response = await updateSession(request);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return response;
    }

    // Use cookie-aware server client in proxy context.
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {
          // Session cookie writes are handled by updateSession.
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      // Let unknown public paths reach Next.js so the branded 404 page can
      // decide whether to guide the visitor to sign in or elsewhere.
      if (!isProtectedRoute(pathname)) {
        return response;
      }

      return NextResponse.redirect(new URL("/auth/login", request.url));
    }

    // Fetch user profile to get role
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    // If profile fetch fails (DB error, network issue), allow access rather than redirect loop
    if (profileError) {
      console.warn(`[Proxy] Profile fetch error for user ${user.id}:`, profileError.message);
      return response;
    }

    const userRole = profile?.role;

    // If no profile yet (new user), allow through to attendance so they can see something
    if (!userRole) {
      if (pathname.startsWith("/dashboard/attendance") || pathname === "/dashboard") {
        return response;
      }
      return NextResponse.redirect(new URL("/dashboard/attendance", request.url));
    }

    // Check authorization for the requested route
    if (!isAuthorizedForRoute(userRole, pathname)) {
      console.warn(
        `[Authorization] User ${user.id} (role: ${userRole}) attempted unauthorized access to ${pathname}`
      );
      // Redirect to attendance (home) not login — login would cause a loop
      // Only redirect to login if user is truly not authenticated
      return NextResponse.redirect(new URL("/dashboard/attendance", request.url));
    }

    return response;
  } catch (error) {
    console.error("[Proxy] Error:", error);
    return await updateSession(request);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
