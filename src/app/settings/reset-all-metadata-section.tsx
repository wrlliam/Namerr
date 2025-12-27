/**
 * Reset All Metadata Section Component
 * Dangerous action to reset metadata across ALL libraries
 * Should be displayed prominently with warnings
 */

"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { TrashIcon, UpdateIcon, ExclamationTriangleIcon } from "@radix-ui/react-icons";
import { ProgressDialog } from "@/src/components/ui/ProgressDialog";
import { Button } from "@/src/components/ui/Button";

export function ResetAllMetadataSection() {
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
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleReset = async () => {
    if (
      !confirm(
        "⚠️ DANGER: This will DELETE all .namerr-metadata files (including poster and backdrop images) from ALL files across ALL libraries and clear all Seerr metadata from the database.\n\nYou can regenerate this metadata later by running 'Refresh Metadata' on each library.\n\nThis action cannot be undone and will affect your entire system. Are you absolutely sure you want to continue?"
      )
    ) {
      return;
    }

    // Double confirmation for such a dangerous action
    if (
      !confirm(
        "This is your final warning. Type 'DELETE ALL METADATA' in the next prompt to confirm.\n\nClick OK to continue, or Cancel to abort."
      )
    ) {
      return;
    }

    const confirmation = prompt(
      "Type 'DELETE ALL METADATA' (without quotes) to confirm:"
    );
    if (confirmation !== "DELETE ALL METADATA") {
      alert("Confirmation text did not match. Operation cancelled.");
      return;
    }

    // Reset state
    setIsResetting(true);
    setShowDialog(true);
    setDialogStatus("running");
    setProgress(null);
    setSuccessCount(0);
    setFailedCount(0);
    setErrorMessage(undefined);

    // Create abort controller for cancellation
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch("/api/settings/reset-all-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stream: true }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const data = await response.json();
        setDialogStatus("error");
        setErrorMessage(data.error || "Global metadata reset failed");
        setIsResetting(false);
        return;
      }

      // Stream progress updates
      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/x-ndjson")) {
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
        // Fallback
        const data = await response.json();
        if (data.success) {
          setDialogStatus("success");
          setSuccessCount(data.deleted);
          setFailedCount(data.failed);
          router.refresh();
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setDialogStatus("cancelled");
      } else {
        console.error("Reset error:", error);
        setDialogStatus("error");
        setErrorMessage("An error occurred during global metadata reset");
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
    router.refresh();
  };

  return (
    <>
      <div className="bg-red-950/20 border border-red-900/50 rounded-lg p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-lg bg-red-500/10">
            <ExclamationTriangleIcon className="w-5 h-5 text-red-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-medium text-red-400 mb-2">
              Danger Zone
            </h3>
            <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
              Reset all metadata across all libraries. This will delete all
              .namerr-metadata files from disk and clear Seerr metadata from the
              database for every file in your system. This action cannot be undone.
            </p>
            <Button
              onClick={handleReset}
              disabled={isResetting}
              className="bg-red-900/30 hover:bg-red-900/50 border-red-900 text-red-300 text-xs"
            >
              {isResetting ? (
                <>
                  <UpdateIcon className="w-3 h-3 animate-spin mr-1.5" />
                  Resetting All Metadata...
                </>
              ) : (
                <>
                  <TrashIcon className="w-3 h-3 mr-1.5" />
                  Reset All Metadata
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      <ProgressDialog
        isOpen={showDialog}
        onClose={handleCloseDialog}
        onCancel={handleCancel}
        title="Resetting All Metadata"
        description="Deleting all .namerr-metadata files and clearing Seerr metadata across ALL libraries. This may take a while..."
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
