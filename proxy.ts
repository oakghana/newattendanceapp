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
  "/dashboard/loan-app": ["admin", "director_hr", "manager_hr", "hr_officer", "loan_office", "hr_leave_office", "accounts"],
  
  // HR/Leave Management
  "/dashboard/leave-management": [
    "admin",
    "staff",
    "nsp",
    "intern",
    "it-admin",
    "department_head",
    "regional_manager",
    "loan_office",
    "accounts",
    "director_hr",
    "manager_hr",
    "hr_officer",
    "hr_leave_office",
    "hr_office",
    "audit_staff",
    "contract",
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
    "accounts",
    "director_hr",
    "manager_hr",
    "hr_officer",
    "hr_leave_office",
    "hr_office",
    "audit_staff",
    "contract",
  ],
  
  // Staff Dashboard
  "/dashboard": ["staff", "nsp", "intern", "it-admin", "department_head", "regional_manager", "admin", "loan_office", "accounts", "director_hr", "manager_hr", "hr_officer", "hr_leave_office", "audit_staff", "contract", "loan_committee", "committee"],
  
  // Regional Manager pages
  "/dashboard/regional": ["admin", "regional_manager"],
  "/dashboard/department": ["admin", "department_head", "regional_manager"],
  
  // Accounts pages
  "/dashboard/accounts": ["admin", "accounts"],
  
  // Audit pages
  "/dashboard/audit": ["admin", "audit_staff"],
};

function normalizeRole(role: string | null | undefined): string {
  return (role || "").toLowerCase().trim().replace(/[-\s]+/g, "_");
}

function isAuthorizedForRoute(userRole: string | null | undefined, pathname: string): boolean {
  const normalized = normalizeRole(userRole);
  
  // Check exact and pattern matches
  for (const [pattern, allowedRoles] of Object.entries(PROTECTED_ROUTES)) {
    // Exact match
    if (pathname === pattern) {
      return allowedRoles.some(r => normalizeRole(r) === normalized);
    }
    
    // Pattern match (pathname starts with pattern)
    if (pathname.startsWith(pattern + "/")) {
      return allowedRoles.some(r => normalizeRole(r) === normalized);
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
      return NextResponse.redirect(new URL("/auth/login", request.url));
    }

    // Fetch user profile to get role
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const userRole = profile?.role;

    // Check authorization for the requested route
    if (!isAuthorizedForRoute(userRole, pathname)) {
      console.warn(
        `[Authorization] User ${user.id} (role: ${userRole}) attempted unauthorized access to ${pathname}`
      );
      return NextResponse.redirect(new URL("/dashboard", request.url));
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
