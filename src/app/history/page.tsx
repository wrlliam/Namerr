"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  CounterClockwiseClockIcon,
  FileIcon,
  CheckIcon,
  Cross2Icon,
} from "@radix-ui/react-icons";

interface HistoryEntry {
  id: string;
  oldPath: string;
  newPath: string;
  oldFileName: string;
  newFileName: string;
  operationType: string;
  status: string;
  createdAt: string;
  undoneAt: string | null;
  mediaFile?: {
    id: string;
    fileName: string;
    seerrTitle?: string | null;
  } | null;
  library?: {
    id: string;
    label: string;
    path: string;
  } | null;
}

interface HistoryResponse {
  entries: HistoryEntry[];
  total: number;
}

export default function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const limit = 20;

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const offset = (page - 1) * limit;
      const res = await fetch(`/api/history?limit=${limit}&offset=${offset}`);
      if (res.ok) {
        const data: HistoryResponse = await res.json();
        setEntries(data.entries);
        setTotal(data.total);
      }
    } catch (error) {
      console.error("Failed to fetch history:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [page]);

  const handleUndo = async (entryId: string) => {
    setUndoingId(entryId);
    try {
      const res = await fetch(`/api/history/${entryId}/undo`, {
        method: "POST",
      });
      if (res.ok) {
        // Refresh the list
        fetchHistory();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to undo");
      }
    } catch (error) {
      console.error("Failed to undo:", error);
      alert("Failed to undo rename");
    } finally {
      setUndoingId(null);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="min-h-screen bg-black">
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/dashboard"
            className="p-2 rounded hover:bg-zinc-800 transition-colors"
          >
            <ArrowLeftIcon className="w-4 h-4 text-zinc-400" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-zinc-300">
              Rename History
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              {total} total operations
            </p>
          </div>
        </div>

        {/* History List */}
        {loading ? (
          <div className="text-center py-12">
            <p className="text-zinc-500">Loading history...</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="p-4 rounded-full bg-zinc-900 border border-zinc-800 mb-4">
              <CounterClockwiseClockIcon className="w-8 h-8 text-zinc-600" />
            </div>
            <h2 className="text-sm font-medium text-zinc-300 mb-1">
              No history yet
            </h2>
            <p className="text-xs text-zinc-500 max-w-sm">
              Rename operations will appear here after you process files.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className={`bg-zinc-900 rounded border p-4 ${
                  entry.status === "undone"
                    ? "border-zinc-800 opacity-60"
                    : "border-zinc-800"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <FileIcon className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                      <span className="text-xs text-zinc-500">
                        {entry.library?.label || "Unknown Library"}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded ${
                          entry.operationType === "organize"
                            ? "bg-violet-900/20 text-violet-400 border border-violet-900/50"
                            : entry.operationType === "move"
                              ? "bg-blue-900/20 text-blue-400 border border-blue-900/50"
                              : "bg-emerald-900/20 text-emerald-400 border border-emerald-900/50"
                        }`}
                      >
                        {entry.operationType}
                      </span>
                      {entry.status === "undone" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">
                          undone
                        </span>
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-500">From:</span>
                        <span className="text-xs text-zinc-400 truncate">
                          {entry.oldFileName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-500">To:</span>
                        <span className="text-xs text-zinc-300 truncate">
                          {entry.newFileName}
                        </span>
                      </div>
                    </div>

                    <p className="text-[10px] text-zinc-600 mt-2">
                      {formatDate(entry.createdAt)}
                    </p>
                  </div>

                  {entry.status === "active" && (
                    <button
                      onClick={() => handleUndo(entry.id)}
                      disabled={undoingId === entry.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors disabled:opacity-50"
                    >
                      <CounterClockwiseClockIcon className="w-3 h-3" />
                      {undoingId === entry.id ? "Undoing..." : "Undo"}
                    </button>
                  )}

                  {entry.status === "undone" && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-500">
                      <CheckIcon className="w-3 h-3" />
                      Undone
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-xs rounded border border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 disabled:opacity-50 transition-colors"
            >
              Previous
            </button>
            <span className="text-xs text-zinc-500">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 text-xs rounded border border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 disabled:opacity-50 transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
