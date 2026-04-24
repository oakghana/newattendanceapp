"use client"

import { useState, useEffect } from "react"

const authenticatedFetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
  return fetch(input, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "Cache-Control": "no-store",
      ...(init.headers || {}),
    },
  })
}
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Key, Shield, Search, Eye, EyeOff } from "lucide-react"
import { toast } from "sonner"

interface User {
  id: string
  email: string
  first_name: string
  last_name: string
  employee_id: string
  role: string
}

interface PasswordManagementProps {
  userId?: string
  userEmail?: string
  isAdmin?: boolean
}

const SERVICE_ROLE_ERROR_MESSAGE =
  "Admin password reset requires the server SUPABASE_SERVICE_ROLE_KEY to be configured. Enter a new password in the modal and submit once the server is ready."

export function PasswordManagement({ userId, userEmail, isAdmin = false }: PasswordManagementProps) {
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [adminNewPassword, setAdminNewPassword] = useState("")
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [showAdminPassword, setShowAdminPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [users, setUsers] = useState<User[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string>("")
  const [selectedUserEmail, setSelectedUserEmail] = useState<string>("")
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [currentUserRole, setCurrentUserRole] = useState<string>("staff")
  const [hasServiceKey, setHasServiceKey] = useState(true)

  const showErrorMessage = (message: string) => {
    setSuccess(null)
    setError(message)
    toast.error(message)
  }

  const showSuccessMessage = (message: string) => {
    setError(null)
    setSuccess(message)
    toast.success(message)
  }

  useEffect(() => {
    if (isAdmin) {
      fetchCurrentUserRole()
      fetchServerConfig()
    }
  }, [isAdmin])

  useEffect(() => {
    if (!isAdmin) return

    const timer = setTimeout(() => {
      fetchUsers(searchTerm)
    }, 250)

    return () => clearTimeout(timer)
  }, [isAdmin, searchTerm])

  const fetchUsers = async (term = "") => {
    setLoadingUsers(true)
    setError(null)
    try {
      console.log("[v0] Password Management: Fetching users", { term })
      const params = new URLSearchParams()
      if (term.trim()) params.append("search", term.trim())
      params.append("limit", "5000")

      const response = await authenticatedFetch(`/api/admin/users?${params.toString()}`)

      console.log("[v0] Password Management: Response status:", response.status)
      console.log("[v0] Password Management: Response headers:", Object.fromEntries(response.headers.entries()))

      if (!response.ok) {
        const errorText = await response.text()
        console.error("[v0] Password Management: HTTP error response:", errorText)
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`)
      }

      const contentType = response.headers.get("content-type")
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text()
        console.error("[v0] Password Management: Non-JSON response:", text.substring(0, 200))
        throw new Error("Server returned non-JSON response")
      }

      const result = await response.json()
      console.log("[v0] Password Management: API response:", result)

      if (result.success) {
        setUsers(result.users || [])
        console.log("[v0] Password Management: Loaded", result.users?.length || 0, "users")
        if (result.debug) {
          console.log("[v0] Password Management: Debug info:", result.debug)
        }
      } else {
        console.error("[v0] Password Management: API error:", result.error)
        const errorMessage = result.error || "Failed to fetch users"
        const contextMessage = result.userRole
          ? `Current user role: ${result.userRole}. Required roles: ${result.requiredRoles?.join(", ") || "admin, department_head"}`
          : ""
        setError(`${errorMessage}${contextMessage ? ` (${contextMessage})` : ""}`)
      }
    } catch (error) {
      console.error("[v0] Password Management: Fetch error:", error)
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred"
      setError(`Failed to load users: ${errorMessage}`)
    } finally {
      setLoadingUsers(false)
    }
  }

  const fetchCurrentUserRole = async () => {
    try {
      const response = await authenticatedFetch("/api/settings")
      const result = await response.json()
      if (result.success && result.profile) {
        setCurrentUserRole(result.profile.role)
      }
    } catch (error) {
      console.error("[v0] Failed to fetch current user role:", error)
    }
  }

  const fetchServerConfig = async () => {
    try {
      const response = await authenticatedFetch("/api/admin/supabase-config")
      const result = await response.json()
      const available = Boolean(result?.hasServiceKey)
      setHasServiceKey(available)
      return available
    } catch (error) {
      console.warn("[v0] Failed to verify service-role configuration:", error)
      setHasServiceKey(false)
      return false
    }
  }

  const handleUserSelect = (userId: string) => {
    const user = users.find((u) => u.id === userId)
    if (user) {
      setSelectedUserId(userId)
      setSelectedUserEmail(user.email)
      console.log("[v0] Password Management: Selected user:", user.email)
      setError(null) // Clear any previous errors
    }
  }

  const availableUsers = users.filter((user) => {
    if (currentUserRole === "it-admin") {
      // IT-Admin cannot see admin or it-admin users in the list
      return user.role !== "admin" && user.role !== "it-admin"
    }
    return true
  })

  const filteredUsers = availableUsers.filter((user) => {
    const normalizedSearch = searchTerm.trim().toLowerCase()
    if (!normalizedSearch) return true

    return (
      String(user.email || "").toLowerCase().includes(normalizedSearch) ||
      `${user.first_name || ""} ${user.last_name || ""}`.toLowerCase().includes(normalizedSearch) ||
      String(user.employee_id || "").toLowerCase().includes(normalizedSearch)
    )
  })

  const handleUserPasswordChange = async () => {
    if (!currentPassword.trim()) {
      showErrorMessage("Current password is required")
      return
    }

    if (newPassword !== confirmPassword) {
      showErrorMessage("Passwords do not match")
      return
    }

    if (newPassword.length < 6) {
      showErrorMessage("Password must be at least 6 characters long")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await authenticatedFetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        showErrorMessage(result.error || "Failed to change password")
        return
      }

      showSuccessMessage(result.message || "Password changed successfully")
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      setIsChangePasswordOpen(false)
    } catch (error) {
      showErrorMessage(error instanceof Error ? error.message : "Failed to change password")
    } finally {
      setLoading(false)
    }
  }

  const handleAdminPasswordReset = async () => {
    const targetUserId = selectedUserId || userId

    const configAvailable = await fetchServerConfig()

    if (!targetUserId) {
      showErrorMessage("Please select a user")
      return
    }

    if (!configAvailable) {
      showErrorMessage(SERVICE_ROLE_ERROR_MESSAGE)
      return
    }

    if (!adminNewPassword) {
      showErrorMessage("Please enter a new password")
      return
    }

    if (adminNewPassword.length < 6) {
      showErrorMessage("Password must be at least 6 characters long")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await authenticatedFetch("/api/admin/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: targetUserId,
          newPassword: adminNewPassword,
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        showErrorMessage(result.error || "Failed to reset password")
        return
      }

      showSuccessMessage(result.message || `Password reset successfully for ${selectedUserEmail || userEmail}`)
      setAdminNewPassword("")
      setSelectedUserId("")
      setSelectedUserEmail("")
      setIsChangePasswordOpen(false)
    } catch (error) {
      showErrorMessage(error instanceof Error ? error.message : "Failed to reset password")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          Password Management
        </CardTitle>
        <CardDescription>
          {isAdmin ? "Reset user passwords as administrator" : "Change your account password"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {isAdmin && !hasServiceKey && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{SERVICE_ROLE_ERROR_MESSAGE}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="mb-4">
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        {isAdmin && (
          <div className="space-y-4 mb-4">
            <div>
              <Label htmlFor="userSearch">Search Users</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="userSearch"
                  placeholder="Search by name, email, or employee ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="userSelect">Select User</Label>
              <Select value={selectedUserId} onValueChange={handleUserSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a user to reset password" />
                </SelectTrigger>
                <SelectContent>
                  {loadingUsers ? (
                    <SelectItem value="loading" disabled>
                      Loading users...
                    </SelectItem>
                  ) : filteredUsers.length > 0 ? (
                    filteredUsers.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.first_name} {user.last_name} ({user.email}) - {user.employee_id}
                      </SelectItem>
                    ))
                  ) : users.length === 0 ? (
                    <SelectItem value="no-users" disabled>
                      {error ? "Error loading users" : "No users available"}
                    </SelectItem>
                  ) : (
                    <SelectItem value="no-match" disabled>
                      No users found matching "{searchTerm}"
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {selectedUserEmail && (
              <Alert>
                <AlertDescription>
                  Selected user: <strong>{selectedUserEmail}</strong>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <Dialog open={isChangePasswordOpen} onOpenChange={setIsChangePasswordOpen}>
          <DialogTrigger asChild>
            <Button className="w-full" disabled={isAdmin && !selectedUserId && !userId}>
              {isAdmin ? <Shield className="mr-2 h-4 w-4" /> : <Key className="mr-2 h-4 w-4" />}
              {isAdmin ? "Reset Selected User Password" : "Change Password"}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{isAdmin ? "Reset User Password" : "Change Password"}</DialogTitle>
              <DialogDescription>
                {isAdmin
                  ? `Reset password for ${selectedUserEmail || userEmail || "selected user"}. The user will be required to change it at next login.`
                  : "Enter your current password and choose a new one"}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {isAdmin ? (
                <div>
                  <Label htmlFor="adminNewPassword">New Password</Label>
                  <div className="relative">
                    <Input
                      id="adminNewPassword"
                      type={showAdminPassword ? "text" : "password"}
                      value={adminNewPassword}
                      onChange={(e) => setAdminNewPassword(e.target.value)}
                      placeholder="Enter new password (min 6 characters)"
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowAdminPassword(!showAdminPassword)}
                    >
                      {showAdminPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <Label htmlFor="currentPassword">Current Password</Label>
                    <div className="relative">
                      <Input
                        id="currentPassword"
                        type={showCurrentPassword ? "text" : "password"}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Enter current password"
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      >
                        {showCurrentPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="newPassword">New Password</Label>
                    <div className="relative">
                      <Input
                        id="newPassword"
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter new password"
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                      >
                        {showNewPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="confirmPassword">Confirm New Password</Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm new password"
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsChangePasswordOpen(false)} disabled={loading}>
                Cancel
              </Button>
              <Button
                onClick={isAdmin ? handleAdminPasswordReset : handleUserPasswordChange}
                disabled={loading}
              >
                {loading ? "Processing..." : isAdmin ? "Reset Password" : "Change Password"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
