'use client';

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
import { Star, Plus, User } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

// Mock data for profiles
const mockProfiles = [
  {
    id: "profile-1",
    name: "Standard User",
    jellyfinUserId: "jfuser-1",
    isDefault: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString() // 30 days ago
  },
  {
    id: "profile-2",
    name: "Premium User",
    jellyfinUserId: "jfuser-2",
    isDefault: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 15).toISOString() // 15 days ago
  },
  {
    id: "profile-3",
    name: "Admin",
    jellyfinUserId: "jfuser-3",
    isDefault: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString() // 5 days ago
  }
];

// Mock Jellyfin users
const mockJellyfinUsers = [
  {
    Id: "jfuser-1",
    Name: "Standard User",
    PrimaryImageTag: "img-tag-1"
  },
  {
    Id: "jfuser-2",
    Name: "Premium User",
    PrimaryImageTag: "img-tag-2"
  },
  {
    Id: "jfuser-3",
    Name: "Admin",
    PrimaryImageTag: "img-tag-3"
  }
];

// Mock profile invites data with explicit type
const mockProfileInvites: Record<string, { count: number, invites: any[] }> = {
  "profile-1": { count: 2, invites: [{id: "inv-1"}, {id: "inv-2"}] },
  "profile-2": { count: 1, invites: [{id: "inv-3"}] },
  "profile-3": { count: 0, invites: [] }
};

export function ProfilesView() {
  const [profiles, setProfiles] = useState(mockProfiles);
  const [refreshing, setRefreshing] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<{[key: string]: string}>({});
  
  // Mock function to set a profile as default
  const handleSetDefault = (profileId: string) => {
    console.log("Setting profile as default:", profileId);
    
    // Track this specific action
    setActionInProgress(prev => ({ ...prev, [profileId]: 'default' }));
    
    // Update UI with mock data
    setProfiles(currentProfiles => 
      currentProfiles.map(p => ({
        ...p,
        isDefault: p.id === profileId
      }))
    );
    
    // Simulate API call
    setTimeout(() => {
      setActionInProgress(prev => {
        const next = { ...prev };
        delete next[profileId];
        return next;
      });
    }, 500);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Profiles</h1>
        <div className="flex gap-2">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Profile
              </Button>
        </div>
      </div>
      
      <Card className="border-foreground/10 shadow-sm">
        <CardHeader>
          <CardTitle>Manage Profiles</CardTitle>
          <CardDescription>
            View and manage your Jellyfin user profiles used for invitations.
          </CardDescription>
          {refreshing && (
            <div className="text-sm text-muted-foreground animate-pulse">
              Updating...
            </div>
          )}
        </CardHeader>
        <CardContent>
        {profiles.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow className="border-border/20">
                <TableHead className="font-bold">Profile</TableHead>
                <TableHead className="font-bold">Template User</TableHead>
                <TableHead className="font-bold">Invites</TableHead>
                <TableHead className="font-bold text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map((profile) => {
                const isDefault = profile.isDefault;
                const jellyfinUser = mockJellyfinUsers.find(user => user.Id === profile.jellyfinUserId);
                const inviteData = mockProfileInvites[profile.id] || { count: 0, invites: [] };
                const isActionInProgress = actionInProgress[profile.id];
                
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
                        <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center mr-2">
                          <User className="h-4 w-4" />
                        </div>
                        <span>{jellyfinUser?.Name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {inviteData.count}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2 justify-end">
                        {!isDefault && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="flex items-center gap-1"
                            onClick={() => handleSetDefault(profile.id)}
                            disabled={isActionInProgress === 'default'}
                          >
                            <Star className="h-4 w-4" />
                            <span>Set as Default</span>
                          </Button>
                        )}
                        
                            <Button
                              variant="ghost"
                              size="sm"
                            >
                              Edit
                            </Button>
                        
                        {!isDefault && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                              >
                                Delete
                              </Button>
                        )}
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
    </div>
  );
} 