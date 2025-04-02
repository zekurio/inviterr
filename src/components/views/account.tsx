"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Separator } from "@/components/ui/separator"
import { User, Ban, Check, AlertTriangle } from "lucide-react"

export function AccountView({
  className,
  ...props
}: React.ComponentProps<"div">) {
  // Mock user data
  const mockInviterrUser = {
    id: "user-1",
    email: "user@example.com",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString() // 30 days ago
  }
  
  const mockJellyfinUser = {
    Id: "jf-user-1",
    Name: "SampleUser",
    HasPassword: true
  }
  
  // Username state
  const [username, setUsername] = useState("SampleUser")
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [usernameSuccess, setUsernameSuccess] = useState(false)
  const [updatingUsername, setUpdatingUsername] = useState(false)
  
  // Password form state
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [updating, setUpdating] = useState(false)
  
  // Delete account state
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Mock function to update username
  const handleUsernameUpdate = (e: React.FormEvent) => {
    e.preventDefault()
    setUsernameError(null)
    setUsernameSuccess(false)
    
    if (!username) {
      setUsernameError("Username cannot be empty")
      return
    }
    
    setUpdatingUsername(true)
    
    // Simulate API call
    setTimeout(() => {
      setUpdatingUsername(false)
      setUsernameSuccess(true)
      console.log("Mock updating username to:", username)
    }, 1000)
  }
  
  // Mock function to update password
  const handlePasswordUpdate = (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError(null)
    setPasswordSuccess(false)
    
    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError("All password fields are required")
      return
    }
    
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords don't match")
      return
    }
    
    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters")
      return
    }
    
    setUpdating(true)
    
    // Simulate API call
    setTimeout(() => {
      setUpdating(false)
      
      // Always succeed in mock version
      setPasswordSuccess(true)
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      console.log("Mock updating password")
    }, 1000)
  }
  
  // Mock function to delete account
  const handleAccountDelete = () => {
    setDeleting(true)
    setDeleteError(null)
    
    // Simulate API call
    setTimeout(() => {
      setDeleting(false)
      setConfirmDelete(false)
      console.log("Mock deleting account")
      alert("Account deletion simulated. This is a mock component.")
    }, 1000)
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Account Settings</h1>
      </div>

      {/* PROFILE SECTION */}
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            Manage your Jellyfin user profile settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-4">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <User className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium leading-none">
                {username}
              </p>
              <p className="text-sm text-muted-foreground">
                Member since {new Date(mockInviterrUser.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
          
          <Separator />
          
          <form onSubmit={handleUsernameUpdate} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
              />
              {usernameError && (
                <p className="text-sm text-destructive">{usernameError}</p>
              )}
              {usernameSuccess && (
                <p className="text-sm text-green-600 dark:text-green-500 flex items-center gap-1">
                  <Check className="h-4 w-4" />
                  Username updated successfully
                </p>
              )}
            </div>
            
            <div className="flex justify-end">
              <Button type="submit" disabled={updatingUsername}>
                {updatingUsername ? "Updating..." : "Update Username"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      
      {/* PASSWORD SECTION */}
      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>
            Update your Jellyfin account password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordUpdate} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="current-password">Current Password</Label>
              <Input 
                id="current-password" 
                type="password" 
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input 
                id="new-password" 
                type="password" 
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <Input 
                id="confirm-password" 
                type="password" 
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            
            {passwordError && (
              <div className="text-destructive text-sm">{passwordError}</div>
            )}
            
            {passwordSuccess && (
              <div className="text-green-600 dark:text-green-500 text-sm flex items-center gap-1">
                <Check className="h-4 w-4" />
                Password updated successfully
              </div>
            )}
            
            <div className="flex justify-end">
              <Button type="submit" disabled={updating}>
                {updating ? "Updating..." : "Update Password"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      
      {/* DANGER ZONE SECTION */}
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Danger Zone
          </CardTitle>
          <CardDescription>
            Irreversible account actions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border border-destructive/20 rounded-lg p-4 bg-destructive/5">
            <div className="flex items-start gap-4">
              <Ban className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-2">
                <h3 className="font-medium">Delete your account</h3>
                <p className="text-sm text-muted-foreground">
                  This will permanently delete your Jellyfin user account and all associated data.
                  This action cannot be undone.
                </p>
                
                <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      Delete Account
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete your
                        account and remove your data from our servers.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    {deleteError && (
                      <div className="text-destructive text-sm mb-4">{deleteError}</div>
                    )}
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleAccountDelete}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        disabled={deleting}
                      >
                        {deleting ? "Deleting..." : "Delete Account"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 