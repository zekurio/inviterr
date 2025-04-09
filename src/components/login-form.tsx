"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { FaDiscord } from "react-icons/fa";
import { signinDiscord, signinUsername } from "@/lib/auth-client";
import { toast } from "sonner";
import { Legal } from "@/components/legal";
import { formSchema } from "@/lib/helpers/zod/login-schemas";

// Infer the type from the schema
type LoginFormValues = z.infer<typeof formSchema>;

// Define a type for the expected error structure from better-auth client
type BetterAuthError = {
  message: string;
  code?: string;
  status?: number;
  statusText?: string;
};

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  // Initialize react-hook-form
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const handleSocialSignIn = async (provider: "discord" | "google") => {
    setIsLoading(true);
    setServerError(null);
    form.clearErrors();
    try {
      const result = await signinDiscord();

      if (result.error) {
        const errorMessage =
          (result.error as BetterAuthError).message ||
          `Sign in with ${provider} failed.`;
        setServerError(errorMessage);
        toast.error(errorMessage);
        setIsLoading(false);
      } else if (result.data?.url) {
        window.location.href = result.data.url;
      } else {
        const errorMessage = `Sign in with ${provider} succeeded but no redirect URL was provided.`;
        setServerError(errorMessage);
        toast.error(errorMessage);
        setIsLoading(false);
      }
    } catch (err) {
      console.error(`Sign in with ${provider} error:`, err);
      const errorMessage =
        err instanceof Error ? err.message : "An unknown error occurred.";
      setServerError(`Sign in with ${provider} failed: ${errorMessage}`);
      toast.error(`Sign in with ${provider} failed: ${errorMessage}`);
      setIsLoading(false);
    }
  };

  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true);
    setServerError(null);
    try {
      const result = await signinUsername(data.username, data.password);

      if (result.error) {
        const errorMessage =
          (result.error as BetterAuthError).message ||
          "Invalid username or password.";
        setServerError(errorMessage);
        toast.error(errorMessage);
        setIsLoading(false);
      } else if (result.data) {
        toast.success("Login successful!");
        router.push("/account");
        router.refresh();
      } else {
        const errorMessage = "Login failed: Unexpected response from server.";
        setServerError(errorMessage);
        toast.error(errorMessage);
        setIsLoading(false);
      }
    } catch (err) {
      console.error("Username sign in error:", err);
      const errorMessage =
        err instanceof Error
          ? err.message
          : "An unknown error occurred during login.";
      setServerError(errorMessage);
      toast.error(errorMessage);
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Welcome back</CardTitle>
          <CardDescription>
            Login with your Discord or Google account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="flex flex-col gap-4">
                <Button
                  variant="outline"
                  className="w-full"
                  type="button"
                  onClick={() => handleSocialSignIn("discord")}
                  disabled={isLoading || form.formState.isSubmitting}
                >
                  <FaDiscord className="mr-2 h-4 w-4" />
                  Login with Discord
                </Button>
              </div>
              <div className="after:border-border relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t">
                <span className="bg-card text-muted-foreground relative z-10 px-2">
                  Or continue with
                </span>
              </div>
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username or Email</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="yourname or m@example.com"
                        {...field}
                        disabled={isLoading || form.formState.isSubmitting}
                        autoComplete="username"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center">
                      <FormLabel>Password</FormLabel>
                      <a
                        href="/forgot-password"
                        className="ml-auto text-sm underline-offset-4 hover:underline"
                      >
                        Forgot your password?
                      </a>
                    </div>
                    <FormControl>
                      <Input
                        type="password"
                        {...field}
                        disabled={isLoading || form.formState.isSubmitting}
                        autoComplete="current-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {serverError && (
                <p className="text-sm text-red-600">{serverError}</p>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || form.formState.isSubmitting}
              >
                {isLoading || form.formState.isSubmitting
                  ? "Logging in..."
                  : "Login"}
              </Button>
              <div className="text-center text-sm">
                Don&apos;t have an account?{" "}
                <a href="/signup" className="underline underline-offset-4">
                  Sign up
                </a>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
      <Legal />
    </div>
  );
}
