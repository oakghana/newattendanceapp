"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SearchableSelect } from "@/components/ui/searchable-select"
import {
  Settings2, Link2, Users, BarChart3,
  ChevronRight, Search, RotateCcw, CheckCircle2,
  AlertCircle, Edit2, Zap,
} from "lucide-react"

// ─── Lightweight types (mirroring page.tsx shapes) ───────────────────────────
interface LoanType {
  loan_key: string
  loan_label: string
  is_active?: boolean
  fixed_amount?: number | null
  max_amount?: number | null
  min_qualification_note?: string | null
  loan_terms?: string | null
  default_recovery_months?: number | null
}

interface StaffProfile {
  id: string
  first_name: string
  last_name: string
  employee_id?: string | null
  position?: string | null
  geofence_locations?: { name?: string; districts?: { name?: string }; address?: string } | null
  departments?: { name: string } | null
}

interface HodProfile {
  id: string
  first_name: string
  last_name: string
  role?: string | null
  position?: string | null
  email?: string
}

interface Linkage {
  id: string
  staff_user_id: string
  hod_user_id: string
}

interface LinkageRequest {
  id: string
  request_status: "pending" | "approved" | "rejected"
  staff?: { full_name?: string; employee_id?: string } | null
  requested_hod?: { full_name?: string; role?: string; position?: string } | null
  requester?: { full_name?: string } | null
  request_note?: string | null
  message?: string | null
  resolved_at?: string | null
  resolved_by?: { full_name?: string } | null
  resolution_note?: string | null
  created_at?: string | null
}

export interface SetupLinkagePanelProps {
  // permissions
  canDirectLinkageUpdate: boolean
  isAdmin: boolean

  // lookup data
  loanTypes: LoanType[]
  staff: StaffProfile[]
  hods: HodProfile[]
  linkages: Linkage[]
  linkageRequests: LinkageRequest[]

  // loan type setup state
  selectedLoanType: string
  setSelectedLoanType: (v: string) => void
  setupLoanLabel: string
  setSetupLoanLabel: (v: string) => void
  setupIsActive: boolean
  setSetupIsActive: (v: boolean) => void
  setupFixedAmount: string
  setSetupFixedAmount: (v: string) => void
  setupMaxAmount: string
  setSetupMaxAmount: (v: string) => void
  setupQualification: string
  setSetupQualification: (v: string) => void
  setupLoanTerms: string
  setSetupLoanTerms: (v: string) => void
  setupDefaultRecoveryMonths: string
  setSetupDefaultRecoveryMonths: (v: string) => void
  onSaveLoanType: () => void

  // single linkage state
  selectedStaffForLink: string
  setSelectedStaffForLink: (v: string) => void
  selectedHodsForLink: string[]
  toggleHodSelection: (id: string) => void
  linkageRequestNote: string
  setLinkageRequestNote: (v: string) => void
  onSaveSingleLinkage: () => void
  onRequestLinkageApproval: () => void

  // bulk linkage state
  staffLocationFilter: string
  setStaffLocationFilter: (v: string) => void
  staffDepartmentFilter: string
  setStaffDepartmentFilter: (v: string) => void
  staffSearchFilter: string
  setStaffSearchFilter: (v: string) => void
  filteredStaffCandidates: StaffProfile[]
  staffLocationOptions: { id: string; label: string }[]
  staffDepartmentOptions: { id: string; label: string }[]
  selectedStaffsForBatchLink: string[]
  toggleStaffBatchSelection: (id: string) => void
  setSelectedStaffsForBatchLink: (ids: string[]) => void
  selectedHodForBatchLink: string
  setSelectedHodForBatchLink: (v: string) => void
  onBulkLink: () => void
  onAutoLinkByLocation: () => void

  // grade update
  selectedStaffForRank: string
  setSelectedStaffForRank: (v: string) => void
  selectedRankLevel: "junior" | "senior" | "manager"
  setSelectedRankLevel: (v: "junior" | "senior" | "manager") => void
  onUpdateStaffRank: () => void

