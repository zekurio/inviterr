"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { api } from "@/trpc/react";
import type { Profile } from "@prisma/client";

// Interface based on the inferred type
interface ProfileWithInviteCount extends Profile {
  inviteCount: number;
}

interface DeleteProfileDialogProps {
  profile: ProfileWithInviteCount;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteProfileDialog({
  profile,
  isOpen,
  onOpenChange,
}: DeleteProfileDialogProps) {
  const utils = api.useUtils();
  const deleteMutation = api.profiles.delete.useMutation({
    onSuccess: async () => {
      toast.success("Profile deleted successfully.");
      await utils.profiles.list.invalidate();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(`Failed to delete profile: ${error.message}`);
    },
  });

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Profile</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete the profile "{profile.name}"?
            {profile.inviteCount > 0 && (
              <span className="text-destructive mt-2 block">
                This profile is linked to {profile.inviteCount} invite(s). You
                cannot delete it.
              </span>
            )}
            {profile.isDefault && (
              <span className="text-destructive mt-2 block">
                This is the default profile. You cannot delete it.
              </span>
            )}
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => deleteMutation.mutate({ id: profile.id })}
            disabled={
              deleteMutation.isPending ||
              profile.inviteCount > 0 ||
              profile.isDefault
            }
          >
            {deleteMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
