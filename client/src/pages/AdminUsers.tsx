import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Shield, Trash2, UserCheck, UserX, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function AdminUsers() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; email: string } | null>(null);
  const utils = trpc.useUtils();

  // Redirect non-admins
  if (user && user.role !== "admin") {
    navigate("/");
    return null;
  }

  const { data: users, isLoading } = trpc.admin.listUsers.useQuery();

  const updateRoleMutation = trpc.admin.updateRole.useMutation({
    onSuccess: () => {
      utils.admin.listUsers.invalidate();
      toast.success("Role updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteUserMutation = trpc.admin.deleteUser.useMutation({
    onSuccess: () => {
      utils.admin.listUsers.invalidate();
      setDeleteTarget(null);
      toast.success("User deleted");
    },
    onError: (err) => {
      toast.error(err.message);
      setDeleteTarget(null);
    },
  });

  const toggleRole = (userId: number, currentRole: string) => {
    const newRole = currentRole === "admin" ? "user" : "admin";
    updateRoleMutation.mutate({ userId, role: newRole });
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-1">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-green-600" />
            User Management
          </h1>
          <p className="text-sm text-muted-foreground">Manage user accounts and roles</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">All Users</CardTitle>
          <CardDescription>
            {users ? `${users.length} user${users.length !== 1 ? "s" : ""} registered` : "Loading..."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 bg-muted rounded-lg animate-pulse" />
              ))}
            </div>
          ) : users && users.length > 0 ? (
            <div className="space-y-2">
              {users.map((u) => {
                const isCurrentUser = u.id === user?.id;
                const initials = u.name
                  ? u.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
                  : (u.email?.[0] ?? "?").toUpperCase();
                return (
                  <div
                    key={u.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/30 transition-colors"
                  >
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-sm font-semibold shrink-0">
                      {initials}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{u.name ?? "—"}</span>
                        {isCurrentUser && (
                          <Badge variant="outline" className="text-[10px] py-0 h-4">You</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground">
                          {u.loginMethod ?? "email"} ·{" "}
                          {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                        </span>
                      </div>
                    </div>

                    {/* Role badge */}
                    <Badge
                      variant={u.role === "admin" ? "default" : "secondary"}
                      className={u.role === "admin" ? "bg-green-600 hover:bg-green-700" : ""}
                    >
                      {u.role === "admin" ? (
                        <><Shield className="h-3 w-3 mr-1" />Admin</>
                      ) : (
                        "User"
                      )}
                    </Badge>

                    {/* Actions */}
                    {!isCurrentUser && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleRole(u.id, u.role ?? "user")}
                          disabled={updateRoleMutation.isPending}
                          className="h-8 px-2 text-xs gap-1"
                          title={u.role === "admin" ? "Demote to User" : "Promote to Admin"}
                        >
                          {u.role === "admin" ? (
                            <><UserX className="h-3.5 w-3.5" />Demote</>
                          ) : (
                            <><UserCheck className="h-3.5 w-3.5 text-green-600" />Promote</>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget({ id: u.id, email: u.email ?? "" })}
                          className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                          title="Delete user"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">No users found</div>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.email}</strong> and all their data.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteTarget && deleteUserMutation.mutate({ userId: deleteTarget.id })}
              disabled={deleteUserMutation.isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