  // linkage data table
  linkageSearch: string
  setLinkageSearch: (v: string) => void
  linkageLocationFilter: string
  setLinkageLocationFilter: (v: string) => void
  linkageDepartmentFilter: string
  setLinkageDepartmentFilter: (v: string) => void
  linkageRankFilter: string
  setLinkageRankFilter: (v: string) => void
  linkagePage: number
  setLinkagePage: (v: number) => void
  filteredLinkageRows: Linkage[]
  paginatedLinkageRows: Linkage[]
  linkageTotalPages: number
  linkageLocationOptions: string[]
  linkageDeptOptions: string[]
  linkageRankOptions: string[]
  editLinkageFromCard: (staffId: string, hodId: string) => void
  LINKAGE_PAGE_SIZE: number

  // admin linkage requests
  linkageRequestStatusFilter: "all" | "pending" | "approved" | "rejected"
  setLinkageRequestStatusFilter: (v: "all" | "pending" | "approved" | "rejected") => void
  filteredLinkageRequests: LinkageRequest[]
  linkageResolutionNotes: Record<string, string>
  setLinkageResolutionNotes: (updater: (prev: Record<string, string>) => Record<string, string>) => void
  onResolveLinkageRequest: (id: string, decision: "approve" | "reject") => void

  normalizeLoanTypeLabel: (lt: LoanType, all: LoanType[]) => string
  fmtDate: (d?: string | null) => string
  lookupLoading: boolean
}

// ─── Sub-tab ids ─────────────────────────────────────────────────────────────
type SubTab = "loan-types" | "staff-linkage" | "bulk-linkage" | "linkage-map"

const SUB_TABS: { id: SubTab; label: string; icon: React.ElementType; description: string }[] = [
  { id: "loan-types",    label: "Loan Types",     icon: Settings2, description: "Configure each welfare product" },
  { id: "staff-linkage", label: "Staff Linkage",  icon: Link2,     description: "Link staff to their HOD" },
  { id: "bulk-linkage",  label: "Bulk Linkage",   icon: Users,     description: "Map many staff at once" },
  { id: "linkage-map",   label: "Linkage Map",    icon: BarChart3, description: "Browse all active linkages" },
]

