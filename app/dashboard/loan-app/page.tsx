import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  BarChart3,
  ClipboardList,
  DollarSign,
  FileText,
  Plus,
  TrendingUp,
  CheckCircle,
  Clock,
  AlertCircle,
} from "lucide-react"

export const metadata = {
  title: "Loan Administration | QCC Staff Welfare",
  description: "Manage staff loans, approvals, and repayment tracking",
}

interface LoanStats {
  total_requests: number
  pending_approval: number
  approved: number
  rejected: number
  total_amount: number
  recovered_amount: number
}

interface LoanRequest {
  id: string
  request_number: string
  staff_name: string
  loan_type: string
  amount: number
  status: string
  created_at: string
  approved_date?: string
}

async function getLoanStats(supabase: any): Promise<LoanStats> {
  try {
    const { data, error } = await supabase
      .from("loan_requests")
      .select("id, status, requested_amount, fixed_amount")

    if (error) throw error

    const stats: LoanStats = {
      total_requests: 0,
      pending_approval: 0,
      approved: 0,
      rejected: 0,
      total_amount: 0,
      recovered_amount: 0,
    }

    if (data && Array.isArray(data)) {
      stats.total_requests = data.length
      data.forEach((loan: any) => {
        const amount = loan.fixed_amount || loan.requested_amount || 0
        stats.total_amount += amount

        if (loan.status === "pending_hod" || loan.status === "sent_to_accounts") {
          stats.pending_approval++
        } else if (
          loan.status === "approved_director" ||
          loan.status === "awaiting_committee" ||
          loan.status === "staff_receiving_funds"
        ) {
          stats.approved++
        } else if (loan.status === "rejected") {
          stats.rejected++
        }
      })
    }

    return stats
  } catch (err) {
    console.error("[v0] Error fetching loan stats:", err)
    return {
      total_requests: 0,
      pending_approval: 0,
      approved: 0,
      rejected: 0,
      total_amount: 0,
      recovered_amount: 0,
    }
  }
}

async function getRecentLoans(supabase: any): Promise<LoanRequest[]> {
  try {
    const { data, error } = await supabase
      .from("loan_requests")
      .select(
        `
        id,
        request_number,
        user_id,
        loan_type_label,
        requested_amount,
        fixed_amount,
        status,
        created_at,
        updated_at
      `,
      )
      .order("created_at", { ascending: false })
      .limit(10)

    if (error) throw error

    const userIds = [...new Set((data || []).map((d: any) => d.user_id))]
    let staffNames: Record<string, string> = {}

    if (userIds.length > 0) {
      const { data: staffData } = await supabase
        .from("user_profiles")
        .select("id, first_name, last_name")
        .in("id", userIds)

      if (staffData) {
        staffData.forEach((staff: any) => {
          staffNames[staff.id] = `${staff.first_name} ${staff.last_name}`
        })
      }
    }

    return (data || []).map((loan: any) => ({
      id: loan.id,
      request_number: loan.request_number,
      staff_name: staffNames[loan.user_id] || "Unknown",
      loan_type: loan.loan_type_label || "General Loan",
      amount: loan.fixed_amount || loan.requested_amount || 0,
      status: loan.status,
      created_at: loan.created_at,
      approved_date: loan.updated_at,
    }))
  } catch (err) {
    console.error("[v0] Error fetching recent loans:", err)
    return []
  }
}

function getStatusBadge(status: string) {
  const statusConfig: Record<
    string,
    { color: string; label: string; icon: React.ReactNode }
  > = {
    pending_hod: {
      color: "bg-yellow-100 text-yellow-800",
      label: "Pending HOD",
      icon: <Clock className="h-3 w-3" />,
    },
    hod_approved: {
      color: "bg-blue-100 text-blue-800",
      label: "HOD Approved",
      icon: <CheckCircle className="h-3 w-3" />,
    },
    sent_to_accounts: {
      color: "bg-purple-100 text-purple-800",
      label: "Accounts Review",
      icon: <FileText className="h-3 w-3" />,
    },
    approved_director: {
      color: "bg-green-100 text-green-800",
      label: "Director Approved",
      icon: <CheckCircle className="h-3 w-3" />,
    },
    staff_receiving_funds: {
      color: "bg-emerald-100 text-emerald-800",
      label: "Funds Released",
      icon: <DollarSign className="h-3 w-3" />,
    },
    rejected: {
      color: "bg-red-100 text-red-800",
      label: "Rejected",
      icon: <AlertCircle className="h-3 w-3" />,
    },
  }

  const config = statusConfig[status] || {
    color: "bg-slate-100 text-slate-800",
    label: status,
    icon: <Clock className="h-3 w-3" />,
  }

  return (
    <Badge className={`${config.color} flex items-center gap-1`}>
      {config.icon}
      {config.label}
    </Badge>
  )
}

