"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { RegisterForm } from "@/components/forms/register";
import { InviteCodeForm } from "@/components/forms/invite-code";
import { ThemeToggle } from "@/components/theme-dropdown";
import { Logo } from "@/components/logo";
import { api } from "@/trpc/react";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { AccountLinkForm } from "@/components/forms/account-link";

// Define the steps in the registration process
type RegistrationStep =
  | "initialCheck" // Check for URL param
  | "enterCode" // Show invite code input form
  | "validateCode" // API call to validate code
  | "registerJellyfin" // Show Jellyfin username/password form
  | "linkAccount" // Show Discord/Email linking options
  | "error"; // Show an error message

function RegisterPageContent() {
  // Wrap content in a component for Suspense
  const searchParams = useSearchParams();
  const [step, setStep] = useState<RegistrationStep>("initialCheck");
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [jellyfinInfo, setJellyfinInfo] = useState<{
    id: string;
    username: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // const [profileId, setProfileId] = useState<string | null>(null); // Store profile ID if needed

  // Use query for validation instead of mutation
  const {
    data: inviteValidationResult,
    isLoading: isVerifyingInvite,
    isError: isInviteVerificationError,
    error: inviteVerificationError,
    isFetching: isFetchingInvite, // Use isFetching for subsequent runs
  } = api.invites.verify.useQuery(
    { code: inviteCode! }, // Assert non-null because enabled is true only when inviteCode exists
    {
      enabled: step === "validateCode" && !!inviteCode, // Only run when needed
      retry: false, // Don't retry on failure automatically
      refetchOnWindowFocus: false, // Optional: prevent refetch on focus
    },
  );

  // 1. Initial Check for Code in URL
  useEffect(() => {
    if (step === "initialCheck") {
      const codeFromUrl = searchParams.get("code");
      if (codeFromUrl) {
        setInviteCode(codeFromUrl);
        setStep("validateCode"); // Validate code from URL
      } else {
        setStep("enterCode"); // Ask user for code
      }
    }
  }, [step, searchParams]);

  // 3. useEffect to react to query results
  useEffect(() => {
    if (step !== "validateCode") return; // Only react during validation step

    if (isVerifyingInvite || isFetchingInvite) return; // Wait for query to finish

    if (isInviteVerificationError) {
      setError(
        inviteVerificationError?.message ?? "Failed to validate invite code.",
      );
      setInviteCode(null); // Clear invalid code
      setStep("enterCode"); // Go back to entering code
      return;
    }

    if (inviteValidationResult) {
      if (inviteValidationResult.valid) {
        setError(null);
        // Optionally store profile info: setProfileId(inviteValidationResult.profile?.id ?? null);
        setStep("registerJellyfin"); // Move to next step
      } else {
        // Handle specific invalid reasons if needed from inviteValidationResult.reason
        setError(
          `Invalid invite code${inviteValidationResult.reason ? ` (${inviteValidationResult.reason})` : ""}.`,
        );
        setInviteCode(null); // Clear invalid code
        setStep("enterCode"); // Go back to entering code
      }
    }
    // If none of the above, something unexpected happened or query hasn't run yet
  }, [
    step,
    isVerifyingInvite,
    isFetchingInvite,
    isInviteVerificationError,
    inviteVerificationError,
    inviteValidationResult,
  ]);

  // Handler for InviteCodeForm submission
  const handleInviteCodeSubmit = (code: string) => {
    setInviteCode(code);
    setError(null); // Clear previous errors
    setStep("validateCode");
  };

  // Handler for RegisterForm success
  const handleJellyfinSuccess = (data: { id: string; username: string }) => {
    setJellyfinInfo(data);
    setStep("linkAccount");
  };

  // Render different components based on the step
  const renderStep = () => {
    switch (step) {
      case "initialCheck":
      case "validateCode":
        // Show loading skeleton while checking/validating
        // Use isVerifyingInvite or isFetchingInvite for loading state
        return <Skeleton className="h-[400px] w-full" />;
      case "enterCode":
        return (
          <InviteCodeForm
            onSubmitCode={handleInviteCodeSubmit}
            isLoading={isVerifyingInvite || isFetchingInvite} // Use query loading state
            error={error} // Pass down validation error from previous attempt
          />
        );
      case "registerJellyfin":
        return <RegisterForm onSuccess={handleJellyfinSuccess} />;
      case "linkAccount":
        if (!jellyfinInfo) {
          // Should not happen, but handle defensively
          setError(
            "An unexpected error occurred. Missing Jellyfin account info.",
          );
          setStep("error");
          return null;
        }
        return (
          <AccountLinkForm
            jellyfinUserId={jellyfinInfo.id}
            jellyfinUsername={jellyfinInfo.username}
          />
        );
      case "error":
        return (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              {error ?? "An unknown error occurred."}
            </AlertDescription>
            {/* Optionally add a button to retry or go back */}
          </Alert>
        );
      default:
        return null; // Or some fallback UI
    }
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <a href="#" className="flex items-center gap-2 self-center font-medium">
        <Logo />
      </a>
      {renderStep()}
    </div>
  );
}

export default function RegisterPage() {
  return (
    <div className="bg-background flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      {/* Wrap content in Suspense for useSearchParams */}
      <Suspense fallback={<Skeleton className="h-[400px] w-[384px]" />}>
        <RegisterPageContent />
      </Suspense>
    </div>
  );
}
