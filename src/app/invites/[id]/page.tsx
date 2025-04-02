"use client"

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Header } from "@/components/header";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { notFound } from "next/navigation";

interface InviteDetailPageProps {
  params: {
    id: string;
  };
}

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

export default function InviteDetailPage({ params }: InviteDetailPageProps) {
  const { id } = params;
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Get invite details
  const { data: invite, isLoading } = api.invites.getById.useQuery({ id }, {
    onError: () => {
      notFound();
    }
  });

  // Delete invite mutation
  const deleteInviteMutation = api.invites.delete.useMutation({
    onSuccess: () => {
      toast.success("Invite deleted successfully");
      router.push("/invites");
    },
    onError: (error) => {
      toast.error(`Error deleting invite: ${error.message}`);
      setIsDeleting(false);
    }
  });

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this invite?")) {
      setIsDeleting(true);
      deleteInviteMutation.mutate({ id });
    }
  };
  
  const handleCopyInvite = (code: string) => {
    const inviteLink = `${window.location.origin}/join?code=${code}`;
    void navigator.clipboard.writeText(inviteLink)
      .then(() => toast.success("Invite link copied to clipboard"))
      .catch(() => toast.error("Failed to copy invite link"));
  };

  // Check if an invite is expired or maxed out
  const isInviteDisabled = invite && 
    ((invite.expiresAt && new Date(invite.expiresAt) < new Date()) ||
     (invite.maxUses !== null && invite.usageCount >= invite.maxUses));

  return (
    <div className="bg-background flex min-h-svh flex-col">
      <Header />
      <div className="container mx-auto py-6 max-w-3xl">
        <div className="flex items-center space-x-2 mb-6">
          <Button variant="outline" onClick={() => router.push("/invites")}>
            Back
          </Button>
          <h1 className="text-3xl font-bold">Invite Details</h1>
        </div>
        
        {isLoading ? (
          <div className="flex justify-center py-12">
            <p className="text-muted-foreground">Loading invite...</p>
          </div>
        ) : invite ? (
          <>
            <Card className="border-muted-foreground/30 shadow-sm mb-6">
              <CardHeader>
                <CardTitle>Invite Code: {invite.code}</CardTitle>
                <CardDescription>
                  Created on {formatDate(invite.createdAt)}
                  {isInviteDisabled && (
                    <div className="mt-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-destructive/10 text-destructive">
                      {invite.maxUses !== null && invite.usageCount >= invite.maxUses 
                        ? "Maximum usage reached" 
                        : "Expired"}
                    </div>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h3 className="font-medium text-muted-foreground">Status</h3>
                    <p className="text-lg">{isInviteDisabled ? "Inactive" : "Active"}</p>
                  </div>
                  <div>
                    <h3 className="font-medium text-muted-foreground">Profile</h3>
                    <p className="text-lg">{invite.profile.name}</p>
                  </div>
                  <div>
                    <h3 className="font-medium text-muted-foreground">Usage</h3>
                    <p className="text-lg">
                      {invite.usageCount}
                      {invite.maxUses !== null && 
                        <>/{invite.maxUses}</>
                      }
                    </p>
                  </div>
                  <div>
                    <h3 className="font-medium text-muted-foreground">Expires</h3>
                    <p className="text-lg">{formatDate(invite.expiresAt)}</p>
                  </div>
                </div>
                
                <div className="flex space-x-2 pt-4">
                  <Button 
                    className="flex-1"
                    variant="outline"
                    onClick={() => handleCopyInvite(invite.code)}
                    disabled={isInviteDisabled}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copy Invite Link
                  </Button>
                  <Button 
                    className="flex-1"
                    variant="destructive"
                    onClick={handleDelete}
                    disabled={isDeleting}
                  >
                    {isDeleting ? "Deleting..." : "Delete Invite"}
                  </Button>
                </div>
              </CardContent>
            </Card>
            
            <Card className="border-muted-foreground/30 shadow-sm">
              <CardHeader>
                <CardTitle>Usage Details</CardTitle>
                <CardDescription>
                  Information about how this invite has been used
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-center py-6 text-muted-foreground">
                  This invite has been used {invite.usageCount} times.
                </p>
              </CardContent>
            </Card>
          </>
        ) : (
          <div className="flex justify-center py-12">
            <p className="text-muted-foreground">Invite not found</p>
          </div>
        )}
      </div>
    </div>
  );
} 