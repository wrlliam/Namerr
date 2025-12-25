"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ReloadIcon, UpdateIcon } from "@radix-ui/react-icons";

interface ScanButtonProps {
  libraryId: string;
  scanStatus: string | null;
}

export function ScanButton({ libraryId, scanStatus }: ScanButtonProps) {
  const router = useRouter();
  const [isScanning, setIsScanning] = useState(scanStatus === "scanning");
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const handleScan = async () => {
    setIsScanning(true);
    setResult(null);

    try {
      const response = await fetch(`/api/libraries/${libraryId}/scan`, {
        method: "POST",
      });

      const data = await response.json();

      if (response.ok) {
        setResult({
          success: true,
          message: `Scanned ${data.stats.totalScanned} files. ${data.stats.newFiles} new, ${data.stats.existingFiles} existing.`,
        });
        router.refresh();
      } else {
        setResult({
          success: false,
          message: data.error || "Scan failed",
        });
      }
    } catch {
      setResult({
        success: false,
        message: "An error occurred during scan",
      });
    } finally {
      setIsScanning(false);
    }
  };

  return (
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
