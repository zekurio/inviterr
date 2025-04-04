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
import { Star, User, Loader2, Trash2, Pencil } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { api } from "@/trpc/react";
import { toast } from "sonner";
import type { Profile } from "@prisma/client";
import { CreateProfileDialog } from "@/components/dialogs/create-profile";
import { EditProfileDialog } from "@/components/dialogs/edit-profile";
import { DeleteProfileDialog } from "@/components/dialogs/delete-profile";
import { AvatarWithFallback } from "@/components/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";

interface ProfileHydrated extends Profile {
  inviteCount: number;
}

type JellyfinUser =
  inferRouterOutputs<AppRouter>["jellyfin"]["getAllUsers"][number];

export function ProfilesView() {
  const utils = api.useUtils();
  const profilesQuery = api.profiles.list.useQuery(undefined, {});
  const jellyfinUsersQuery = api.jellyfin.getAllUsers.useQuery(undefined, {
    staleTime: 1000 * 60 * 5,
  });

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ProfileHydrated | null>(
    null,
  );
  const [deletingProfile, setDeletingProfile] =
    useState<ProfileHydrated | null>(null);

  const setDefaultMutation = api.profiles.setDefault.useMutation({
    onSuccess: async () => {
      toast.success("Default profile updated.");
      await utils.profiles.list.invalidate();
    },
    onError: (error) => {
      toast.error(`Failed to set default profile: ${error.message}`);
    },
  });

  const handleSetDefault = (profileId: string) => {
    setDefaultMutation.mutate({ id: profileId });
  };

  const profiles = profilesQuery.data ?? [];
  const jellyfinUsers = jellyfinUsersQuery.data ?? [];
  const isLoading =
    profilesQuery.isLoading ||
    (profilesQuery.isFetched && jellyfinUsersQuery.isLoading);
  const isError = profilesQuery.isError || jellyfinUsersQuery.isError;
  const errorMessage =
    profilesQuery.error?.message ??
    jellyfinUsersQuery.error?.message ??
    "An unknown error occurred.";

  return (
    <div className="space-y-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Profiles</h1>
        <CreateProfileDialog
          isOpen={isCreateOpen}
          onOpenChange={setIsCreateOpen}
        />
      </div>

      <Card className="border-foreground/10 shadow-sm">
        <CardHeader>
          <CardTitle>Manage Profiles</CardTitle>
          <CardDescription>
            View and manage your Jellyfin user profiles used for invitations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isError ? (
            <div className="text-destructive py-10 text-center">
              Error loading data: {errorMessage}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border/20">
                  <TableHead className="font-bold">Profile</TableHead>
                  <TableHead className="font-bold">Template User</TableHead>
                  <TableHead className="font-bold">Invites</TableHead>
                  <TableHead className="text-right font-bold">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  // Skeleton Loading Rows
                  Array.from({ length: 3 }).map((_, index) => (
                    <TableRow
                      key={`skeleton-${index}`}
                      className="border-border/10"
                    >
                      <TableCell>
                        <Skeleton className="h-5 w-3/4 sm:w-[180px]" />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-8 w-8 rounded-full" />
                          <Skeleton className="h-5 w-[100px]" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-[30px]" />
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
                ) : profiles.length > 0 ? (
                  // Actual Data Rows
                  profiles.map((profile) => {
                    const isDefault = profile.isDefault;
                    const inviteCount = profile.inviteCount;
                    const isSetDefaultPending =
                      setDefaultMutation.isPending &&
                      setDefaultMutation.variables?.id === profile.id;

                    const templateUser = profile.jellyfinTemplateUserId
                      ? jellyfinUsers.find(
                          (user: JellyfinUser) =>
                            user.id === profile.jellyfinTemplateUserId,
                        )
                      : null;

                    return (
                      <TableRow key={profile.id} className="border-border/10">
                        <TableCell>
                          <div className="flex items-center">
                            <span className="font-medium">{profile.name}</span>
                            {isDefault && (
                              <span className="bg-primary/10 text-primary ml-2 rounded-full px-2 py-0.5 text-xs">
                                Default
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {templateUser ? (
                              <>
                                <AvatarWithFallback
                                  src={templateUser.avatarUrl ?? ""}
                                  name={templateUser.name ?? "User"}
                                />
                                <span>{templateUser.name}</span>
                              </>
                            ) : profile.jellyfinTemplateUserId ? (
                              <span className="text-muted-foreground text-xs italic">
                                User ID: {profile.jellyfinTemplateUserId}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{inviteCount}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            {!isDefault && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="flex items-center gap-1"
                                onClick={() => handleSetDefault(profile.id)}
                                disabled={isSetDefaultPending}
                                title="Set as Default"
                              >
                                {isSetDefaultPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Star className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingProfile(profile)}
                              title="Edit Profile"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeletingProfile(profile)}
                              disabled={isDefault || inviteCount > 0}
                              title="Delete Profile"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  // Empty State Row (No profiles found)
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center">
                      <p className="text-muted-foreground">
                        No profiles found. Create your first profile to get
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

      {editingProfile && (
        <EditProfileDialog
          profile={editingProfile}
          isOpen={!!editingProfile}
          onOpenChange={(open) => !open && setEditingProfile(null)}
        />
      )}

      {deletingProfile && (
        <DeleteProfileDialog
          profile={deletingProfile}
          isOpen={!!deletingProfile}
          onOpenChange={(open) => !open && setDeletingProfile(null)}
        />
      )}
    </div>
  );
}
