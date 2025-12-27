/**
 * Reset Metadata Button Component
 * Allows resetting/clearing all Seerr metadata for files in a library
 * Deletes .namerr-metadata files and clears database seerr fields
 */

"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { TrashIcon, UpdateIcon } from "@radix-ui/react-icons";
import { ProgressDialog } from "@/src/components/ui/ProgressDialog";
import { Button } from "@/src/components/ui/Button";

interface ResetMetadataButtonProps {
  libraryId: string;
  fileCount: number;
}

export function ResetMetadataButton({
  libraryId,
  fileCount,
}: ResetMetadataButtonProps) {
  const router = useRouter();
  const [isResetting, setIsResetting] = useState(false);
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

  const handleReset = async () => {
    if (
      !confirm(
        `This will DELETE all .namerr-metadata files (including poster and backdrop images) from ${fileCount} files on disk and clear Seerr metadata from the database.\n\nYou can regenerate this metadata later by running "Refresh Metadata".\n\nThis action cannot be undone. Continue?`
      )
    ) {
      return;
    }

    // Reset state
    setIsResetting(true);
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
      const response = await fetch(`/api/libraries/${libraryId}/reset-metadata`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stream: true }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const data = await response.json();
        setDialogStatus("error");
        setErrorMessage(data.error || "Metadata reset failed");
        setResult({
          success: false,
          message: data.error || "Metadata reset failed",
        });
        setIsResetting(false);
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
                    setSuccessCount(update.deleted);
                    setFailedCount(update.failed);
                  } else if (update.type === "complete") {
                    setDialogStatus("success");
                    setSuccessCount(update.deleted);
                    setFailedCount(update.failed);
                    setResult({
                      success: true,
                      message: `Reset ${update.deleted} files. ${update.failed} failed.`,
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
          setSuccessCount(data.deleted);
          setFailedCount(data.failed);
          setResult({
            success: true,
            message: `Reset ${data.deleted} files. ${data.failed} failed.`,
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
          message: "Metadata reset was cancelled",
        });
      } else {
        console.error("Reset error:", error);
        setDialogStatus("error");
        setErrorMessage("An error occurred during metadata reset");
        setResult({
          success: false,
          message: "An error occurred during metadata reset",
        });
      }
    } finally {
      setIsResetting(false);
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
        onClick={handleReset}
        disabled={isResetting || fileCount === 0}
        variant="outline"
        className="flex items-center gap-1.5 text-xs border-amber-900/50 text-amber-400 hover:bg-amber-900/20"
      >
        {isResetting ? (
          <>
            <UpdateIcon className="w-3 h-3 animate-spin" />
            Resetting...
          </>
        ) : (
          <>
            <TrashIcon className="w-3 h-3" />
            Reset Metadata
          </>
        )}
      </Button>

      {result && !showDialog && (
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

      <ProgressDialog
        isOpen={showDialog}
        onClose={handleCloseDialog}
        onCancel={handleCancel}
        title="Resetting Metadata"
        description="Deleting .namerr-metadata files from disk and clearing Seerr metadata from database for all files in this library."
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
