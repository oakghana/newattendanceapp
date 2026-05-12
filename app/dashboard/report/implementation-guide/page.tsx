"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import Link from "next/link"

export default function ImplementationGuidePage() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Print Styles */}
        <style>{`
          @media print {
            body { margin: 0; padding: 0; }
            .no-print { display: none; }
            .report-container { page-break-after: avoid; }
            .report-page { 
              width: 210mm;
              height: 148.5mm;
              margin: 0 auto;
              padding: 15mm;
              background: white;
              break-after: avoid;
            }
          }
          @page {
            size: A4 landscape;
            margin: 10mm;
          }
        `}</style>

        {/* Header with Print Button */}
        <div className="no-print mb-6 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">Implementation Guide</h1>
          <div className="flex gap-2">
            <Button onClick={() => window.print()} variant="outline">
              Print / Save as PDF
            </Button>
            <Link href="/dashboard/loan-app">
              <Button variant="ghost">Back to App</Button>
            </Link>
          </div>
        </div>

        {/* Report Content - A4 Landscape Half Page */}
        <div className="report-container bg-white shadow-lg rounded-lg overflow-hidden">
          <div className="report-page">
            {/* Header Section */}
            <div className="border-b-2 border-gray-300 pb-3 mb-3">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">QCC Attendance Electronic System</h2>
                  <p className="text-sm text-gray-600">Loan & Leave Management Application</p>
                </div>
                <div className="text-right text-xs text-gray-600">
                  <p>Document: Implementation Guide</p>
                  <p>Date: {new Date().toLocaleDateString()}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              {/* Column 1 */}
              <div className="space-y-2">
                <div>
                  <h3 className="font-bold text-gray-900 text-sm mb-1">1. HOD LINKAGE SETUP</h3>
                  <ul className="space-y-0.5 text-gray-700 list-disc list-inside">
                    <li>Every staff member must have a HOD assigned in their profile</li>
                    <li>HOD approval is mandatory for loan applications</li>
                    <li>HOD can endorse or reject requests</li>
                    <li>Navigate to: Admin → Staff Management → Link HOD</li>
                    <li>Use "Setup & Linkage" tab in Loan App</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-bold text-gray-900 text-sm mb-1">2. SIGNATURE SETUP</h3>
                  <ul className="space-y-0.5 text-gray-700 list-disc list-inside">
                    <li><strong>Executive HR:</strong> Must save digital signature before approving loans</li>
                    <li><strong>HOD:</strong> Can optionally save signature for document signing</li>
                    <li>Signature methods: Type, Draw, or Upload image</li>
                    <li>Access via: Profile Settings → Signature tab</li>
                    <li>Or: Loan App → Setup & Linkage → Change Signature</li>
                  </ul>
                </div>
              </div>

              {/* Column 2 */}
              <div className="space-y-2">
                <div>
                  <h3 className="font-bold text-gray-900 text-sm mb-1">3. IMPLEMENTATION CHECKLIST</h3>
                  <div className="space-y-0.5 text-gray-700">
                    <div className="flex items-start gap-2">
                      <span>☐</span>
                      <span>Configure all staff HOD assignments</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span>☐</span>
                      <span>Set up approval workflow rules</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span>☐</span>
                      <span>Executive HR creates digital signature</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span>☐</span>
                      <span>HOD saves signature (optional but recommended)</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span>☐</span>
                      <span>Test loan application workflow end-to-end</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span>☐</span>
                      <span>Train all users on the application</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-bold text-gray-900 text-sm mb-1">4. KEY FEATURES</h3>
                  <ul className="space-y-0.5 text-gray-700 list-disc list-inside">
                    <li>Multi-level approval process (HOD → Committee → HR)</li>
                    <li>Digital signature on all approval documents</li>
                    <li>Automated memo generation with CC recipients</li>
                    <li>Real-time tracking and status updates</li>
                    <li>Leave management and balance tracking</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-gray-300 mt-3 pt-2 text-xs text-gray-600 flex justify-between">
              <span>QCC Attendance Electronic System v2.0</span>
              <span>For technical support, contact: admin@qccapps.com</span>
            </div>
          </div>
        </div>

        {/* Online View Additional Info */}
        <div className="no-print mt-8 grid grid-cols-2 gap-6">
          <Card className="p-6">
            <h3 className="font-bold text-lg mb-3 text-gray-900">Quick Links</h3>
            <div className="space-y-2 text-sm">
              <Link href="/dashboard/loan-app" className="text-blue-600 hover:underline block">
                → Loan Application Dashboard
              </Link>
              <Link href="/dashboard/leave-management" className="text-blue-600 hover:underline block">
                → Leave Management Hub
              </Link>
              <Link href="/dashboard/profile?tab=signature" className="text-blue-600 hover:underline block">
                → Setup Your Signature
              </Link>
              <Link href="/dashboard/admin/staff" className="text-blue-600 hover:underline block">
                → Staff Management (HOD Setup)
              </Link>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-bold text-lg mb-3 text-gray-900">Important Notes</h3>
            <ul className="space-y-2 text-sm text-gray-700 list-disc list-inside">
              <li>All staff must be linked to a HOD</li>
              <li>Executive HR signature is required before any loan approvals</li>
              <li>Signatures are database-backed and can be changed anytime</li>
              <li>All activities are logged and auditable</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  )
}
