"use client";

import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { useState } from "react";
import { api } from "@/trpc/react";
import type { TRPCClientErrorLike } from "@trpc/client";
import type { AppRouter } from "@/server/api/root";
import { PrivacyNotice } from "../privacy-notice";
import {
  PasswordRequirements,
  passwordValidation,
} from "../password-requirements";

export function RegisterForm({
  className,
  onSuccess,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & {
  onSuccess: (data: { id: string; username: string }) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createAccountMutation = api.accounts.create.useMutation({
    onSuccess: (data: { id: string; username: string }) => {
      setError(null);
      console.log("Jellyfin account created successfully:", data);
      onSuccess(data);
    },
    onError: (error: TRPCClientErrorLike<AppRouter>) => {
      if (error.data?.code === "CONFLICT") {
        setError(error.message);
      } else {
        setError(
          error.message || "Failed to create account. Please try again.",
        );
      }
      console.error("Failed to create account:", error);
    },
  });

  const passwordsMatch = password === confirmPassword;
  const allPasswordRequirementsMet = passwordValidation.checkAll(password);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username) {
      setError("Username is required.");
      return;
    }
    if (!/^[a-zA-Z0-9]+$/.test(username)) {
      setError("Username must be alphanumeric.");
      return;
    }
    if (username.length > 12) {
      setError("Username cannot be longer than 12 characters.");
      return;
    }
    if (!password) {
      setError("Password is required.");
      return;
    }
    if (!allPasswordRequirementsMet) {
      setError("Password does not meet all requirements.");
      return;
    }
    if (!passwordsMatch) {
      setError("Passwords do not match.");
      return;
    }

    createAccountMutation.mutate({ username, password });
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">
            Create your Jellyfin account
          </CardTitle>
          <CardDescription>
            Enter your desired username and password for Jellyfin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-6">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="grid gap-2">
                <Label htmlFor="username">Jellyfin Username</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="Choose a Jellyfin username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={
                    createAccountMutation.isPending ||
                    createAccountMutation.isSuccess
                  }
                  maxLength={12}
                />
                <p
                  className={cn(
                    "text-xs",
                    username.length > 0 && !/^[a-zA-Z0-9]+$/.test(username)
                      ? "text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  Alphanumeric, 1-12 characters.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Jellyfin Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={
                    createAccountMutation.isPending ||
                    createAccountMutation.isSuccess
                  }
                  maxLength={passwordValidation.MAX_LEN}
                />
              </div>
              <PasswordRequirements password={password} />
              <div className="grid gap-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={
                    createAccountMutation.isPending ||
                    createAccountMutation.isSuccess
                  }
                  maxLength={passwordValidation.MAX_LEN}
                />
                {password && confirmPassword && !passwordsMatch && (
                  <p className="text-destructive text-xs">
                    Passwords do not match.
                  </p>
                )}
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={
                  createAccountMutation.isPending ||
                  createAccountMutation.isSuccess ||
                  !passwordsMatch ||
                  !allPasswordRequirementsMet ||
                  !username
                }
              >
                {createAccountMutation.isPending
                  ? "Creating Jellyfin Account..."
                  : "Create Jellyfin Account"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <PrivacyNotice />
    </div>
  );
}
