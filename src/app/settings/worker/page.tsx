"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  CheckCircledIcon,
  ReloadIcon,
  ArrowLeftIcon,
  PlusIcon,
  Cross2Icon,
  TrashIcon,
  ComponentInstanceIcon,
} from "@radix-ui/react-icons";
import { Label } from "@/src/components/ui/Input";
import { Button } from "@/src/components/ui/Button";

interface WorkerConfig {
  parallelism: number;
  dryRun: boolean;
}

interface Worker {
  id: string;
  name: string;
  hostname: string;
  type: string;
  status: string;
  pid: number | null;
  lastHeartbeat: string | null;
  startedAt: string | null;
  isHealthy: boolean;
  isStale: boolean;
}

interface SshHost {
  id: string;
  name: string;
  hostname: string;
  enabled: boolean;
}

export default function WorkerSettingsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Configuration state
  const [parallelism, setParallelism] = useState(4);
  const [dryRun, setDryRun] = useState(true);

  // Worker management state
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [selectedWorkers, setSelectedWorkers] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [workerType, setWorkerType] = useState<"local" | "remote">("local");
  const [sshHosts, setSshHosts] = useState<SshHost[]>([]);
  const [selectedSshHost, setSelectedSshHost] = useState<string>("");

  useEffect(() => {
    fetchConfig();
    fetchWorkers();
  }, []);

  const fetchConfig = async () => {
    try {
      const response = await fetch("/api/worker/config");
      if (response.ok) {
        const data: WorkerConfig = await response.json();
        setParallelism(data.parallelism);
        setDryRun(data.dryRun);
      }
    } catch {
      setError("Failed to load worker config");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchWorkers = async () => {
    try {
      const res = await fetch("/api/workers");
      if (res.ok) {
        const data = await res.json();
        setWorkers(data.workers);
      }
    } catch (error) {
      console.error("Error fetching workers:", error);
    }
  };

  const fetchSshHosts = async () => {
    try {
      const res = await fetch("/api/workers/ssh-hosts");
      if (res.ok) {
        const data = await res.json();
        setSshHosts(data.hosts.filter((h: SshHost) => h.enabled));
      }
    } catch (error) {
      console.error("Error fetching SSH hosts:", error);
    }
  };

  useEffect(() => {
    if (showAddModal && workerType === "remote") {
      fetchSshHosts();
    }
  }, [showAddModal, workerType]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setIsSaving(true);

    try {
      const response = await fetch("/api/worker/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parallelism, dryRun }),
      });

      if (response.ok) {
        setSuccess("Worker configuration saved successfully");
        setTimeout(() => setSuccess(""), 3000);
      } else {
        const data = await response.json();
        setError(data.error || "Failed to save configuration");
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const spawnWorker = async (name: string) => {
    try {
      const payload: any = {
        type: workerType,
        name: name || `Worker ${workers.length + 1}`,
      };

      if (workerType === "remote") {
        if (!selectedSshHost) {
          setError("Please select an SSH host");
          return;
        }
        payload.sshHostId = selectedSshHost;
      }

      const res = await fetch("/api/workers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setShowAddModal(false);
        setSelectedSshHost("");
        setSuccess("Worker spawned successfully");
        setTimeout(() => setSuccess(""), 3000);
        fetchWorkers();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to spawn worker");
      }
    } catch (error) {
      console.error("Error spawning worker:", error);
      setError("Failed to spawn worker");
    }
  };

  const deleteWorker = async (workerId: string) => {
    if (!confirm("Are you sure you want to stop and remove this worker?")) return;

    try {
      const res = await fetch(`/api/workers/${workerId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setSuccess("Worker removed successfully");
        setTimeout(() => setSuccess(""), 3000);
        fetchWorkers();
        setSelectedWorkers((prev) => {
          const newSet = new Set(prev);
          newSet.delete(workerId);
          return newSet;
        });
      } else {
        const data = await res.json();
        setError(data.error || "Failed to remove worker");
      }
    } catch (error) {
      console.error("Error deleting worker:", error);
      setError("Failed to remove worker");
    }
  };

  const deleteSelectedWorkers = async () => {
    if (selectedWorkers.size === 0) return;
    if (!confirm(`Are you sure you want to stop and remove ${selectedWorkers.size} worker(s)?`)) return;

    let successCount = 0;
    let failCount = 0;

    for (const workerId of selectedWorkers) {
      try {
        const res = await fetch(`/api/workers/${workerId}`, {
          method: "DELETE",
        });
        if (res.ok) {
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
    }

    if (successCount > 0) {
      setSuccess(`Successfully removed ${successCount} worker(s)`);
      setTimeout(() => setSuccess(""), 3000);
    }
    if (failCount > 0) {
      setError(`Failed to remove ${failCount} worker(s)`);
    }

    setSelectedWorkers(new Set());
    fetchWorkers();
  };

  const removeStaleWorkers = async () => {
    const staleWorkers = workers.filter((w) => w.isStale || !w.isHealthy);
    if (staleWorkers.length === 0) {
      setError("No stale workers to remove");
      setTimeout(() => setError(""), 3000);
      return;
    }

    if (!confirm(`Are you sure you want to remove ${staleWorkers.length} stale worker(s)?`)) return;

    let successCount = 0;
    let failCount = 0;

    for (const worker of staleWorkers) {
      try {
        const res = await fetch(`/api/workers/${worker.id}`, {
          method: "DELETE",
        });

        if (res.ok) {
          successCount++;
        } else {
          const data = await res.json();
          console.error(`Failed to remove worker ${worker.id}:`, data);
          failCount++;
        }
      } catch (err) {
        console.error(`Error removing worker ${worker.id}:`, err);
        failCount++;
      }
    }

    setSelectedWorkers(new Set()); // Clear selections

    if (successCount > 0) {
      setSuccess(`Successfully removed ${successCount} stale worker(s)`);
      setTimeout(() => setSuccess(""), 3000);
    }
    if (failCount > 0) {
      setError(`Failed to remove ${failCount} worker(s)`);
      setTimeout(() => setError(""), 5000);
    }

    // Refresh worker list
    await fetchWorkers();
  };

  const toggleWorkerSelection = (workerId: string) => {
    setSelectedWorkers((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(workerId)) {
        newSet.delete(workerId);
      } else {
        newSet.add(workerId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedWorkers.size === workers.length) {
      setSelectedWorkers(new Set());
    } else {
      setSelectedWorkers(new Set(workers.map((w) => w.id)));
    }
  };

  const getStatusColor = (status: string, isHealthy: boolean) => {
    if (!isHealthy) return "bg-red-900/20 text-red-400 border-red-900/50";
    if (status === "running") return "bg-green-900/20 text-green-400 border-green-900/50";
    if (status === "starting") return "bg-blue-900/20 text-blue-400 border-blue-900/50";
    if (status === "stopping") return "bg-yellow-900/20 text-yellow-400 border-yellow-900/50";
    return "bg-zinc-800 text-zinc-500 border-zinc-700";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <ReloadIcon className="w-6 h-6 text-zinc-500 animate-spin" />
      </div>
    );
  }

  const staleCount = workers.filter((w) => w.isStale || !w.isHealthy).length;

  return (
    <div className="min-h-screen bg-black">
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <Link
              href="/settings"
              className="text-zinc-500 hover:text-zinc-400 transition-colors"
            >
              <ArrowLeftIcon className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="text-xl font-medium text-zinc-300">Worker Settings</h1>
              <p className="text-xs text-zinc-500 mt-0.5">
                Manage worker instances and configure background processing
              </p>
            </div>
          </div>
        </div>

        {/* Global Messages */}
        {error && (
          <div className="mb-4 text-xs text-red-400 bg-red-900/20 border border-red-900/50 p-3 rounded">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 text-xs text-green-400 bg-green-900/20 border border-green-900/50 p-3 rounded flex items-center gap-2">
            <CheckCircledIcon className="w-3.5 h-3.5" />
            {success}
          </div>
        )}

        {/* Configuration Section */}
        <div className="mb-8">
          <h2 className="text-sm font-medium text-zinc-300 mb-4">Processing Configuration</h2>
          <div className="bg-zinc-900 rounded border border-zinc-800 p-6">
            <form onSubmit={handleSaveConfig} className="space-y-6">
              {/* Dry Run Mode */}
              <div>
                <Label className="text-xs text-zinc-400">Dry Run Mode</Label>
                <div className="mt-2 flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={dryRun}
                    onChange={(e) => setDryRun(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-zinc-200"
                  />
                  <div>
                    <p className="text-xs text-zinc-300">
                      Enable dry run mode (recommended for first runs)
                    </p>
                    <p className="text-[10px] text-zinc-600 mt-1">
                      When enabled, the worker will log what it <em>would</em> rename without actually
                      renaming files. Disable this only when you're confident the renaming is correct.
                    </p>
                  </div>
                </div>
              </div>

              {/* Parallelism */}
              <div>
                <Label className="text-xs text-zinc-400">
                  Parallel Workers ({parallelism})
                </Label>
                <div className="mt-2">
                  <input
                    type="range"
                    min="1"
                    max="20"
                    value={parallelism}
                    onChange={(e) => setParallelism(parseInt(e.target.value, 10))}
                    className="w-full h-2 bg-zinc-800 rounded appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
                    <span>1 (slow)</span>
                    <span>10 (balanced)</span>
                    <span>20 (fast)</span>
                  </div>
                </div>
                <p className="text-[10px] text-zinc-600 mt-2">
                  Number of files to process simultaneously. Higher values = faster processing
                  but more CPU/disk usage.
                </p>
              </div>

              {/* Save Button */}
              <Button
                type="submit"
                disabled={isSaving}
                className="w-full h-9 bg-zinc-800 text-zinc-200 text-xs hover:bg-zinc-700 disabled:opacity-50"
              >
                {isSaving ? "Saving..." : "Save Configuration"}
              </Button>
            </form>
          </div>
        </div>

        {/* Worker Instances Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-zinc-300">Worker Instances</h2>
            <div className="flex gap-2">
              {staleCount > 0 && (
                <button
                  onClick={removeStaleWorkers}
                  className="px-3 py-1.5 text-xs bg-red-900/20 hover:bg-red-900/30 text-red-400 rounded border border-red-900/50 transition-colors"
                >
                  Remove {staleCount} Stale
                </button>
              )}
              {selectedWorkers.size > 0 && (
                <button
                  onClick={deleteSelectedWorkers}
                  className="px-3 py-1.5 text-xs bg-red-900/20 hover:bg-red-900/30 text-red-400 rounded border border-red-900/50 transition-colors flex items-center gap-2"
                >
                  <TrashIcon className="w-3 h-3" />
                  Remove {selectedWorkers.size} Selected
                </button>
              )}
              <button
                onClick={fetchWorkers}
                className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 rounded border border-zinc-700 transition-colors flex items-center gap-2"
              >
                <ReloadIcon className="w-3 h-3" />
                Refresh
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded border border-blue-700 transition-colors flex items-center gap-2"
              >
                <PlusIcon className="w-3 h-3" />
                Add Worker
              </button>
            </div>
          </div>

          <div className="bg-zinc-900 rounded border border-zinc-800 overflow-hidden">
            {workers.length === 0 ? (
              <div className="p-8 text-center">
                <ComponentInstanceIcon className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
                <p className="text-xs text-zinc-500">No worker instances configured</p>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="mt-3 px-4 py-2 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded border border-zinc-700 transition-colors"
                >
                  Add Your First Worker
                </button>
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-zinc-800/50 border-b border-zinc-800">
                  <tr>
                    <th className="text-left p-3 font-medium text-zinc-400">
                      <input
                        type="checkbox"
                        checked={selectedWorkers.size === workers.length && workers.length > 0}
                        onChange={toggleSelectAll}
                        className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-900 text-zinc-200"
                      />
                    </th>
                    <th className="text-left p-3 font-medium text-zinc-400">Name</th>
                    <th className="text-left p-3 font-medium text-zinc-400">Type</th>
                    <th className="text-left p-3 font-medium text-zinc-400">Hostname</th>
                    <th className="text-left p-3 font-medium text-zinc-400">Status</th>
                    <th className="text-left p-3 font-medium text-zinc-400">Last Heartbeat</th>
                    <th className="text-right p-3 font-medium text-zinc-400">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {workers.map((worker) => (
                    <tr key={worker.id} className="border-b border-zinc-800 hover:bg-zinc-800/30">
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={selectedWorkers.has(worker.id)}
                          onChange={() => toggleWorkerSelection(worker.id)}
                          className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-900 text-zinc-200"
                        />
                      </td>
                      <td className="p-3 text-zinc-300 font-medium">{worker.name}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded border border-zinc-700 uppercase text-[10px]">
                          {worker.type}
                        </span>
                      </td>
                      <td className="p-3 text-zinc-400">{worker.hostname}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded border text-[10px] uppercase ${getStatusColor(worker.status, worker.isHealthy)}`}>
                          {worker.isStale ? "Stale" : worker.status}
                        </span>
                      </td>
                      <td className="p-3 text-zinc-500">
                        {worker.lastHeartbeat
                          ? new Date(worker.lastHeartbeat).toLocaleString()
                          : "Never"}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => deleteWorker(worker.id)}
                          className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors"
                          title="Remove worker"
                        >
                          <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <p className="text-[10px] text-zinc-600 mt-2">
            Workers process jobs from the queue. Stale workers haven't sent a heartbeat in over 30 seconds.
          </p>
        </div>

        {/* Add Worker Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6 max-w-md w-full">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-zinc-200">Add Worker Instance</h2>
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setSelectedSshHost("");
                    setError("");
                  }}
                  className="text-zinc-500 hover:text-zinc-400"
                >
                  <Cross2Icon className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs text-zinc-400 mb-2 block">Worker Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setWorkerType("local")}
                      className={`px-3 py-2 text-xs rounded border transition-colors ${
                        workerType === "local"
                          ? "bg-blue-600 border-blue-700 text-white"
                          : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700"
                      }`}
                    >
                      Local Worker
                    </button>
                    <button
                      onClick={() => setWorkerType("remote")}
                      className={`px-3 py-2 text-xs rounded border transition-colors ${
                        workerType === "remote"
                          ? "bg-blue-600 border-blue-700 text-white"
                          : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700"
                      }`}
                    >
                      SSH Worker
                    </button>
                  </div>
                </div>

                {workerType === "local" ? (
                  <div>
                    <p className="text-xs text-zinc-500 mb-3">
                      Local workers run on the same machine as the web server. They are
                      automatically managed and require no configuration.
                    </p>
                    <button
                      onClick={() => spawnWorker(`Local Worker ${workers.length + 1}`)}
                      className="w-full px-4 py-2 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded border border-blue-700 transition-colors"
                    >
                      Spawn Local Worker
                    </button>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-zinc-500 mb-3">
                      SSH workers run on remote machines via SSH connection.
                    </p>
                    {sshHosts.length === 0 ? (
                      <>
                        <p className="text-xs text-yellow-400 mb-3">
                          No SSH hosts configured. Please add an SSH host first.
                        </p>
                        <Link
                          href="/workers/ssh-hosts"
                          className="block w-full px-4 py-2 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-center rounded border border-zinc-700 transition-colors"
                          onClick={() => setShowAddModal(false)}
                        >
                          Configure SSH Hosts
                        </Link>
                      </>
                    ) : (
                      <>
                        <div className="mb-3">
                          <label className="text-xs text-zinc-400 mb-1.5 block">
                            Select SSH Host
                          </label>
                          <select
                            value={selectedSshHost}
                            onChange={(e) => setSelectedSshHost(e.target.value)}
                            className="w-full px-3 py-2 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-300 focus:outline-none focus:border-zinc-600"
                          >
                            <option value="">Choose an SSH host...</option>
                            {sshHosts.map((host) => (
                              <option key={host.id} value={host.id}>
                                {host.name} ({host.hostname})
                              </option>
                            ))}
                          </select>
                        </div>
                        <button
                          onClick={() => {
                            if (!selectedSshHost) {
                              setError("Please select an SSH host");
                              return;
                            }
                            const selectedHost = sshHosts.find((h) => h.id === selectedSshHost);
                            spawnWorker(`SSH Worker - ${selectedHost?.name || "Remote"}`);
                          }}
                          disabled={!selectedSshHost}
                          className="w-full px-4 py-2 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded border border-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Spawn SSH Worker
                        </button>
                        <Link
                          href="/workers/ssh-hosts"
                          className="block w-full px-4 py-2 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-center rounded border border-zinc-700 transition-colors mt-2"
                          onClick={() => setShowAddModal(false)}
                        >
                          Manage SSH Hosts
                        </Link>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
