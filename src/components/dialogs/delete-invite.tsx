'use client';

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    Dialog, DialogClose,
    DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { api, type RouterOutputs } from "@/trpc/react";

// Infer Invite type
type Invite = RouterOutputs["invites"]["list"][number];

interface DeleteInviteDialogProps {
    invite: Invite;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
}

export function DeleteInviteDialog({ invite, isOpen, onOpenChange }: DeleteInviteDialogProps) {
    const utils = api.useUtils();
    const deleteMutation = api.invites.delete.useMutation({
        onSuccess: async () => {
            toast.success("Invite deleted successfully.");
            await utils.invites.list.invalidate();
            onOpenChange(false);
        },
        onError: (error) => {
            toast.error(`Failed to delete invite: ${error.message}`);
        },
    });

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Delete Invite</DialogTitle>
                    <DialogDescription>
                        Are you sure you want to delete the invite code <span className="font-mono font-semibold">{invite.code}</span>?
                        This action cannot be undone.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button type="button" variant="ghost">Cancel</Button>
                    </DialogClose>
                    <Button
                        type="button"
                        variant="destructive"
                        onClick={() => deleteMutation.mutate({ id: invite.id })}
                        disabled={deleteMutation.isPending}
                    >
                        {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Delete
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
} 