'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Calculator,
  TrendingUp,
  DollarSign,
  Clock,
  Percent,
} from 'lucide-react'
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert'

interface CalculationSummaryProps {
  loanAmount: number
  recoveryPeriodMonths: number
  annualSalary: number
  monthlyRepayment: number
  totalRecoveryValue: number
  affordabilityPercentage: number
  affordabilityStatus: 'affordable' | 'at_risk' | 'unaffordable'
  calculationMemo?: string
  showMemo?: boolean
}

export function FDCalculationSummary({
  loanAmount,
  recoveryPeriodMonths,
  annualSalary,
  monthlyRepayment,
  totalRecoveryValue,
  affordabilityPercentage,
  affordabilityStatus,
  calculationMemo,
  showMemo = false,
}: CalculationSummaryProps) {
  const monthlySalary = annualSalary / 12

  const getStatusBadge = () => {
    switch (affordabilityStatus) {
      case 'affordable':
        return (
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <Badge variant="outline" className="bg-green-50 border-green-200 text-green-900">
              Affordable
            </Badge>
          </div>
        )
      case 'at_risk':
        return (
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <Badge variant="outline" className="bg-amber-50 border-amber-200 text-amber-900">
              At Risk
            </Badge>
          </div>
        )
      case 'unaffordable':
        return (
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <Badge variant="outline" className="bg-red-50 border-red-200 text-red-900">
              Unaffordable
            </Badge>
          </div>
        )
    }
  }

  const getStatusAlert = () => {
    switch (affordabilityStatus) {
      case 'affordable':
        return (
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-900">Affordable FD Request</AlertTitle>
            <AlertDescription className="text-green-800">
              Monthly repayment of GHc {monthlyRepayment.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })} represents {affordabilityPercentage.toFixed(2)}% of monthly salary. This is sustainable.
            </AlertDescription>
          </Alert>
        )
      case 'at_risk':
        return (
          <Alert className="border-amber-200 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-900">At Risk - Constrained Capacity</AlertTitle>
            <AlertDescription className="text-amber-800">
              Monthly repayment of GHc {monthlyRepayment.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })} represents {affordabilityPercentage.toFixed(2)}% of monthly salary. The staff&apos;s repayment capacity is limited.
            </AlertDescription>
          </Alert>
        )
      case 'unaffordable':
        return (
          <Alert className="border-red-200 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertTitle className="text-red-900">Unaffordable - High Risk</AlertTitle>
            <AlertDescription className="text-red-800">
              Monthly repayment of GHc {monthlyRepayment.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })} represents {affordabilityPercentage.toFixed(2)}% of monthly salary. The staff may struggle significantly with repayment.
            </AlertDescription>
          </Alert>
        )
    }
  }

  const formatCurrency = (value: number) =>
    value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })

  return (
    <div className="space-y-4">
      {/* Status Alert */}
      {getStatusAlert()}

      {/* Main Summary Card */}
      <Card className="border-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-blue-600" />
              <div>
                <CardTitle>FD Calculation Summary</CardTitle>
                <CardDescription>Auto-calculated values for this FD request</CardDescription>
              </div>
            </div>
            {getStatusBadge()}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Loan Amount */}
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Loan Amount</span>
                <DollarSign className="h-4 w-4 text-blue-600" />
              </div>
              <p className="text-2xl font-bold text-blue-900">
                GHc {formatCurrency(loanAmount)}
              </p>
              <p className="text-xs text-blue-600 mt-1">Requested amount</p>
            </div>

            {/* Recovery Period */}
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-lg border border-purple-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Recovery Period</span>
                <Clock className="h-4 w-4 text-purple-600" />
              </div>
              <p className="text-2xl font-bold text-purple-900">{recoveryPeriodMonths}</p>
              <p className="text-xs text-purple-600 mt-1">months</p>
            </div>

            {/* Monthly Repayment */}
            <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg border border-green-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Monthly Repayment</span>
                <TrendingUp className="h-4 w-4 text-green-600" />
              </div>
              <p className="text-2xl font-bold text-green-900">
                GHc {formatCurrency(monthlyRepayment)}
              </p>
              <p className="text-xs text-green-600 mt-1">per month</p>
            </div>

            {/* Total Recovery Value */}
            <div className="bg-gradient-to-br from-amber-50 to-amber-100 p-4 rounded-lg border border-amber-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Total Recovery</span>
                <DollarSign className="h-4 w-4 text-amber-600" />
              </div>
              <p className="text-2xl font-bold text-amber-900">
                GHc {formatCurrency(totalRecoveryValue)}
              </p>
              <p className="text-xs text-amber-600 mt-1">full recovery value</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Affordability Analysis Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Affordability Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Annual Salary */}
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-sm text-gray-600 mb-2">Annual Salary</p>
              <p className="text-2xl font-bold text-gray-900">
                GHc {formatCurrency(annualSalary)}
              </p>
            </div>

            {/* Monthly Salary */}
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-sm text-gray-600 mb-2">Monthly Salary</p>
              <p className="text-2xl font-bold text-gray-900">
                GHc {formatCurrency(monthlySalary)}
              </p>
            </div>

            {/* Affordability Ratio */}
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-600">Affordability Ratio</p>
                <Percent className="h-4 w-4 text-gray-600" />
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {affordabilityPercentage.toFixed(2)}%
              </p>
              <p className="text-xs text-gray-500 mt-1">
                of monthly salary
              </p>
            </div>
          </div>

          {/* Affordability Guidelines */}
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm font-semibold text-blue-900 mb-2">Affordability Guidelines:</p>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• <span className="font-medium">Affordable (≤ 30%)</span>: Sustainable repayment capacity</li>
              <li>• <span className="font-medium">At Risk (31-50%)</span>: Limited repayment capacity</li>
              <li>• <span className="font-medium">Unaffordable (&gt; 50%)</span>: High risk of default</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Full Calculation Memo */}
      {showMemo && calculationMemo && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Detailed Calculation Report</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono bg-gray-50 p-4 rounded-lg border border-gray-200 max-h-64 overflow-y-auto">
              {calculationMemo}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
