import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FaDiscord } from "react-icons/fa";
import { signIn } from "next-auth/react";
import { PrivacyNotice } from "../privacy-notice";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, CheckCircle } from "lucide-react";

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  // State for Jellyfin credentials login
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [jellyfinError, setJellyfinError] = useState<string | null>(null);
  const [isJellyfinLoading, setIsJellyfinLoading] = useState(false);

  // State for general/Discord errors from URL
  const [urlError, setUrlError] = useState<string | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();

  // Handle errors passed in URL query params (e.g., from callbacks)
  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam) {
      // Reset specific form errors if a URL error occurs
      setJellyfinError(null);

      if (errorParam === "CredentialsSignin") {
        // Set the specific Jellyfin error for this case
        setJellyfinError("Invalid username or password.");
      } else {
        // Generic URL error message
        setUrlError(`Login failed: ${errorParam}. Please try again.`);
      }
      // Clear the error from the URL bar
      router.replace("/login", { scroll: false });
    }
  }, [searchParams, router]);

  // Handler for Jellyfin Credentials Submit
  const handleJellyfinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setJellyfinError(null);
    setUrlError(null);
    setIsJellyfinLoading(true);

    try {
      const result = await signIn("jellyfin", {
        username,
        password,
        redirect: false, // Handle redirect manually
      });

      if (result?.error) {
        // Error handled by useEffect checking searchParams now
        // setJellyfinError("Invalid username or password");
        console.error("Jellyfin Signin Error:", result.error); // Log it
        // The useEffect hook will pick up the error from the URL redirect
        setIsJellyfinLoading(false); // Stop loading on error
        return; // Stop execution here
      }

      // If successful (no error), redirect
      router.push("/account");
    } catch (error) {
      console.error("Jellyfin Signin Exception:", error);
      setJellyfinError("An unexpected error occurred. Please try again.");
      setIsJellyfinLoading(false);
    } finally {
      // Ensure loading is stopped if error occurs before redirect
      // No need to set here if redirect happens
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Welcome back</CardTitle>
          <CardDescription>
            Sign in to manage your account and invites.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6">
            {/* Display URL/Callback Errors First */}
            {urlError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Login Error</AlertTitle>
                <AlertDescription>{urlError}</AlertDescription>
              </Alert>
            )}

            {/* Discord Button */}
            <Button
              variant="outline"
              className="w-full"
              onClick={() =>
                signIn("discord", {
                  callbackUrl: "/account", // Specify callbackUrl for OAuth
                })
              }
              type="button"
              disabled={isJellyfinLoading}
            >
              <FaDiscord className="mr-2 h-4 w-4" />
              Login with Discord
            </Button>

            {/* Separator for Jellyfin Credentials */}
            <div className="after:border-border relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t">
              <span className="bg-card text-muted-foreground relative z-10 px-2">
                Or with Jellyfin Credentials
              </span>
            </div>

            {/* Jellyfin Credentials Form */}
            <form onSubmit={handleJellyfinSubmit} className="grid gap-6">
              {jellyfinError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Jellyfin Login Error</AlertTitle>
                  <AlertDescription>{jellyfinError}</AlertDescription>
                </Alert>
              )}
              <div className="grid gap-2">
                <Label htmlFor="username">Jellyfin Username</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="YourJellyfinUser"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isJellyfinLoading}
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="password">Jellyfin Password</Label>
                  {/* TODO: Implement password reset? */}
                  {/* <a
                    href="#"
                    className="ml-auto text-sm underline-offset-4 hover:underline"
                  >
                    Forgot your password?
                  </a> */}
                </div>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isJellyfinLoading}
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={!username || !password || isJellyfinLoading}
              >
                {isJellyfinLoading ? "Logging in..." : "Login with Jellyfin"}
              </Button>
            </form>

            <div className="text-center text-sm">
              Don&apos;t have an account? You need an invitation to join.
            </div>
          </div>
        </CardContent>
      </Card>
      <PrivacyNotice />
    </div>
  );
}
