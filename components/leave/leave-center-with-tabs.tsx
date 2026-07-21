'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CheckCircle, Eye, UserCheck, FileText, Clock, RotateCcw, ClipboardCheck } from 'lucide-react'
import { HODReviewSection } from './hod-review-section'
import { AllRequestsViewSection } from './all-requests-view-section'
import { PaymentAdviceClient } from './payment-advice-client'
import { HRDefermentRecallManagement } from './hr-deferment-recall-management'
import { HrExecutiveApprovalDashboard } from './hr-executive-approval-dashboard'

interface LeaveCenterWithTabsProps {
  userDepartmentId: string
  userName?: string
}

export function LeaveCenterWithTabs({ userDepartmentId, userName }: LeaveCenterWithTabsProps) {
  const [activeTab, setActiveTab] = useState('hod-review')

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold mb-1">Leave Center</h2>
        <p className="text-sm text-muted-foreground">
          Manage leave requests and review pending approvals
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-6 h-auto p-1 gap-1 rounded-xl shadow-sm [background:white] border border-slate-200">
          {(
            [
              { value: "hod-review",     icon: <UserCheck className="h-4 w-4 shrink-0" />,    label: "HOD" },
              { value: "all-requests",   icon: <Eye className="h-4 w-4 shrink-0" />,           label: "All" },
              { value: "payment-advice", icon: <FileText className="h-4 w-4 shrink-0" />,      label: "Payment" },
              { value: "deferments",     icon: <Clock className="h-4 w-4 shrink-0" />,         label: "Defer" },
              { value: "recalls",        icon: <RotateCcw className="h-4 w-4 shrink-0" />,     label: "Recall" },
              { value: "hr-approve",     icon: <ClipboardCheck className="h-4 w-4 shrink-0" />,label: "HR Approve" },
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

        <TabsContent value="deferments" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-600" />
                Deferments & Recalls
              </CardTitle>
              <CardDescription>
                Review and approve leave deferment and recall requests
              </CardDescription>
            </CardHeader>
          </Card>

          <HRDefermentRecallManagement />
        </TabsContent>

        <TabsContent value="recalls" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <RotateCcw className="h-5 w-5 text-purple-600" />
                Recalls
              </CardTitle>
              <CardDescription>
                Manage leave recall requests from the organization
              </CardDescription>
            </CardHeader>
          </Card>

          <HRDefermentRecallManagement />
        </TabsContent>

        <TabsContent value="hr-approve" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-orange-600" />
                HR Executive Approvals
              </CardTitle>
              <CardDescription>
                All leave requests submitted by the Leave Office for HR Executive approval — view, approve, and download approved memos
              </CardDescription>
            </CardHeader>
          </Card>

          <HrExecutiveApprovalDashboard />
        </TabsContent>
      </Tabs>
    </div>
  )
}
