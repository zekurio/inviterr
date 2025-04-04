"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { User, Ban, Check, AlertTriangle, Loader2, LogOut } from "lucide-react";
import {
  PasswordRequirements,
  passwordValidation,
} from "@/components/password-requirements";
import { api } from "@/trpc/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { signOut } from "next-auth/react";
import Image from "next/image";
import { AvatarWithFallback } from "@/components/avatar";
import { Skeleton } from "@/components/ui/skeleton";

export function AccountView({
  className,
  ...props
}: React.ComponentProps<"div">) {
  // --- tRPC Hooks --- //
  const {
    data: userData,
    isLoading: isLoadingUser,
    error: userError,
  } = api.accounts.getCurrentUser.useQuery(
    undefined, // No input needed for getCurrentUser
    {
      staleTime: Infinity, // User data unlikely to change often in this view
      retry: false, // Don't retry if fetching user fails initially
    },
  );

  const updateUsernameMutation = api.accounts.updateUsername.useMutation();
  const updatePasswordMutation = api.accounts.updatePassword.useMutation();
  const deleteAccountMutation = api.accounts.deleteAccount.useMutation();

  // --- State --- //
  // Username state
  const [username, setUsername] = useState("");
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameSuccess, setUsernameSuccess] = useState(false);

  // Password form state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // Delete account state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // --- Effects --- //
  // Set initial username from fetched data
  useEffect(() => {
    if (userData?.username) {
      setUsername(userData.username);
    }
  }, [userData]);

  // Reset success/error messages on mutation state change
  useEffect(() => {
    if (updateUsernameMutation.isSuccess) setUsernameSuccess(true);
    else setUsernameSuccess(false);
    if (updateUsernameMutation.isError)
      setUsernameError(updateUsernameMutation.error.message);
    else setUsernameError(null);
  }, [
    updateUsernameMutation.isSuccess,
    updateUsernameMutation.isError,
    updateUsernameMutation.error,
  ]);

  useEffect(() => {
    if (updatePasswordMutation.isSuccess) {
      setPasswordSuccess(true);
      // Clear password fields on success
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } else setPasswordSuccess(false);
    if (updatePasswordMutation.isError)
      setPasswordError(updatePasswordMutation.error.message);
    else setPasswordError(null);
  }, [
    updatePasswordMutation.isSuccess,
    updatePasswordMutation.isError,
    updatePasswordMutation.error,
  ]);

  useEffect(() => {
    if (deleteAccountMutation.isError)
      setDeleteError(deleteAccountMutation.error.message);
    else setDeleteError(null);
    if (deleteAccountMutation.isSuccess) {
      setIsDeleteDialogOpen(false);
      // Sign out the user after successful deletion
      void signOut({ callbackUrl: "/" }); // Redirect to home after sign out
    }
  }, [
    deleteAccountMutation.isSuccess,
    deleteAccountMutation.isError,
    deleteAccountMutation.error,
  ]);

  // --- Event Handlers --- //
  const handleUsernameUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    setUsernameError(null);
    setUsernameSuccess(false);

    if (!username || username === userData?.username) return; // Don't submit if unchanged

    if (
      !/^[a-zA-Z0-9]+$/.test(username) ||
      username.length > 12 ||
      username.length < 1
    ) {
      setUsernameError("Username must be alphanumeric (1-12 characters).");
      return;
    }

    updateUsernameMutation.mutate({ newUsername: username });
  };

  const handlePasswordUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError("All password fields are required");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords don't match");
      return;
    }
    if (!passwordValidation.checkAll(newPassword)) {
      setPasswordError("New password does not meet all requirements.");
      return;
    }

    updatePasswordMutation.mutate({ currentPassword, newPassword });
  };

  const handleAccountDelete = () => {
    setDeleteError(null);
    deleteAccountMutation.mutate();
  };

  // --- Derived State --- //
  const passwordsMatch = newPassword === confirmPassword;
  const allPasswordRequirementsMet = passwordValidation.checkAll(newPassword);
  const canUpdatePassword = Boolean(
    currentPassword &&
      newPassword &&
      confirmPassword &&
      passwordsMatch &&
      allPasswordRequirementsMet,
  );
  const canUpdateUsername = Boolean(
    username &&
      username !== userData?.username &&
      /^[a-zA-Z0-9]+$/.test(username) &&
      username.length <= 12 &&
      username.length >= 1,
  );

  // --- Render Logic --- //
  if (isLoadingUser) {
    // --- Skeleton Loading State --- //
    return (
      <div className="animate-pulse space-y-6">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-24" />
        </div>

        {/* Profile Card Skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-4">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-48" />
              </div>
            </div>
            <Separator />
            <div className="space-y-4">
              <div className="grid gap-2">
                <Skeleton className="h-4 w-16" /> {/* Label */}
                <Skeleton className="h-10 w-full" /> {/* Input */}
                <Skeleton className="h-3 w-32" /> {/* Hint text */}
              </div>
              <div className="flex justify-end">
                <Skeleton className="h-10 w-36" /> {/* Button */}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Password Card Skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-56" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Skeleton className="h-4 w-28" /> {/* Label */}
              <Skeleton className="h-10 w-full" /> {/* Input */}
            </div>
            <div className="grid gap-2">
              <Skeleton className="h-4 w-24" /> {/* Label */}
              <Skeleton className="h-10 w-full" /> {/* Input */}
            </div>
            {/* Skeleton for requirements (optional, can simplify) */}
            <div className="space-y-2 pt-1">
              <Skeleton className="h-2 w-full" /> {/* Progress */}
              <Skeleton className="mt-1 h-3 w-48" />
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-44" />
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
            <div className="grid gap-2">
              <Skeleton className="h-4 w-40" /> {/* Label */}
              <Skeleton className="h-10 w-full" /> {/* Input */}
            </div>
            <div className="flex justify-end">
              <Skeleton className="h-10 w-36" /> {/* Button */}
            </div>
          </CardContent>
        </Card>

        {/* Danger Zone Card Skeleton */}
        <Card className="border-transparent">
          {" "}
          {/* Avoid double border with skeleton */}
          <CardHeader>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent>
            <div className="border-border bg-background rounded-lg border p-4">
              <div className="flex items-start gap-4">
                <Skeleton className="mt-0.5 h-5 w-5" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-36" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="mt-1 h-9 w-32" /> {/* Button */}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (userError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error Loading Account</AlertTitle>
        <AlertDescription>{userError.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Account Settings</h1>
        <Button variant="outline" size="sm" onClick={() => signOut()}>
          <LogOut className="mr-2 h-4 w-4" />
          Log Out
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            Manage your Jellyfin user profile settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-4">
            <AvatarWithFallback
              src={userData?.image ?? ""}
              name={userData?.username ?? "User"}
            />
            <div>
              <p className="text-sm leading-none font-medium">
                {userData?.username ?? "..."}
              </p>
              {/* Display Email (no blur) */}
              {userData?.email && (
                <p className="text-muted-foreground text-sm">
                  {userData.email}
                </p>
              )}
            </div>
          </div>

          <Separator />

          <form onSubmit={handleUsernameUpdate} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setUsernameSuccess(false);
                  setUsernameError(null);
                }}
                placeholder="Enter your username"
                disabled={updateUsernameMutation.isPending}
                maxLength={12}
              />
              <p className="text-muted-foreground text-xs">
                Alphanumeric, 1-12 characters.
              </p>
              {usernameError && (
                <p className="text-destructive flex items-center gap-1 text-sm">
                  <AlertCircle className="h-4 w-4" />
                  {usernameError}
                </p>
              )}
              {usernameSuccess && (
                <p className="flex items-center gap-1 text-sm text-green-600 dark:text-green-500">
                  <Check className="h-4 w-4" />
                  Username updated successfully
                </p>
              )}
            </div>

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={
                  updateUsernameMutation.isPending || !canUpdateUsername
                }
              >
                {updateUsernameMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />{" "}
                    Updating...
                  </>
                ) : (
                  "Update Username"
                )}
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
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  setPasswordSuccess(false);
                  setPasswordError(null);
                }}
                disabled={updatePasswordMutation.isPending}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setPasswordSuccess(false);
                  setPasswordError(null);
                }}
                maxLength={passwordValidation.MAX_LEN}
                disabled={updatePasswordMutation.isPending}
              />
            </div>

            <PasswordRequirements password={newPassword} />

            <div className="grid gap-2">
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setPasswordSuccess(false);
                  setPasswordError(null);
                }}
                maxLength={passwordValidation.MAX_LEN}
                disabled={updatePasswordMutation.isPending}
              />
            </div>

            {passwordError && (
              <div className="text-destructive flex items-center gap-1 text-sm">
                <AlertCircle className="h-4 w-4" />
                {passwordError}
              </div>
            )}

            {passwordSuccess && (
              <div className="flex items-center gap-1 text-sm text-green-600 dark:text-green-500">
                <Check className="h-4 w-4" />
                Password updated successfully
              </div>
            )}

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={
                  updatePasswordMutation.isPending || !canUpdatePassword
                }
              >
                {updatePasswordMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />{" "}
                    Updating...
                  </>
                ) : (
                  "Update Password"
                )}
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
          <CardDescription>Irreversible account actions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border-destructive/20 bg-destructive/5 rounded-lg border p-4">
            <div className="flex items-start gap-4">
              <Ban className="text-destructive mt-0.5 h-5 w-5 shrink-0" />
              <div className="space-y-2">
                <h3 className="font-medium">Delete your account</h3>
                <p className="text-muted-foreground text-sm">
                  This will permanently delete your Jellyfin user account. This
                  action cannot be undone.
                </p>

                <AlertDialog
                  open={isDeleteDialogOpen}
                  onOpenChange={setIsDeleteDialogOpen}
                >
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={deleteAccountMutation.isPending}
                    >
                      {deleteAccountMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />{" "}
                          Deleting...
                        </>
                      ) : (
                        "Delete Account"
                      )}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Are you absolutely sure?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently
                        delete your Jellyfin account.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    {deleteError && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Error Deleting Account</AlertTitle>
                        <AlertDescription>{deleteError}</AlertDescription>
                      </Alert>
                    )}
                    <AlertDialogFooter>
                      <AlertDialogCancel
                        disabled={deleteAccountMutation.isPending}
                      >
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleAccountDelete}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        disabled={deleteAccountMutation.isPending}
                      >
                        {deleteAccountMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />{" "}
                            Deleting...
                          </>
                        ) : (
                          "Delete Account"
                        )}
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
  );
}
