'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CheckCircle, Eye, UserCheck } from 'lucide-react'
import { HODReviewSection } from './hod-review-section'
import { AllRequestsViewSection } from './all-requests-view-section'

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
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="hod-review" className="flex items-center gap-2">
            <UserCheck className="h-4 w-4" />
            <span className="hidden sm:inline">HOD Review</span>
            <span className="sm:hidden">HOD</span>
          </TabsTrigger>
          <TabsTrigger value="all-requests" className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            <span className="hidden sm:inline">All Requests</span>
            <span className="sm:hidden">View</span>
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
      </Tabs>
    </div>
  )
}
