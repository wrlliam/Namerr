/**
 * Account & User Management Settings
 * Change email, password, and manage users (admin only)
 */

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  TrashIcon,
  PlusIcon,
  Cross2Icon,
  PersonIcon,
  CheckCircledIcon,
  ExclamationTriangleIcon,
  EyeOpenIcon,
  EyeClosedIcon,
  MagicWandIcon,
  CopyIcon,
} from "@radix-ui/react-icons";
import { Label } from "@/src/components/ui/Input";
import { Button } from "@/src/components/ui/Button";
import { validatePassword, generateStrongPassword } from "@/src/lib/password-validation";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
}

export default function AccountSettingsPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Change Email/Password State
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Password visibility state
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showNewUserPassword, setShowNewUserPassword] = useState(false);

  // User Management State
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState<"user" | "admin">("user");

  // UI State
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  const fetchCurrentUser = async () => {
    try {
      const res = await fetch("/api/users/me");
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data.user);
        setNewEmail(data.user.email);
        setIsAdmin(data.user.role === "admin");

        // Fetch all users if admin
        if (data.user.role === "admin") {
          await fetchUsers();
        }
      }
    } catch (err) {
      console.error("Error fetching current user:", err);
      setError("Failed to load user data");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users);
      }
    } catch (err) {
      console.error("Error fetching users:", err);
    }
  };

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail) {
      setError("Email is required");
      return;
    }

    setIsSaving(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess("Email updated successfully");
        setTimeout(() => setSuccess(""), 3000);
        await fetchCurrentUser();
      } else {
        setError(data.error || "Failed to update email");
      }
    } catch (err) {
      setError("Failed to update email");
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("All password fields are required");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }

    // Validate password strength
    const validation = validatePassword(newPassword);
    if (!validation.isValid) {
      setError(validation.errors.join(". "));
      return;
    }

    setIsSaving(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess("Password updated successfully");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setTimeout(() => setSuccess(""), 3000);
      } else {
        setError(data.error || "Failed to update password");
      }
    } catch (err) {
      setError("Failed to update password");
    } finally {
      setIsSaving(false);
    }
  };

  const generateRandomPassword = () => {
    const password = generateStrongPassword(16);
    setNewUserPassword(password);
  };

  const copyPasswordToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(newUserPassword);
      setSuccess("Password copied to clipboard");
      setTimeout(() => setSuccess(""), 2000);
    } catch (err) {
      setError("Failed to copy password");
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserEmail || !newUserName || !newUserPassword) {
      setError("All fields are required");
      return;
    }

    // Validate password strength
    const validation = validatePassword(newUserPassword);
    if (!validation.isValid) {
      setError(validation.errors.join(". "));
      return;
    }

    setIsSaving(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newUserEmail,
          name: newUserName,
          password: newUserPassword,
          role: newUserRole,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(`User ${newUserName} created successfully`);
        setShowAddUserModal(false);
        setNewUserEmail("");
        setNewUserName("");
        setNewUserPassword("");
        setNewUserRole("user");
        setTimeout(() => setSuccess(""), 3000);
        await fetchUsers();
      } else {
        setError(data.error || "Failed to create user");
      }
    } catch (err) {
      setError("Failed to create user");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (userId === currentUser?.id) {
      setError("You cannot delete your own account");
      setTimeout(() => setError(""), 3000);
      return;
    }

    if (!confirm(`Are you sure you want to delete user "${userName}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setSuccess(`User ${userName} deleted successfully`);
        setTimeout(() => setSuccess(""), 3000);
        await fetchUsers();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to delete user");
      }
    } catch (err) {
      setError("Failed to delete user");
    }
  };

  const handleUpdateUserRole = async (userId: string, newRole: string) => {
    if (userId === currentUser?.id) {
      setError("You cannot change your own role");
      setTimeout(() => setError(""), 3000);
      return;
    }

    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });

      if (res.ok) {
        setSuccess("User role updated successfully");
        setTimeout(() => setSuccess(""), 3000);
        await fetchUsers();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to update user role");
      }
    } catch (err) {
      setError("Failed to update user role");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="text-zinc-500 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      <main className="mx-auto w-full max-w-4xl px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <Link
              href="/settings"
              className="text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <ArrowLeftIcon className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="text-base font-medium text-zinc-200">
                Account & Users
              </h1>
              <p className="text-xs text-zinc-500 mt-0.5">
                Manage your account and users
              </p>
            </div>
          </div>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="mb-4 text-xs text-red-400 bg-red-900/20 border border-red-900/50 p-3 rounded flex items-center gap-2">
            <ExclamationTriangleIcon className="w-3.5 h-3.5" />
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 text-xs text-green-400 bg-green-900/20 border border-green-900/50 p-3 rounded flex items-center gap-2">
            <CheckCircledIcon className="w-3.5 h-3.5" />
            {success}
          </div>
        )}

        {/* My Account Section */}
        <div className="mb-8">
          <h2 className="text-sm font-medium text-zinc-300 mb-4">My Account</h2>
          <div className="bg-zinc-900 rounded border border-zinc-800 p-6 space-y-6">
            {/* Change Email */}
            <form onSubmit={handleChangeEmail} className="space-y-4">
              <div>
                <Label className="text-xs text-zinc-400">Email Address</Label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="mt-2 w-full h-9 bg-zinc-950 border border-zinc-800 rounded px-3 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
                  placeholder="your@email.com"
                />
              </div>
              <Button
                type="submit"
                disabled={isSaving || newEmail === currentUser?.email}
                className="h-9 bg-zinc-800 text-zinc-200 text-xs hover:bg-zinc-700 disabled:opacity-50"
              >
                {isSaving ? "Updating..." : "Update Email"}
              </Button>
            </form>

            <div className="border-t border-zinc-800 my-6" />

            {/* Change Password */}
            <form onSubmit={handleChangePassword} className="space-y-4">
              <h3 className="text-xs font-medium text-zinc-400">Change Password</h3>
              <div>
                <Label className="text-xs text-zinc-400">Current Password</Label>
                <div className="relative mt-2">
                  <input
                    type={showCurrentPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full h-9 bg-zinc-950 border border-zinc-800 rounded px-3 pr-10 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
                    placeholder="Enter current password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                  >
                    {showCurrentPassword ? (
                      <EyeClosedIcon className="w-4 h-4" />
                    ) : (
                      <EyeOpenIcon className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
              <div>
                <Label className="text-xs text-zinc-400">New Password</Label>
                <div className="relative mt-2">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full h-9 bg-zinc-950 border border-zinc-800 rounded px-3 pr-10 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
                    placeholder="12+ chars, uppercase, lowercase, number, symbol"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                  >
                    {showNewPassword ? (
                      <EyeClosedIcon className="w-4 h-4" />
                    ) : (
                      <EyeOpenIcon className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
              <div>
                <Label className="text-xs text-zinc-400">Confirm New Password</Label>
                <div className="relative mt-2">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full h-9 bg-zinc-950 border border-zinc-800 rounded px-3 pr-10 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
                    placeholder="Re-enter new password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                  >
                    {showConfirmPassword ? (
                      <EyeClosedIcon className="w-4 h-4" />
                    ) : (
                      <EyeOpenIcon className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
              <Button
                type="submit"
                disabled={isSaving}
                className="h-9 bg-zinc-800 text-zinc-200 text-xs hover:bg-zinc-700 disabled:opacity-50"
              >
                {isSaving ? "Updating..." : "Change Password"}
              </Button>
            </form>
          </div>
        </div>

        {/* User Management (Admin Only) */}
        {isAdmin && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-zinc-300">User Management</h2>
              <button
                onClick={() => setShowAddUserModal(true)}
                className="flex items-center gap-2 h-8 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded transition-colors"
              >
                <PlusIcon className="w-3.5 h-3.5" />
                Add User
              </button>
            </div>

            {users.length === 0 ? (
              <div className="bg-zinc-900 rounded border border-zinc-800 p-8 text-center">
                <PersonIcon className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
                <p className="text-xs text-zinc-500">No users found</p>
              </div>
            ) : (
              <div className="bg-zinc-900 rounded border border-zinc-800 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-zinc-950 border-b border-zinc-800">
                    <tr>
                      <th className="text-left p-3 font-medium text-zinc-400">Name</th>
                      <th className="text-left p-3 font-medium text-zinc-400">Email</th>
                      <th className="text-left p-3 font-medium text-zinc-400">Role</th>
                      <th className="text-left p-3 font-medium text-zinc-400">Created</th>
                      <th className="text-left p-3 font-medium text-zinc-400">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr
                        key={user.id}
                        className="border-b border-zinc-800 last:border-0 hover:bg-zinc-800/50"
                      >
                        <td className="p-3 text-zinc-200">
                          {user.name}
                          {user.id === currentUser?.id && (
                            <span className="ml-2 text-[10px] text-zinc-500">(You)</span>
                          )}
                        </td>
                        <td className="p-3 text-zinc-400">{user.email}</td>
                        <td className="p-3">
                          <select
                            value={user.role}
                            onChange={(e) => handleUpdateUserRole(user.id, e.target.value)}
                            disabled={user.id === currentUser?.id}
                            className="h-7 px-2 bg-zinc-950 border border-zinc-800 rounded text-xs text-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <option value="user">User</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                        <td className="p-3 text-zinc-500">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </td>
                        <td className="p-3">
                          <button
                            onClick={() => handleDeleteUser(user.id, user.name)}
                            disabled={user.id === currentUser?.id}
                            className="text-red-400 hover:text-red-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title={user.id === currentUser?.id ? "Cannot delete yourself" : "Delete user"}
                          >
                            <TrashIcon className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Add User Modal */}
        {showAddUserModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6 max-w-md w-full">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-zinc-200">Add New User</h2>
                <button
                  onClick={() => {
                    setShowAddUserModal(false);
                    setNewUserEmail("");
                    setNewUserName("");
                    setNewUserPassword("");
                    setNewUserRole("user");
                    setError("");
                  }}
                  className="text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <Cross2Icon className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleAddUser} className="space-y-4">
                <div>
                  <Label className="text-xs text-zinc-400">Email</Label>
                  <input
                    type="email"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    className="mt-2 w-full h-9 bg-zinc-950 border border-zinc-800 rounded px-3 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
                    placeholder="user@example.com"
                    required
                  />
                </div>

                <div>
                  <Label className="text-xs text-zinc-400">Name</Label>
                  <input
                    type="text"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    className="mt-2 w-full h-9 bg-zinc-950 border border-zinc-800 rounded px-3 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
                    placeholder="John Doe"
                    required
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs text-zinc-400">Password</Label>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={generateRandomPassword}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors"
                        title="Generate random password"
                      >
                        <MagicWandIcon className="w-3 h-3" />
                        Generate
                      </button>
                      {newUserPassword && (
                        <button
                          type="button"
                          onClick={copyPasswordToClipboard}
                          className="flex items-center gap-1 px-2 py-1 text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors"
                          title="Copy password"
                        >
                          <CopyIcon className="w-3 h-3" />
                          Copy
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="relative">
                    <input
                      type={showNewUserPassword ? "text" : "password"}
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                      className="w-full h-9 bg-zinc-950 border border-zinc-800 rounded px-3 pr-10 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
                      placeholder="12+ chars, uppercase, lowercase, number, symbol"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewUserPassword(!showNewUserPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                    >
                      {showNewUserPassword ? (
                        <EyeClosedIcon className="w-4 h-4" />
                      ) : (
                        <EyeOpenIcon className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-1">
                    User will be prompted to change this password on first login
                  </p>
                </div>

                <div>
                  <Label className="text-xs text-zinc-400">Role</Label>
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value as "user" | "admin")}
                    className="mt-2 w-full h-9 bg-zinc-950 border border-zinc-800 rounded px-3 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    type="button"
                    onClick={() => {
                      setShowAddUserModal(false);
                      setNewUserEmail("");
                      setNewUserName("");
                      setNewUserPassword("");
                      setNewUserRole("user");
                      setError("");
                    }}
                    className="flex-1 h-9 bg-zinc-800 text-zinc-200 text-xs hover:bg-zinc-700"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSaving}
                    className="flex-1 h-9 bg-blue-600 text-white text-xs hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isSaving ? "Creating..." : "Create User"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
