"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "@radix-ui/react-icons";
import { Container, Stack, Separator, Icon, Button } from "@/src/components/ui";

export default function AdvancedSettingsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [settings, setSettings] = useState({
    autoDuplicateDetection: true,
    scanScheduleEnabled: false,
    scanScheduleCron: "0 2 * * *",
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/settings/system");
      if (response.ok) {
        const data = await response.json();
        setSettings({
          autoDuplicateDetection: data.autoDuplicateDetection ?? true,
          scanScheduleEnabled: data.scanScheduleEnabled ?? false,
          scanScheduleCron: data.scanScheduleCron ?? "0 2 * * *",
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
      const response = await fetch("/api/settings/system", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (response.ok) {
        alert("Settings saved successfully!");
      } else {
        const error = await response.json();
        alert(
          `Failed to save settings: ${error.details?.join(", ") || error.error || "Unknown error"}`
        );
      }
    } catch (error) {
      console.error("Failed to save settings:", error);
      alert("An error occurred while saving settings");
    } finally {
      setIsSaving(false);
    }
  };

  // Parse cron expression to human-readable text
  const parseCronToText = (cron: string): string => {
    try {
      const parts = cron.split(" ");
      if (parts.length !== 5) return cron;

      const [minute, hour, day, month, weekday] = parts;

      // Simple interpretations
      if (cron === "0 2 * * *") return "Daily at 2:00 AM";
      if (cron === "0 0 * * 0") return "Weekly on Sunday at midnight";
      if (cron === "0 0 1 * *") return "Monthly on the 1st at midnight";

      return `At ${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
    } catch {
      return cron;
    }
  };

  const cronPresets = [
    { label: "Daily at 2 AM", value: "0 2 * * *" },
    { label: "Daily at midnight", value: "0 0 * * *" },
    { label: "Every 6 hours", value: "0 */6 * * *" },
    { label: "Weekly (Sunday 2 AM)", value: "0 2 * * 0" },
    { label: "Custom", value: "" },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-300 p-6">
      <Container size="lg">
        {/* Header */}
        <Stack direction="row" align="center" spacing="sm" className="mb-6">
          <Link href="/settings">
            <Button variant="ghost" size="sm">
              <Icon icon={ArrowLeftIcon} />
            </Button>
          </Link>
          <div>
            <h1 className="text-sm font-medium text-zinc-200">
              Advanced Settings
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Configure automation and system-level features
            </p>
          </div>
        </Stack>

        <Separator className="mb-6" />

        {isLoading ? (
          <div className="py-12 text-center text-zinc-500 text-sm">
            Loading settings...
          </div>
        ) : (
          <div className="space-y-6">
            {/* Auto Duplicate Detection */}
            <div className="bg-zinc-900 rounded border border-zinc-800 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-medium text-zinc-200 mb-1">
                    Automatic Duplicate Detection
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Automatically flag potential duplicate files based on TMDB
                    ID when scanning libraries.
                  </p>
                </div>
                <button
                  onClick={() =>
                    setSettings({
                      ...settings,
                      autoDuplicateDetection: !settings.autoDuplicateDetection,
                    })
                  }
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings.autoDuplicateDetection
                      ? "bg-violet-600"
                      : "bg-zinc-700"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.autoDuplicateDetection
                        ? "translate-x-6"
                        : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Scan Schedule */}
            <div className="bg-zinc-900 rounded border border-zinc-800 p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-medium text-zinc-200 mb-1">
                      Automatic Scan Schedule
                    </h2>
                    <p className="text-xs text-zinc-500">
                      Automatically scan all libraries on a schedule. Feature
                      coming soon.
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      setSettings({
                        ...settings,
                        scanScheduleEnabled: !settings.scanScheduleEnabled,
                      })
                    }
                    disabled
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors opacity-50 cursor-not-allowed ${
                      settings.scanScheduleEnabled
                        ? "bg-violet-600"
                        : "bg-zinc-700"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        settings.scanScheduleEnabled
                          ? "translate-x-6"
                          : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                {settings.scanScheduleEnabled && (
                  <div className="space-y-3 pt-3 border-t border-zinc-800">
                    {/* Preset selector */}
                    <div>
                      <label className="text-xs text-zinc-400 mb-2 block">
                        Schedule Preset
                      </label>
                      <select
                        value={
                          cronPresets.find(
                            (p) => p.value === settings.scanScheduleCron
                          )?.value || ""
                        }
                        onChange={(e) => {
                          if (e.target.value) {
                            setSettings({
                              ...settings,
                              scanScheduleCron: e.target.value,
                            });
                          }
                        }}
                        className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded text-zinc-300 focus:outline-none focus:ring-2 focus:ring-violet-600"
                      >
                        {cronPresets.map((preset) => (
                          <option key={preset.label} value={preset.value}>
                            {preset.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Custom cron input */}
                    <div>
                      <label className="text-xs text-zinc-400 mb-2 block">
                        Cron Expression (5 fields: minute hour day month
                        weekday)
                      </label>
                      <input
                        type="text"
                        value={settings.scanScheduleCron}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            scanScheduleCron: e.target.value,
                          })
                        }
                        placeholder="0 2 * * *"
                        className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded text-zinc-300 focus:outline-none focus:ring-2 focus:ring-violet-600"
                      />
                      <p className="text-xs text-zinc-500 mt-1">
                        Current: {parseCronToText(settings.scanScheduleCron)}
                      </p>
                    </div>

                    {/* Next run preview */}
                    <div className="bg-zinc-800 rounded p-3">
                      <div className="text-xs text-zinc-400">
                        <strong className="text-zinc-300">Note:</strong>{" "}
                        Automatic scanning will trigger for all enabled
                        libraries at the scheduled time. Make sure your server
                        has sufficient resources.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Save Button */}
            <div className="flex gap-2">
              <button
                onClick={saveSettings}
                disabled={isSaving}
                className="px-4 py-2 text-sm rounded bg-violet-600 text-white hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
              <Link href="/settings">
                <button className="px-4 py-2 text-sm rounded border border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300 transition-colors">
                  Cancel
                </button>
              </Link>
            </div>
          </div>
        )}
      </Container>
    </div>
  );
}