export function SetupLinkagePanel(props: SetupLinkagePanelProps) {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>("loan-types")

  const {
    canDirectLinkageUpdate, isAdmin,
    loanTypes, staff, hods, linkages,
    selectedLoanType, setSelectedLoanType,
    setupLoanLabel, setSetupLoanLabel,
    setupIsActive, setSetupIsActive,
    setupFixedAmount, setSetupFixedAmount,
    setupMaxAmount, setSetupMaxAmount,
    setupQualification, setSetupQualification,
    setupLoanTerms, setSetupLoanTerms,
    setupDefaultRecoveryMonths, setSetupDefaultRecoveryMonths,
    onSaveLoanType,
    selectedStaffForLink, setSelectedStaffForLink,
    selectedHodsForLink, toggleHodSelection,
    linkageRequestNote, setLinkageRequestNote,
    onSaveSingleLinkage, onRequestLinkageApproval,
    staffLocationFilter, setStaffLocationFilter,
    staffDepartmentFilter, setStaffDepartmentFilter,
    staffSearchFilter, setStaffSearchFilter,
    filteredStaffCandidates, staffLocationOptions, staffDepartmentOptions,
    selectedStaffsForBatchLink, toggleStaffBatchSelection, setSelectedStaffsForBatchLink,
    selectedHodForBatchLink, setSelectedHodForBatchLink,
    onBulkLink, onAutoLinkByLocation,
    selectedStaffForRank, setSelectedStaffForRank,
    selectedRankLevel, setSelectedRankLevel,
    onUpdateStaffRank,
    linkageSearch, setLinkageSearch,
    linkageLocationFilter, setLinkageLocationFilter,
    linkageDepartmentFilter, setLinkageDepartmentFilter,
    linkageRankFilter, setLinkageRankFilter,
    linkagePage, setLinkagePage,
    filteredLinkageRows, paginatedLinkageRows, linkageTotalPages,
    linkageLocationOptions, linkageDeptOptions, linkageRankOptions,
    editLinkageFromCard, LINKAGE_PAGE_SIZE,
    isAdmin: isAdminProp,
    linkageRequestStatusFilter, setLinkageRequestStatusFilter,
    filteredLinkageRequests, linkageResolutionNotes, setLinkageResolutionNotes,
    onResolveLinkageRequest,
    normalizeLoanTypeLabel, fmtDate, lookupLoading,
  } = props

  return (
    <div className="space-y-5">
      {/* ── KPI strip ── */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Loan Types</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{loanTypes.length}</p>
          <p className="mt-0.5 text-xs text-slate-400">Configured products</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">HOD Linkages</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{linkages.length}</p>
          <p className="mt-0.5 text-xs text-slate-400">Active relationships</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Staff Pool</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{staff.length}</p>
          <p className="mt-0.5 text-xs text-slate-400">Ready for linkage</p>
        </div>
      </div>

      {/* ── Sub-tab nav ── */}
      <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
        {SUB_TABS.map((tab) => {
          const Icon = tab.icon
          const active = activeSubTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                active
                  ? "bg-white text-emerald-700 shadow-sm ring-1 ring-slate-200"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* SUB-TAB: Loan Types                                                 */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      {activeSubTab === "loan-types" && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings2 className="h-4 w-4 text-emerald-600" />
              Loan Type Configuration
            </CardTitle>
            <CardDescription>
              Select a welfare product to update its amount limits, qualification rules, and repayment terms.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 lg:grid-cols-[1fr_auto_1fr]">
              {/* Left: selector + type list */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Select Loan Type</Label>
                  <SearchableSelect
                    value={selectedLoanType}
                    onChange={(v) => {
                      setSelectedLoanType(v)
                      const found = loanTypes.find((t) => t.loan_key === v)
                      if (!found) return
                      setSetupLoanLabel(found.loan_label || "")
                      setSetupIsActive(found.is_active ?? true)
                      setSetupFixedAmount(String(found.fixed_amount || ""))
                      setSetupMaxAmount(String(found.max_amount || found.fixed_amount || ""))
                      setSetupQualification(String(found.min_qualification_note || ""))
                      setSetupLoanTerms(String(found.loan_terms || ""))
                      setSetupDefaultRecoveryMonths(String(found.default_recovery_months || ""))
                    }}
                    placeholder="Choose loan type..."
                    searchPlaceholder="Search loan type..."
                    options={loanTypes.map((lt) => ({
                      value: lt.loan_key,
                      label: normalizeLoanTypeLabel(lt, loanTypes),
                    }))}
                  />
                </div>

                {/* Quick list of existing types */}
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">All Products</p>
                  <div className="max-h-52 overflow-auto space-y-1 pr-1">
                    {loanTypes.map((lt) => (
                      <button
                        key={lt.loan_key}
                        onClick={() => {
                          setSelectedLoanType(lt.loan_key)
                          setSetupLoanLabel(lt.loan_label || "")
                          setSetupIsActive(lt.is_active ?? true)
                          setSetupFixedAmount(String(lt.fixed_amount || ""))
                          setSetupMaxAmount(String(lt.max_amount || lt.fixed_amount || ""))
                          setSetupQualification(String(lt.min_qualification_note || ""))
                          setSetupLoanTerms(String(lt.loan_terms || ""))
                          setSetupDefaultRecoveryMonths(String(lt.default_recovery_months || ""))
                        }}
                        className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm text-left transition-colors ${
                          selectedLoanType === lt.loan_key
                            ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
                            : "hover:bg-slate-50 text-slate-700"
                        }`}
                      >
                        <span className="truncate">{normalizeLoanTypeLabel(lt, loanTypes)}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {lt.fixed_amount ? (
                            <span className="text-xs text-slate-400">GHc {lt.fixed_amount.toLocaleString()}</span>
                          ) : null}
                          <span className={`h-2 w-2 rounded-full ${lt.is_active ? "bg-emerald-500" : "bg-slate-300"}`} />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="hidden lg:flex items-center">
                <div className="h-full w-px bg-slate-200" />
              </div>

              {/* Right: edit form */}
              {selectedLoanType ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-800">
                      Editing: <span className="text-emerald-700">{setupLoanLabel || selectedLoanType}</span>
                    </p>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={setupIsActive}
                        onChange={(e) => setSetupIsActive(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-sm text-slate-600">Active</span>
                    </label>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm">Label</Label>
                    <Input value={setupLoanLabel} onChange={(e) => setSetupLoanLabel(e.target.value)} placeholder="Display name" />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-sm">Fixed Amount (GHc)</Label>
                      <Input value={setupFixedAmount} onChange={(e) => setSetupFixedAmount(e.target.value)} type="number" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm">Limit Amount (GHc)</Label>
                      <Input value={setupMaxAmount} onChange={(e) => setSetupMaxAmount(e.target.value)} type="number" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm">Qualification Note</Label>
                    <Input value={setupQualification} onChange={(e) => setSetupQualification(e.target.value)} placeholder="e.g. Senior and above" />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm">Default Recovery Months</Label>
                    <Input value={setupDefaultRecoveryMonths} onChange={(e) => setSetupDefaultRecoveryMonths(e.target.value)} type="number" min={1} />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm">HR Terms Note</Label>
                    <Textarea
                      value={setupLoanTerms}
                      onChange={(e) => setSetupLoanTerms(e.target.value)}
                      placeholder="e.g. Recovery in equal monthly instalments from salary"
                      rows={3}
                    />
                  </div>

                  <Button
                    onClick={onSaveLoanType}
                    disabled={!selectedLoanType}
                    className="w-full bg-emerald-700 hover:bg-emerald-800 text-white"
                  >
                    Save Changes
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full py-12 text-center text-slate-400 space-y-2">
                  <Settings2 className="h-8 w-8 opacity-30" />
                  <p className="text-sm">Select a loan type on the left to edit it</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* SUB-TAB: Staff Linkage (single + grade update merged)               */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      {activeSubTab === "staff-linkage" && (
        <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
          {/* Single staff linkage */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <Link2 className="h-4 w-4 text-emerald-600" />
                Assign HOD to Staff
              </CardTitle>
              <CardDescription>
                {canDirectLinkageUpdate
                  ? "Pick a staff member and select their HOD(s)."
                  : "Your request will be sent to Admin for approval."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm">Staff Member</Label>
                <SearchableSelect
                  value={selectedStaffForLink}
                  onChange={setSelectedStaffForLink}
                  placeholder="Search and select staff..."
                  searchPlaceholder="Name or employee ID..."
                  options={filteredStaffCandidates.map((s) => ({
                    value: s.id,
                    label: `${s.first_name} ${s.last_name} (${s.employee_id || "N/A"})`,
                    keywords: `${s.position || ""} ${s.departments?.name || ""}`,
                  }))}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm">HOD / Regional Manager(s)</Label>
                <div className="max-h-52 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-2 space-y-1">
                  {hods.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-4">No HOD profiles found.</p>
                  )}
                  {hods.map((h) => {
                    const checked = selectedHodsForLink.includes(h.id)
                    return (
                      <label
                        key={h.id}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                          checked ? "bg-emerald-50 ring-1 ring-emerald-200" : "hover:bg-white"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleHodSelection(h.id)}
                          className="h-4 w-4 rounded text-emerald-600 border-slate-300"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{`${h.first_name} ${h.last_name}`}</p>
                          <p className="text-xs text-slate-400 truncate">{h.role || h.position || "—"}</p>
                        </div>
                      </label>
                    )
                  })}
                </div>
                {selectedHodsForLink.length > 0 && (
                  <p className="text-xs text-emerald-700 font-medium">{selectedHodsForLink.length} HOD(s) selected</p>
                )}
              </div>

              {!canDirectLinkageUpdate && (
                <div className="space-y-2">
                  <Label className="text-sm">Note for Admin (optional)</Label>
                  <Textarea
                    value={linkageRequestNote}
                    onChange={(e) => setLinkageRequestNote(e.target.value)}
                    rows={2}
                    placeholder="Why is this linkage needed?"
                  />
                </div>
              )}

              {canDirectLinkageUpdate ? (
                <Button
                  onClick={onSaveSingleLinkage}
                  disabled={!selectedStaffForLink || selectedHodsForLink.length === 0}
                  className="w-full bg-emerald-700 hover:bg-emerald-800 text-white"
                >
                  Save Linkage
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={onRequestLinkageApproval}
                  disabled={!selectedStaffForLink || selectedHodsForLink.length === 0}
                  className="w-full"
                >
                  Request Approval
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Grade update + admin approval queue */}
          <div className="space-y-5">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Edit2 className="h-4 w-4 text-emerald-600" />
                  Staff Grade Update
                </CardTitle>
                <CardDescription>Align a staff member&apos;s grade with loan qualification rules.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm">Staff Member</Label>
                  <SearchableSelect
                    value={selectedStaffForRank}
                    onChange={setSelectedStaffForRank}
                    placeholder="Search staff..."
                    searchPlaceholder="Name or position..."
                    options={staff.map((s) => ({
                      value: s.id,
                      label: `${s.first_name} ${s.last_name} (${s.position || "N/A"})`,
                      keywords: s.employee_id || "",
                    }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Grade Level</Label>
                  <Select
                    value={selectedRankLevel}
                    onValueChange={(v: "junior" | "senior" | "manager") => setSelectedRankLevel(v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="junior">Junior</SelectItem>
                      <SelectItem value="senior">Senior</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={onUpdateStaffRank}
                  disabled={!selectedStaffForRank || !canDirectLinkageUpdate}
                  className="w-full bg-slate-800 hover:bg-slate-900 text-white"
                >
                  Update Grade
                </Button>
              </CardContent>
            </Card>

            {/* Admin linkage approval queue */}
            {isAdmin && (
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold">Linkage Requests</CardTitle>
                    <Select
                      value={linkageRequestStatusFilter}
                      onValueChange={(v: "all" | "pending" | "approved" | "rejected") => setLinkageRequestStatusFilter(v)}
                    >
                      <SelectTrigger className="h-7 w-[130px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                        <SelectItem value="all">All</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 max-h-72 overflow-auto">
                  {filteredLinkageRequests.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-4">No requests match this filter.</p>
                  )}
                  {filteredLinkageRequests.map((req) => (
                    <div key={req.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {req.staff?.full_name || "Staff"} <ChevronRight className="inline h-3 w-3 text-slate-400" /> {req.requested_hod?.full_name || "HOD"}
                          </p>
                          <p className="text-xs text-slate-400">By {req.requester?.full_name || "?"} · {fmtDate(req.created_at)}</p>
                        </div>
                        <Badge
                          className={`text-xs ${
                            req.request_status === "pending"
                              ? "bg-amber-100 text-amber-800"
                              : req.request_status === "approved"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {req.request_status}
                        </Badge>
                      </div>
                      {req.request_note && (
                        <p className="text-xs text-slate-500 italic">&ldquo;{req.request_note}&rdquo;</p>
                      )}
                      {req.request_status === "pending" && (
                        <>
                          <Textarea
                            value={linkageResolutionNotes[req.id] || ""}
                            onChange={(e) =>
                              setLinkageResolutionNotes((prev) => ({ ...prev, [req.id]: e.target.value }))
                            }
                            rows={1}
                            placeholder="Optional admin note"
                            className="text-xs"
                          />
                          <div className="flex gap-2">
                            <Button size="sm" className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white text-xs" onClick={() => onResolveLinkageRequest(req.id, "approve")}>
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                            </Button>
                            <Button size="sm" variant="destructive" className="flex-1 text-xs" onClick={() => onResolveLinkageRequest(req.id, "reject")}>
                              <AlertCircle className="h-3 w-3 mr-1" /> Reject
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* SUB-TAB: Bulk Linkage                                               */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      {activeSubTab === "bulk-linkage" && (
        <div className="grid gap-5 lg:grid-cols-[1.3fr_0.7fr]">
          {/* Staff filter + list */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-emerald-600" />
                Select Staff to Link
              </CardTitle>
              <CardDescription>Filter and select multiple staff, then assign them to one HOD at once.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filters */}
              <div className="grid grid-cols-3 gap-2">
                <Select value={staffLocationFilter} onValueChange={setStaffLocationFilter}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Location" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Locations</SelectItem>
                    {staffLocationOptions.map((loc) => (
                      <SelectItem key={`loc-${loc.id}`} value={loc.id}>{loc.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={staffDepartmentFilter} onValueChange={setStaffDepartmentFilter}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {staffDepartmentOptions.map((dept) => (
                      <SelectItem key={`dept-${dept.id}`} value={dept.id}>{dept.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <Input
                    value={staffSearchFilter}
                    onChange={(e) => setStaffSearchFilter(e.target.value)}
                    placeholder="Search staff..."
                    className="h-9 pl-8 text-sm"
                  />
                </div>
              </div>

              {/* Select / clear all row */}
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedStaffsForBatchLink(filteredStaffCandidates.map((s) => s.id))}
                  disabled={filteredStaffCandidates.length === 0}
                  className="h-7 text-xs"
                >
                  Select All ({filteredStaffCandidates.length})
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedStaffsForBatchLink([])}
                  disabled={selectedStaffsForBatchLink.length === 0}
                  className="h-7 text-xs text-slate-500"
                >
                  <RotateCcw className="h-3 w-3 mr-1" /> Clear
                </Button>
                {selectedStaffsForBatchLink.length > 0 && (
                  <span className="text-xs font-medium text-emerald-700 ml-auto">
                    {selectedStaffsForBatchLink.length} selected
                  </span>
                )}
              </div>

              {/* Staff list */}
              <div className="max-h-72 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-2 space-y-1">
                {filteredStaffCandidates.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-6">No staff match these filters.</p>
                )}
                {filteredStaffCandidates.map((s) => {
                  const checked = selectedStaffsForBatchLink.includes(s.id)
                  return (
                    <label
                      key={`batch-${s.id}`}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                        checked ? "bg-emerald-50 ring-1 ring-emerald-200" : "hover:bg-white"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleStaffBatchSelection(s.id)}
                        className="h-4 w-4 rounded text-emerald-600 border-slate-300"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{`${s.first_name} ${s.last_name}`}</p>
                        <p className="text-xs text-slate-400 truncate">{s.employee_id || "No ID"} · {s.position || "—"}</p>
                      </div>
                    </label>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* HOD selector + actions */}
          <div className="space-y-4">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-sm font-semibold">Assign HOD</CardTitle>
                <CardDescription className="text-xs">Apply one HOD to all selected staff.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm">Select HOD</Label>
                  <SearchableSelect
                    value={selectedHodForBatchLink}
                    onChange={setSelectedHodForBatchLink}
                    placeholder="Pick HOD..."
                    searchPlaceholder="Search HOD..."
                    options={hods.map((h) => ({
                      value: h.id,
                      label: `${h.first_name} ${h.last_name} (${h.role || h.position || "—"})`,
                    }))}
                  />
                </div>

                <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-1">
                  <p className="text-xs text-slate-500">Staff to be linked</p>
                  <p className="text-lg font-bold text-slate-900">{selectedStaffsForBatchLink.length}</p>
                </div>

                <Button
                  onClick={onBulkLink}
                  disabled={selectedStaffsForBatchLink.length === 0 || !selectedHodForBatchLink || !canDirectLinkageUpdate}
                  className="w-full bg-emerald-700 hover:bg-emerald-800 text-white"
                >
                  <Zap className="h-4 w-4 mr-2" />
                  Link to HOD
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={onAutoLinkByLocation}
                  disabled={lookupLoading || !canDirectLinkageUpdate}
                  className="w-full text-xs border-slate-300 text-slate-600 hover:bg-slate-50"
                >
                  Auto-link by Location
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* SUB-TAB: Linkage Map                                                */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      {activeSubTab === "linkage-map" && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart3 className="h-4 w-4 text-emerald-600" />
                  Active Linkage Map
                </CardTitle>
                <CardDescription>
                  {filteredLinkageRows.length} record{filteredLinkageRows.length !== 1 ? "s" : ""} found
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Filters */}
            <div className="mb-5 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  value={linkageSearch}
                  onChange={(e) => { setLinkageSearch(e.target.value); setLinkagePage(1) }}
                  placeholder="Search by name, employee ID, HOD, location..."
                  className="pl-9"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Select value={linkageLocationFilter} onValueChange={(v) => { setLinkageLocationFilter(v); setLinkagePage(1) }}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Location" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Locations</SelectItem>
                    {linkageLocationOptions.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={linkageDepartmentFilter} onValueChange={(v) => { setLinkageDepartmentFilter(v); setLinkagePage(1) }}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Department" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {linkageDeptOptions.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={linkageRankFilter} onValueChange={(v) => { setLinkageRankFilter(v); setLinkagePage(1) }}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Rank" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Ranks</SelectItem>
                    {linkageRankOptions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {(linkageSearch || linkageLocationFilter !== "all" || linkageDepartmentFilter !== "all" || linkageRankFilter !== "all") && (
                <button
                  className="text-xs text-emerald-700 hover:underline"
                  onClick={() => { setLinkageSearch(""); setLinkageLocationFilter("all"); setLinkageDepartmentFilter("all"); setLinkageRankFilter("all"); setLinkagePage(1) }}
                >
                  Clear all filters
                </button>
              )}
            </div>

            {/* Cards */}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {paginatedLinkageRows.map((link) => {
                const staffMember = props.staff.find((s) => s.id === link.staff_user_id)
                const hod = hods.find((h) => h.id === link.hod_user_id)
                return (
                  <div
                    key={link.id}
                    className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-emerald-300 hover:shadow-md transition-all"
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <p className="font-semibold text-sm text-slate-900">
                          {staffMember ? `${staffMember.first_name} ${staffMember.last_name}` : "Unknown"}
                        </p>
                        <p className="text-xs text-slate-400">{staffMember?.employee_id || "No ID"}</p>
                      </div>
                      {staffMember?.position && (
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 capitalize">
                          {staffMember.position}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1 border-t border-slate-100 pt-2 text-xs">
                      <div className="flex gap-1">
                        <span className="font-medium text-slate-500 w-12 shrink-0">HOD</span>
                        <span className="text-slate-700">
                          {hod ? `${hod.first_name} ${hod.last_name}` : link.hod_user_id}
                          {hod?.position ? <span className="text-slate-400"> ({hod.position})</span> : null}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <span className="font-medium text-slate-500 w-12 shrink-0">Office</span>
                        <span className="text-slate-600 truncate">{staffMember?.geofence_locations?.name || "N/A"}</span>
                      </div>
                      {staffMember?.departments?.name && (
                        <div className="flex gap-1">
                          <span className="font-medium text-slate-500 w-12 shrink-0">Dept</span>
                          <span className="text-slate-600 truncate">{staffMember.departments.name}</span>
                        </div>
                      )}
                    </div>

                    {canDirectLinkageUpdate && (
                      <div className="mt-3 pt-2 border-t border-slate-100">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => editLinkageFromCard(link.staff_user_id, link.hod_user_id)}
                          className="h-7 text-xs text-emerald-700 hover:bg-emerald-50 w-full"
                        >
                          <Edit2 className="h-3 w-3 mr-1" /> Edit Linkage
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
              {filteredLinkageRows.length === 0 && (
                <p className="col-span-3 text-sm text-slate-400 text-center py-12">
                  No linkage records match your filters.
                </p>
              )}
            </div>

            {/* Pagination */}
            {linkageTotalPages > 1 && (
              <div className="mt-5 flex items-center justify-between">
                <p className="text-xs text-slate-400">
                  Showing {((linkagePage - 1) * LINKAGE_PAGE_SIZE) + 1}–{Math.min(linkagePage * LINKAGE_PAGE_SIZE, filteredLinkageRows.length)} of {filteredLinkageRows.length}
                </p>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" disabled={linkagePage <= 1} onClick={() => setLinkagePage((p) => p - 1)} className="h-7 text-xs px-3">Prev</Button>
                  <span className="text-xs text-slate-600">Page {linkagePage} / {linkageTotalPages}</span>
                  <Button size="sm" variant="outline" disabled={linkagePage >= linkageTotalPages} onClick={() => setLinkagePage((p) => p + 1)} className="h-7 text-xs px-3">Next</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
