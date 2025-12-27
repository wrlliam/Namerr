/**
 * Progress Dialog Component
 * Modal-style dialog for showing progress of long-running operations
 */

"use client";

import React from "react";
import { cn } from "@/src/lib/utils";
import { Cross2Icon, CheckCircledIcon, CrossCircledIcon, StopIcon } from "@radix-ui/react-icons";

export interface ProgressDialogProps {
  isOpen: boolean;
  onClose?: () => void;
  onCancel?: () => void;
  title: string;
  description?: string;
  progress?: {
    current: number;
    total: number;
    label?: string;
  };
  status?: "running" | "success" | "error" | "cancelled";
  successCount?: number;
  failedCount?: number;
  errorMessage?: string;
  canClose?: boolean;
  canCancel?: boolean;
}

export function ProgressDialog({
  isOpen,
  onClose,
  onCancel,
  title,
  description,
  progress,
  status = "running",
  successCount,
  failedCount,
  errorMessage,
  canClose = true,
  canCancel = true,
}: ProgressDialogProps) {
  if (!isOpen) return null;

  const percentage = progress
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  const isFinished = status !== "running";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop - more opaque with subtle blur */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-[2px]"
        onClick={canClose && isFinished ? onClose : undefined}
      />

      {/* Dialog */}
      <div className="relative w-full max-w-md mx-4 bg-zinc-900 rounded-lg border border-zinc-800 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            {status === "running" && (
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            )}
            {status === "success" && (
              <CheckCircledIcon className="w-4 h-4 text-green-500" />
            )}
            {status === "error" && (
              <CrossCircledIcon className="w-4 h-4 text-red-500" />
            )}
            {status === "cancelled" && (
              <StopIcon className="w-4 h-4 text-yellow-500" />
            )}
            <h2 className="text-sm font-medium text-zinc-200">{title}</h2>
          </div>
          {/* Close button - always visible when finished or when canClose is true */}
          {(isFinished && canClose) && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-zinc-800 rounded transition-colors"
            >
              <Cross2Icon className="w-4 h-4 text-zinc-400" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {description && (
            <p className="text-xs text-zinc-400">{description}</p>
          )}

          {/* Progress bar */}
          {progress && status === "running" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400">
                  {progress.label ||
                    `Processing ${progress.current} of ${progress.total}`}
                </span>
                <span className="text-xs font-medium text-zinc-300">
                  {percentage}%
                </span>
              </div>
              <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-300 ease-out"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          )}

          {/* Results summary */}
          {status !== "running" && (successCount !== undefined || failedCount !== undefined) && (
            <div className="flex items-center gap-4 py-2">
              {successCount !== undefined && (
                <div className="flex items-center gap-1.5">
                  <CheckCircledIcon className="w-4 h-4 text-green-500" />
                  <span className="text-sm text-zinc-300">
                    {successCount} {successCount === 1 ? "success" : "successes"}
                  </span>
                </div>
              )}
              {failedCount !== undefined && failedCount > 0 && (
                <div className="flex items-center gap-1.5">
                  <CrossCircledIcon className="w-4 h-4 text-red-500" />
                  <span className="text-sm text-zinc-300">
                    {failedCount} failed
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Error message */}
          {errorMessage && (
            <div className="p-3 bg-red-900/20 border border-red-900/50 rounded text-xs text-red-400">
              {errorMessage}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-zinc-800">
          {/* Cancel button - shown while running */}
          {status === "running" && canCancel && onCancel && (
            <button
              onClick={onCancel}
              className="px-4 py-2 text-xs font-medium rounded transition-colors bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
            >
              Cancel
            </button>
          )}

          {/* Close/Done button - shown when finished */}
          {isFinished && canClose && (
            <button
              onClick={onClose}
              className={cn(
                "px-4 py-2 text-xs font-medium rounded transition-colors",
                status === "success"
                  ? "bg-green-600 hover:bg-green-700 text-white"
                  : status === "error"
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : status === "cancelled"
                  ? "bg-yellow-600 hover:bg-yellow-700 text-white"
                  : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
              )}
            >
              {status === "success" ? "Done" : status === "error" ? "Close" : status === "cancelled" ? "Dismissed" : "OK"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
