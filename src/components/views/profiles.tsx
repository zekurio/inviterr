'use client';

import { useState } from "react";
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
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Star, Plus, User, Loader2, Trash2, Pencil } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { api } from "@/trpc/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import type { Profile } from "@prisma/client";
import type { TRPCClientErrorLike } from "@trpc/client";
import type { AppRouter } from "@/server/api/root";
import type { inferProcedureOutput } from "@trpc/server";

// Define Zod schema for profile creation/update
const profileFormSchema = z.object({
    name: z.string().min(1, "Profile name is required"),
    jellyfinTemplateUserId: z.string().optional(),
});
type ProfileFormData = z.infer<typeof profileFormSchema>;

// Infer the profile type with invite count from the router output
type ProfileWithInviteCountOutput = inferProcedureOutput<AppRouter["profiles"]["list"]>[number];

interface ProfileWithInviteCount extends Profile {
    inviteCount: number;
}

interface EditProfileDialogProps {
    profile: ProfileWithInviteCount;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
}

function EditProfileDialog({ profile, isOpen, onOpenChange }: EditProfileDialogProps) {
    const utils = api.useUtils();
    const form = useForm<ProfileFormData>({
        resolver: zodResolver(profileFormSchema),
        defaultValues: {
            name: profile.name ?? "",
            jellyfinTemplateUserId: profile.jellyfinTemplateUserId ?? "",
        },
    });

    const updateMutation = api.profiles.update.useMutation({
        onSuccess: async () => {
            toast.success("Profile updated successfully.");
            await utils.profiles.list.invalidate();
            onOpenChange(false);
            form.reset();
        },
        onError: (error) => {
            toast.error(`Failed to update profile: ${error.message}`);
        },
    });

    function onSubmit(data: ProfileFormData) {
        updateMutation.mutate({ id: profile.id, ...data });
    }

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent>
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
                                    <FormLabel>Jellyfin Template User ID (Optional)</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Enter Jellyfin User ID" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <DialogFooter>
                            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                            <Button type="submit" disabled={updateMutation.isPending}>
                                {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Save Changes
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}

interface DeleteProfileDialogProps {
    profile: ProfileWithInviteCount;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
}

function DeleteProfileDialog({ profile, isOpen, onOpenChange }: DeleteProfileDialogProps) {
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
                        {profile.inviteCount > 0 && <span className="text-destructive block mt-2">This profile is linked to {profile.inviteCount} invite(s). You cannot delete it.</span>}
                        {profile.isDefault && <span className="text-destructive block mt-2">This is the default profile. You cannot delete it.</span>}
                        This action cannot be undone.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button
                        type="button"
                        variant="destructive"
                        onClick={() => deleteMutation.mutate({ id: profile.id })}
                        disabled={deleteMutation.isPending || profile.inviteCount > 0 || profile.isDefault}
                    >
                        {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Delete
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}


export function ProfilesView() {
    const utils = api.useUtils();
    const profilesQuery = api.profiles.list.useQuery(undefined, {
        // Optional: Configure refetching behavior if needed
        // refetchOnWindowFocus: false,
    });
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [editingProfile, setEditingProfile] = useState<ProfileWithInviteCount | null>(null);
    const [deletingProfile, setDeletingProfile] = useState<ProfileWithInviteCount | null>(null);

    const form = useForm<ProfileFormData>({
        resolver: zodResolver(profileFormSchema),
        defaultValues: {
            name: "",
            jellyfinTemplateUserId: "",
        },
    });

    const createMutation = api.profiles.create.useMutation({
        onSuccess: async () => {
            toast.success("Profile created successfully.");
            await utils.profiles.list.invalidate();
            setIsCreateOpen(false);
            form.reset();
        },
        onError: (error) => {
            toast.error(`Failed to create profile: ${error.message}`);
        },
    });

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

    function onCreateSubmit(data: ProfileFormData) {
        createMutation.mutate(data);
    }

    const profiles = profilesQuery.data ?? []; // Use fetched data or empty array

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-3xl font-bold">Profiles</h1>
                <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            Create Profile
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                         <DialogHeader>
                            <DialogTitle>Create New Profile</DialogTitle>
                            <DialogDescription>
                                Configure a new profile for generating invites.
                            </DialogDescription>
                        </DialogHeader>
                         <Form {...form}>
                            <form onSubmit={form.handleSubmit(onCreateSubmit)} className="space-y-4">
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
                                            <FormLabel>Jellyfin Template User ID (Optional)</FormLabel>
                                            <FormControl>
                                                <Input placeholder="Enter Jellyfin User ID" {...field} />
                                            </FormControl>
                                             <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <DialogFooter>
                                    <Button type="button" variant="ghost" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                                    <Button type="submit" disabled={createMutation.isPending}>
                                         {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Create Profile
                                    </Button>
                                </DialogFooter>
                            </form>
                        </Form>
                    </DialogContent>
                </Dialog>
            </div>

            <Card className="border-foreground/10 shadow-sm">
                <CardHeader>
                    <CardTitle>Manage Profiles</CardTitle>
                    <CardDescription>
                        View and manage your Jellyfin user profiles used for invitations.
                    </CardDescription>
                    {profilesQuery.isRefetching && (
                        <div className="text-sm text-muted-foreground animate-pulse flex items-center gap-1">
                           <Loader2 className="h-3 w-3 animate-spin"/> Updating...
                        </div>
                    )}
                </CardHeader>
                <CardContent>
                    {profilesQuery.isLoading ? (
                        <div className="text-center py-10 text-muted-foreground">Loading profiles...</div>
                    ) : profilesQuery.isError ? (
                         <div className="text-center py-10 text-destructive">
                            Error loading profiles: {profilesQuery.error.message}
                         </div>
                    ) : profiles.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow className="border-border/20">
                                    <TableHead className="font-bold">Profile</TableHead>
                                    <TableHead className="font-bold">Template User ID</TableHead>
                                    <TableHead className="font-bold">Invites</TableHead>
                                    <TableHead className="font-bold text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {profiles.map((profile) => {
                                    const isDefault = profile.isDefault;
                                    // Note: We don't have Jellyfin User *Names* easily accessible here without another API call or joining data.
                                    // Displaying the ID for now. You might want to fetch user details separately if needed.
                                    const templateUserId = profile.jellyfinTemplateUserId ?? '-';
                                    const inviteCount = profile.inviteCount;
                                    const isSetDefaultPending = setDefaultMutation.isPending && setDefaultMutation.variables?.id === profile.id;

                                    return (
                                        <TableRow key={profile.id} className="border-border/10">
                                            <TableCell>
                                                <div className="flex items-center">
                                                    {isDefault && (
                                                        <Star className="h-4 w-4 text-primary mr-2 flex-shrink-0" />
                                                    )}
                                                    <span className="font-medium">{profile.name}</span>
                                                    {isDefault && (
                                                        <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                                                            Default
                                                        </span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                 <div className="flex items-center">
                                                    {templateUserId !== '-' ? (
                                                        <>
                                                            <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center mr-2">
                                                                <User className="h-4 w-4" />
                                                            </div>
                                                            <span>{templateUserId}</span>
                                                        </>
                                                    ) : (
                                                        <span className="text-muted-foreground">-</span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {inviteCount}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex gap-1 justify-end">
                                                    {!isDefault && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="flex items-center gap-1"
                                                            onClick={() => handleSetDefault(profile.id)}
                                                            disabled={isSetDefaultPending}
                                                            title="Set as Default"
                                                        >
                                                            {isSetDefaultPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />}
                                                            {/* <span className="hidden sm:inline">Set as Default</span> */}
                                                        </Button>
                                                    )}

                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setEditingProfile(profile)}
                                                        title="Edit Profile"
                                                    >
                                                        <Pencil className="h-4 w-4" />
                                                         {/* <span className="hidden sm:inline">Edit</span> */}
                                                    </Button>

                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-destructive hover:text-destructive"
                                                        onClick={() => setDeletingProfile(profile)}
                                                        disabled={isDefault || inviteCount > 0} // Disable directly if it's default or has invites
                                                        title="Delete Profile"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                        {/* <span className="hidden sm:inline">Delete</span> */}
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    ) : (
                        <div className="text-center py-10">
                            <p className="text-muted-foreground">
                                No profiles found. Create your first profile to get started.
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Edit Dialog */}
            {editingProfile && (
                <EditProfileDialog
                    profile={editingProfile}
                    isOpen={!!editingProfile}
                    onOpenChange={(open) => !open && setEditingProfile(null)}
                />
            )}

            {/* Delete Dialog */}
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