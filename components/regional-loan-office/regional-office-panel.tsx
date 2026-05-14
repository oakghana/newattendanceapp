import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, Filter, RefreshCw, Eye, BarChart3 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface RegionalLoanOfficeData {
  id: string;
  request_number?: string;
  staff_number: string;
  staff_rank: string;
  loan_type_label?: string;
  leave_type_key?: string;
  requested_amount?: number;
  requested_days?: number;
  reason: string;
  status: string;
  submitted_at: string;
  created_at: string;
}

interface Summary {
  total: number;
  pending: number;
  approved: number;
  rejected?: number;
  byType?: Record<string, number>;
}

export function RegionalLoanOfficePanel() {
  const [activeTab, setActiveTab] = useState('loans');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loans, setLoans] = useState<RegionalLoanOfficeData[]>([]);
  const [leaves, setLeaves] = useState<RegionalLoanOfficeData[]>([]);
  const [loanSummary, setLoanSummary] = useState<Summary>({ total: 0, pending: 0, approved: 0 });
  const [leaveSummary, setLeaveSummary] = useState<Summary>({ total: 0, pending: 0, approved: 0 });
  const [error, setError] = useState<string | null>(null);

  const fetchLoans = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/loan/regional-office');
      if (!response.ok) throw new Error('Failed to fetch loans');
      const data = await response.json();
      setLoans(data.loans || []);
      setLoanSummary(data.summary || { total: 0, pending: 0, approved: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching loans');
      console.error('[v0] Loan fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchLeaves = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/leave/regional-office');
      if (!response.ok) throw new Error('Failed to fetch leaves');
      const data = await response.json();
      setLeaves(data.leaves || []);
      setLeaveSummary(data.summary || { total: 0, pending: 0, approved: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching leaves');
      console.error('[v0] Leave fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const exportData = async (type: 'loans' | 'leaves' | 'all', format: 'csv' | 'json') => {
    setExporting(true);
    try {
      const response = await fetch(
        `/api/regional-office/export?type=${type}&format=${format}`,
        { method: 'GET' }
      );

      if (!response.ok) throw new Error('Export failed');

      if (format === 'csv') {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `regional_${type}_report.csv`;
        a.click();
      } else {
        const data = await response.json();
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `regional_${type}_report.json`;
        a.click();
      }
    } catch (err) {
      console.error('[v0] Export error:', err);
      alert('Failed to export data');
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    fetchLoans();
  }, []);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab === 'leaves') {
      fetchLeaves();
    }
  };

  return (
    <div className="w-full space-y-6 p-6 max-w-7xl mx-auto">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Regional Data Management</h1>
        <p className="text-muted-foreground">View and export loan and leave requests from your regional locations</p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="loans" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Loan Requests
          </TabsTrigger>
          <TabsTrigger value="leaves" className="gap-2">
            <Eye className="h-4 w-4" />
            Leave Requests
          </TabsTrigger>
        </TabsList>

        <TabsContent value="loans" className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4">
              <div className="text-sm font-medium text-muted-foreground">Total Loans</div>
              <div className="text-2xl font-bold mt-1">{loanSummary.total}</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm font-medium text-muted-foreground">Pending</div>
              <div className="text-2xl font-bold text-amber-600 mt-1">{loanSummary.pending}</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm font-medium text-muted-foreground">Approved</div>
              <div className="text-2xl font-bold text-green-600 mt-1">{loanSummary.approved}</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm font-medium text-muted-foreground">Rejected</div>
              <div className="text-2xl font-bold text-red-600 mt-1">{loanSummary.rejected || 0}</div>
            </Card>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => fetchLoans()} disabled={loading} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button onClick={() => exportData('loans', 'csv')} disabled={exporting} size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
            <Button onClick={() => exportData('loans', 'json')} disabled={exporting} variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export JSON
            </Button>
          </div>

          {/* Data Table */}
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-2 text-left font-medium">Request #</th>
                    <th className="px-4 py-2 text-left font-medium">Staff</th>
                    <th className="px-4 py-2 text-left font-medium">Loan Type</th>
                    <th className="px-4 py-2 text-left font-medium">Amount</th>
                    <th className="px-4 py-2 text-left font-medium">Status</th>
                    <th className="px-4 py-2 text-left font-medium">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {loans.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                        No loan requests found
                      </td>
                    </tr>
                  ) : (
                    loans.slice(0, 10).map((loan) => (
                      <tr key={loan.id} className="border-b hover:bg-muted/50">
                        <td className="px-4 py-2 font-medium">{loan.request_number}</td>
                        <td className="px-4 py-2">{loan.staff_number} - {loan.staff_rank}</td>
                        <td className="px-4 py-2">{loan.loan_type_label}</td>
                        <td className="px-4 py-2">GHS {loan.requested_amount?.toLocaleString()}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            loan.status === 'pending_hod' ? 'bg-amber-100 text-amber-800' :
                            loan.status === 'hr_office_approved' ? 'bg-green-100 text-green-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {loan.status}
                          </span>
                        </td>
                        <td className="px-4 py-2">{new Date(loan.submitted_at).toLocaleDateString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {loans.length > 10 && (
            <p className="text-sm text-muted-foreground text-center py-2">
              Showing 10 of {loans.length} records. Export to see all.
            </p>
          )}
        </TabsContent>

        <TabsContent value="leaves" className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4">
              <div className="text-sm font-medium text-muted-foreground">Total Leaves</div>
              <div className="text-2xl font-bold mt-1">{leaveSummary.total}</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm font-medium text-muted-foreground">Pending</div>
              <div className="text-2xl font-bold text-amber-600 mt-1">{leaveSummary.pending}</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm font-medium text-muted-foreground">Approved</div>
              <div className="text-2xl font-bold text-green-600 mt-1">{leaveSummary.approved}</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm font-medium text-muted-foreground">Rejected</div>
              <div className="text-2xl font-bold text-red-600 mt-1">{leaveSummary.rejected || 0}</div>
            </Card>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => fetchLeaves()} disabled={loading} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button onClick={() => exportData('leaves', 'csv')} disabled={exporting} size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
            <Button onClick={() => exportData('leaves', 'json')} disabled={exporting} variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export JSON
            </Button>
          </div>

          {/* Data Table */}
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-2 text-left font-medium">Staff</th>
                    <th className="px-4 py-2 text-left font-medium">Leave Type</th>
                    <th className="px-4 py-2 text-left font-medium">Start Date</th>
                    <th className="px-4 py-2 text-left font-medium">End Date</th>
                    <th className="px-4 py-2 text-left font-medium">Days</th>
                    <th className="px-4 py-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {leaves.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                        No leave requests found
                      </td>
                    </tr>
                  ) : (
                    leaves.slice(0, 10).map((leave) => (
                      <tr key={leave.id} className="border-b hover:bg-muted/50">
                        <td className="px-4 py-2 font-medium">{leave.staff_number}</td>
                        <td className="px-4 py-2">{leave.leave_type_key}</td>
                        <td className="px-4 py-2">{leave.created_at}</td>
                        <td className="px-4 py-2">{leave.submitted_at}</td>
                        <td className="px-4 py-2">{leave.requested_days}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            leave.status === 'pending_hod_review' ? 'bg-amber-100 text-amber-800' :
                            leave.status === 'hr_office_approved' ? 'bg-green-100 text-green-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {leave.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {leaves.length > 10 && (
            <p className="text-sm text-muted-foreground text-center py-2">
              Showing 10 of {leaves.length} records. Export to see all.
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
