"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/header";
import Link from "next/link";

export default function LinkPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const jellyfinUserId = searchParams.get("jellyfinUserId");
  const error = searchParams.get("error");
  const [redirecting, setRedirecting] = useState(false);

  const handleRedirect = () => {
    setRedirecting(true);
    router.push("/account");
  };

  return (
    <div className="bg-background flex min-h-svh flex-col">
      <Header />
      <div className="container mx-auto flex max-w-sm flex-grow items-center justify-center py-8">
        <Card className="w-full">
          <CardHeader className="flex-row items-center gap-2 text-center">
            <CardTitle className="text-xl">
              {error ? "Linking Failed" : "Account Linking Successful"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            {!error && jellyfinUserId ? (
              <Button
                onClick={handleRedirect}
                className="mt-6 w-full"
                disabled={redirecting}
              >
                {redirecting
                  ? "Redirecting..."
                  : "Continue to Account Settings"}
              </Button>
            ) : (
              <Button asChild className="mt-6 w-full">
                <Link href="/account">Go to Account Settings</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
