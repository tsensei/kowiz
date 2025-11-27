"use client";

import { useEffect, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useUserProfile } from "@/hooks/use-user-profile";

export function AuthButton() {
  const { data: session, status } = useSession();
  const { profile, loading, updateEmail, refresh } = useUserProfile();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile?.email !== undefined && profile?.email !== null) {
      setEmail(profile.email);
    } else {
      setEmail("");
    }
  }, [profile?.email, open]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateEmail(email.trim());
      toast.success("Email updated");
      setOpen(false);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update email");
    } finally {
      setSaving(false);
    }
  };

  if (status === "loading") {
    return <Button disabled>Loading...</Button>;
  }

  if (session) {
    return (
      <>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium">{session.user?.username || session.user?.name}</p>
            <p className="text-xs text-muted-foreground">
              {profile?.email || "Add an email for alerts"}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            Profile
          </Button>
          <Button size="sm" onClick={() => signOut()}>
            Sign out
          </Button>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Your profile</DialogTitle>
              <DialogDescription>
                View your account and set the email used for upload notifications.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Username</p>
                  <p className="font-medium">{session.user?.username || session.user?.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Wikimedia ID</p>
                  <p className="font-medium break-all">{session.user?.wikimediaId}</p>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="email">Notification email</Label>
                <Input
                  id="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={saving || loading}
                  type="email"
                />
                <p className="text-xs text-muted-foreground">
                  We'll send batch completion alerts to this address.
                </p>
              </div>

              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Daily notification quota</span>
                  <span className="font-semibold">
                    {profile?.notificationQuota.used ?? 0}/{profile?.notificationQuota.limit ?? 5} sent
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {profile?.notificationQuota.remaining ?? 0} remaining today
                </p>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                Close
              </Button>
              <Button onClick={handleSave} disabled={saving || !email.trim()}>
                {saving ? "Saving..." : "Save email"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Button onClick={() => signIn("wikimedia")}>
      Sign in with Wikimedia
    </Button>
  );
}
