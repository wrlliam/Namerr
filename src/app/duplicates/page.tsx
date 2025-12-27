"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  ReloadIcon,
  TrashIcon,
  CopyIcon,
  CheckCircledIcon,
  Cross2Icon,
} from "@radix-ui/react-icons";

interface DuplicateFile {
  id: string;
  fileName: string;
  filePath: string;
  fileSize: number | null;
  libraryId: string;
  libraryName: string;
  seerrTitle: string | null;
  seerrYear: string | null;
}

interface DuplicateGroup {
  tmdbId: number;
  title: string;
  year: string;
  type: "movie" | "tv";
  files: DuplicateFile[];
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(unitIndex > 0 ? 1 : 0)} ${units[unitIndex]}`;
}

export default function DuplicatesPage() {
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [excluding, setExcluding] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | "movie" | "tv">("all");

  const fetchDuplicates = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/duplicates");
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch duplicates");
      }
      setDuplicates(data.duplicates || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDuplicates();
  }, []);

  const handleDeleteFile = async (fileId: string) => {
    if (!confirm("Are you sure you want to delete this file?")) return;

    setDeleting((prev) => new Set(prev).add(fileId));
    try {
      const response = await fetch("/api/duplicates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds: [fileId] }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to delete file");
      }
      // Refresh list
      await fetchDuplicates();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete file");
    } finally {
      setDeleting((prev) => {
        const next = new Set(prev);
        next.delete(fileId);
        return next;
      });
    }
  };

  const handleDeleteAllExceptFirst = async (group: DuplicateGroup) => {
    const filesToDelete = group.files.slice(1).map((f) => f.id);
    if (filesToDelete.length === 0) return;

    if (
      !confirm(
        `Delete ${filesToDelete.length} duplicate file(s) and keep "${group.files[0].fileName}"?`
      )
    )
      return;

    for (const id of filesToDelete) {
      setDeleting((prev) => new Set(prev).add(id));
    }

    try {
      const response = await fetch("/api/duplicates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds: filesToDelete }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to delete files");
      }
      await fetchDuplicates();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete files");
    } finally {
      setDeleting((prev) => {
        const next = new Set(prev);
        for (const id of filesToDelete) {
          next.delete(id);
        }
        return next;
      });
    }
  };

  const handleMarkNotDuplicates = async (group: DuplicateGroup) => {
    // Create exclusions between all pairs
    const pairs: [string, string][] = [];
    for (let i = 0; i < group.files.length; i++) {
      for (let j = i + 1; j < group.files.length; j++) {
        pairs.push([group.files[i].id, group.files[j].id]);
      }
    }

    const groupKey = `group-${group.tmdbId}`;
    setExcluding((prev) => new Set(prev).add(groupKey));

    try {
      for (const [fileId1, fileId2] of pairs) {
        await fetch("/api/duplicates/exclude", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId1, fileId2 }),
        });
      }
      await fetchDuplicates();
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "Failed to mark as non-duplicates"
      );
    } finally {
      setExcluding((prev) => {
        const next = new Set(prev);
        next.delete(groupKey);
        return next;
      });
    }
  };

  const handleDeleteAllDuplicates = async () => {
    const allFilesToDelete = duplicates.flatMap((g) =>
      g.files.slice(1).map((f) => f.id)
    );
    if (allFilesToDelete.length === 0) return;

    if (
      !confirm(
        `Delete ${allFilesToDelete.length} duplicate file(s) across all groups? This will keep the first file in each group.`
      )
    )
      return;

    for (const id of allFilesToDelete) {
      setDeleting((prev) => new Set(prev).add(id));
    }

    try {
      const response = await fetch("/api/duplicates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds: allFilesToDelete }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to delete files");
      }
      await fetchDuplicates();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete files");
    } finally {
      setDeleting(new Set());
    }
  };

  const filteredDuplicates = duplicates.filter((g) => {
    if (filter === "all") return true;
    return g.type === filter;
  });

  const totalDuplicateFiles = filteredDuplicates.reduce(
    (sum, g) => sum + g.files.length - 1,
    0
  );

  return (
    <div className="min-h-screen bg-black">
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="text-zinc-500 hover:text-zinc-400 transition-colors"
            >
              <ArrowLeftIcon className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="text-xl font-medium text-zinc-300 flex items-center gap-2">
                <CopyIcon className="w-5 h-5" />
                Duplicate Files
              </h1>
              <p className="text-xs text-zinc-500 mt-1">
                Files with the same TMDB ID across all libraries
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={fetchDuplicates}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 transition-colors disabled:opacity-50"
            >
              <ReloadIcon className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            {totalDuplicateFiles > 0 && (
              <button
                onClick={handleDeleteAllDuplicates}
                disabled={deleting.size > 0}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded bg-red-900/20 text-red-400 border border-red-900/50 hover:bg-red-900/30 transition-colors disabled:opacity-50"
              >
                <TrashIcon className="w-3 h-3" />
                Delete All Duplicates ({totalDuplicateFiles})
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1.5 text-xs rounded border transition-colors ${
              filter === "all"
                ? "bg-zinc-800 text-zinc-200 border-zinc-700"
                : "border-zinc-800 text-zinc-500 hover:text-zinc-400"
            }`}
          >
            All ({duplicates.length})
          </button>
          <button
            onClick={() => setFilter("movie")}
            className={`px-3 py-1.5 text-xs rounded border transition-colors ${
              filter === "movie"
                ? "bg-violet-900/30 text-violet-400 border-violet-900/50"
                : "border-zinc-800 text-zinc-500 hover:text-zinc-400"
            }`}
          >
            Movies ({duplicates.filter((g) => g.type === "movie").length})
          </button>
          <button
            onClick={() => setFilter("tv")}
            className={`px-3 py-1.5 text-xs rounded border transition-colors ${
              filter === "tv"
                ? "bg-emerald-900/30 text-emerald-400 border-emerald-900/50"
                : "border-zinc-800 text-zinc-500 hover:text-zinc-400"
            }`}
          >
            TV Shows ({duplicates.filter((g) => g.type === "tv").length})
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <ReloadIcon className="w-6 h-6 text-zinc-600 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="p-4 rounded-full bg-red-900/20 border border-red-900/50 mb-4">
              <Cross2Icon className="w-6 h-6 text-red-400" />
            </div>
            <h2 className="text-sm font-medium text-zinc-300 mb-1">
              Error loading duplicates
            </h2>
            <p className="text-xs text-zinc-500 max-w-sm">{error}</p>
          </div>
        ) : filteredDuplicates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="p-4 rounded-full bg-green-900/20 border border-green-900/50 mb-4">
              <CheckCircledIcon className="w-6 h-6 text-green-400" />
            </div>
            <h2 className="text-sm font-medium text-zinc-300 mb-1">
              No duplicates found
            </h2>
            <p className="text-xs text-zinc-500 max-w-sm">
              All your media files have unique TMDB IDs.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredDuplicates.map((group) => (
              <div
                key={group.tmdbId}
                className="bg-zinc-900 rounded border border-zinc-800 overflow-hidden"
              >
                {/* Group Header */}
                <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2 py-0.5 text-[10px] rounded ${
                        group.type === "movie"
                          ? "bg-violet-900/20 text-violet-400"
                          : "bg-emerald-900/20 text-emerald-400"
                      }`}
                    >
                      {group.type === "movie" ? "Movie" : "TV"}
                    </span>
                    <div>
                      <h3 className="text-sm font-medium text-zinc-200">
                        {group.title}{" "}
                        {group.year && (
                          <span className="text-zinc-500">({group.year})</span>
                        )}
                      </h3>
                      <p className="text-[10px] text-zinc-600 mt-0.5">
                        TMDB ID: {group.tmdbId} • {group.files.length} copies
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDeleteAllExceptFirst(group)}
                      disabled={
                        deleting.size > 0 || group.files.length < 2
                      }
                      className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-medium rounded bg-red-900/20 text-red-400 border border-red-900/50 hover:bg-red-900/30 transition-colors disabled:opacity-50"
                    >
                      <TrashIcon className="w-3 h-3" />
                      Keep First, Delete Rest
                    </button>
                    <button
                      onClick={() => handleMarkNotDuplicates(group)}
                      disabled={excluding.has(`group-${group.tmdbId}`)}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-medium rounded bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700 transition-colors disabled:opacity-50"
                    >
                      {excluding.has(`group-${group.tmdbId}`) ? (
                        <ReloadIcon className="w-3 h-3 animate-spin" />
                      ) : (
                        <Cross2Icon className="w-3 h-3" />
                      )}
                      Not Duplicates
                    </button>
                  </div>
                </div>

                {/* File List */}
                <div className="divide-y divide-zinc-800/50">
                  {group.files.map((file, index) => (
                    <div
                      key={file.id}
                      className={`flex items-center justify-between p-3 ${
                        index === 0 ? "bg-zinc-800/30" : ""
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {index === 0 && (
                            <span className="px-1.5 py-0.5 text-[9px] rounded bg-blue-900/20 text-blue-400 border border-blue-900/50">
                              KEEP
                            </span>
                          )}
                          <Link
                            href={`/media/${file.id}`}
                            className="text-xs text-zinc-300 hover:text-zinc-200 truncate transition-colors"
                          >
                            {file.fileName}
                          </Link>
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[10px] text-zinc-600">
                            {file.libraryName}
                          </span>
                          <span className="text-[10px] text-zinc-600">
                            {formatFileSize(file.fileSize)}
                          </span>
                          <span
                            className="text-[10px] text-zinc-700 truncate max-w-md"
                            title={file.filePath}
                          >
                            {file.filePath}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteFile(file.id)}
                        disabled={deleting.has(file.id)}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-zinc-800 text-zinc-500 hover:text-red-400 hover:bg-red-900/20 border border-zinc-700 hover:border-red-900/50 transition-colors disabled:opacity-50"
                      >
                        {deleting.has(file.id) ? (
                          <ReloadIcon className="w-3 h-3 animate-spin" />
                        ) : (
                          <TrashIcon className="w-3 h-3" />
                        )}
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
