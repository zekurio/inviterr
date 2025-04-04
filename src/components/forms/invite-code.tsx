"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

interface InviteCodeFormProps {
  onSubmitCode: (code: string) => void; // Callback when user submits
  isLoading: boolean;
  error?: string | null;
}

export function InviteCodeForm({
  onSubmitCode,
  isLoading,
  error,
}: InviteCodeFormProps) {
  const [inviteCode, setInviteCode] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inviteCode.trim()) {
      onSubmitCode(inviteCode.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-2">
        <Label htmlFor="invite-code">Invite Code</Label>
        <Input
          id="invite-code"
          type="text"
          placeholder="Enter your invite code"
          required
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
          disabled={isLoading}
        />
      </div>
      <Button
        type="submit"
        className="w-full"
        disabled={isLoading || !inviteCode.trim()}
      >
        {isLoading ? "Validating..." : "Submit Code"}
      </Button>
    </form>
  );
}
