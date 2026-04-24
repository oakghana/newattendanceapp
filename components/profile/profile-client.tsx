"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { User, Mail, Phone, MapPin, Building, Save, Camera, Lock, Key, Calendar, Eye, EyeOff, Settings2, Shield, Bell } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { clearAppCache } from "@/lib/cache-manager"
import { RequestLeaveButton } from "@/components/leave/request-leave-button"
import { PersonalAttendanceHistory } from "@/components/attendance/personal-attendance-history"
import { SecureInput } from "@/components/ui/secure-input"
import { useToast } from "@/hooks/use-toast"
import { getPasswordEnforcementMessage, validatePassword } from "@/lib/security"
import { toast } from "sonner"

interface UserProfile {
  id: string
  first_name: string
  last_name: string
  email: string
  employee_id: string
  position: string
  phone_number?: string
  phone?: string
  role: string
  is_active: boolean
  profile_image_url?: string
  departments?: {
    id: string
    name: string
    code: string
  }
  assigned_location?: {
    id: string
    name: string
    address?: string
    district_id?: string
    districts?: {
      id: string
      name: string
    }
  }
  districts?: {
    id: string
    name: string
  }
}

interface AttendanceSummary {
  totalDays: number
  totalHours: number
  averageHours: number
  thisMonthDays: number
  thisMonthHours: number
  presentDays: number
  lateDays: number
}

interface ProfileClientProps {
  initialUser: any
  initialProfile: UserProfile | null
}

