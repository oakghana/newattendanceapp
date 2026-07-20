'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CheckCircle, Eye, UserCheck, FileText, Clock, RotateCcw } from 'lucide-react'
import { HODReviewSection } from './hod-review-section'
import { AllRequestsViewSection } from './all-requests-view-section'
import { PaymentAdviceClient } from './payment-advice-client'
import { HRDefermentRecallManagement } from './hr-deferment-recall-management'

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
        <TabsList className="grid w-full grid-cols-5 h-auto p-1 gap-1 bg-muted rounded-xl">
          <TabsTrigger
            value="hod-review"
            className="flex items-center gap-1 rounded-lg py-2 text-xs font-medium transition-all data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow-md"
          >
            <UserCheck className="h-4 w-4" />
            <span>HOD</span>
          </TabsTrigger>
          <TabsTrigger
            value="all-requests"
            className="flex items-center gap-1 rounded-lg py-2 text-xs font-medium transition-all data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow-md"
          >
            <Eye className="h-4 w-4" />
            <span>All</span>
          </TabsTrigger>
          <TabsTrigger
            value="payment-advice"
            className="flex items-center gap-1 rounded-lg py-2 text-xs font-medium transition-all data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow-md"
          >
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Payment</span>
            <span className="sm:hidden">Pay</span>
          </TabsTrigger>
          <TabsTrigger
            value="deferments"
            className="flex items-center gap-1 rounded-lg py-2 text-xs font-medium transition-all data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow-md"
          >
            <Clock className="h-4 w-4" />
            <span>Defer</span>
          </TabsTrigger>
          <TabsTrigger
            value="recalls"
            className="flex items-center gap-1 rounded-lg py-2 text-xs font-medium transition-all data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow-md"
          >
            <RotateCcw className="h-4 w-4" />
            <span>Recall</span>
          </TabsTrigger>
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
      </Tabs>
    </div>
  )
}
