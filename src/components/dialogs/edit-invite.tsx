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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertTriangle } from "lucide-react";
import { api, type RouterOutputs } from "@/trpc/react";
import { DatePicker } from "@/components/ui/date-picker";
import { useEffect } from "react";

// Infer Invite type from API output (list includes profile name)
type Invite = RouterOutputs["invites"]["list"][number];

// Zod schema for the form (matching the TRPC update input schema)
const inviteFormSchema = z.object({
  expiresAt: z.date().optional().nullable(),
  maxUses: z.coerce.number().int().positive().optional().nullable(),
});
type InviteFormData = z.infer<typeof inviteFormSchema>;

interface EditInviteDialogProps {
  invite: Invite;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditInviteDialog({
  invite,
  isOpen,
  onOpenChange,
}: EditInviteDialogProps) {
  const utils = api.useUtils();
  const form = useForm<InviteFormData>({
    resolver: zodResolver(inviteFormSchema),
    // Default values set in useEffect
  });

  // Get touched state
  const { touchedFields } = form.formState;

  // Watch fields for the warning
  const expiresAtValue = form.watch("expiresAt");
  const maxUsesValue = form.watch("maxUses");
  // Show warning only if at least one field was touched and both are now empty
  const showWarning =
    (touchedFields.expiresAt || touchedFields.maxUses) &&
    !expiresAtValue &&
    !maxUsesValue;

  // Reset form when invite changes or dialog opens
  useEffect(() => {
    if (isOpen && invite) {
      form.reset({
        expiresAt: invite.expiresAt ? new Date(invite.expiresAt) : null,
        maxUses: invite.maxUses ?? null,
      });
    } else if (!isOpen) {
      form.reset(); // Clear form when closing
    }
  }, [invite, isOpen, form]);

  const updateMutation = api.invites.update.useMutation({
    onSuccess: async () => {
      toast.success("Invite updated successfully.");
      await utils.invites.list.invalidate();
      onOpenChange(false);
      // No need to reset here, useEffect handles it
    },
    onError: (error) => {
      const fieldErrors = error.data?.zodError?.fieldErrors;
      let message = error.message;
      if (fieldErrors?.expiresAt) message = fieldErrors.expiresAt[0] ?? message;
      if (fieldErrors?.maxUses) message = fieldErrors.maxUses[0] ?? message;
      toast.error(`Failed to update invite: ${message}`);
    },
  });

  function onSubmit(data: InviteFormData) {
    updateMutation.mutate({
      id: invite.id,
      ...data,
      maxUses: data.maxUses || null, // Ensure empty string becomes null
    });
  }

  // Handle the underlying dialog state change
  const handleOpenChange = (open: boolean) => {
    onOpenChange(open);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Invite</DialogTitle>
          <DialogDescription>
            Update details for invite code:{" "}
            <span className="font-mono font-semibold">{invite.code}</span>
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="expiresAt"
              render={({ field }) => (
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
                  <FormDescription>
                    Current:{" "}
                    {invite.expiresAt
                      ? new Date(invite.expiresAt).toLocaleDateString()
                      : "Never"}
                  </FormDescription>
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
                    <Input
                      type="number"
                      placeholder="e.g., 10"
                      min="1"
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) =>
                        field.onChange(
                          e.target.value === ""
                            ? null
                            : parseInt(e.target.value, 10),
                        )
                      }
                    />
                  </FormControl>
                  <FormDescription>
                    Leave blank for unlimited uses. Current:{" "}
                    {invite.maxUses ?? "Unlimited"}
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
              <Button type="submit" disabled={updateMutation.isPending}>
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
