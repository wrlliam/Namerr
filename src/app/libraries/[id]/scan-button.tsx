"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { ReloadIcon, UpdateIcon } from "@radix-ui/react-icons";
import { ProgressDialog } from "@/src/components/ui/ProgressDialog";

interface ScanButtonProps {
  libraryId: string;
  scanStatus: string | null;
}

export function ScanButton({ libraryId, scanStatus }: ScanButtonProps) {
  const router = useRouter();
  const [isScanning, setIsScanning] = useState(scanStatus === "scanning");
  const [showDialog, setShowDialog] = useState(false);
  const [dialogStatus, setDialogStatus] = useState<"running" | "success" | "error" | "cancelled">("running");
  const [scanResult, setScanResult] = useState<{
    newFiles?: number;
    existingFiles?: number;
    totalScanned?: number;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleScan = async () => {
    setIsScanning(true);
    setShowDialog(true);
    setDialogStatus("running");
    setResult(null);
    setScanResult(null);
    setErrorMessage(undefined);

    // Create abort controller for cancellation
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(`/api/libraries/${libraryId}/scan`, {
        method: "POST",
        signal: abortControllerRef.current.signal,
      });

      const data = await response.json();

      if (response.ok) {
        setDialogStatus("success");
        setScanResult({
          newFiles: data.stats.newFiles,
          existingFiles: data.stats.existingFiles,
          totalScanned: data.stats.totalScanned,
        });
        setResult({
          success: true,
          message: `Scanned ${data.stats.totalScanned} files. ${data.stats.newFiles} new, ${data.stats.existingFiles} existing.`,
        });
        router.refresh();
      } else {
        setDialogStatus("error");
        setErrorMessage(data.error || "Scan failed");
        setResult({
          success: false,
          message: data.error || "Scan failed",
        });
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setDialogStatus("cancelled");
        setResult({
          success: false,
          message: "Scan was cancelled",
        });
      } else {
        setDialogStatus("error");
        setErrorMessage("An error occurred during scan");
        setResult({
          success: false,
          message: "An error occurred during scan",
        });
      }
    } finally {
      setIsScanning(false);
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
    router.refresh();
  };

  return (
    <>
      <div className="flex flex-col items-end gap-2">
        <button
          onClick={handleScan}
          disabled={isScanning}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded border border-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isScanning ? (
            <>
              <UpdateIcon className="w-3 h-3 animate-spin" />
              Scanning...
            </>
          ) : (
            <>
              <ReloadIcon className="w-3 h-3" />
              Scan Library
            </>
          )}
        </button>

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
      </div>

      <ProgressDialog
        isOpen={showDialog}
        onClose={handleCloseDialog}
        onCancel={handleCancel}
        title="Scanning Library"
        description="Searching for media files in the library folder and checking for metadata files."
        status={dialogStatus}
        successCount={scanResult?.newFiles}
        failedCount={undefined}
        errorMessage={errorMessage}
        canClose={true}
        canCancel={true}
      />
    </>
  );
}
