"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  PersonIcon,
  TrashIcon,
  PlusIcon,
  HomeIcon,
} from "@radix-ui/react-icons";
import { Input, Label } from "@/src/components/ui/Input";
import { Button } from "@/src/components/ui/Button";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

export default function AdminPage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // User Management state
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<"user" | "admin">("user");
  const [editingUserId, setEditingUserId] = useState("");
  const [editingUserName, setEditingUserName] = useState("");
  const [editingUserRole, setEditingUserRole] = useState<"user" | "admin">(
    "user"
  );

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchUsers();
    }
  }, [isAuthenticated]);

  const checkAuth = async () => {
    try {
      const response = await fetch("/api/admin/session");
      if (response.ok) {
        const data = await response.json();
        if (data?.user?.role === "admin") {
          setIsAuthenticated(true);
          setError("");
          return true;
        }
        setError("Access denied. Admin role required.");
      } else {
        router.push("/login");
      }
    } catch (error) {
      console.error("Auth check failed:", error);
      router.push("/login");
    }
    return false;
  };

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const usersRes = await fetch("/api/admin/users");

      if (usersRes.ok) {
        const parsed = (await usersRes.json()) as { users?: User[] };
        setUsers(parsed?.users ?? []);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess("");
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newUserEmail,
          name: newUserName,
          password: newUserPassword,
          role: newUserRole,
        }),
      });

      if (response.ok) {
        setSuccess("User created successfully!");
        setNewUserEmail("");
        setNewUserName("");
        setNewUserPassword("");
        setNewUserRole("user");
        fetchUsers();
      } else {
        const data = await response.json();
        setError(data.error || "Failed to create user");
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartEditUser = (user: User) => {
    setEditingUserId(user.id);
    setEditingUserName(user.name);
    setEditingUserRole(user.role as "user" | "admin");
    setError("");
    setSuccess("");
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUserId) return;
    setIsLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: editingUserId,
          name: editingUserName,
          role: editingUserRole,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setUsers((prev) =>
          prev.map((u) => (u.id === data.user.id ? { ...u, ...data.user } : u))
        );
        setSuccess("User updated.");
        setEditingUserId("");
        setEditingUserName("");
        setEditingUserRole("user");
      } else {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData.error || "Failed to update user");
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm("Are you sure you want to delete this user?")) return;

    setError("");
    setIsLoading(true);

    try {
      const response = await fetch(`/api/admin/users?userId=${userId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setSuccess("User deleted successfully!");
        fetchUsers();
      } else {
        const data = await response.json();
        setError(data.error || "Failed to delete user");
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-xs text-zinc-500">Checking authentication...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black p-4 sm:p-6">
      <div className="max-w-3xl mx-auto">
        <div className="bg-zinc-900 rounded border border-zinc-800 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-lg font-medium text-zinc-200">
                User Management
              </h1>
              <p className="text-xs text-zinc-500 mt-0.5">
                Manage user accounts and roles
              </p>
            </div>
            <button
              onClick={() => router.push("/dashboard")}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-400 transition-colors"
            >
              <HomeIcon className="w-3 h-3" />
              Dashboard
            </button>
          </div>

          {/* Messages */}
          {error && (
            <div className="mb-4 p-2.5 bg-red-900/20 border border-red-900/50 rounded text-xs text-red-400">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 p-2.5 bg-green-900/20 border border-green-900/50 rounded text-xs text-green-400">
              {success}
            </div>
          )}

          {/* Create User Form */}
          <div className="mb-6">
            <h2 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-1.5">
              <PlusIcon className="w-3 h-3" />
              Create User
            </h2>
            <form onSubmit={handleCreateUser} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-zinc-400">Email</Label>
                  <Input
                    type="email"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    required
                    className="mt-1.5 bg-zinc-900 border-zinc-800 text-zinc-300 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs text-zinc-400">Name</Label>
                  <Input
                    type="text"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    required
                    className="mt-1.5 bg-zinc-900 border-zinc-800 text-zinc-300 text-xs"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-zinc-400">Password</Label>
                  <Input
                    type="password"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    required
                    className="mt-1.5 bg-zinc-900 border-zinc-800 text-zinc-300 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs text-zinc-400">Role</Label>
                  <select
                    value={newUserRole}
                    onChange={(e) =>
                      setNewUserRole(e.target.value as "user" | "admin")
                    }
                    className="mt-1.5 w-full px-3 py-1.5 rounded border border-zinc-800 bg-zinc-900 text-xs text-zinc-300 focus:outline-none focus:border-zinc-700"
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-8 bg-zinc-800 text-zinc-200 text-xs hover:bg-zinc-700 disabled:opacity-50"
              >
                {isLoading ? "Creating..." : "Create User"}
              </Button>
            </form>
          </div>

          {/* Users List */}
          <div className="p-3 bg-zinc-900/50 rounded border border-zinc-800">
            <h3 className="text-xs font-medium text-zinc-300 mb-3 flex items-center gap-1.5">
              <PersonIcon className="w-3 h-3" />
              All Users ({users.length})
            </h3>
            <div className="space-y-1.5">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-2 bg-zinc-900 rounded border border-zinc-800"
                >
                  <div>
                    <div className="text-xs text-zinc-300 font-medium">
                      {user.name}
                    </div>
                    <div className="text-[10px] text-zinc-500">{user.email}</div>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded mt-1 inline-block ${
                        user.role === "admin"
                          ? "bg-violet-900/20 text-violet-400 border border-violet-900/50"
                          : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {user.role}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleStartEditUser(user)}
                      disabled={isLoading}
                      className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] rounded border border-zinc-700 disabled:opacity-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteUser(user.id)}
                      disabled={isLoading}
                      className="px-2 py-0.5 bg-red-900/30 hover:bg-red-900/50 text-red-400 text-[10px] rounded border border-red-900/50 disabled:opacity-50 flex items-center gap-1"
                    >
                      <TrashIcon className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Edit User Form */}
          {editingUserId && (
            <div className="mt-4 p-3 bg-zinc-900/60 rounded border border-zinc-800">
              <h4 className="text-xs font-medium text-zinc-300 mb-3">
                Edit User
              </h4>
              <form
                onSubmit={handleUpdateUser}
                className="grid grid-cols-2 gap-3"
              >
                <div className="col-span-2">
                  <Label className="text-xs text-zinc-400">Name</Label>
                  <Input
                    type="text"
                    value={editingUserName}
                    onChange={(e) => setEditingUserName(e.target.value)}
                    required
                    className="mt-1.5 bg-zinc-900 border-zinc-800 text-zinc-300 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs text-zinc-400">Role</Label>
                  <select
                    value={editingUserRole}
                    onChange={(e) =>
                      setEditingUserRole(e.target.value as "user" | "admin")
                    }
                    className="mt-1.5 w-full px-3 py-1.5 rounded border border-zinc-800 bg-zinc-900 text-xs text-zinc-300 focus:outline-none focus:border-zinc-700"
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="flex items-end gap-2">
                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="h-8 bg-zinc-800 text-zinc-200 text-xs hover:bg-zinc-700 disabled:opacity-50"
                  >
                    {isLoading ? "Saving..." : "Save"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditingUserId("");
                      setEditingUserName("");
                      setEditingUserRole("user");
                    }}
                    className="h-8 text-xs"
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
