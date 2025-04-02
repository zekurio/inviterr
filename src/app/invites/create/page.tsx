"use client"

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Header } from "@/components/header";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function CreateInvitePage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string>("");
  const [maxUses, setMaxUses] = useState<string>("");
  const [profileId, setProfileId] = useState<string>("");

  // Get profiles for dropdown
  const { data: profiles, isLoading: loadingProfiles } = api.profiles.list.useQuery();

  // Create invite mutation
  const createInviteMutation = api.invites.create.useMutation({
    onSuccess: () => {
      toast.success("Invite created successfully");
      router.push("/invites");
    },
    onError: (error) => {
      toast.error(`Error creating invite: ${error.message}`);
      setIsSubmitting(false);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!profileId) {
      toast.error("Please select a profile");
      return;
    }
    
    setIsSubmitting(true);
    
    createInviteMutation.mutate({
      createdAt: new Date(),
      profileId,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      maxUses: maxUses ? parseInt(maxUses, 10) : undefined,
      createdById: "" // This will be populated by the server
    });
  };

  return (
    <div className="bg-background flex min-h-svh flex-col">
      <Header />
      <div className="container mx-auto py-6 max-w-2xl">
        <div className="flex items-center space-x-2 mb-6">
          <Button variant="outline" onClick={() => router.push("/invites")}>
            Back
          </Button>
          <h1 className="text-3xl font-bold">Create Invite</h1>
        </div>
        
        <Card className="border-muted-foreground/30 shadow-sm">
          <CardHeader>
            <CardTitle>Create New Invite</CardTitle>
            <CardDescription>
              Create a new invite code for Jellyfin access
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="profile">Profile</Label>
                <Select 
                  disabled={loadingProfiles || isSubmitting} 
                  value={profileId} 
                  onValueChange={setProfileId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a profile" />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles?.map((profile) => (
                      <SelectItem key={profile.id} value={profile.id}>
                        {profile.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  The template profile to use for this invite
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="expiry">Expiry Date (Optional)</Label>
                <Input
                  id="expiry"
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  disabled={isSubmitting}
                />
                <p className="text-sm text-muted-foreground">
                  When this invite should expire. Leave blank for no expiry.
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="maxUses">Usage Limit (Optional)</Label>
                <Input
                  id="maxUses"
                  type="number"
                  min="1"
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  disabled={isSubmitting}
                />
                <p className="text-sm text-muted-foreground">
                  Maximum number of times this invite can be used. Leave blank for unlimited.
                </p>
              </div>
              
              <div className="flex justify-end space-x-2">
                <Button 
                  variant="outline" 
                  type="button" 
                  onClick={() => router.push("/invites")}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  disabled={isSubmitting || !profileId}
                >
                  {isSubmitting ? "Creating..." : "Create Invite"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 