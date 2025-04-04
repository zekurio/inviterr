"use client";

import { useState } from "react";
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
import { signIn } from "next-auth/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, CheckCircle } from "lucide-react";

interface AccountLinkFormProps {
  jellyfinUserId: string;
  jellyfinUsername: string;
}

export function AccountLinkForm({
  jellyfinUserId,
  jellyfinUsername,
}: AccountLinkFormProps) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<"discord" | "email" | false>(
    false,
  );
  const [isEmailSent, setIsEmailSent] = useState(false); // Track if magic link is sent

  const handleSignIn = async (
    provider: "discord" | "resend",
    options?: Record<string, any>,
  ) => {
    setError(null);
    setIsEmailSent(false);
    setIsLoading(provider === "discord" ? "discord" : "email");

    // Construct the callback URL with Jellyfin info
    const callbackUrl = `/finish-linking?jellyfinUserId=${encodeURIComponent(jellyfinUserId)}&jellyfinUsername=${encodeURIComponent(jellyfinUsername)}`;

    try {
      const result = await signIn(provider, {
        ...options,
        callbackUrl: callbackUrl,
        redirect: provider === "discord", // Redirect immediately for Discord
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
          // OK means email was sent (or attempted)
          setIsEmailSent(true);
          // Don't clear loading here, keep form disabled until user clicks link
        } else {
          setError(
            "An unexpected error occurred while sending the login email.",
          );
        }
      } else if (result?.error) {
        // Handle errors for Discord redirect
        setError(result.error ?? `Failed to sign in with ${provider}.`);
      }
      // If Discord sign-in was initiated successfully, the redirect should happen automatically.
    } catch (err) {
      console.error("Sign in error:", err);
      setError("An unexpected error occurred during sign in.");
    } finally {
      // Only stop loading for Resend if there was an error immediately
      if (provider === "resend" && error) {
        setIsLoading(false);
      }
      // For discord, loading stops implicitly on redirect or explicitly on error
      if (provider === "discord" && error) {
        setIsLoading(false);
      }
    }
  };

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email && !isLoading) {
      handleSignIn("resend", { email });
    }
  };

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Link Your Account</CardTitle>
        <CardDescription>
          Your Jellyfin account '{jellyfinUsername}' is created! Now link it
          using Discord or Email to complete registration.
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
        {isEmailSent && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertTitle>Check Your Email</AlertTitle>
            <AlertDescription>
              A login link has been sent to {email}. Click the link in the email
              to complete your registration. You can close this window.
            </AlertDescription>
          </Alert>
        )}

        {/* Discord Button */}
        <Button
          variant="outline"
          className="w-full"
          onClick={() => handleSignIn("discord")}
          type="button"
          disabled={!!isLoading || isEmailSent} // Disable if any operation is in progress or email sent
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

        {/* Separator */}
        <div className="after:border-border relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t">
          <span className="bg-card text-muted-foreground relative z-10 px-2">
            Or link with Email
          </span>
        </div>

        {/* Email Form */}
        <form onSubmit={handleEmailSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={!!isLoading || isEmailSent}
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={!email || !!isLoading || isEmailSent}
          >
            {isLoading === "email" ? "Sending Link..." : "Send Magic Link"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
