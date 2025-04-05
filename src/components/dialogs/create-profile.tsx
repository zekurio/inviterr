"use client";

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
  DialogTrigger,
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
import { Loader2, Plus } from "lucide-react";
import { api } from "@/trpc/react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AvatarWithFallback } from "@/components/avatar";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";

// Infer the output type for a single user
type JellyfinUser =
  inferRouterOutputs<AppRouter>["jellyfin"]["getAllUsers"][number];

// Define Zod schema for profile creation
const profileFormSchema = z.object({
  name: z.string().min(1, "Profile name is required"),
  jellyfinTemplateUserId: z.string().optional(),
});
type ProfileFormData = z.infer<typeof profileFormSchema>;

interface CreateProfileDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateProfileDialog({
  isOpen,
  onOpenChange,
}: CreateProfileDialogProps) {
  const utils = api.useUtils();
  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      name: "",
      jellyfinTemplateUserId: "",
    },
  });

  const jellyfinUsersQuery = api.jellyfin.getAllUsers.useQuery(undefined, {
    enabled: isOpen,
    staleTime: 1000 * 60 * 5,
  });

  const createMutation = api.profiles.create.useMutation({
    onSuccess: async () => {
      toast.success("Profile created successfully.");
      await utils.profiles.list.invalidate();
      onOpenChange(false);
      form.reset();
    },
    onError: (error) => {
      const message =
        error.data?.zodError?.fieldErrors.jellyfinTemplateUserId?.[0] ??
        error.message ??
        "An unknown error occurred.";
      toast.error(`Failed to create profile: ${message}`);
    },
  });

  function onSubmit(data: ProfileFormData) {
    createMutation.mutate({
      ...data,
      jellyfinTemplateUserId: data.jellyfinTemplateUserId ?? undefined,
    });
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      form.reset();
    }
    onOpenChange(open);
  };

  const selectedUserDisplay = form.watch("jellyfinTemplateUserId")
    ? jellyfinUsersQuery.data?.find(
        (u: { id: string | undefined }) =>
          u.id === form.watch("jellyfinTemplateUserId"),
      )
    : null;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create Profile
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create New Profile</DialogTitle>
          <DialogDescription>
            Configure a new profile for generating invites. Optionally link to a
            Jellyfin user as a template.
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
                    defaultValue={field.value}
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
                  createMutation.isPending || jellyfinUsersQuery.isLoading
                }
              >
                {createMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create Profile
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
