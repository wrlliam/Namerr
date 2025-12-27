"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  BarChartIcon,
  FileIcon,
  CheckCircledIcon,
  CrossCircledIcon,
  ClockIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";

interface GlobalStats {
  totalLibraries: number;
  totalFiles: number;
  totalSizeBytes: number;
  filesByStatus: {
    pending: number;
    ready: number;
    renamed: number;
    error: number;
    skipped: number;
  };
  verifiedFiles: number;
  unverifiedFiles: number;
  avgMatchScore: number | null;
  recentRenames: number;
}

interface Activity {
  id: string;
  activityType: string;
  description: string;
  createdAt: string;
  library?: {
    id: string;
    label: string;
  } | null;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString();
}

export default function StatsPage() {
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [statsRes, activityRes] = await Promise.all([
        fetch("/api/statistics"),
        fetch("/api/activity?limit=20"),
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      if (activityRes.ok) {
        const activityData = await activityRes.json();
        setActivities(activityData.activities || []);
      }
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getStatusColor = (status: string): string => {
    switch (status) {
      case "renamed":
        return "bg-green-500";
      case "ready":
        return "bg-blue-500";
      case "error":
        return "bg-red-500";
      case "skipped":
        return "bg-zinc-500";
      default:
        return "bg-zinc-600";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-zinc-500">Loading statistics...</p>
      </div>
    );
  }

  const totalStatusFiles = stats
    ? Object.values(stats.filesByStatus).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <div className="min-h-screen bg-black">
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="p-2 rounded hover:bg-zinc-800 transition-colors"
            >
              <ArrowLeftIcon className="w-4 h-4 text-zinc-400" />
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-zinc-300">Statistics</h1>
              <p className="text-xs text-zinc-500 mt-0.5">
                Overview of your media libraries
              </p>
            </div>
          </div>
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 transition-colors"
          >
            <ReloadIcon className="w-3 h-3" />
            Refresh
          </button>
        </div>

        {stats && (
          <>
            {/* Overview Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              <div className="bg-zinc-900 rounded border border-zinc-800 p-4">
                <p className="text-xs text-zinc-500 mb-1">Libraries</p>
                <p className="text-2xl font-medium text-zinc-300">
                  {stats.totalLibraries}
                </p>
              </div>
              <div className="bg-zinc-900 rounded border border-zinc-800 p-4">
                <p className="text-xs text-zinc-500 mb-1">Total Files</p>
                <p className="text-2xl font-medium text-zinc-300">
                  {stats.totalFiles.toLocaleString()}
                </p>
              </div>
              <div className="bg-zinc-900 rounded border border-zinc-800 p-4">
                <p className="text-xs text-zinc-500 mb-1">Total Size</p>
                <p className="text-2xl font-medium text-zinc-300">
                  {formatBytes(stats.totalSizeBytes)}
                </p>
              </div>
              <div className="bg-zinc-900 rounded border border-zinc-800 p-4">
                <p className="text-xs text-zinc-500 mb-1">Recent Renames</p>
                <p className="text-2xl font-medium text-zinc-300">
                  {stats.recentRenames}
                </p>
                <p className="text-[10px] text-zinc-600">Last 24 hours</p>
              </div>
            </div>

            {/* Status Distribution */}
            <div className="bg-zinc-900 rounded border border-zinc-800 p-4 mb-8">
              <h2 className="text-sm font-medium text-zinc-300 mb-4">
                File Status Distribution
              </h2>

              {/* Status Bar */}
              {totalStatusFiles > 0 && (
                <div className="flex h-4 rounded overflow-hidden mb-4">
                  {Object.entries(stats.filesByStatus).map(([status, count]) => {
                    const percentage = (count / totalStatusFiles) * 100;
                    if (percentage === 0) return null;
                    return (
                      <div
                        key={status}
                        className={`${getStatusColor(status)} transition-all`}
                        style={{ width: `${percentage}%` }}
                        title={`${status}: ${count} (${percentage.toFixed(1)}%)`}
                      />
                    );
                  })}
                </div>
              )}

              {/* Status Legend */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-zinc-600" />
                  <div>
                    <p className="text-xs text-zinc-400">Pending</p>
                    <p className="text-sm font-medium text-zinc-300">
                      {stats.filesByStatus.pending.toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-blue-500" />
                  <div>
                    <p className="text-xs text-zinc-400">Ready</p>
                    <p className="text-sm font-medium text-zinc-300">
                      {stats.filesByStatus.ready.toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-green-500" />
                  <div>
                    <p className="text-xs text-zinc-400">Renamed</p>
                    <p className="text-sm font-medium text-zinc-300">
                      {stats.filesByStatus.renamed.toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-red-500" />
                  <div>
                    <p className="text-xs text-zinc-400">Error</p>
                    <p className="text-sm font-medium text-zinc-300">
                      {stats.filesByStatus.error.toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-zinc-500" />
                  <div>
                    <p className="text-xs text-zinc-400">Skipped</p>
                    <p className="text-sm font-medium text-zinc-300">
                      {stats.filesByStatus.skipped.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Verification & Match Quality */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              <div className="bg-zinc-900 rounded border border-zinc-800 p-4">
                <h2 className="text-sm font-medium text-zinc-300 mb-4">
                  Metadata Verification
                </h2>
                <div className="flex gap-8">
                  <div className="flex items-center gap-2">
                    <CheckCircledIcon className="w-4 h-4 text-green-400" />
                    <div>
                      <p className="text-xs text-zinc-400">Verified</p>
                      <p className="text-lg font-medium text-zinc-300">
                        {stats.verifiedFiles.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <CrossCircledIcon className="w-4 h-4 text-zinc-500" />
                    <div>
                      <p className="text-xs text-zinc-400">Unverified</p>
                      <p className="text-lg font-medium text-zinc-300">
                        {stats.unverifiedFiles.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-zinc-900 rounded border border-zinc-800 p-4">
                <h2 className="text-sm font-medium text-zinc-300 mb-4">
                  Average Match Score
                </h2>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-medium text-zinc-300">
                    {stats.avgMatchScore
                      ? `${(stats.avgMatchScore * 100).toFixed(0)}%`
                      : "N/A"}
                  </p>
                  <p className="text-xs text-zinc-500">confidence</p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Recent Activity */}
        <div className="bg-zinc-900 rounded border border-zinc-800 p-4">
          <h2 className="text-sm font-medium text-zinc-300 mb-4">
            Recent Activity
          </h2>

          {activities.length === 0 ? (
            <p className="text-xs text-zinc-500 text-center py-8">
              No recent activity
            </p>
          ) : (
            <div className="space-y-2">
              {activities.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 p-2 rounded bg-zinc-800/50"
                >
                  <div className="p-1.5 rounded bg-zinc-800">
                    {activity.activityType === "scan" && (
                      <ReloadIcon className="w-3 h-3 text-blue-400" />
                    )}
                    {activity.activityType === "rename" && (
                      <FileIcon className="w-3 h-3 text-green-400" />
                    )}
                    {activity.activityType === "undo" && (
                      <ClockIcon className="w-3 h-3 text-orange-400" />
                    )}
                    {!["scan", "rename", "undo"].includes(activity.activityType) && (
                      <BarChartIcon className="w-3 h-3 text-zinc-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-zinc-300">{activity.description}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {activity.library && (
                        <span className="text-[10px] text-zinc-500">
                          {activity.library.label}
                        </span>
                      )}
                      <span className="text-[10px] text-zinc-600">
                        {formatDate(activity.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
