'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Calendar, DollarSign, TrendingDown, CheckCircle } from 'lucide-react'

interface CalculationData {
  loan_amount: number
  recovery_period_months: number
  monthly_repayment_amount: number
  total_recovery_value: number
  repayment_percentage: number
  is_affordable: boolean
  affordability_status: string
  annual_salary: number
  monthly_salary: number
  calculated_at: string
}

export function FDCalculationSummary({ calculation }: { calculation: CalculationData }) {
  return (
    <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              FD Calculation Results
            </CardTitle>
            <CardDescription>Real-time calculations based on entered values</CardDescription>
          </div>
          <Badge variant={calculation.is_affordable ? 'default' : 'destructive'}>
            {calculation.affordability_status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Input Values */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm text-gray-700">Input Values</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-2 bg-white rounded-lg">
                <span className="text-sm text-gray-600">Loan Amount:</span>
                <span className="font-semibold">GHc {calculation.loan_amount?.toFixed(2) || '0.00'}</span>
              </div>
              <div className="flex justify-between items-center p-2 bg-white rounded-lg">
                <span className="text-sm text-gray-600">Recovery Period:</span>
                <span className="font-semibold">{calculation.recovery_period_months} months</span>
              </div>
              <div className="flex justify-between items-center p-2 bg-white rounded-lg">
                <span className="text-sm text-gray-600">Annual Salary:</span>
                <span className="font-semibold">GHc {calculation.annual_salary?.toFixed(2) || '0.00'}</span>
              </div>
              <div className="flex justify-between items-center p-2 bg-white rounded-lg">
                <span className="text-sm text-gray-600">Monthly Salary:</span>
                <span className="font-semibold">GHc {calculation.monthly_salary?.toFixed(2) || '0.00'}</span>
              </div>
            </div>
          </div>

          {/* Calculated Values */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm text-gray-700">Calculated Values</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-white rounded-lg border-2 border-green-200">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-green-600" />
                  <span className="text-sm text-gray-600">Monthly Repayment:</span>
                </div>
                <span className="font-bold text-lg text-green-700">
                  GHc {calculation.monthly_repayment_amount?.toFixed(2) || '0.00'}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-white rounded-lg border-2 border-blue-200">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-blue-600" />
                  <span className="text-sm text-gray-600">Total Recovery Value:</span>
                </div>
                <span className="font-bold text-lg text-blue-700">
                  GHc {calculation.total_recovery_value?.toFixed(2) || '0.00'}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-white rounded-lg">
                <span className="text-sm text-gray-600">% of Monthly Salary:</span>
                <div className="text-right">
                  <div className="font-bold text-lg">{calculation.repayment_percentage?.toFixed(2) || '0.00'}%</div>
                  <div className="text-xs text-gray-500">
                    {calculation.repayment_percentage <= 30 ? '✓ Within Limits' : '⚠ Exceeds 30%'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Calculation Memo */}
        <div className="mt-6 p-4 bg-white rounded-lg border border-gray-200">
          <h3 className="font-semibold text-sm text-gray-700 mb-3">Calculation Memo</h3>
          <pre className="text-xs text-gray-600 overflow-x-auto bg-gray-50 p-3 rounded font-mono whitespace-pre-wrap">
            {calculation.calculation_memo || 'No memo available'}
          </pre>
        </div>

        {/* Timestamp */}
        <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
          <Calendar className="h-3 w-3" />
          Calculated at {new Date(calculation.calculated_at || '').toLocaleString()}
        </div>
      </CardContent>
    </Card>
  )
}
