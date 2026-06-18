import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, User, Lock, Shield, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function Profile() {
  const { user, refresh } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  // Name form
  const [name, setName] = useState(user?.name ?? "");
  const [nameEditing, setNameEditing] = useState(false);

  // Password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwError, setPwError] = useState("");

  const updateProfileMutation = trpc.profile.update.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      refresh();
      setNameEditing(false);
      toast.success("Name updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const changePasswordMutation = trpc.profile.changePassword.useMutation({
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPwError("");
      toast.success("Password changed successfully");
    },
    onError: (err) => {
      setPwError(err.message);
    },
  });

  const handleNameSave = () => {
    if (!name.trim()) return;
    updateProfileMutation.mutate({ name: name.trim() });
  };

  const handlePasswordChange = () => {
    setPwError("");
    if (newPassword.length < 8) {
      setPwError("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("Passwords do not match");
      return;
    }
    changePasswordMutation.mutate({ currentPassword, newPassword });
  };

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "SA";

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-1">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Account Settings</h1>
          <p className="text-sm text-muted-foreground">Manage your profile and security</p>
        </div>
      </div>

      {/* Profile overview */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xl font-bold shrink-0">
              {initials}
            </div>
            <div>
              <div className="font-semibold text-lg">{user?.name ?? "—"}</div>
              <div className="text-sm text-muted-foreground">{user?.email}</div>
              <div className="flex items-center gap-2 mt-1">
                {user?.role === "admin" && (
                  <Badge className="bg-green-600 hover:bg-green-700 text-xs gap-1">
                    <Shield className="h-3 w-3" />Admin
                  </Badge>
                )}
                <Badge variant="secondary" className="text-xs">
                  {user?.role === "admin" ? "Full access" : "Standard access"}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Display name */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4" />
            Display Name
          </CardTitle>
          <CardDescription>This is how your name appears in the app</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="display-name">Name</Label>
            <Input
              id="display-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameEditing(true);
              }}
              placeholder="Your name"
              maxLength={100}
            />
          </div>
          {nameEditing && (
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleNameSave}
                disabled={updateProfileMutation.isPending || !name.trim()}
                className="bg-green-600 hover:bg-green-700"
              >
                {updateProfileMutation.isPending ? "Saving..." : "Save Name"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setName(user?.name ?? "");
                  setNameEditing(false);
                }}
              >
                Cancel
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Change password */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="h-4 w-4" />
            Change Password
          </CardTitle>
          <CardDescription>
            Update your password. Must be at least 8 characters.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="current-password">Current Password</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              autoComplete="current-password"
            />
          </div>
          <Separator />
          <div className="space-y-1.5">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Confirm New Password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat new password"
              autoComplete="new-password"
            />
          </div>

          {pwError && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {pwError}
            </div>
          )}

          <Button
            onClick={handlePasswordChange}
            disabled={changePasswordMutation.isPending || !currentPassword || !newPassword || !confirmPassword}
            className="bg-green-600 hover:bg-green-700 w-full sm:w-auto"
          >
            {changePasswordMutation.isPending ? "Updating..." : "Update Password"}
          </Button>
        </CardContent>
      </Card>

      {/* Account info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Account Info</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="font-medium">{user?.email}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Role</dt>
              <dd className="font-medium capitalize">{user?.role}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Member since</dt>
              <dd className="font-medium">
                {user?.createdAt ? new Date(user.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "—"}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