export default async function LoanAdminPage() {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("id, role, first_name, last_name")
    .eq("id", user.id)
    .single()

  const allowedRoles = [
    "admin",
    "loan_office",
    "accounts_executive",
    "director_hr",
    "manager_hr",
  ]
  if (!profile || !allowedRoles.includes(profile.role)) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600 font-semibold">Access Denied</p>
        <p className="text-slate-500 text-sm mt-2">
          You do not have permission to access the loan administration page.
        </p>
      </div>
    )
  }

  const stats = await getLoanStats(supabase)
  const recentLoans = await getRecentLoans(supabase)

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            QCC Loan Processing Hub
          </h1>
          <p className="text-slate-600 mt-1">
            Welcome back, {profile.first_name}. Manage staff loans and approvals.
          </p>
        </div>
        <Button className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="h-4 w-4 mr-2" />
          New Loan Request
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-blue-600" />
              Total Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {stats.total_requests}
            </div>
            <p className="text-xs text-slate-500 mt-1">All loan requests</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              Pending Approval
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {stats.pending_approval}
            </div>
            <p className="text-xs text-slate-500 mt-1">Awaiting review</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-600" />
              Approved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {stats.approved}
            </div>
            <p className="text-xs text-slate-500 mt-1">Approved requests</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-600" />
              Total Value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              GHc{(stats.total_amount / 1000).toFixed(1)}K
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Total loan amount
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="pending">Pending Approvals</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Loan Requests</CardTitle>
              <CardDescription>
                Latest 10 loan requests across the organization
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recentLoans.length === 0 ? (
                <p className="text-slate-500 py-8 text-center">
                  No loan requests found
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-3 px-4 font-semibold text-slate-700">
                          Request #
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-700">
                          Staff Name
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-700">
                          Loan Type
                        </th>
                        <th className="text-right py-3 px-4 font-semibold text-slate-700">
                          Amount
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-700">
                          Status
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-slate-700">
                          Date
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentLoans.map((loan) => (
                        <tr
                          key={loan.id}
                          className="border-b border-slate-100 hover:bg-slate-50"
                        >
                          <td className="py-3 px-4 font-mono text-slate-600">
                            {loan.request_number}
                          </td>
                          <td className="py-3 px-4 text-slate-900">
                            {loan.staff_name}
                          </td>
                          <td className="py-3 px-4 text-slate-700">
                            {loan.loan_type}
                          </td>
                          <td className="py-3 px-4 text-right font-semibold text-slate-900">
                            GHc{loan.amount.toLocaleString()}
                          </td>
                          <td className="py-3 px-4">
                            {getStatusBadge(loan.status)}
                          </td>
                          <td className="py-3 px-4 text-slate-600">
                            {new Date(loan.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pending Approvals</CardTitle>
              <CardDescription>
                Loan requests awaiting your review and approval
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentLoans
                  .filter(
                    (loan) =>
                      loan.status === "pending_hod" ||
                      loan.status === "sent_to_accounts",
                  )
                  .map((loan) => (
                    <div
                      key={loan.id}
                      className="border border-slate-200 rounded-lg p-4 flex items-center justify-between"
                    >
                      <div className="flex-1">
                        <div className="font-semibold text-slate-900">
                          {loan.request_number} - {loan.staff_name}
                        </div>
                        <div className="text-sm text-slate-600 mt-1">
                          {loan.loan_type} • GHc
                          {loan.amount.toLocaleString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {getStatusBadge(loan.status)}
                        <Button variant="outline" size="sm">
                          Review
                        </Button>
                      </div>
                    </div>
                  ))
                  .slice(0, 5)}
              </div>
              {
                recentLoans.filter(
                  (loan) =>
                    loan.status === "pending_hod" ||
                    loan.status === "sent_to_accounts",
                ).length === 0 && (
                  <p className="text-slate-500 py-8 text-center">
                    No pending approvals
                  </p>
                )
              }
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-blue-600" />
                Loan Performance Metrics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <div className="text-sm text-slate-600 font-medium">
                    Approval Rate
                  </div>
                  <div className="text-3xl font-bold text-slate-900 mt-2">
                    {stats.total_requests > 0
                      ? Math.round(
                          (stats.approved / stats.total_requests) * 100,
                        )
                      : 0}
                    %
                  </div>
                </div>
                <div>
                  <div className="text-sm text-slate-600 font-medium">
                    Rejection Rate
                  </div>
                  <div className="text-3xl font-bold text-red-600 mt-2">
                    {stats.total_requests > 0
                      ? Math.round(
                          (stats.rejected / stats.total_requests) * 100,
                        )
                      : 0}
                    %
                  </div>
                </div>
                <div>
                  <div className="text-sm text-slate-600 font-medium">
                    Pending Requests
                  </div>
                  <div className="text-3xl font-bold text-amber-600 mt-2">
                    {stats.pending_approval}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
