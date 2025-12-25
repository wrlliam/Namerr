"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeftIcon, PlusIcon, Cross2Icon, ReloadIcon } from "@radix-ui/react-icons";

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

interface WorkerLog {
  id: string;
  workerId: string;
  level: string;
  message: string;
  timestamp: string;
}

interface WorkerStatistic {
  workerId: string;
  cpuUsage: string | null;
  memoryUsagePercent: string | null;
  filesProcessed: number;
  filesSucceeded: number;
  filesFailed: number;
  filesSkipped: number;
  currentJobProgress: number;
}

interface SshHost {
  id: string;
  name: string;
  hostname: string;
  enabled: boolean;
}

export default function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [logs, setLogs] = useState<WorkerLog[]>([]);
  const [statistics, setStatistics] = useState<WorkerStatistic[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedWorker, setSelectedWorker] = useState<string | null>(null);
  const [showAddWorkerModal, setShowAddWorkerModal] = useState(false);
  const [workerType, setWorkerType] = useState<"local" | "remote">("local");
  const [sshHosts, setSshHosts] = useState<SshHost[]>([]);
  const [selectedSshHost, setSelectedSshHost] = useState<string>("");

  // Fetch initial workers
  useEffect(() => {
    fetchWorkers();
  }, []);

  // Set up SSE connection for real-time updates
  useEffect(() => {
    const eventSource = new EventSource("/api/workers/stream");

    eventSource.addEventListener("connected", (e) => {
      console.log("Connected to worker stream");
    });

    eventSource.addEventListener("workers", (e) => {
      const data = JSON.parse(e.data);
      setWorkers(data);
      setIsLoading(false);
    });

    eventSource.addEventListener("logs", (e) => {
      const newLogs: WorkerLog[] = JSON.parse(e.data);
      setLogs((prev) => [...newLogs, ...prev].slice(0, 500)); // Keep last 500 logs
    });

    eventSource.addEventListener("statistics", (e) => {
      const newStats: WorkerStatistic[] = JSON.parse(e.data);
      setStatistics(newStats);
    });

    eventSource.onerror = () => {
      console.error("SSE connection error");
      eventSource.close();
      // Retry connection after 5 seconds
      setTimeout(() => {
        window.location.reload();
      }, 5000);
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const fetchWorkers = async () => {
    try {
      const res = await fetch("/api/workers");
      if (res.ok) {
        const data = await res.json();
        setWorkers(data.workers);
      }
    } catch (error) {
      console.error("Error fetching workers:", error);
    } finally {
      setIsLoading(false);
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
    if (showAddWorkerModal && workerType === "remote") {
      fetchSshHosts();
    }
  }, [showAddWorkerModal, workerType]);

  const killWorker = async (workerId: string) => {
    if (!confirm("Are you sure you want to stop this worker?")) return;

    try {
      const res = await fetch(`/api/workers/${workerId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchWorkers();
      }
    } catch (error) {
      console.error("Error killing worker:", error);
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
          alert("Please select an SSH host");
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
        setShowAddWorkerModal(false);
        setSelectedSshHost("");
        fetchWorkers();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to spawn worker");
      }
    } catch (error) {
      console.error("Error spawning worker:", error);
      alert("Failed to spawn worker");
    }
  };

  const getWorkerStats = (workerId: string) => {
    return statistics.find((s) => s.workerId === workerId);
  };

  const filteredLogs = selectedWorker
    ? logs.filter((log) => log.workerId === selectedWorker)
    : logs;

  const getStatusColor = (status: string, isHealthy: boolean) => {
    if (!isHealthy) return "bg-red-900/20 text-red-400 border-red-900/50";
    if (status === "running") return "bg-green-900/20 text-green-400 border-green-900/50";
    if (status === "starting") return "bg-blue-900/20 text-blue-400 border-blue-900/50";
    if (status === "stopping") return "bg-yellow-900/20 text-yellow-400 border-yellow-900/50";
    return "bg-zinc-800 text-zinc-500 border-zinc-700";
  };

  const getLevelColor = (level: string) => {
    if (level === "error") return "text-red-400";
    if (level === "warn") return "text-yellow-400";
    if (level === "info") return "text-blue-400";
    return "text-zinc-400";
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-300 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="p-2 hover:bg-zinc-800 rounded border border-zinc-800 transition-colors"
            >
              <ArrowLeftIcon className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="text-sm font-medium text-zinc-200">Worker Management</h1>
              <p className="text-xs text-zinc-500 mt-0.5">
                Monitor and manage worker instances
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAddWorkerModal(true)}
              className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded border border-blue-700 transition-colors flex items-center gap-2"
            >
              <PlusIcon className="w-3 h-3" />
              Add Worker
            </button>
            <button
              onClick={fetchWorkers}
              className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 rounded border border-zinc-700 transition-colors flex items-center gap-2"
            >
              <ReloadIcon className="w-3 h-3" />
              Refresh
            </button>
          </div>
        </div>

        {/* Workers Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {workers.map((worker) => {
            const stats = getWorkerStats(worker.id);
            return (
              <div
                key={worker.id}
                className="bg-zinc-900 rounded border border-zinc-800 p-4 hover:border-zinc-700 transition-colors cursor-pointer"
                onClick={() =>
                  setSelectedWorker(selectedWorker === worker.id ? null : worker.id)
                }
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-medium text-zinc-200">{worker.name}</h3>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {worker.hostname} • PID {worker.pid || "N/A"}
                    </p>
                  </div>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded border ${getStatusColor(
                      worker.status,
                      worker.isHealthy
                    )}`}
                  >
                    {worker.isStale ? "Stale" : worker.status}
                  </span>
                </div>

                {stats && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-500">CPU:</span>
                      <span className="text-zinc-300">{stats.cpuUsage || "0"}%</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-500">Memory:</span>
                      <span className="text-zinc-300">
                        {stats.memoryUsagePercent || "0"}%
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-500">Processed:</span>
                      <span className="text-zinc-300">{stats.filesProcessed}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[10px] mt-2">
                      <div className="text-center">
                        <div className="text-green-400">{stats.filesSucceeded}</div>
                        <div className="text-zinc-600">Success</div>
                      </div>
                      <div className="text-center">
                        <div className="text-red-400">{stats.filesFailed}</div>
                        <div className="text-zinc-600">Failed</div>
                      </div>
                      <div className="text-center">
                        <div className="text-yellow-400">{stats.filesSkipped}</div>
                        <div className="text-zinc-600">Skipped</div>
                      </div>
                    </div>
                    {stats.currentJobProgress > 0 && (
                      <div className="mt-2">
                        <div className="h-1 bg-zinc-800 rounded overflow-hidden">
                          <div
                            className="h-full bg-blue-500 transition-all"
                            style={{ width: `${stats.currentJobProgress}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-zinc-500 mt-1">
                          Job Progress: {stats.currentJobProgress}%
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-2 mt-3 pt-3 border-t border-zinc-800">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      killWorker(worker.id);
                    }}
                    className="flex-1 px-2 py-1 text-xs bg-red-900/20 hover:bg-red-900/30 text-red-400 rounded border border-red-900/50 transition-colors"
                  >
                    Stop
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Real-time Logs */}
        <div className="bg-zinc-900 rounded border border-zinc-800 p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-zinc-200">
              Real-time Logs{" "}
              {selectedWorker && (
                <span className="text-xs text-zinc-500">
                  ({workers.find((w) => w.id === selectedWorker)?.name})
                </span>
              )}
            </h2>
            {selectedWorker && (
              <button
                onClick={() => setSelectedWorker(null)}
                className="text-xs text-zinc-500 hover:text-zinc-400"
              >
                Clear Filter
              </button>
            )}
          </div>
          <div className="bg-[#0a0a0a] rounded border border-zinc-800 p-3 h-96 overflow-y-auto font-mono text-xs">
            {filteredLogs.length === 0 ? (
              <p className="text-zinc-600 text-center py-8">
                No logs yet. Logs will appear here in real-time.
              </p>
            ) : (
              <div className="space-y-1">
                {filteredLogs.map((log, idx) => (
                  <div key={`${log.id}-${idx}`} className="flex gap-2">
                    <span className="text-zinc-600 shrink-0">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span className={`shrink-0 ${getLevelColor(log.level)}`}>
                      [{log.level.toUpperCase()}]
                    </span>
                    <span className="text-zinc-300">{log.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Add Worker Modal */}
        {showAddWorkerModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6 max-w-md w-full">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-zinc-200">Add Worker</h2>
                <button
                  onClick={() => setShowAddWorkerModal(false)}
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
                          onClick={() => setShowAddWorkerModal(false)}
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
                              alert("Please select an SSH host");
                              return;
                            }
                            const selectedHost = sshHosts.find(h => h.id === selectedSshHost);
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
                          onClick={() => setShowAddWorkerModal(false)}
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
      </div>
    </div>
  );
}
