"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Copy, Plus, Trash2, Pencil, Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api, type RouterOutputs } from "@/trpc/react";
import { CreateInviteDialog } from "@/components/dialogs/create-invite";
import { EditInviteDialog } from "@/components/dialogs/edit-invite";
import { DeleteInviteDialog } from "@/components/dialogs/delete-invite";
import { Skeleton } from "@/components/ui/skeleton";

// Format date for display
const formatDate = (dateString: string | Date | null, includeTime = true) => {
  if (!dateString) return "Never";
  const date = dateString instanceof Date ? dateString : new Date(dateString);

  if (includeTime) {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } else {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(date);
  }
};

type Invite = RouterOutputs["invites"]["list"][number];

// Check if an invite is expired or maxed out
const isInviteDisabled = (invite: Invite) => {
  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
    return true;
  }

  // Check if usage limit reached
  if (invite.maxUses !== null && invite.usageCount >= invite.maxUses) {
    return true;
  }

  return false;
};

export function InvitesView() {
  // Dialog states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingInvite, setEditingInvite] = useState<Invite | null>(null);
  const [deletingInvite, setDeletingInvite] = useState<Invite | null>(null);

  // Fetch invites
  const invitesQuery = api.invites.list.useQuery();
  // Fetch profiles to check if creation is possible
  const profilesQuery = api.profiles.list.useQuery();

  // Copy invite link to clipboard
  const handleCopyInvite = (code: string) => {
    const inviteLink = `${window.location.origin}/register?code=${code}`;
    void navigator.clipboard
      .writeText(inviteLink)
      .then(() => toast.success("Invite link copied to clipboard"))
      .catch(() => toast.error("Failed to copy invite link"));
  };

  // Determine loading/error states
  const isLoadingInvites = invitesQuery.isLoading;
  const isLoadingProfiles = profilesQuery.isLoading;

  const isErrorInvites = invitesQuery.isError;
  const isErrorProfiles = profilesQuery.isError;
  const isError = isErrorInvites || isErrorProfiles; // Combine error states
  const errorMessage =
    invitesQuery.error?.message ??
    profilesQuery.error?.message ??
    "Unknown error";

  const invites = invitesQuery.data ?? [];
  const noProfilesAvailable =
    !isLoadingProfiles && profilesQuery.data?.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Invites</h1>
        <Button
          onClick={() => setIsCreateOpen(true)}
          disabled={isLoadingProfiles || noProfilesAvailable}
          title={
            noProfilesAvailable
              ? "Create a profile first to generate invites"
              : undefined
          }
        >
          {isLoadingProfiles ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          Create Invite
        </Button>
      </div>

      <Card className="border-muted-foreground/30 shadow-sm">
        <CardHeader>
          <CardTitle>Manage Invites</CardTitle>
          <CardDescription>
            View and manage your Jellyfin invitation codes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isError ? (
            <div className="text-destructive py-10 text-center">
              Error loading data: {errorMessage}
            </div>
          ) : (
            <Table className="w-full table-fixed">
              <TableHeader>
                <TableRow className="border-muted-foreground/10">
                  <TableHead className="w-[25%] font-bold">Code</TableHead>
                  <TableHead className="w-[15%] font-bold">Profile</TableHead>
                  <TableHead className="w-[10%] font-bold">Usage</TableHead>
                  <TableHead className="w-[20%] font-bold">Expires</TableHead>
                  <TableHead className="w-[20%] font-bold">Created</TableHead>
                  <TableHead className="w-[10%] text-right font-bold">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingInvites ? (
                  // Skeleton Loading Rows
                  Array.from({ length: 5 }).map((_, index) => (
                    <TableRow
                      key={`skeleton-${index}`}
                      className="border-border/10"
                    >
                      <TableCell>
                        <Skeleton className="h-5 w-3/4" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-[100px]" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-[50px]" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-[150px]" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-[150px]" />
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Skeleton className="h-8 w-8" />
                          <Skeleton className="h-8 w-8" />
                          <Skeleton className="h-8 w-8" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : invites.length > 0 ? (
                  // Actual Data Rows
                  invites.map((invite) => {
                    const isDisabled = isInviteDisabled(invite);
                    return (
                      <TableRow
                        key={invite.id}
                        className={cn(
                          "border-muted-foreground/5",
                          isDisabled && "bg-muted/30 opacity-60",
                        )}
                      >
                        <TableCell className="font-mono">
                          {invite.code}
                          {isDisabled && (
                            <div className="bg-muted text-muted-foreground ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium">
                              {invite.maxUses !== null &&
                              invite.usageCount >= invite.maxUses
                                ? "Maxed out"
                                : "Expired"}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>{invite.profile.name}</TableCell>
                        <TableCell>
                          {invite.usageCount ?? 0}
                          {invite.maxUses !== null && <>/{invite.maxUses}</>}
                        </TableCell>
                        <TableCell>{formatDate(invite.expiresAt)}</TableCell>
                        <TableCell>{formatDate(invite.createdAt)}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Copy Link"
                              onClick={() => handleCopyInvite(invite.code)}
                              disabled={isDisabled}
                            >
                              <Copy className="h-4 w-4" />
                              <span className="sr-only">Copy</span>
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              title="Edit Invite"
                              onClick={() => setEditingInvite(invite)}
                            >
                              <Pencil className="h-4 w-4" />
                              <span className="sr-only">Edit</span>
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              title="Delete Invite"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeletingInvite(invite)}
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">Delete</span>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center">
                      <p className="text-muted-foreground">
                        No invites found. Create your first invite to get
                        started.
                      </p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CreateInviteDialog
        isOpen={isCreateOpen}
        onOpenChange={setIsCreateOpen}
      />

      {editingInvite && (
        <EditInviteDialog
          invite={editingInvite}
          isOpen={!!editingInvite}
          onOpenChange={(open) => !open && setEditingInvite(null)}
        />
      )}

      {deletingInvite && (
        <DeleteInviteDialog
          invite={deletingInvite}
          isOpen={!!deletingInvite}
          onOpenChange={(open) => !open && setDeletingInvite(null)}
        />
      )}
    </div>
  );
}
