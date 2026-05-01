import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"

/**
 * Middleware to enforce role-based access control
 * Prevents users from accessing pages they're not authorized for via URL manipulation
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Define route protection rules: [pathPattern] => [allowedRoles]
const PROTECTED_ROUTES: Record<string, string[]> = {
  // Admin pages
  "/admin": ["admin"],
  "/dashboard/admin": ["admin"],
  "/dashboard/settings": ["admin"],
  "/dashboard/loan-app": ["admin", "director_hr", "manager_hr", "hr_officer", "loan_office", "accounts"],
  
  // HR/Leave Management
  "/dashboard/leave-management": ["admin", "hr_leave_office", "hr_officer", "manager_hr", "director_hr", "department_head", "regional_manager"],
  "/dashboard/leave-planning": ["admin", "hr_leave_office", "hr_officer", "manager_hr", "director_hr"],
  
  // Staff Dashboard
  "/dashboard": ["staff", "nsp", "intern", "it-admin", "department_head", "regional_manager", "admin", "loan_office", "accounts", "director_hr", "manager_hr", "hr_officer", "hr_leave_office", "audit_staff", "contract", "loan_committee", "committee"],
  
  // Regional Manager pages
  "/dashboard/regional": ["admin", "regional_manager"],
  "/dashboard/department": ["admin", "department_head", "regional_manager"],
  
  // Accounts pages
  "/dashboard/accounts": ["admin", "accounts"],
  
  // Audit pages
  "/dashboard/audit": ["admin", "audit_staff"],
}

function normalizeRole(role: string | null | undefined): string {
  return (role || "").toLowerCase().trim().replace(/[-\s]+/g, "_")
}

function isAuthorizedForRoute(userRole: string | null | undefined, pathname: string): boolean {
  const normalized = normalizeRole(userRole)
  
  // Check exact and pattern matches
  for (const [pattern, allowedRoles] of Object.entries(PROTECTED_ROUTES)) {
    // Exact match
    if (pathname === pattern) {
      return allowedRoles.some(r => normalizeRole(r) === normalized)
    }
    
    // Pattern match (pathname starts with pattern)
    if (pathname.startsWith(pattern + "/")) {
      return allowedRoles.some(r => normalizeRole(r) === normalized)
    }
  }
  
  // If not in protected routes, allow access (public pages)
  return true
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  
  // Skip middleware for public paths, API routes, and static files
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/public/") ||
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/auth" ||
    pathname.startsWith("/images/") ||
    pathname.startsWith("/fonts/") ||
    pathname.match(/\.\w+$/) // Files with extensions
  ) {
    return NextResponse.next()
  }

  try {
    // Get user session
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.user) {
      // Redirect unauthenticated users to login
      return NextResponse.redirect(new URL("/login", request.url))
    }

    // Fetch user profile to get role
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", session.user.id)
      .maybeSingle()

    const userRole = profile?.role

    // Check authorization for the requested route
    if (!isAuthorizedForRoute(userRole, pathname)) {
      console.warn(
        `[Authorization] User ${session.user.id} (role: ${userRole}) attempted unauthorized access to ${pathname}`
      )

      // Redirect to dashboard instead of showing error
      return NextResponse.redirect(new URL("/dashboard", request.url))
    }

    return NextResponse.next()
  } catch (error) {
    console.error("[Middleware] Authorization check error:", error)
    // On error, allow the request to proceed (will be caught by page-level checks)
    return NextResponse.next()
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|public).*)",
  ],
}
