'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CheckCircle, Eye, UserCheck, FileText, ClipboardCheck, ShieldCheck } from 'lucide-react'
import { HODReviewSection } from './hod-review-section'
import { AllRequestsViewSection } from './all-requests-view-section'
import { PaymentAdviceClient } from './payment-advice-client'
import { HrExecutiveApprovalDashboard } from './hr-executive-approval-dashboard'
import { HrApprovalsTab } from './hr-approvals-tab'

interface LeaveCenterWithTabsProps {
  userDepartmentId: string
  userName?: string
}

export function LeaveCenterWithTabs({ userDepartmentId, userName }: LeaveCenterWithTabsProps) {
  const [activeTab, setActiveTab] = useState('hr-approvals')

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold mb-1">Leave Center</h2>
        <p className="text-sm text-muted-foreground">
          Manage leave requests and review pending approvals
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5 h-auto p-1 gap-1 rounded-xl shadow-sm [background:white] border border-slate-200">
          {(
            [
              { value: "hr-approvals",   icon: <ShieldCheck className="h-4 w-4 shrink-0" />,   label: "HR Approvals" },
              { value: "hod-review",     icon: <UserCheck className="h-4 w-4 shrink-0" />,     label: "HOD" },
              { value: "all-requests",   icon: <Eye className="h-4 w-4 shrink-0" />,            label: "All" },
              { value: "payment-advice", icon: <FileText className="h-4 w-4 shrink-0" />,       label: "Payment" },
              { value: "hr-approve",     icon: <ClipboardCheck className="h-4 w-4 shrink-0" />, label: "Defer/Recall" },
            ] as const
          ).map(({ value, icon, label }) => (
            <TabsTrigger
              key={value}
              value={value}
              className={[
                "flex items-center gap-1 rounded-lg py-2 text-xs font-medium transition-all duration-200",
                "text-slate-500",                                     // inactive text
                "data-[state=inactive]:bg-transparent",               // inactive bg
                "data-[state=active]:!bg-orange-500",                 // active bg — ! overrides shadcn vars
                "data-[state=active]:!text-white",                    // active text
                "data-[state=active]:!shadow-md",                     // active shadow
                "hover:bg-slate-100 hover:text-slate-700",            // hover state
              ].join(" ")}
            >
              {icon}
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{label.slice(0, 3)}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="hr-approvals" className="space-y-4">
          <HrApprovalsTab />
        </TabsContent>

        <TabsContent value="hod-review" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-blue-600" />
                Pending HOD Review
              </CardTitle>
              <CardDescription>
                Leave requests from your department pending your review and approval
              </CardDescription>
            </CardHeader>
          </Card>

          <HODReviewSection userDepartmentId={userDepartmentId} />
        </TabsContent>

        <TabsContent value="all-requests" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="h-5 w-5 text-green-600" />
                All Leave Requests
              </CardTitle>
              <CardDescription>
                View-only access to all leave requests across the organization with status and history
              </CardDescription>
            </CardHeader>
          </Card>

          <AllRequestsViewSection />
        </TabsContent>

        <TabsContent value="payment-advice" className="space-y-4">
          <PaymentAdviceClient userRole="hr_executive" />
        </TabsContent>

        <TabsContent value="hr-approve" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-orange-600" />
                Defer / Recall
              </CardTitle>
              <CardDescription>
                Review and act on leave deferment and recall requests, and approve HR-forwarded leave memos
              </CardDescription>
            </CardHeader>
          </Card>

          <HrExecutiveApprovalDashboard />
        </TabsContent>
      </Tabs>
    </div>
  )
}
