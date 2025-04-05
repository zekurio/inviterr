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
import { Separator } from "@/components/ui/separator";
import {
  Ban,
  Check,
  AlertTriangle,
  Loader2,
  LogOut,
  LinkIcon,
  Link2Off,
  ExternalLink,
  Mail,
} from "lucide-react";
import {
  PasswordRequirements,
  passwordValidation,
} from "@/components/password-requirements";
import { api } from "@/trpc/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { signOut, signIn } from "next-auth/react";
import { Skeleton } from "@/components/ui/skeleton";
import { FaDiscord } from "react-icons/fa";
import { UnlinkProviderDialog } from "@/components/dialogs/unlink-provider";
import { DeleteJellyfinAccountDialog } from "@/components/dialogs/delete-jellyfin-account";

export function AccountView() {
  const utils = api.useUtils(); // Get tRPC utils for invalidation
  const {
    data: userData,
    isLoading: isLoadingUser,
    error: userError,
    refetch: refetchUser,
  } = api.accounts.getCurrentUser.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    retry: (failureCount, error) => {
      if (error.data?.code === "UNAUTHORIZED") return false;
      return failureCount < 1;
    },
  });

  // Mutations
  const updateUsernameMutation = api.accounts.updateUsername.useMutation({
    onSuccess: () => utils.accounts.getCurrentUser.invalidate(),
  });
  const updatePasswordMutation = api.accounts.updatePassword.useMutation();
  const deleteAccountMutation = api.accounts.deleteAccount.useMutation({
    onSuccess: () => {
      setDeleteError(null);
      void signOut({ callbackUrl: "/" });
    },
    onError: (error) => {
      setDeleteError(error.message);
    },
  });
  const linkJellyfinMutation = api.accounts.linkJellyfinAccount.useMutation({
    onSuccess: () => {
      setLinkJfUsername("");
      setLinkJfPassword("");
      setLinkJfError(null);
      utils.accounts.getCurrentUser.invalidate();
    },
    onError: (error) => {
      setLinkJfError(error.message);
    },
  });
  const unlinkProviderMutation = api.accounts.unlinkProvider.useMutation({
    onSuccess: (data, variables) => {
      console.log(`Successfully unlinked ${variables.provider}`);
      setUnlinkError(null);
      utils.accounts.getCurrentUser.invalidate();
    },
    onError: (error, variables) => {
      console.error(`Error unlinking ${variables.provider}:`, error);
      setUnlinkError(
        `Failed to unlink ${variables.provider}: ${error.message}`,
      );
    },
  });

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
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Link Jellyfin state
  const [linkJfUsername, setLinkJfUsername] = useState("");
  const [linkJfPassword, setLinkJfPassword] = useState("");
  const [linkJfError, setLinkJfError] = useState<string | null>(null);

  // Unlink Provider state
  const [unlinkError, setUnlinkError] = useState<string | null>(null);

  // --- Effects --- //
  // Set initial username from fetched data
  useEffect(() => {
    if (userData?.jellyfin?.username) {
      setUsername(userData.jellyfin.username);
    }
  }, [userData?.jellyfin?.username]);

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

  // Reset errors when relevant mutations reset
  useEffect(() => {
    if (deleteAccountMutation.isIdle || deleteAccountMutation.isSuccess) {
      setDeleteError(null);
    }
  }, [deleteAccountMutation.isIdle, deleteAccountMutation.isSuccess]);

  useEffect(() => {
    if (unlinkProviderMutation.isIdle || unlinkProviderMutation.isSuccess) {
      setUnlinkError(null);
    }
  }, [unlinkProviderMutation.isIdle, unlinkProviderMutation.isSuccess]);

  // --- Event Handlers --- //
  const handleUsernameUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    setUsernameError(null);
    setUsernameSuccess(false);
    if (!username || username === userData?.jellyfin?.username) return;
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

  // Handler for linking existing Jellyfin account
  const handleLinkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLinkJfError(null);
    if (!linkJfUsername || !linkJfPassword) {
      setLinkJfError("Jellyfin username and password are required.");
      return;
    }
    linkJellyfinMutation.mutate({
      username: linkJfUsername,
      password: linkJfPassword,
    });
  };

  // Specific handler for deleting the Jellyfin account
  const handleAccountDelete = () => {
    setDeleteError(null);
    deleteAccountMutation.mutate();
  };

  // Specific handler for unlinking Discord
  const handleUnlinkDiscord = () => {
    setUnlinkError(null);
    unlinkProviderMutation.mutate({ provider: "discord" });
  };

  // Specific handler for unlinking Jellyfin
  const handleUnlinkJellyfin = () => {
    setUnlinkError(null);
    unlinkProviderMutation.mutate({ provider: "jellyfin" });
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
      userData?.jellyfin &&
      username !== userData.jellyfin.username &&
      /^[a-zA-Z0-9]+$/.test(username) &&
      username.length <= 12 &&
      username.length >= 1,
  );

  // --- Render Logic --- //
  if (isLoadingUser) {
    // --- Skeleton Loading State --- //
    return (
      <div className="animate-pulse space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-24" />
        </div>

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
            <Skeleton className="h-5 w-32" />
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-28" />
            </div>
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-9 w-28" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div className="grid gap-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-3 w-32" />
              </div>
              <div className="flex justify-end">
                <Skeleton className="h-10 w-36" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-56" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="grid gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="space-y-2 pt-1">
              <Skeleton className="h-2 w-full" />
              <Skeleton className="mt-1 h-3 w-48" />
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-44" />
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
            <div className="grid gap-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="flex justify-end">
              <Skeleton className="h-10 w-36" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-transparent">
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
                  <Skeleton className="mt-1 h-9 w-32" />
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
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => refetchUser()}
        >
          Retry
        </Button>
      </Alert>
    );
  }

  // Main Account View Render
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Account Settings</h1>
        <Button variant="outline" size="sm" onClick={() => signOut()}>
          <LogOut className="mr-2 h-4 w-4" /> Log Out
        </Button>
      </div>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Linked Accounts</CardTitle>
          <CardDescription>
            Manage connections to external services.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border p-2">
            <div className="flex items-center gap-3">
              <FaDiscord className="h-6 w-6 text-[#5865F2]" />
              <div>
                <span className="text-sm font-medium">
                  {userData?.discordLinked ? "Discord Linked" : "Discord"}
                </span>
                <div className="text-muted-foreground text-xs">
                  {userData?.discordLinked && userData?.name && (
                    <span>{userData.name}</span>
                  )}
                  {userData?.discordLinked && userData?.email && (
                    <span className="ml-1">({userData.email})</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {userData?.discordLinked ? (
                <UnlinkProviderDialog
                  provider="discord"
                  onConfirm={handleUnlinkDiscord}
                  isPending={
                    unlinkProviderMutation.isPending &&
                    unlinkProviderMutation.variables?.provider === "discord"
                  }
                  error={unlinkError}
                  trigger={
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={unlinkProviderMutation.isPending}
                    >
                      {unlinkProviderMutation.isPending &&
                      unlinkProviderMutation.variables?.provider ===
                        "discord" ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Link2Off className="mr-2 h-4 w-4" />
                      )}
                      Unlink
                    </Button>
                  }
                />
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => signIn("discord", { callbackUrl: "/account" })}
                >
                  <LinkIcon className="mr-2 h-4 w-4" /> Link Discord
                </Button>
              )}
            </div>
          </div>

          {/* Jellyfin Link Status/Action/Form */}
          {userData?.jellyfin ? (
            <div className="flex items-center justify-between rounded-lg border p-2">
              <div className="flex items-center gap-3">
                <img
                  src="/jellyfin.svg"
                  alt="Jellyfin"
                  className="h-6 w-6"
                  style={{ background: "transparent" }}
                />
                <div className="text-sm">
                  <span className="font-medium">Jellyfin Linked: </span>
                  <span className="text-muted-foreground">
                    {userData.jellyfin.username}
                  </span>
                  {userData.jellyfin.isAdmin && (
                    <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                      Admin
                    </span>
                  )}
                </div>
              </div>
              <UnlinkProviderDialog
                provider="jellyfin"
                onConfirm={handleUnlinkJellyfin}
                isPending={
                  unlinkProviderMutation.isPending &&
                  unlinkProviderMutation.variables?.provider === "jellyfin"
                }
                error={unlinkError}
                trigger={
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={unlinkProviderMutation.isPending}
                  >
                    {unlinkProviderMutation.isPending &&
                    unlinkProviderMutation.variables?.provider ===
                      "jellyfin" ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Link2Off className="mr-2 h-4 w-4" />
                    )}
                    Unlink
                  </Button>
                }
              />
            </div>
          ) : (
            // Jellyfin Linking Form
            <form
              onSubmit={handleLinkSubmit}
              className="space-y-3 rounded-lg border p-3"
            >
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <img
                  src="/jellyfin.svg"
                  alt="Jellyfin"
                  className="h-6 w-6"
                  style={{ background: "transparent" }}
                />
                Link Existing Jellyfin Account
              </h3>
              {linkJfError && (
                <Alert variant="destructive" className="mt-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Linking Error</AlertTitle>
                  <AlertDescription>{linkJfError}</AlertDescription>
                </Alert>
              )}
              <div className="grid gap-2">
                <Label htmlFor="link-jf-username">Jellyfin Username</Label>
                <Input
                  id="link-jf-username"
                  value={linkJfUsername}
                  onChange={(e) => setLinkJfUsername(e.target.value)}
                  placeholder="YourJellyfinUser"
                  disabled={linkJellyfinMutation.isPending}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="link-jf-password">Jellyfin Password</Label>
                <Input
                  id="link-jf-password"
                  type="password"
                  value={linkJfPassword}
                  onChange={(e) => setLinkJfPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={linkJellyfinMutation.isPending}
                  required
                />
              </div>
              <Button
                type="submit"
                size="sm"
                disabled={
                  linkJellyfinMutation.isPending ||
                  !linkJfUsername ||
                  !linkJfPassword
                }
              >
                {linkJellyfinMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <LinkIcon className="mr-2 h-4 w-4" />
                )}
                Link Jellyfin Account
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* --- Jellyfin Account Management (only shown if linked) --- */}
      {userData?.jellyfin && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Jellyfin Account Management</CardTitle>
            <CardDescription>
              Manage your linked Jellyfin user profile settings.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Username Update Form */}
            <form onSubmit={handleUsernameUpdate} className="space-y-3">
              <div className="grid gap-2">
                <Label htmlFor="username">Jellyfin Username</Label>
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
                    <AlertCircle className="h-4 w-4" /> {usernameError}
                  </p>
                )}
                {usernameSuccess && (
                  <p className="flex items-center gap-1 text-sm text-green-600 dark:text-green-500">
                    <Check className="h-4 w-4" /> Username updated successfully
                  </p>
                )}
              </div>
              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={
                    updateUsernameMutation.isPending || !canUpdateUsername
                  }
                  size="sm"
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

            <Separator />

            {/* Password Update Form */}
            <form onSubmit={handlePasswordUpdate} className="space-y-3">
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
                  <AlertCircle className="h-4 w-4" /> {passwordError}
                </div>
              )}
              {passwordSuccess && (
                <div className="flex items-center gap-1 text-sm text-green-600 dark:text-green-500">
                  <Check className="h-4 w-4" /> Password updated successfully
                </div>
              )}
              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={
                    updatePasswordMutation.isPending || !canUpdatePassword
                  }
                  size="sm"
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
      )}

      {/* --- Danger Zone --- */}
      {userData?.jellyfin && (
        <Card className="border-red-500">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-red-500">
              <AlertTriangle className="h-5 w-5" /> Danger Zone
            </CardTitle>
            <CardDescription>
              Actions that can have serious consequences. Proceed with caution.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="text-destructive flex items-center gap-1 text-sm font-medium">
                  <Ban className="h-4 w-4" /> Delete Jellyfin Account
                </h3>
                <p className="text-muted-foreground text-xs">
                  Permanently delete your Jellyfin account. This action cannot
                  be undone.
                </p>
              </div>
              <DeleteJellyfinAccountDialog
                onConfirm={handleAccountDelete}
                isPending={deleteAccountMutation.isPending}
                error={deleteError}
                trigger={
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={deleteAccountMutation.isPending}
                  >
                    {deleteAccountMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Delete Account
                  </Button>
                }
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
