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
import { AlertCircle, CheckCircle } from "lucide-react";
import { useState } from "react";
import { api } from "@/trpc/react";
import { Progress } from "@/components/ui/progress";
import type { TRPCClientErrorLike } from "@trpc/client";
import type { AppRouter } from "@/server/api/root";
import { PrivacyNotice } from "../privacy-notice";

const MIN_LEN = 12;
const MAX_LEN = 24;
const checkLength = (password: string) =>
  password.length >= MIN_LEN && password.length <= MAX_LEN;
const checkUppercase = (password: string) => /[A-Z]/.test(password);
const checkLowercase = (password: string) => /[a-z]/.test(password);
const checkNumber = (password: string) => /[0-9]/.test(password);
const checkSpecialChar = (password: string) => /[^A-Za-z0-9]/.test(password);

function RequirementItem({
  met,
  children,
}: {
  met: boolean;
  children: React.ReactNode;
}) {
  return (
    <li
      className={cn(
        "flex items-center",
        met ? "text-green-600" : "text-destructive",
      )}
    >
      {met ? (
        <CheckCircle className="mr-2 h-4 w-4 flex-shrink-0" />
      ) : (
        <AlertCircle className="mr-2 h-4 w-4 flex-shrink-0" />
      )}
      {children}
    </li>
  );
}

export function RegisterForm({
  className,
  onSuccess, // <<< MODIFIED: Changed signature
  ...props
}: React.ComponentPropsWithoutRef<"div"> & {
  onSuccess: (data: { id: string; username: string }) => void; // <<< MODIFIED: Changed signature
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createAccountMutation = api.accounts.create.useMutation({
    onSuccess: (data: { id: string; username: string }) => {
      setError(null);
      console.log("Jellyfin account created successfully:", data);
      // Call the onSuccess callback provided by the parent page
      onSuccess(data); // <<< MODIFIED: Call parent callback
    },
    onError: (error: TRPCClientErrorLike<AppRouter>) => {
      // Handle specific TRPC errors or display a generic message
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
  const isLengthMet = checkLength(password);
  const isUppercaseMet = checkUppercase(password);
  const isLowercaseMet = checkLowercase(password);
  const isNumberMet = checkNumber(password);
  const isSpecialCharMet = checkSpecialChar(password);

  const requirements = [
    { met: isLengthMet, text: `${MIN_LEN}-${MAX_LEN} characters long` },
    { met: isUppercaseMet, text: "At least one uppercase letter" },
    { met: isLowercaseMet, text: "At least one lowercase letter" },
    { met: isNumberMet, text: "At least one number" },
    { met: isSpecialCharMet, text: "At least one special character" },
  ];

  const requirementsMetCount = requirements.filter((r) => r.met).length;
  const allRequirementsMet = requirementsMetCount === requirements.length;

  const getPasswordStrength = () => {
    // Calculate strength as percentage of requirements met
    return (requirementsMetCount / requirements.length) * 100;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username) {
      setError("Username is required.");
      return;
    }
    // Basic alphanumeric check (more thorough check is on server)
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
    if (!allRequirementsMet) {
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
                  maxLength={24}
                />
              </div>
              {password.length > 0 && (
                <div className="space-y-2">
                  <Progress value={getPasswordStrength()} className="h-2" />
                  <ul className="list-none space-y-1 pt-1 text-xs">
                    {requirements.map((req) => (
                      <RequirementItem key={req.text} met={req.met}>
                        {req.text}
                      </RequirementItem>
                    ))}
                  </ul>
                </div>
              )}
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
                  maxLength={24}
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
                  !allRequirementsMet ||
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
