"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/header";
import { CheckCircle, AlertCircle } from "lucide-react";
import Link from "next/link";

export default function FinishLinkingPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const jellyfinUsername = searchParams.get("jellyfinUsername");
  const jellyfinUserId = searchParams.get("jellyfinUserId");
  const error = searchParams.get("error");

  // Optional: Redirect to account page after a delay
  useEffect(() => {
    if (!error && jellyfinUserId) {
      const timer = setTimeout(() => {
        router.push("/account");
      }, 5000); // Redirect after 5 seconds

      return () => clearTimeout(timer); // Cleanup timer on unmount
    }
  }, [router, error, jellyfinUserId]);

  return (
    <div className="bg-background flex min-h-svh flex-col">
      <Header />
      <div className="container mx-auto flex max-w-md flex-grow items-center justify-center py-8">
        <Card className="w-full">
          <CardHeader className="items-center text-center">
            {error ? (
              <AlertCircle className="text-destructive h-12 w-12" />
            ) : (
              <CheckCircle className="h-12 w-12 text-green-600" />
            )}
            <CardTitle className="mt-4 text-xl">
              {error ? "Linking Failed" : "Account Linking Successful"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            {error ? (
              <p className="text-destructive">
                Failed to link accounts. Error: {error}
              </p>
            ) : jellyfinUsername ? (
              <p className="text-muted-foreground">
                Your Discord account has been successfully linked to the
                Jellyfin account: <strong>{jellyfinUsername}</strong>.
              </p>
            ) : (
              <p className="text-muted-foreground">
                Account linking process completed.
              </p>
            )}
            <Button asChild className="mt-6 w-full">
              <Link href="/account">Go to Account Settings</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
