"use client";

import { useState } from "react";
import { GearIcon } from "@radix-ui/react-icons";

export function LibrarySettingsButton({ libraryId }: { libraryId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [settings, setSettings] = useState({
    autoMetadataOnScan: true,
    matchConfidenceThreshold: 0.8,
  });

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/libraries/${libraryId}/settings`);
      if (response.ok) {
        const data = await response.json();
        setSettings({
          autoMetadataOnScan: data.autoMetadataOnScan ?? true,
          matchConfidenceThreshold: data.matchConfidenceThreshold
            ? parseFloat(data.matchConfidenceThreshold)
            : 0.8,
        });
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/libraries/${libraryId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (response.ok) {
        setIsOpen(false);
      } else {
        const error = await response.json();
        alert(`Failed to save settings: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to save settings:", error);
      alert("An error occurred while saving settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpen = () => {
    loadSettings();
    setIsOpen(true);
  };

  if (!isOpen) {
    return (
      <button
        onClick={handleOpen}
        className="flex items-center gap-1.5 h-8 px-3 text-xs rounded border border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
        title="Library settings"
      >
        <GearIcon className="w-3 h-3" />
        Settings
      </button>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={() => setIsOpen(false)}
      />

      {/* Dialog */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-zinc-900 rounded border border-zinc-800 shadow-xl z-50">
        <div className="p-6 space-y-4">
          <h2 className="text-lg font-medium text-zinc-200">Library Settings</h2>

          {isLoading ? (
            <div className="py-8 text-center text-zinc-500 text-sm">
              Loading settings...
            </div>
          ) : (
            <div className="space-y-4">
              {/* Auto-metadata toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm text-zinc-300 font-medium">
                    Auto-fetch metadata on scan
                  </label>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Automatically fetch TMDB metadata for new files during scan
                  </p>
                </div>
                <button
                  onClick={() =>
                    setSettings({
                      ...settings,
                      autoMetadataOnScan: !settings.autoMetadataOnScan,
                    })
                  }
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings.autoMetadataOnScan ? "bg-violet-600" : "bg-zinc-700"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.autoMetadataOnScan
                        ? "translate-x-6"
                        : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              {/* Match threshold slider */}
              <div>
                <label className="text-sm text-zinc-300 font-medium">
                  Match confidence threshold
                </label>
                <p className="text-xs text-zinc-500 mt-0.5 mb-2">
                  Minimum similarity score (0-100%) for auto-accepting metadata
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={settings.matchConfidenceThreshold}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        matchConfidenceThreshold: parseFloat(e.target.value),
                      })
                    }
                    className="flex-1 h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-violet-600"
                  />
                  <span className="text-sm text-zinc-300 font-medium w-12 text-right">
                    {Math.round(settings.matchConfidenceThreshold * 100)}%
                  </span>
                </div>
                <div className="flex justify-between text-xs text-zinc-600 mt-1">
                  <span>0%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={saveSettings}
              disabled={isSaving || isLoading}
              className="flex-1 px-4 py-2 text-sm rounded bg-violet-600 text-white hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
            <button
              onClick={() => setIsOpen(false)}
              disabled={isSaving}
              className="px-4 py-2 text-sm rounded border border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
