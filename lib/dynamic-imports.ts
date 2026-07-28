import dynamic from 'next/dynamic'

/**
 * Dynamic imports for heavy components to enable code-splitting
 * Reduces initial bundle size and improves Time to Interactive (TTI)
 */

export const DynamicLeaveManagementClient = dynamic(
  () => import('@/app/dashboard/leave-management/leave-management-client').then(mod => ({ default: mod.LeaveManagementClient })),
  { 
    ssr: true,
    loading: () => <div className="h-screen flex items-center justify-center text-slate-500">Loading leave management...</div>
  }
)

export const DynamicLeavePlanningClient = dynamic(
  () => import('@/app/dashboard/leave-planning/leave-planning-client').then(mod => ({ default: mod.LeavePlanningClient })),
  { 
    ssr: true,
    loading: () => <div className="h-screen flex items-center justify-center text-slate-500">Loading leave planning...</div>
  }
)

export const DynamicLoanAppPage = dynamic(
  () => import('@/app/dashboard/loan-app/page').then(mod => ({ default: mod.default })),
  { 
    ssr: true,
    loading: () => <div className="h-screen flex items-center justify-center text-slate-500">Loading loan application...</div>
  }
)

// For API response time optimization
export const createCachedApiResponse = (data: any, maxAge: number = 60) => {
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 10}`,
    },
  })
}