export function ProfileClient({ initialUser, initialProfile }: ProfileClientProps) {
  const { toast: appToast } = useToast()
  const [profile, setProfile] = useState<UserProfile | null>(initialProfile)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [attendanceSummary, setAttendanceSummary] = useState<AttendanceSummary | null>(null)

  const [editForm, setEditForm] = useState({
    first_name: "",
    last_name: "",
  })

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  })
  const [showPasswordChange, setShowPasswordChange] = useState(false)
  const searchParams = useSearchParams()

  // if redirected with forceChange flag, open password form automatically
  useEffect(() => {
    try {
      const force = searchParams?.get?.("forceChange")
      const reason = searchParams?.get?.("reason")
      if (force) {
        setShowPasswordChange(true)
        if (reason === "monthly") {
          setError(getPasswordEnforcementMessage())
        }
      }
    } catch (e) {
      // ignore
    }
  }, [searchParams])
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  useEffect(() => {
    if (!initialProfile) {
      fetchProfile()
    } else {
      setLoading(false)
      // Initialize edit form with profile data
      setEditForm({
        first_name: initialProfile.first_name || "",
        last_name: initialProfile.last_name || "",
      })
    }
    fetchAttendanceSummary()
  }, [initialProfile])

  const fetchProfile = async () => {
    try {
      const supabase = createClient()
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError) {
        console.error("Auth error:", userError)
        throw new Error(`Authentication error: ${userError.message}`)
      }

      if (!user) {
        throw new Error("No authenticated user found")
      }

      const { data: profileData, error } = await supabase
        .from("user_profiles")
        .select(`
          *,
          departments (
            id,
            name,
            code
          ),
          assigned_location:assigned_location_id (
            id,
            name,
            address,
            district_id,
            districts (
              id,
              name
            )
          )
        `)
        .eq("id", user.id)
        .maybeSingle()

      if (error) {
        console.error("Database query error:", error)
        throw new Error(`Database error: ${error.message}`)
      }

      if (!profileData) {
        // Create a basic profile for the user if it doesn't exist
        console.log("Creating new profile for user:", user.id)
        const { data: newProfile, error: createError } = await supabase
          .from("user_profiles")
          .insert({
            id: user.id,
            email: user.email,
            first_name: user.user_metadata?.first_name || "",
            last_name: user.user_metadata?.last_name || "",
            role: "staff", // Default role for new users
            is_active: true,
          })
          .select(`
            *,
            departments (
              id,
              name,
              code
            ),
            assigned_location:assigned_location_id (
              id,
              name,
              address,
              district_id,
              districts (
                id,
                name
              )
            )
          `)
          .single()

        if (createError) {
          console.error("Profile creation error:", createError)
          throw new Error(`Failed to create profile: ${createError.message}`)
        }

        setProfile(newProfile)
        setEditForm({
          first_name: newProfile.first_name || "",
          last_name: newProfile.last_name || "",
        })
      } else {
        setProfile(profileData)
        setEditForm({
          first_name: profileData.first_name || "",
          last_name: profileData.last_name || "",
        })
      }
    } catch (error: any) {
      console.error("Failed to load profile:", error)
      const errorMessage = error?.message || "Unknown error occurred"
      setError(`Failed to load profile: ${errorMessage}`)
    } finally {
      setLoading(false)
    }
  }

  const fetchAttendanceSummary = async () => {
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) return

      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      const startOfYear = new Date(now.getFullYear(), 0, 1)

      // Fetch all-time attendance summary
      const { data: allTimeData, error: allTimeError } = await supabase
        .from("attendance_records")
        .select("work_hours, status, check_in_time")
        .eq("user_id", user.id)
        .gte("check_in_time", startOfYear.toISOString())

      if (allTimeError) throw allTimeError

      // Fetch this month's attendance
      const { data: monthData, error: monthError } = await supabase
        .from("attendance_records")
        .select("work_hours, status")
        .eq("user_id", user.id)
        .gte("check_in_time", startOfMonth.toISOString())

      if (monthError) throw monthError

      const totalDays = allTimeData?.length || 0
      const totalHours = allTimeData?.reduce((sum, record) => sum + (record.work_hours || 0), 0) || 0
      const averageHours = totalDays > 0 ? totalHours / totalDays : 0

      const thisMonthDays = monthData?.length || 0
      const thisMonthHours = monthData?.reduce((sum, record) => sum + (record.work_hours || 0), 0) || 0

      const presentDays = allTimeData?.filter((record) => record.status === "present").length || 0
      const lateDays = allTimeData?.filter((record) => record.status === "late").length || 0

      setAttendanceSummary({
        totalDays,
        totalHours,
        averageHours,
        thisMonthDays,
        thisMonthHours,
        presentDays,
        lateDays,
      })
    } catch (error) {
      console.error("Failed to fetch attendance summary:", error)
    }
  }

  const handleSave = async () => {
    if (!profile) return

    setSaving(true)
    setError(null)

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("user_profiles")
        .update({
          first_name: editForm.first_name,
          last_name: editForm.last_name,
          updated_at: new Date().toISOString(),
        })
        .eq("id", profile.id)

      if (error) throw error

      setSuccess("Profile updated successfully")
      appToast({
        title: "Profile updated",
        description: "Your profile information was saved successfully.",
      })
      toast.success("Profile updated successfully")
      setIsEditing(false)
      fetchProfile() // Refresh profile data
      setTimeout(() => setSuccess(null), 3000)
    } catch (error) {
      setError("Failed to update profile")
      appToast({
        title: "Update failed",
        description: "Failed to update profile.",
        variant: "destructive",
      })
      toast.error("Failed to update profile")
    } finally {
      setSaving(false)
    }
  }

  const handlePasswordChange = async () => {
    if (!passwordForm.currentPassword.trim()) {
      const message = "Current password is required"
      setError(message)
      appToast({ title: "Password update failed", description: message, variant: "destructive" })
      toast.error(message)
      return
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      const message = "New passwords do not match"
      setError(message)
      appToast({ title: "Password update failed", description: message, variant: "destructive" })
      toast.error(message)
      return
    }

    const passwordValidation = validatePassword(passwordForm.newPassword)
    if (!passwordValidation.isValid) {
      const message = `Password requirements not met: ${passwordValidation.errors.join(", ")}`
      setError(message)
      appToast({ title: "Password requirements not met", description: message, variant: "destructive" })
      toast.error(message)
      return
    }

    setSaving(true)
    setError(null)

    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        const detailMessage = Array.isArray(result.details) ? result.details.join(", ") : null
        throw new Error(detailMessage ? `${result.error || "Failed to update password"}: ${detailMessage}` : (result.error || "Failed to update password"))
      }

      const successMessage = result.message || "Password updated successfully"
      setSuccess(successMessage)
      appToast({
        title: "Password updated",
        description: successMessage,
      })
      toast.success(successMessage)
      setShowPasswordChange(false)
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" })
      setShowCurrentPassword(false)
      setShowNewPassword(false)
      setShowConfirmPassword(false)
      setTimeout(() => setSuccess(null), 3000)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update password"
      setError(message)
      appToast({ title: "Password update failed", description: message, variant: "destructive" })
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center items-center h-64">Loading profile...</div>
  }

  if (!profile) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Profile not found</p>
      </div>
    )
  }

  const userInitials = `${profile.first_name[0]}${profile.last_name[0]}`

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-primary">Profile Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage your personal information, account details, and attendance history
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="profile">Profile Info</TabsTrigger>
          <TabsTrigger value="security">Security & Preferences</TabsTrigger>
          <TabsTrigger value="attendance">Attendance History</TabsTrigger>
          <TabsTrigger value="summary">Quick Summary</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          {/* Profile Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Personal Information
              </CardTitle>
              <CardDescription>Your QCC account details and contact information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Profile Picture */}
              <div className="flex items-center gap-6">
                <Avatar className="h-24 w-24">
                  <AvatarImage src={profile.profile_image_url || "/placeholder.svg"} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-xl">{userInitials}</AvatarFallback>
                </Avatar>
                <div>
                  <Button variant="outline" size="sm">
                    <Camera className="mr-2 h-4 w-4" />
                    Change Photo
                  </Button>
                  <p className="text-sm text-muted-foreground mt-2">Upload a professional photo for your profile</p>
                </div>
              </div>

              {/* Basic Information */}
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="firstName">First Name</Label>
                  {isEditing ? (
                    <SecureInput
                      id="firstName"
                      value={editForm.first_name}
                      onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
                      maxLength={50}
                      allowedChars={/^[a-zA-Z\s]*$/}
                    />
                  ) : (
                    <div className="p-2 bg-muted rounded-md">{profile.first_name}</div>
                  )}
                </div>
                <div>
                  <Label htmlFor="lastName">Last Name</Label>
                  {isEditing ? (
                    <SecureInput
                      id="lastName"
                      value={editForm.last_name}
                      onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
                      maxLength={50}
                      allowedChars={/^[a-zA-Z\s]*$/}
                    />
                  ) : (
                    <div className="p-2 bg-muted rounded-md">{profile.last_name}</div>
                  )}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="email">Email Address</Label>
                  <div className="p-2 bg-muted rounded-md flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    {profile.email}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">Email cannot be changed</p>
                </div>
                <div>
                  <Label htmlFor="employeeId">Employee ID</Label>
                  <div className="p-2 bg-muted rounded-md">{profile.employee_id}</div>
                  <p className="text-sm text-muted-foreground mt-1">Employee ID cannot be changed</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="position">Position</Label>
                  <div className="p-2 bg-muted rounded-md flex items-center gap-2">
                    <Lock className="h-4 w-4 text-muted-foreground" />
                    {profile.position}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">Only admin can change position</p>
                </div>
                <div>
                  <Label htmlFor="phone">Phone Number</Label>
                  <div className="p-2 bg-muted rounded-md flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    {profile.phone_number || profile.phone || "Not provided"}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">Only admin can change phone number</p>
                </div>
              </div>

              {/* Organization Information */}
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Department</Label>
                  <div className="p-2 bg-muted rounded-md flex items-center gap-2">
                    <Building className="h-4 w-4 text-muted-foreground" />
                    {profile.departments?.name || "No department assigned"}
                  </div>
                </div>
                <div>
                  <Label>Location</Label>
                  <div className="p-2 bg-muted rounded-md flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    {profile.assigned_location?.districts?.name || "No location assigned"}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Role</Label>
                  <div className="p-2">
                    <Badge variant={profile.role === "admin" ? "default" : "secondary"}>
                      {profile.role.replace("_", " ").toUpperCase()}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label>Account Status</Label>
                  <div className="p-2">
                    <Badge variant={profile.is_active ? "default" : "destructive"}>
                      {profile.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-4">
                {isEditing ? (
                  <>
                    <Button onClick={handleSave} disabled={saving}>
                      <Save className="mr-2 h-4 w-4" />
                      {saving ? "Saving..." : "Save Changes"}
                    </Button>
                    <Button variant="outline" onClick={() => setIsEditing(false)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button onClick={() => setIsEditing(true)}>Edit Profile</Button>
                )}
              </div>

              {/* Password Change Section */}
              <div className="border-t pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-medium">Password</h3>
                    <p className="text-sm text-muted-foreground">Change your account password</p>
                  </div>
                  <Button variant="outline" onClick={() => setShowPasswordChange(!showPasswordChange)}>
                    <Key className="mr-2 h-4 w-4" />
                    Change Password
                  </Button>
                </div>

                {/* if redirected due to expiry, force form open */}
                {searchParams?.get?.("forceChange") && !showPasswordChange && (
                  <p className="text-sm text-red-600 mt-2">Your password has expired; please update before using the app.</p>
                )}

                {showPasswordChange && (
                  <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
                    <div>
                      <Label htmlFor="currentPassword">Current Password</Label>
                      <div className="relative">
                        <SecureInput
                          id="currentPassword"
                          type={showCurrentPassword ? "text" : "password"}
                          value={passwordForm.currentPassword}
                          onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                          placeholder="Enter current password"
                          sanitize={false}
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
                        <SecureInput
                          id="newPassword"
                          type={showNewPassword ? "text" : "password"}
                          value={passwordForm.newPassword}
                          onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                          placeholder="Enter new password"
                          sanitize={false}
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
                      <p className="text-xs text-muted-foreground mt-1">
                        Password must be at least 8 characters with uppercase, lowercase, number, and special character
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="confirmPassword">Confirm New Password</Label>
                      <div className="relative">
                        <SecureInput
                          id="confirmPassword"
                          type={showConfirmPassword ? "text" : "password"}
                          value={passwordForm.confirmPassword}
                          onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                          placeholder="Confirm new password"
                          sanitize={false}
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
                    <div className="flex gap-2">
                      <Button type="button" onClick={handlePasswordChange} disabled={saving}>
                        {saving ? "Updating..." : "Update Password"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setShowPasswordChange(false)
                          setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" })
                          setShowCurrentPassword(false)
                          setShowNewPassword(false)
                          setShowConfirmPassword(false)
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          {/* Password Change Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Change Password
              </CardTitle>
              <CardDescription>
                Update your password to keep your account secure
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!showPasswordChange ? (
                <Button type="button" onClick={() => setShowPasswordChange(true)} className="w-full">
                  <Key className="h-4 w-4 mr-2" />
                  Change Password
                </Button>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="currentPassword">Current Password</Label>
                    <div className="relative">
                      <SecureInput
                        id="currentPassword"
                        type={showCurrentPassword ? "text" : "password"}
                        value={passwordForm.currentPassword}
                        onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                        placeholder="Enter current password"
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      >
                        {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="newPassword">New Password</Label>
                    <div className="relative">
                      <SecureInput
                        id="newPassword"
                        type={showNewPassword ? "text" : "password"}
                        value={passwordForm.newPassword}
                        onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                        placeholder="Enter new password"
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                      >
                        {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm New Password</Label>
                    <div className="relative">
                      <SecureInput
                        id="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        value={passwordForm.confirmPassword}
                        onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                        placeholder="Confirm new password"
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={handlePasswordChange} disabled={saving} className="flex-1">
                      {saving ? "Updating..." : "Update Password"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowPasswordChange(false)
                        setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" })
                        setShowCurrentPassword(false)
                        setShowNewPassword(false)
                        setShowConfirmPassword(false)
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Preferences Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="h-5 w-5" />
                Preferences
              </CardTitle>
              <CardDescription>
                Customize your experience and notification settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">Email Notifications</Label>
                    <p className="text-xs text-muted-foreground">Receive email updates about your account</p>
                  </div>
                  <Button variant="outline" size="sm">
                    Configure
                  </Button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">Theme</Label>
                    <p className="text-xs text-muted-foreground">Choose your preferred theme</p>
                  </div>
                  <Button variant="outline" size="sm">
                    Light/Dark
                  </Button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">Language</Label>
                    <p className="text-xs text-muted-foreground">Select your preferred language</p>
                  </div>
                  <Button variant="outline" size="sm">
                    English
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notifications & Cache */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notifications
              </CardTitle>
              <CardDescription>Manage in-app notifications and clear local cache</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Notification Center</Label>
                  <p className="text-xs text-muted-foreground">View and manage your leave notifications</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => window.location.href = '/dashboard/leave-notifications'}>
                    Manage
                  </Button>
                  <RequestLeaveButton />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Clear Cache</Label>
                  <p className="text-xs text-muted-foreground">Remove cached data and reload the app</p>
                </div>
                <Button variant="ghost" size="sm" onClick={async () => {
                  try {
                    await clearAppCache()
                    // reload to ensure a clean state
                    window.location.reload()
                  } catch (e) {
                    console.error('Failed to clear cache from settings:', e)
                    alert('Failed to clear cache')
                  }
                }}>
                  Clear Cache
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Account Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Account Actions
              </CardTitle>
              <CardDescription>
                Manage your account security and access
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Sign Out</Label>
                  <p className="text-xs text-muted-foreground">Sign out from your current session</p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={async () => {
                    const confirmed = window.confirm("Are you sure you want to sign out?")
                    if (confirmed) {
                      const supabase = createClient()
                      await supabase.auth.signOut()
                      window.location.href = "/auth/login"
                    }
                  }}
                >
                  Sign Out
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attendance" className="space-y-6">
          <PersonalAttendanceHistory />
        </TabsContent>

        <TabsContent value="summary" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Profile Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Profile Summary
                </CardTitle>
                <CardDescription>Your account overview</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={profile.profile_image_url || "/placeholder.svg"} />
                    <AvatarFallback className="bg-primary text-primary-foreground text-lg">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="text-lg font-semibold">
                      {profile.first_name} {profile.last_name}
                    </h3>
                    <p className="text-sm text-muted-foreground">{profile.position}</p>
                    <p className="text-sm text-muted-foreground">ID: {profile.employee_id}</p>
                  </div>
                </div>
                <div className="grid gap-2">
                  <div className="flex justify-between">
                    <span className="text-sm">Department:</span>
                    <span className="text-sm font-medium">{profile.departments?.name || "N/A"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Location:</span>
                    <span className="text-sm font-medium">{profile.districts?.name || "N/A"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Role:</span>
                    <Badge variant={profile.role === "admin" ? "default" : "secondary"} className="text-xs">
                      {profile.role.replace("_", " ").toUpperCase()}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Attendance Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Attendance Overview
                </CardTitle>
                <CardDescription>Your attendance statistics this year</CardDescription>
              </CardHeader>
              <CardContent>
                {attendanceSummary ? (
                  <div className="space-y-4">
                    <div className="grid gap-4 grid-cols-2">
                      <div className="text-center p-3 bg-muted rounded-lg">
                        <div className="text-2xl font-bold text-primary">{attendanceSummary.totalDays}</div>
                        <p className="text-xs text-muted-foreground">Total Days</p>
                      </div>
                      <div className="text-center p-3 bg-muted rounded-lg">
                        <div className="text-2xl font-bold text-primary">
                          {Math.round(attendanceSummary.totalHours)}
                        </div>
                        <p className="text-xs text-muted-foreground">Total Hours</p>
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <div className="flex justify-between">
                        <span className="text-sm">This Month:</span>
                        <span className="text-sm font-medium">{attendanceSummary.thisMonthDays} days</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Average Hours:</span>
                        <span className="text-sm font-medium">{attendanceSummary.averageHours.toFixed(1)}h/day</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Present Days:</span>
                        <span className="text-sm font-medium text-green-600">{attendanceSummary.presentDays}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Late Days:</span>
                        <span className="text-sm font-medium text-orange-600">{attendanceSummary.lateDays}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">Loading attendance summary...</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
