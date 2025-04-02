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
import { Copy, Eye, Plus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api, type RouterOutputs } from "@/trpc/react";
import { useRouter } from "next/navigation";

// Format date for display
const formatDate = (dateString: string | Date | null, includeTime = true) => {
  if (!dateString) return "Never";
  const date = dateString instanceof Date ? dateString : new Date(dateString);
  
  if (includeTime) {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  } else {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(date);
  }
};

type Invite = RouterOutputs["invites"]["list"][number];

// Check if an invite is expired or maxed out
const isInviteDisabled = (invite: Invite) => {
  // Check if expired
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
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  
  // Get invites data from TRPC
  const { data: invites, isLoading, refetch } = api.invites.list.useQuery();
  
  // Delete invite mutation
  const deleteInviteMutation = api.invites.delete.useMutation({
    onSuccess: () => {
      toast.success("Invite deleted successfully");
      void refetch();
      setRefreshing(false);
    },
    onError: (error) => {
      toast.error(`Error deleting invite: ${error.message}`);
      setRefreshing(false);
    }
  });

  const handleDeleteInvite = (id: string) => {
    if (confirm("Are you sure you want to delete this invite?")) {
      setRefreshing(true);
      deleteInviteMutation.mutate({ id });
    }
  };
  
  // Copy invite link to clipboard
  const handleCopyInvite = (code: string) => {
    const inviteLink = `${window.location.origin}/join?code=${code}`;
    void navigator.clipboard.writeText(inviteLink)
      .then(() => toast.success("Invite link copied to clipboard"))
      .catch(() => toast.error("Failed to copy invite link"));
  };

  // View invite details
  const handleViewInvite = (id: string) => {
    router.push(`/invites/${id}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Invites</h1>
        <Button onClick={() => router.push("/invites/create")}>
          <Plus className="mr-2 h-4 w-4" />
          Create Invite
        </Button>
      </div>
      
      <Card className="border-muted-foreground/30 shadow-sm">
        <CardHeader>
          <CardTitle>Manage Invites</CardTitle>
          <CardDescription>
            View and manage your Jellyfin invitation codes.
          </CardDescription>
          {(refreshing || isLoading) && (
            <div className="text-sm text-muted-foreground animate-pulse">
              {isLoading ? "Loading..." : "Updating..."}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-10">
              <p className="text-muted-foreground">Loading invites...</p>
            </div>
          ) : invites && invites.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="border-muted-foreground/10">
                  <TableHead className="font-bold">Code</TableHead>
                  <TableHead className="font-bold">Profile</TableHead>
                  <TableHead className="font-bold">Usage</TableHead>
                  <TableHead className="font-bold">Expires</TableHead>
                  <TableHead className="font-bold">Created</TableHead>
                  <TableHead className="font-bold text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.map((invite) => {
                  const isDisabled = isInviteDisabled(invite);
                  return (
                    <TableRow 
                      key={invite.id} 
                      className={cn(
                        "border-muted-foreground/5",
                        isDisabled && "opacity-60 bg-muted/30"
                      )}
                    >
                      <TableCell className="font-mono">
                        {invite.code}
                        {isDisabled && (
                          <div className="inline-flex ml-2 items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
                            {invite.maxUses !== null && invite.usageCount >= invite.maxUses 
                              ? "Maxed out" 
                              : "Expired"}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{invite.profile.name}</TableCell>
                      <TableCell>
                        {invite.usageCount}
                        {invite.maxUses !== null && 
                          <>/{invite.maxUses}</>
                        }
                      </TableCell>
                      <TableCell>{formatDate(invite.expiresAt)}</TableCell>
                      <TableCell>{formatDate(invite.createdAt)}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleCopyInvite(invite.code)}
                            disabled={isDisabled}
                          >
                            <Copy className="h-4 w-4" />
                            <span className="sr-only">Copy</span>
                          </Button>
                          
                          <Button 
                            variant="ghost" 
                            size="icon"
                            disabled={isDisabled}
                            onClick={() => handleViewInvite(invite.id)}
                          >
                            <Eye className="h-4 w-4" />
                            <span className="sr-only">View</span>
                          </Button>
                          
                          <Button 
                            variant="ghost" 
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDeleteInvite(invite.id)}
                          >
                            <svg 
                              xmlns="http://www.w3.org/2000/svg" 
                              width="24" 
                              height="24" 
                              viewBox="0 0 24 24" 
                              fill="none" 
                              stroke="currentColor" 
                              strokeWidth="2" 
                              strokeLinecap="round" 
                              strokeLinejoin="round" 
                              className="h-4 w-4"
                            >
                              <path d="M3 6h18"></path>
                              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                            </svg>
                            <span className="sr-only">Delete</span>
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
              <p className="text-muted-foreground">No invites found. Create your first invite to get started.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 