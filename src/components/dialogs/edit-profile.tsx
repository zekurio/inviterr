"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Loader2, Check } from "lucide-react";
import { api } from "@/trpc/react";
import type { Profile } from "@prisma/client";
import type { AppRouter } from "@/server/api/root";
import type { inferRouterOutputs, inferProcedureOutput } from "@trpc/server";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AvatarWithFallback } from "@/components/avatar";

// Define Zod schema for profile update
const profileFormSchema = z.object({
  name: z.string().min(1, "Profile name is required"),
  jellyfinTemplateUserId: z.string().optional(),
});
type ProfileFormData = z.infer<typeof profileFormSchema>;

// Infer the profile type with invite count from the router output
type ProfileWithInviteCountOutput = inferProcedureOutput<
  AppRouter["profiles"]["list"]
>[number];

// Interface based on the inferred type
interface ProfileWithInviteCount extends Profile {
  inviteCount: number;
}

// Infer the output type for a single user
type JellyfinUser =
  inferRouterOutputs<AppRouter>["jellyfin"]["getAllUsers"][number];

interface EditProfileDialogProps {
  profile: ProfileWithInviteCount;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditProfileDialog({
  profile,
  isOpen,
  onOpenChange,
}: EditProfileDialogProps) {
  const utils = api.useUtils();
  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      name: profile.name ?? "",
      jellyfinTemplateUserId: profile.jellyfinTemplateUserId ?? "",
    },
  });

  const jellyfinUsersQuery = api.jellyfin.getAllUsers.useQuery(undefined, {
    enabled: isOpen,
    staleTime: 1000 * 60 * 5,
  });

  const updateMutation = api.profiles.update.useMutation({
    onSuccess: async () => {
      toast.success("Profile updated successfully.");
      await utils.profiles.list.invalidate();
      onOpenChange(false);
    },
    onError: (error) => {
      const message =
        error.data?.zodError?.fieldErrors.jellyfinTemplateUserId?.[0] ??
        error.message ??
        "An unknown error occurred.";
      toast.error(`Failed to update profile: ${message}`);
    },
  });

  function onSubmit(data: ProfileFormData) {
    updateMutation.mutate({
      id: profile.id,
      ...data,
      jellyfinTemplateUserId: data.jellyfinTemplateUserId || undefined,
    });
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      form.reset({
        name: profile.name ?? "",
        jellyfinTemplateUserId: profile.jellyfinTemplateUserId ?? "",
      });
    }
    onOpenChange(open);
  };

  const currentUserId = form.watch("jellyfinTemplateUserId");
  const selectedUserDisplay = currentUserId
    ? jellyfinUsersQuery.data?.find(
        (u: { id: string | undefined }) => u.id === currentUserId,
      )
    : null;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
          <DialogDescription>
            Update the details for the profile "{profile.name}".
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Profile Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Standard Access" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="jellyfinTemplateUserId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Jellyfin Template User</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value ?? ""}
                    disabled={
                      jellyfinUsersQuery.isLoading || jellyfinUsersQuery.isError
                    }
                  >
                    <FormControl>
                      <SelectTrigger className="h-10">
                        {jellyfinUsersQuery.isLoading ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <SelectValue placeholder="Select a Jellyfin user...">
                            {selectedUserDisplay ? (
                              <div className="flex items-center gap-2">
                                <AvatarWithFallback
                                  src={selectedUserDisplay.avatarUrl ?? ""}
                                  name={selectedUserDisplay.name ?? "User"}
                                />
                                {selectedUserDisplay.name}
                              </div>
                            ) : (
                              "Select a Jellyfin user..."
                            )}
                          </SelectValue>
                        )}
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectGroup>
                        {jellyfinUsersQuery.isError && (
                          <div className="text-destructive p-4 text-sm">
                            Error loading users.
                          </div>
                        )}
                        {jellyfinUsersQuery.data?.map((user: JellyfinUser) => (
                          <SelectItem key={user.id} value={user.id}>
                            <div className="flex items-center gap-2">
                              <AvatarWithFallback
                                src={user.avatarUrl ?? ""}
                                name={user.name ?? "User"}
                              />
                              {user.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  updateMutation.isPending || jellyfinUsersQuery.isLoading
                }
              >
                {updateMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
