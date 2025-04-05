"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Loader2 } from "lucide-react";

interface UnlinkProviderDialogProps {
  provider: "discord" | "jellyfin" | "email";
  onConfirm: () => void; // Callback when confirm button is clicked
  isPending: boolean; // Loading state for the unlink action
  error: string | null; // Error message to display
  trigger: React.ReactNode; // The button that opens the dialog
}

export function UnlinkProviderDialog({
  provider,
  onConfirm,
  isPending,
  error,
  trigger,
}: UnlinkProviderDialogProps) {
  const [isOpen, setIsOpen] = useState(false);

  let providerName: string;
  let description: string;

  switch (provider) {
    case "discord":
      providerName = "Discord";
      description =
        "If you primarily log in with Discord, you may lose access to your account if you unlink it without another linked login method (like Email). Are you sure?";
      break;
    case "jellyfin":
      providerName = "Jellyfin";
      description =
        "You will no longer be able to manage this Jellyfin account through Inviterr. Are you sure?";
      break;
    case "email":
      providerName = "Email";
      description =
        "If you primarily log in with Email, you may lose access to your account if you unlink it without another linked login method (like Discord). Are you sure?";
      break;
    default:
      providerName = "Account";
      description = "Are you sure you want to unlink this account?";
  }

  const title = `Unlink ${providerName}?`;

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Unlink Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onConfirm();
            }}
            className="bg-destructive hover:bg-destructive/90"
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}{" "}
            Unlink {providerName}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
