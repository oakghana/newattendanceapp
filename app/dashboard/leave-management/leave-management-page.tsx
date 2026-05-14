'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Calendar, Download, RefreshCw, FileText, X } from 'lucide-react'

export function LeaveManagementPage() {
  const [activeTab, setActiveTab] = useState('management')
  const [showBanner, setShowBanner] = useState(true)

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      {/* Pink Info Banner */}
      {showBanner && (
        <Alert className="mb-6 border-pink-300 bg-pink-50 flex items-center justify-between">
          <div>
            <p className="font-semibold text-pink-900">New Flash: Loan & Leave Administration Upgrade</p>
            <AlertDescription className="text-pink-700 text-sm">
              We're introducing a smarter system with stronger approval tracking and improved manager notifications to enhance loan and leave administration. Stay tuned for the rollout soon.
            </AlertDescription>
          </div>
          <button onClick={() => setShowBanner(false)} className="text-pink-500 hover:text-pink-700">
            <X className="w-5 h-5" />
          </button>
        </Alert>
      )}

      {/* Tab Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex gap-3 mb-6 bg-transparent p-0">
          <TabsTrigger
            value="management"
            className="px-6 py-2 rounded-full border-2 border-orange-400 bg-orange-400 text-white font-semibold hover:bg-orange-500 data-[state=active]:bg-orange-500"
          >
            <FileText className="w-4 h-4 mr-2" />
            Leave Management
          </TabsTrigger>
          <TabsTrigger
            value="hr-leave"
            className="px-6 py-2 rounded-full border-2 border-orange-400 bg-orange-400 text-white font-semibold hover:bg-orange-500 data-[state=active]:bg-orange-500"
          >
            <FileText className="w-4 h-4 mr-2" />
            Leave & HR Leave
          </TabsTrigger>
          <TabsTrigger
            value="analytics"
            className="px-6 py-2 rounded-full border-2 border-orange-400 bg-orange-400 text-white font-semibold hover:bg-orange-500 data-[state=active]:bg-orange-500"
          >
            <Calendar className="w-4 h-4 mr-2" />
            Leave Analytics
          </TabsTrigger>
          <TabsTrigger
            value="balance"
            className="px-6 py-2 rounded-full border-2 border-blue-400 bg-blue-400 text-white font-semibold hover:bg-blue-500 data-[state=active]:bg-blue-500"
          >
            <Calendar className="w-4 h-4 mr-2" />
            Balance & Calendar
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Leave Management */}
        <TabsContent value="management" className="space-y-6">
          {/* Dark Blue Workspace Header */}
          <div className="bg-blue-900 rounded-lg p-8 text-white">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-4 h-4" />
                  <span className="text-xs font-semibold tracking-wider">LEAVE WORKSPACE</span>
                </div>
                <h1 className="text-3xl font-bold">Leave Management</h1>
                <p className="text-sm text-blue-200 mt-1">Review leave activity, track submissions, and move quickly between personal requests and approvals.</p>
              </div>
              <Button variant="outline" size="sm" className="bg-blue-800 border-blue-600 text-white hover:bg-blue-700">
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>

            {/* Role Badges */}
            <div className="flex gap-2 text-xs">
              <span className="px-3 py-1 bg-blue-800 rounded-full">Role: department head</span>
              <span className="px-3 py-1 bg-blue-800 rounded-full">Department Linked</span>
              <span className="px-3 py-1 bg-blue-800 rounded-full">Self service Enabled</span>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-blue-900 text-white p-6 rounded-lg">
              <div className="text-3xl font-bold">0</div>
              <div className="text-sm text-blue-200 mt-2">Pending</div>
              <p className="text-xs text-blue-300">Awaiting decision</p>
            </div>
            <div className="bg-blue-900 text-white p-6 rounded-lg">
              <div className="text-3xl font-bold">4</div>
              <div className="text-sm text-blue-200 mt-2">Approved</div>
              <p className="text-xs text-blue-300">Confirmed leave</p>
            </div>
            <div className="bg-blue-900 text-white p-6 rounded-lg">
              <div className="text-3xl font-bold">0</div>
              <div className="text-sm text-blue-200 mt-2">Submitted</div>
              <p className="text-xs text-blue-300">My requests</p>
            </div>
            <div className="bg-blue-900 text-white p-6 rounded-lg">
              <div className="text-3xl font-bold">0</div>
              <div className="text-sm text-blue-200 mt-2">Approvals</div>
              <p className="text-xs text-blue-300">Manager queue</p>
            </div>
          </div>

          {/* Export Section */}
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <div className="mb-4">
              <h3 className="font-semibold text-gray-900">Export Annual Leave Requests</h3>
              <p className="text-sm text-gray-600">Download all staff annual leave requests for your department/region as an Excel file.</p>
            </div>
            <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3">
              <Download className="w-4 h-4 mr-2" />
              Export to Excel
            </Button>
          </div>

          {/* Leave Application Actions */}
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-4">Leave Application Actions</h3>
            <p className="text-sm text-gray-600 mb-4">Manage your leave requests and submissions</p>
            <div className="grid grid-cols-6 gap-3">
              <Button className="bg-blue-600 hover:bg-blue-700 text-white">My Requests (0)</Button>
              <Button className="bg-green-600 hover:bg-green-700 text-white">+ Apply for Leave</Button>
              <Button className="bg-gray-400 hover:bg-gray-500 text-white">Approved (4)</Button>
              <Button className="bg-gray-400 hover:bg-gray-500 text-white">Deferrments</Button>
              <Button className="bg-gray-400 hover:bg-gray-500 text-white">Recalls</Button>
              <Button className="bg-gray-400 hover:bg-gray-500 text-white">Approved Memos</Button>
            </div>
          </div>

          {/* Empty State */}
          <div className="bg-white rounded-lg p-12 border border-gray-200 text-center">
            <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="font-semibold text-gray-900 mb-2">No leave requests yet</h3>
            <p className="text-sm text-gray-600 mb-6">You haven't submitted any leave requests. Click the button below to apply for leave.</p>
            <Button className="bg-green-600 hover:bg-green-700 text-white">+ Apply for Leave</Button>
          </div>
        </TabsContent>

        {/* Tab 2: Leave & HR Leave */}
        <TabsContent value="hr-leave" className="space-y-6">
          <div className="bg-green-600 rounded-lg p-6 text-white">
            <h2 className="text-2xl font-bold">Leave Management</h2>
            <p className="text-sm text-green-100">2025/2026 Leave Year · Quality Control Company Limited</p>
            <div className="flex gap-2 mt-4 text-xs">
              <span className="px-2 py-1 bg-green-700 rounded">Staff Applies</span>
              <span className="px-2 py-1 bg-green-700 rounded">HOD Reviews</span>
              <span className="px-2 py-1 bg-green-700 rounded">HR Leave Office Adjusts</span>
              <span className="px-2 py-1 bg-green-700 rounded">HR Issues Memo</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Button className="bg-orange-400 hover:bg-orange-500 text-white">Request</Button>
            <Button className="bg-orange-400 hover:bg-orange-500 text-white">+ Apply</Button>
            <Button className="bg-orange-400 hover:bg-orange-500 text-white">HOD Review</Button>
          </div>

          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <h3 className="font-semibold mb-2">New Leave Application</h3>
            <p className="text-sm text-gray-600">Leave Year Period: 2025/2026</p>
          </div>

          <Alert className="border-yellow-300 bg-yellow-50">
            <AlertDescription className="text-yellow-800">
              <strong>Annual Leave Planning Reminder:</strong> In September, all staff must submit their annual leave requests for the October cocoa season cycle. This allows HOD/Regional Managers time to review and approve all leave days by the start of October. Plan ahead to avoid operational disruptions.
            </AlertDescription>
          </Alert>

          <p className="text-sm text-gray-600">Select leave type <span className="text-red-500">*</span></p>
          <div className="grid grid-cols-3 gap-3">
            <Button className="bg-orange-400 hover:bg-orange-500 text-white">Maternity Leave</Button>
            <Button className="bg-gray-300 hover:bg-gray-400">Paternity Leave</Button>
            <Button className="bg-gray-300 hover:bg-gray-400">Study Leave (With Pay)</Button>
          </div>

          <div className="bg-white rounded-lg p-6 border border-gray-200 space-y-4">
            <div>
              <label className="text-sm font-semibold text-gray-700">Current year: 2025/2026</label>
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700">Date</label>
              <input type="text" placeholder="01/mm/yyyy" className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700">Brief reason for leave (Optional)</label>
              <textarea className="w-full px-3 py-2 border rounded-lg text-sm" rows={4}></textarea>
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700">Staff Signature</label>
              <p className="text-xs text-gray-500">Signature is auto-populated from your staff profile name</p>
            </div>
            <Button className="w-full bg-green-600 hover:bg-green-700 text-white">Submit Application</Button>
          </div>
        </TabsContent>

        {/* Tab 3: Leave Analytics */}
        <TabsContent value="analytics" className="space-y-6">
          <div className="bg-purple-900 rounded-lg p-8 text-white">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-3xl font-bold">Leave Analytics Dashboard</h2>
                <p className="text-sm text-purple-200">Executive Insights - Quality Control Company Limited</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="border-purple-400 text-white">Refresh</Button>
                <Button size="sm" variant="outline" className="border-purple-400 text-white">CSV</Button>
                <Button size="sm" variant="outline" className="border-purple-400 text-white">PDF</Button>
                <Button size="sm" className="bg-purple-700 hover:bg-purple-800">Send 5-Day Reminders</Button>
              </div>
            </div>

            <div className="flex gap-4 text-sm">
              <input type="date" defaultValue="2026-05-01" className="px-3 py-2 rounded bg-purple-800 text-white" />
              <span className="text-purple-300">to</span>
              <input type="date" defaultValue="2026-05-31" className="px-3 py-2 rounded bg-purple-800 text-white" />
              <Button size="sm" className="bg-blue-600 hover:bg-blue-700">Apply Range</Button>
            </div>
          </div>

          {/* Metric Cards */}
          <div className="grid grid-cols-6 gap-3">
            <div className="bg-orange-500 text-white p-6 rounded-lg text-center">
              <div className="text-3xl font-bold">2</div>
              <p className="text-xs uppercase font-semibold mt-2">Outstanding</p>
            </div>
            <div className="bg-teal-500 text-white p-6 rounded-lg text-center">
              <div className="text-3xl font-bold">3</div>
              <p className="text-xs uppercase font-semibold mt-2">Approved Total</p>
            </div>
            <div className="bg-blue-500 text-white p-6 rounded-lg text-center">
              <div className="text-3xl font-bold">2</div>
              <p className="text-xs uppercase font-semibold mt-2">On Leave Now</p>
            </div>
            <div className="bg-purple-500 text-white p-6 rounded-lg text-center">
              <div className="text-3xl font-bold">0</div>
              <p className="text-xs uppercase font-semibold mt-2">Yet to Enjoy</p>
            </div>
            <div className="bg-cyan-500 text-white p-6 rounded-lg text-center">
              <div className="text-3xl font-bold">1</div>
              <p className="text-xs uppercase font-semibold mt-2">Completed</p>
            </div>
            <div className="bg-pink-500 text-white p-6 rounded-lg text-center">
              <div className="text-3xl font-bold">3</div>
              <p className="text-xs uppercase font-semibold mt-2">Unique Staff</p>
            </div>
          </div>

          {/* Leave by Type and Location */}
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-4">Leave by Type</h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span>Annual Leave</span>
                  <div className="h-2 bg-purple-500 rounded" style={{ width: '100%' }}></div>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-4">Leave by Location</h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span>QCC Head Office</span>
                  <div className="h-2 bg-teal-500 rounded" style={{ width: '100%' }}></div>
                </div>
              </div>
            </div>
          </div>

          {/* Currently on Leave */}
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-4">Currently on Leave</h3>
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b">
                  <td className="py-2">Mr. Osuardu Aniah</td>
                  <td className="py-2">DEPARTMENT</td>
                  <td className="py-2">LEAVE TYPE</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2">Mrs Yaw Ofisuo Siaw</td>
                  <td className="py-2">DEPARTMENT</td>
                  <td className="py-2">LEAVE TYPE</td>
                </tr>
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Tab 4: Balance & Calendar */}
        <TabsContent value="balance" className="grid grid-cols-2 gap-6">
          {/* Left: Leave Balance Cards */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white mb-4">Leave Balance</h3>
            <div className="bg-blue-900 text-white p-4 rounded-lg">
              <p className="text-sm">Period 2026/2027</p>
              <p className="text-2xl font-bold mt-2">0</p>
              <p className="text-xs text-blue-200">of 412 days used</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { name: 'Study Leave', days: '365 left' },
                { name: 'Maternity Leave', days: '344 left' },
                { name: 'Annual Leave', days: '364 left' },
                { name: 'Sick Leave', days: '26 left' },
                { name: 'Study Leave (With Pay)', days: '332 left' },
                { name: 'Special / Leave Without Pay', days: '2 left' },
                { name: 'Paternity Leave', days: '54 left' },
                { name: 'Casual Leave', days: '334 left' },
              ].map((item, i) => (
                <div key={i} className="bg-gray-400 text-gray-900 p-3 rounded-lg text-sm">
                  <p className="font-semibold">{item.name}</p>
                  <p className="text-xs text-gray-700 mt-1">{item.days}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Team Calendar */}
          <div className="space-y-4">
            <div className="bg-blue-900 text-white p-4 rounded-lg">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Team Calendar</h3>
                <p className="text-xs">Who's off this month</p>
              </div>
              
              {/* Calendar */}
              <div className="mb-4">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-semibold">May 2026</h4>
                  <div className="flex gap-1">
                    <button className="text-xs px-2">←</button>
                    <button className="text-xs px-2">→</button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-2 text-xs mb-3">
                  {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(day => (
                    <div key={day} className="text-center text-gray-300">{day}</div>
                  ))}
                  {Array.from({ length: 31 }).map((_, i) => (
                    <div key={i} className={`text-center p-2 rounded ${i < 5 ? 'bg-orange-400 text-white' : 'text-gray-300'}`}>
                      {i + 1}
                    </div>
                  ))}
                </div>
              </div>

              {/* Staff on Leave */}
              <div className="bg-blue-800 p-3 rounded text-sm">
                <p className="text-gray-300 mb-2">SUNDAY 17 MAY 2026</p>
                <p className="text-blue-100">Mr. Osuardu Aniah</p>
                <span className="text-xs bg-blue-700 px-2 py-1 rounded inline-block mt-1">Annual</span>
                <p className="text-blue-100 mt-2">Mrs Yaw Ofisuo Siaw</p>
                <span className="text-xs bg-blue-700 px-2 py-1 rounded inline-block mt-1">Annual</span>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
