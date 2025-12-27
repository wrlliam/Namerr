"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeftIcon } from "@radix-ui/react-icons";
import { Container, Stack, Separator, Icon, Button } from "@/src/components/ui";

export default function MediaSettingsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [settings, setSettings] = useState({
    matchConfidenceThreshold: 0.8,
    preferredPosterLanguage: "en",
    preferredBackdropLanguage: "en",
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
          matchConfidenceThreshold: data.matchConfidenceThreshold ?? 0.8,
          preferredPosterLanguage: data.preferredPosterLanguage ?? "en",
          preferredBackdropLanguage: data.preferredBackdropLanguage ?? "en",
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
        alert(`Failed to save settings: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to save settings:", error);
      alert("An error occurred while saving settings");
    } finally {
      setIsSaving(false);
    }
  };

  const languageOptions = [
    { value: "en", label: "English" },
    { value: "es", label: "Spanish" },
    { value: "fr", label: "French" },
    { value: "de", label: "German" },
    { value: "it", label: "Italian" },
    { value: "pt", label: "Portuguese" },
    { value: "ja", label: "Japanese" },
    { value: "ko", label: "Korean" },
    { value: "zh", label: "Chinese" },
    { value: "ru", label: "Russian" },
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
            <h1 className="text-sm font-medium text-zinc-200">Media Settings</h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Configure metadata matching and language preferences
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
            {/* Match Confidence Threshold */}
            <div className="bg-zinc-900 rounded border border-zinc-800 p-6">
              <h2 className="text-sm font-medium text-zinc-200 mb-4">
                Match Confidence Threshold
              </h2>
              <p className="text-xs text-zinc-500 mb-4">
                Minimum similarity score (0-100%) for auto-accepting metadata
                matches. Higher values mean stricter matching.
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

            {/* Preferred Poster Language */}
            <div className="bg-zinc-900 rounded border border-zinc-800 p-6">
              <h2 className="text-sm font-medium text-zinc-200 mb-4">
                Preferred Poster Language
              </h2>
              <p className="text-xs text-zinc-500 mb-4">
                Language preference for downloading movie and TV show poster
                images from TMDB.
              </p>
              <select
                value={settings.preferredPosterLanguage}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    preferredPosterLanguage: e.target.value,
                  })
                }
                className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded text-zinc-300 focus:outline-none focus:ring-2 focus:ring-violet-600"
              >
                {languageOptions.map((lang) => (
                  <option key={lang.value} value={lang.value}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Preferred Backdrop Language */}
            <div className="bg-zinc-900 rounded border border-zinc-800 p-6">
              <h2 className="text-sm font-medium text-zinc-200 mb-4">
                Preferred Backdrop Language
              </h2>
              <p className="text-xs text-zinc-500 mb-4">
                Language preference for downloading backdrop/banner images from
                TMDB.
              </p>
              <select
                value={settings.preferredBackdropLanguage}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    preferredBackdropLanguage: e.target.value,
                  })
                }
                className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded text-zinc-300 focus:outline-none focus:ring-2 focus:ring-violet-600"
              >
                {languageOptions.map((lang) => (
                  <option key={lang.value} value={lang.value}>
                    {lang.label}
                  </option>
                ))}
              </select>
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
