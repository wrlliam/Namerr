/**
 * Worker Settings Component
 * Extracted from page.tsx to be used in tabbed settings
 */

"use client";

import { useState, useEffect } from "react";
import { Input, Label, Button, Card, Spinner } from "@/src/components/ui";

interface WorkerConfig {
  parallelism: number;
  dryRunMode: boolean;
}

export default function WorkerSettings() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [parallelism, setParallelism] = useState(4);
  const [dryRunMode, setDryRunMode] = useState(true);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch("/api/worker/config");
      if (response.ok) {
        const data = await response.json();
        setParallelism(data.parallelism || 4);
        setDryRunMode(data.dryRunMode !== false); // Default to true
      }
    } catch {
      setError("Failed to load worker settings");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setIsSaving(true);

    try {
      const response = await fetch("/api/worker/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parallelism, dryRunMode }),
      });

      if (response.ok) {
        setSuccess("Worker settings saved successfully");
        fetchSettings();
      } else {
        const data = await response.json();
        setError(data.error || "Failed to save settings");
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <div className="flex items-center justify-center py-12">
          <Spinner size="md" />
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <form onSubmit={handleSave} className="space-y-6">
        {/* Parallelism */}
        <div>
          <Label htmlFor="parallelism">Worker Parallelism</Label>
          <Input
            id="parallelism"
            type="number"
            min={1}
            max={16}
            value={parallelism}
            onChange={(e) => setParallelism(parseInt(e.target.value, 10))}
            required
            className="mt-1.5 bg-zinc-900 border-zinc-800 text-zinc-300 text-xs"
          />
          <p className="text-[10px] text-zinc-600 mt-1">
            Number of files to process in parallel (1-16)
          </p>
        </div>

        {/* Dry Run Mode */}
        <div className="flex items-start gap-3">
          <input
            id="dry-run"
            type="checkbox"
            checked={dryRunMode}
            onChange={(e) => setDryRunMode(e.target.checked)}
            className="mt-1 w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-900"
          />
          <div className="flex-1">
            <Label htmlFor="dry-run" className="cursor-pointer">
              Dry Run Mode
            </Label>
            <p className="text-[10px] text-zinc-600 mt-1">
              When enabled, the worker will simulate renaming without actually moving files.
              Useful for testing before applying changes.
            </p>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="text-xs text-red-400 bg-red-900/20 border border-red-900/50 p-3 rounded">
            {error}
          </div>
        )}

        {/* Success Message */}
        {success && (
          <div className="text-xs text-green-400 bg-green-900/20 border border-green-900/50 p-3 rounded">
            {success}
          </div>
        )}

        {/* Save Button */}
        <Button
          type="submit"
          disabled={isSaving}
          size="sm"
        >
          {isSaving ? "Saving..." : "Save Settings"}
        </Button>
      </form>

      {/* Help Text */}
      <div className="mt-6 pt-6 border-t border-zinc-800">
        <h3 className="text-xs font-medium text-zinc-400 mb-2">
          Worker Configuration
        </h3>
        <p className="text-[10px] text-zinc-500 mb-2">
          The background worker processes media files for renaming. Configure how it operates:
        </p>
        <ul className="text-[10px] text-zinc-500 space-y-1 ml-4 list-disc">
          <li>Higher parallelism = faster processing but more resource usage</li>
          <li>Dry run mode shows what would be renamed without making changes</li>
          <li>Worker runs automatically every 4 hours</li>
        </ul>
      </div>
    </Card>
  );
}
