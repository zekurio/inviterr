"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle } from "lucide-react";

interface AccountsLinkedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jellyfinUrl: string;
}

export function AccountsLinkedDialog({
  open,
  onOpenChange,
  jellyfinUrl,
}: AccountsLinkedDialogProps) {
  const handleGoToJellyfin = () => {
    window.location.href = jellyfinUrl;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <CheckCircle className="mr-2 h-5 w-5 text-green-500" />
            Account Linked Successfully!
          </DialogTitle>
          <DialogDescription>
            Your account has been successfully linked.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 text-center">
          You can now close this window or proceed to Jellyfin.
        </div>
        <DialogFooter>
          <Button onClick={handleGoToJellyfin} className="w-full sm:w-auto">
            Go to Jellyfin
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
