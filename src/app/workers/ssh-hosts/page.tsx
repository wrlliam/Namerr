"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  PlusIcon,
  Pencil1Icon,
  TrashIcon,
  CheckCircledIcon,
  CrossCircledIcon,
  ReloadIcon,
  EyeOpenIcon,
  EyeClosedIcon,
} from "@radix-ui/react-icons";

interface SshHost {
  id: string;
  name: string;
  hostname: string;
  port: number;
  username: string;
  authMethod: string;
  workingDirectory: string | null;
  enabled: boolean;
  connectionStatus: string;
  lastConnectionAt: string | null;
}

export default function SshHostsPage() {
  const [hosts, setHosts] = useState<SshHost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingHost, setEditingHost] = useState<SshHost | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [hostname, setHostname] = useState("");
  const [port, setPort] = useState(22);
  const [username, setUsername] = useState("");
  const [authMethod, setAuthMethod] = useState<"password" | "key">("key");
  const [password, setPassword] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [workingDirectory, setWorkingDirectory] = useState("");

  // Test connection state
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{success: boolean; message?: string; error?: string} | null>(null);

  // Password visibility
  const [showPassword, setShowPassword] = useState(false);
  const [showPassphrase, setShowPassphrase] = useState(false);

  useEffect(() => {
    fetchHosts();
  }, []);

  const fetchHosts = async () => {
    try {
      const res = await fetch("/api/workers/ssh-hosts");
      if (res.ok) {
        const data = await res.json();
        setHosts(data.hosts);
      }
    } catch (error) {
      console.error("Error fetching SSH hosts:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const openAddModal = () => {
    resetForm();
    setEditingHost(null);
    setShowModal(true);
  };

  const openEditModal = (host: SshHost) => {
    setEditingHost(host);
    setName(host.name);
    setHostname(host.hostname);
    setPort(host.port);
    setUsername(host.username);
    setAuthMethod(host.authMethod as "password" | "key");
    setWorkingDirectory(host.workingDirectory || "");
    setShowModal(true);
  };

  const resetForm = () => {
    setName("");
    setHostname("");
    setPort(22);
    setUsername("");
    setAuthMethod("key");
    setPassword("");
    setPrivateKey("");
    setPassphrase("");
    setWorkingDirectory("");
    setTestResult(null);
    setShowPassword(false);
    setShowPassphrase(false);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    const payload = {
      hostname,
      port,
      username,
      authMethod,
      ...(authMethod === "password" ? { password } : { privateKey, passphrase }),
    };

    try {
      const res = await fetch("/api/workers/ssh-hosts/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      setTestResult(data);
    } catch (error) {
      setTestResult({
        success: false,
        error: "Failed to test connection",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const payload = {
      name,
      hostname,
      port,
      username,
      authMethod,
      ...(authMethod === "password" ? { password } : { privateKey, passphrase }),
      workingDirectory: workingDirectory || null,
    };

    try {
      const res = await fetch(
        editingHost ? `/api/workers/ssh-hosts/${editingHost.id}` : "/api/workers/ssh-hosts",
        {
          method: editingHost ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (res.ok) {
        setShowModal(false);
        fetchHosts();
        resetForm();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to save SSH host");
      }
    } catch (error) {
      console.error("Error saving SSH host:", error);
      alert("Failed to save SSH host");
    }
  };

  const deleteHost = async (id: string) => {
    if (!confirm("Are you sure you want to delete this SSH host?")) return;

    try {
      const res = await fetch(`/api/workers/ssh-hosts/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchHosts();
      }
    } catch (error) {
      console.error("Error deleting SSH host:", error);
    }
  };

  const getStatusBadge = (status: string, enabled: boolean) => {
    if (!enabled) {
      return (
        <span className="text-[10px] px-1.5 py-0.5 rounded border bg-zinc-800 text-zinc-500 border-zinc-700">
          Disabled
        </span>
      );
    }
    if (status === "connected") {
      return (
        <span className="text-[10px] px-1.5 py-0.5 rounded border bg-green-900/20 text-green-400 border-green-900/50">
          <CheckCircledIcon className="w-3 h-3 inline mr-1" />
          Connected
        </span>
      );
    }
    if (status === "error") {
      return (
        <span className="text-[10px] px-1.5 py-0.5 rounded border bg-red-900/20 text-red-400 border-red-900/50">
          <CrossCircledIcon className="w-3 h-3 inline mr-1" />
          Error
        </span>
      );
    }
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded border bg-zinc-800 text-zinc-500 border-zinc-700">
        Not Connected
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-300 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link
              href="/workers"
              className="p-2 hover:bg-zinc-800 rounded border border-zinc-800 transition-colors"
            >
              <ArrowLeftIcon className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="text-sm font-medium text-zinc-200">SSH Hosts</h1>
              <p className="text-xs text-zinc-500 mt-0.5">
                Configure remote hosts for worker deployment
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={openAddModal}
              className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded border border-blue-700 transition-colors flex items-center gap-2"
            >
              <PlusIcon className="w-3 h-3" />
              Add SSH Host
            </button>
            <button
              onClick={fetchHosts}
              className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 rounded border border-zinc-700 transition-colors flex items-center gap-2"
            >
              <ReloadIcon className="w-3 h-3" />
              Refresh
            </button>
          </div>
        </div>

        {/* SSH Hosts List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <ReloadIcon className="w-6 h-6 text-zinc-500 animate-spin" />
          </div>
        ) : hosts.length === 0 ? (
          <div className="bg-zinc-900 rounded border border-zinc-800 p-12 text-center">
            <p className="text-sm text-zinc-500 mb-4">No SSH hosts configured</p>
            <button
              onClick={openAddModal}
              className="px-4 py-2 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded border border-blue-700 transition-colors"
            >
              Add Your First SSH Host
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {hosts.map((host) => (
              <div
                key={host.id}
                className="bg-zinc-900 rounded border border-zinc-800 p-4 hover:border-zinc-700 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-sm font-medium text-zinc-200">{host.name}</h3>
                      {getStatusBadge(host.connectionStatus, host.enabled)}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div>
                        <span className="text-zinc-500">Host:</span>
                        <span className="text-zinc-300 ml-2 font-mono">
                          {host.hostname}:{host.port}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Username:</span>
                        <span className="text-zinc-300 ml-2">{host.username}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Auth:</span>
                        <span className="text-zinc-300 ml-2 capitalize">{host.authMethod}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Working Dir:</span>
                        <span className="text-zinc-300 ml-2 font-mono">
                          {host.workingDirectory || "~/worker"}
                        </span>
                      </div>
                    </div>
                    {host.lastConnectionAt && (
                      <p className="text-[10px] text-zinc-600 mt-2">
                        Last connected: {new Date(host.lastConnectionAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => openEditModal(host)}
                      className="p-2 text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800 rounded transition-colors"
                    >
                      <Pencil1Icon className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => deleteHost(host.id)}
                      className="p-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors"
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <h2 className="text-sm font-medium text-zinc-200 mb-4">
                {editingHost ? "Edit SSH Host" : "Add SSH Host"}
              </h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-zinc-400 mb-1.5 block">Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Production Server"
                      required
                      className="w-full px-3 py-2 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-300 focus:outline-none focus:border-zinc-600"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-400 mb-1.5 block">Hostname/IP</label>
                    <input
                      type="text"
                      value={hostname}
                      onChange={(e) => setHostname(e.target.value)}
                      placeholder="192.168.1.100"
                      required
                      className="w-full px-3 py-2 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-300 focus:outline-none focus:border-zinc-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-zinc-400 mb-1.5 block">Port</label>
                    <input
                      type="number"
                      value={port}
                      onChange={(e) => setPort(parseInt(e.target.value))}
                      required
                      className="w-full px-3 py-2 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-300 focus:outline-none focus:border-zinc-600"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-400 mb-1.5 block">Username</label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="root"
                      required
                      className="w-full px-3 py-2 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-300 focus:outline-none focus:border-zinc-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-zinc-400 mb-1.5 block">Working Directory</label>
                  <input
                    type="text"
                    value={workingDirectory}
                    onChange={(e) => setWorkingDirectory(e.target.value)}
                    placeholder="/home/user/namerr-worker"
                    className="w-full px-3 py-2 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-300 font-mono focus:outline-none focus:border-zinc-600"
                  />
                  <p className="text-[10px] text-zinc-600 mt-1">
                    Path where the worker code is located on the remote server
                  </p>
                </div>

                <div>
                  <label className="text-xs text-zinc-400 mb-2 block">Authentication Method</label>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <button
                      type="button"
                      onClick={() => setAuthMethod("key")}
                      className={`px-3 py-2 text-xs rounded border transition-colors ${
                        authMethod === "key"
                          ? "bg-blue-600 border-blue-700 text-white"
                          : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700"
                      }`}
                    >
                      SSH Key
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthMethod("password")}
                      className={`px-3 py-2 text-xs rounded border transition-colors ${
                        authMethod === "password"
                          ? "bg-blue-600 border-blue-700 text-white"
                          : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700"
                      }`}
                    >
                      Password
                    </button>
                  </div>

                  {authMethod === "password" ? (
                    <div>
                      <label className="text-xs text-zinc-400 mb-1.5 block">Password</label>
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required={authMethod === "password" && !editingHost}
                          placeholder={editingHost ? "Leave empty to keep current" : ""}
                          className="w-full px-3 py-2 pr-10 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-300 focus:outline-none focus:border-zinc-600"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                          {showPassword ? (
                            <EyeClosedIcon className="w-4 h-4" />
                          ) : (
                            <EyeOpenIcon className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-zinc-400 mb-1.5 block">Private Key</label>
                        <textarea
                          value={privateKey}
                          onChange={(e) => setPrivateKey(e.target.value)}
                          required={authMethod === "key" && !editingHost}
                          placeholder={
                            editingHost
                              ? "Leave empty to keep current"
                              : "-----BEGIN OPENSSH PRIVATE KEY-----\n..."
                          }
                          rows={4}
                          className="w-full px-3 py-2 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-300 font-mono focus:outline-none focus:border-zinc-600"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-zinc-400 mb-1.5 block">
                          Passphrase (optional)
                        </label>
                        <div className="relative">
                          <input
                            type={showPassphrase ? "text" : "password"}
                            value={passphrase}
                            onChange={(e) => setPassphrase(e.target.value)}
                            placeholder="Leave empty if key has no passphrase"
                            className="w-full px-3 py-2 pr-10 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-300 focus:outline-none focus:border-zinc-600"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassphrase(!showPassphrase)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                          >
                            {showPassphrase ? (
                              <EyeClosedIcon className="w-4 h-4" />
                            ) : (
                              <EyeOpenIcon className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Test Connection Section */}
                <div className="pt-4 border-t border-zinc-800">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isTesting || !hostname || !username || (authMethod === "password" && !password && !editingHost) || (authMethod === "key" && !privateKey && !editingHost)}
                    className="w-full px-4 py-2 text-xs bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-900 disabled:text-zinc-600 text-zinc-300 rounded border border-zinc-700 transition-colors flex items-center justify-center gap-2"
                  >
                    {isTesting ? (
                      <>
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-zinc-400"></div>
                        Testing Connection...
                      </>
                    ) : (
                      "Test Connection"
                    )}
                  </button>

                  {/* Test Results */}
                  {testResult && (
                    <div className={`mt-3 p-3 rounded border text-xs ${
                      testResult.success
                        ? "bg-green-900/20 border-green-700 text-green-300"
                        : "bg-red-900/20 border-red-700 text-red-300"
                    }`}>
                      {testResult.success ? (
                        <div>
                          <p className="font-medium">Connection successful!</p>
                          {testResult.message && (
                            <p className="text-[10px] mt-1 opacity-80">{testResult.message}</p>
                          )}
                        </div>
                      ) : (
                        <div>
                          <p className="font-medium">Connection failed</p>
                          {testResult.error && (
                            <p className="text-[10px] mt-1 opacity-80">{testResult.error}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex gap-3 pt-4 border-t border-zinc-800">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      resetForm();
                    }}
                    className="flex-1 px-4 py-2 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded border border-zinc-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded border border-blue-700 transition-colors"
                  >
                    {editingHost ? "Update Host" : "Add Host"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
