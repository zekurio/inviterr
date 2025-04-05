"use client";

import { useState, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { FaDiscord } from "react-icons/fa";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, CheckCircle } from "lucide-react";
import { AccountsLinkedDialog } from "@/components/dialogs/accounts-linked";

interface AccountLinkFormProps {
  jellyfinUserId: string;
  jellyfinUsername: string;
}

export function AccountLinkForm({
  jellyfinUserId,
  jellyfinUsername,
}: AccountLinkFormProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session, status: sessionStatus } = useSession();

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<"discord" | "email" | false>(
    false,
  );
  const [isLinkSuccess, setIsLinkSuccess] = useState(false);

  const handleSignIn = async (
    provider: "discord" | "resend",
    options?: Record<string, string>,
  ) => {
    setError(null);
    setIsLoading(provider === "discord" ? "discord" : "email");

    try {
      const result = await signIn(provider, {
        ...options,
        redirect: false,
      });

      // For Resend (email), signIn doesn't redirect automatically if successful,
      // it just sends the email. We need to inform the user.
      if (provider === "resend") {
        if (result?.error) {
          setError(
            result.error ??
              "Failed to send login email. Please check the email address and try again.",
          );
        } else if (result?.ok) {
          // Don't clear loading here, keep form disabled until user clicks link
        } else {
          setError(
            "An unexpected error occurred while sending the login email.",
          );
        }
      } else if (result?.error) {
        // Handle errors for Discord redirect or Resend errors
        setError(result.error ?? `Failed to sign in with ${provider}.`);
      }
    } catch (err) {
      console.error("Sign in error:", err);
      setError("An unexpected error occurred during sign in.");
    } finally {
      // Only stop loading for Resend if there was an error immediately
      if (provider === "resend" && error) {
        setIsLoading(false);
      }
      // For discord, stop loading on error. Success is handled by page reload.
      if (provider === "discord" && error) {
        setIsLoading(false);
      }
    }
  };

  // Effect to check for successful link after redirect
  useEffect(() => {
    const redirectedJellyfinId = searchParams.get("jellyfinUserId");
    // Check if authenticated and the URL contains the jellyfinUserId from the callback
    if (
      sessionStatus === "authenticated" &&
      redirectedJellyfinId === jellyfinUserId
    ) {
      setIsLinkSuccess(true);
      // Optional: Clean the URL param to prevent dialog showing on refresh
      // window.history.replaceState(null, '', pathname);
    }
  }, [sessionStatus, searchParams, jellyfinUserId, pathname]);

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Link Your Account</CardTitle>
        <CardDescription>
          Your Jellyfin account &quot;{jellyfinUsername}&quot; is created! Now
          link it using one of the following methods.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {/* Discord Button */}
        <Button
          variant="outline"
          className="w-full"
          onClick={() => handleSignIn("discord")}
          type="button"
          disabled={isLoading === "discord" || isLinkSuccess}
        >
          {isLoading === "discord" ? (
            "Redirecting..."
          ) : (
            <>
              {" "}
              <FaDiscord className="mr-2 h-4 w-4" /> Link with Discord{" "}
            </>
          )}
        </Button>
      </CardContent>
      <AccountsLinkedDialog
        open={isLinkSuccess}
        onOpenChange={setIsLinkSuccess}
        jellyfinUrl={process.env.NEXT_PUBLIC_JELLYFIN_URL ?? "/"}
      />
    </Card>
  );
}
