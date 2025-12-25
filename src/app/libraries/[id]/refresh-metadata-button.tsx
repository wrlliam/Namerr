/**
 * Refresh Metadata Button Component
 * Allows bulk refreshing of Seerr metadata for all files in a library
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MagicWandIcon, UpdateIcon } from "@radix-ui/react-icons";

interface RefreshMetadataButtonProps {
  libraryId: string;
  fileCount: number;
}

export function RefreshMetadataButton({
  libraryId,
  fileCount,
}: RefreshMetadataButtonProps) {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const handleRefresh = async () => {
    if (
      !confirm(
        `This will fetch metadata from Seerr for all ${fileCount} files in this library. Continue?`
      )
    ) {
      return;
    }

    setIsRefreshing(true);
    setResult(null);

    try {
      const response = await fetch("/api/media/refresh-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ libraryId }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setResult({
          success: true,
          message: `Refreshed ${data.updated} files. ${data.failed} failed.`,
        });
        router.refresh();
      } else {
        setResult({
          success: false,
          message: data.error || "Metadata refresh failed",
        });
      }
    } catch {
      setResult({
        success: false,
        message: "An error occurred during metadata refresh",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={handleRefresh}
        disabled={isRefreshing || fileCount === 0}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-900/20 hover:bg-blue-900/30 text-blue-400 text-xs rounded border border-blue-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isRefreshing ? (
          <>
            <UpdateIcon className="w-3 h-3 animate-spin" />
            Refreshing...
          </>
        ) : (
          <>
            <MagicWandIcon className="w-3 h-3" />
            Refresh Metadata
          </>
        )}
      </button>

      {result && (
        <div
          className={`text-[10px] px-2 py-1 rounded ${
            result.success
              ? "bg-green-900/20 text-green-400 border border-green-900/50"
              : "bg-red-900/20 text-red-400 border border-red-900/50"
          }`}
        >
          {result.message}
        </div>
      )}
    </div>
  );
}
