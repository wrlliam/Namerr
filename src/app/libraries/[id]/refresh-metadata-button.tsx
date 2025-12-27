/**
 * Refresh Metadata Button Component
 * Allows bulk refreshing of Seerr metadata for all files in a library
 */

"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { MagicWandIcon, UpdateIcon } from "@radix-ui/react-icons";
import { ProgressDialog } from "@/src/components/ui/ProgressDialog";
import { Button } from "@/src/components/ui/Button";

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
  const [showDialog, setShowDialog] = useState(false);
  const [progress, setProgress] = useState<{
    processed: number;
    total: number;
  } | null>(null);
  const [dialogStatus, setDialogStatus] = useState<
    "running" | "success" | "error" | "cancelled"
  >("running");
  const [successCount, setSuccessCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleRefresh = async (hardRefresh = false) => {
    const confirmMessage = hardRefresh
      ? `This is a HARD refresh that will clear cache, delete existing metadata files, and re-fetch from Seerr for all ${fileCount} files. Continue?`
      : `This will fetch metadata from Seerr for ${fileCount} files (skips files with existing metadata). Continue?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    // Reset state
    setIsRefreshing(true);
    setShowDialog(true);
    setDialogStatus("running");
    setResult(null);
    setProgress(null);
    setSuccessCount(0);
    setFailedCount(0);
    setErrorMessage(undefined);

    // Create abort controller for cancellation
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch("/api/media/refresh-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ libraryId, stream: true, hard: hardRefresh }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const data = await response.json();
        setDialogStatus("error");
        setErrorMessage(data.error || "Metadata refresh failed");
        setResult({
          success: false,
          message: data.error || "Metadata refresh failed",
        });
        setIsRefreshing(false);
        return;
      }

      // Check if streaming is supported
      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/x-ndjson")) {
        // Stream progress updates
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (reader) {
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();

            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.trim()) {
                try {
                  const update = JSON.parse(line);

                  if (update.type === "progress") {
                    setProgress({
                      processed: update.processed,
                      total: update.total,
                    });
                    setSuccessCount(update.updated);
                    setFailedCount(update.failed);
                  } else if (update.type === "complete") {
                    setDialogStatus("success");
                    setSuccessCount(update.updated);
                    setFailedCount(update.failed);
                    setResult({
                      success: true,
                      message: `Refreshed ${update.updated} files. ${update.failed} failed.`,
                    });
                    router.refresh();
                  } else if (update.type === "error") {
                    setDialogStatus("error");
                    setErrorMessage(update.error);
                  }
                } catch (e) {
                  console.error("Error parsing progress update:", e);
                }
              }
            }
          }
        }
      } else {
        // Fallback to non-streaming
        const data = await response.json();
        if (data.success) {
          setDialogStatus("success");
          setSuccessCount(data.updated);
          setFailedCount(data.failed);
          setResult({
            success: true,
            message: `Refreshed ${data.updated} files. ${data.failed} failed.`,
          });
          router.refresh();
        }
      }
    } catch (error) {
      // Check if it was cancelled
      if (error instanceof Error && error.name === "AbortError") {
        setDialogStatus("cancelled");
        setResult({
          success: false,
          message: "Metadata refresh was cancelled",
        });
      } else {
        console.error("Refresh error:", error);
        setDialogStatus("error");
        setErrorMessage("An error occurred during metadata refresh");
        setResult({
          success: false,
          message: "An error occurred during metadata refresh",
        });
      }
    } finally {
      setIsRefreshing(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setProgress(null);
    router.refresh(); // Refresh to show any partial updates
  };

  return (
    <>
      <Button
        onClick={() => handleRefresh(false)}
        disabled={isRefreshing || fileCount === 0}
        variant="outline"
        className="flex items-center gap-1.5 text-xs"
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
      </Button>

      <Button
        onClick={() => handleRefresh(true)}
        disabled={isRefreshing || fileCount === 0}
        variant="outline"
        className="flex items-center gap-1.5 text-xs border-orange-900/50 text-orange-400 hover:bg-orange-900/20"
      >
        {isRefreshing ? (
          <>
            <UpdateIcon className="w-3 h-3 animate-spin" />
            Refreshing...
          </>
        ) : (
          <>
            <UpdateIcon className="w-3 h-3" />
            Hard Refresh
          </>
        )}
      </Button>

      <ProgressDialog
        isOpen={showDialog}
        onClose={handleCloseDialog}
        onCancel={handleCancel}
        title="Refreshing Metadata"
        description="Fetching metadata from Seerr and downloading poster images for all files in this library."
        progress={
          progress
            ? { current: progress.processed, total: progress.total }
            : undefined
        }
        status={dialogStatus}
        successCount={successCount}
        failedCount={failedCount}
        errorMessage={errorMessage}
        canClose={true}
        canCancel={true}
      />
    </>
  );
}
