"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertTriangle, AlertCircle } from "lucide-react";
import { api, type RouterOutputs } from "@/trpc/react";
import { DatePicker } from "@/components/ui/date-picker";

// Infer Profile type from API
type Profile = RouterOutputs["profiles"]["list"][number];

// Zod schema for the form (matching the TRPC input schema)
const inviteFormSchema = z.object({
  profileId: z.string().min(1, "Profile is required"),
  expiresAt: z.date().optional().nullable(),
  maxUses: z.coerce.number().int().positive().optional().nullable(),
});
type InviteFormData = z.infer<typeof inviteFormSchema>;

interface CreateInviteDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateInviteDialog({
  isOpen,
  onOpenChange,
}: CreateInviteDialogProps) {
  const utils = api.useUtils();
  const form = useForm<InviteFormData>({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: {
      profileId: "",
      expiresAt: null,
      maxUses: null,
    },
  });

  // Get touched state
  const { touchedFields } = form.formState;

  // Watch fields for the warning
  const expiresAtValue = form.watch("expiresAt");
  const maxUsesValue = form.watch("maxUses");
  // Show warning only if at least one field was touched and both are now empty
  const showWarning =
    (touchedFields.expiresAt ?? touchedFields.maxUses) &&
    !expiresAtValue &&
    !maxUsesValue;

  // Fetch profiles for the select dropdown
  const profilesQuery = api.profiles.list.useQuery();

  // Determine states
  const isLoadingProfiles = profilesQuery.isLoading;
  const isErrorProfiles = profilesQuery.isError;
  const noProfiles = !isLoadingProfiles && profilesQuery.data?.length === 0;

  const createMutation = api.invites.create.useMutation({
    onSuccess: async () => {
      toast.success("Invite created successfully.");
      await utils.invites.list.invalidate(); // Invalidate invites list
      onOpenChange(false);
      form.reset();
    },
    onError: (error) => {
      const fieldErrors = error.data?.zodError?.fieldErrors;
      let message = error.message;
      // Try to get a more specific message from Zod errors
      if (fieldErrors?.profileId) message = fieldErrors.profileId[0] ?? message;
      if (fieldErrors?.expiresAt) message = fieldErrors.expiresAt[0] ?? message;
      if (fieldErrors?.maxUses) message = fieldErrors.maxUses[0] ?? message;

      toast.error(`Failed to create invite: ${message}`);
    },
  });

  function onSubmit(data: InviteFormData) {
    createMutation.mutate({
      ...data,
      maxUses: data.maxUses ?? null,
    });
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      form.reset();
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      {/* Optional: Add DialogTrigger if needed elsewhere */}
      {/* <DialogTrigger asChild><Button>Create Invite</Button></DialogTrigger> */}
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create New Invite</DialogTitle>
          <DialogDescription>
            {noProfiles
              ? "You must create a profile before generating invites."
              : "Generate a new invite code linked to a profile."}
          </DialogDescription>
        </DialogHeader>

        {isErrorProfiles ? (
          <div className="text-destructive p-4 text-center">
            Error loading profiles:{" "}
            {profilesQuery.error?.message ?? "Unknown error"}
          </div>
        ) : noProfiles ? (
          <div className="text-muted-foreground flex flex-col items-center gap-2 p-4 text-center">
            <AlertCircle className="text-destructive h-8 w-8" />
            <span>No profiles found. Please create a profile first.</span>
            <DialogClose asChild>
              <Button variant="outline" size="sm">
                Close
              </Button>
            </DialogClose>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Profile Select Field - Disabled if loading */}
              <FormField
                control={form.control}
                name="profileId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Profile</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      disabled={isLoadingProfiles} // Disable during load
                    >
                      <FormControl>
                        <SelectTrigger>
                          {isLoadingProfiles ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <SelectValue placeholder="Select a profile..." />
                          )}
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectGroup>
                          {profilesQuery.data?.map((profile: Profile) => (
                            <SelectItem key={profile.id} value={profile.id}>
                              {profile.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="expiresAt"
                render={() => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Expires At (Optional)</FormLabel>
                    <Controller
                      control={form.control}
                      name="expiresAt"
                      render={({ field: controllerField }) => (
                        <DatePicker
                          date={controllerField.value ?? undefined}
                          setDate={(date) =>
                            controllerField.onChange(date ?? null)
                          }
                        />
                      )}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="maxUses"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Uses (Optional)</FormLabel>
                    <FormControl>
                      {/* Pass null if value is empty string or truly null/undefined */}
                      <Input
                        type="number"
                        placeholder="e.g., 10"
                        min="1" // HTML5 validation
                        {...field}
                        value={field.value ?? ""} // Ensure controlled input displays empty string for null
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === ""
                              ? null
                              : parseInt(e.target.value, 10),
                          )
                        } // Convert back to number or null
                      />
                    </FormControl>
                    <FormDescription>
                      Leave blank for unlimited uses.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Conditional Warning Alert - uses updated showWarning logic */}
              {showWarning && (
                <Alert
                  variant="destructive"
                  className="border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300"
                >
                  <AlertTriangle className="h-4 w-4 !text-yellow-800 dark:!text-yellow-300" />
                  <AlertTitle className="text-yellow-900 dark:text-yellow-200">
                    Warning
                  </AlertTitle>
                  <AlertDescription className="text-yellow-800 dark:text-yellow-400">
                    Invites without an expiration date or usage limit can
                    potentially be abused. Consider setting at least one limit.
                  </AlertDescription>
                </Alert>
              )}

              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="ghost">
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || isLoadingProfiles}
                >
                  {createMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Create Invite
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
