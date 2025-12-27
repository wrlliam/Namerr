"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeftIcon, SunIcon, MoonIcon, DesktopIcon } from "@radix-ui/react-icons";
import { Container, Stack, Separator, Icon, Button } from "@/src/components/ui";

export default function AppearanceSettingsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [settings, setSettings] = useState({
    themePreference: "dark",
    accessibilityFontSize: "medium",
    accessibilityHighContrast: false,
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
          themePreference: data.themePreference ?? "dark",
          accessibilityFontSize: data.accessibilityFontSize ?? "medium",
          accessibilityHighContrast: data.accessibilityHighContrast ?? false,
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
        alert("Settings saved successfully! Refresh the page to see changes.");
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

  const themeOptions = [
    {
      value: "dark",
      label: "Dark",
      icon: MoonIcon,
      description: "Dark theme (current default)",
    },
    {
      value: "light",
      label: "Light",
      icon: SunIcon,
      description: "Light theme (coming soon)",
    },
    {
      value: "auto",
      label: "Auto",
      icon: DesktopIcon,
      description: "Match system preference (coming soon)",
    },
  ];

  const fontSizeOptions = [
    { value: "small", label: "Small", preview: "12px" },
    { value: "medium", label: "Medium", preview: "14px" },
    { value: "large", label: "Large", preview: "16px" },
    { value: "xlarge", label: "Extra Large", preview: "18px" },
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
            <h1 className="text-sm font-medium text-zinc-200">Appearance</h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Customize theme, font size, and accessibility options
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
            {/* Theme Preference */}
            <div className="bg-zinc-900 rounded border border-zinc-800 p-6">
              <h2 className="text-sm font-medium text-zinc-200 mb-4">
                Theme Preference
              </h2>
              <p className="text-xs text-zinc-500 mb-4">
                Choose your preferred color scheme. Light and auto themes are
                coming soon.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {themeOptions.map((theme) => (
                  <button
                    key={theme.value}
                    onClick={() =>
                      setSettings({ ...settings, themePreference: theme.value })
                    }
                    disabled={theme.value !== "dark"}
                    className={`p-4 rounded border transition-all ${
                      settings.themePreference === theme.value
                        ? "border-violet-600 bg-violet-600/10"
                        : "border-zinc-800 hover:border-zinc-700"
                    } ${
                      theme.value !== "dark"
                        ? "opacity-50 cursor-not-allowed"
                        : ""
                    }`}
                  >
                    <theme.icon className="w-5 h-5 mb-2 text-zinc-400" />
                    <div className="text-sm font-medium text-zinc-300">
                      {theme.label}
                    </div>
                    <div className="text-xs text-zinc-500 mt-1">
                      {theme.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Font Size */}
            <div className="bg-zinc-900 rounded border border-zinc-800 p-6">
              <h2 className="text-sm font-medium text-zinc-200 mb-4">
                Font Size
              </h2>
              <p className="text-xs text-zinc-500 mb-4">
                Adjust the base font size for better readability. Changes
                require a page refresh.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {fontSizeOptions.map((size) => (
                  <button
                    key={size.value}
                    onClick={() =>
                      setSettings({
                        ...settings,
                        accessibilityFontSize: size.value,
                      })
                    }
                    className={`p-4 rounded border transition-all ${
                      settings.accessibilityFontSize === size.value
                        ? "border-violet-600 bg-violet-600/10"
                        : "border-zinc-800 hover:border-zinc-700"
                    }`}
                  >
                    <div className="text-sm font-medium text-zinc-300 mb-1">
                      {size.label}
                    </div>
                    <div className="text-xs text-zinc-500">{size.preview}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* High Contrast */}
            <div className="bg-zinc-900 rounded border border-zinc-800 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-medium text-zinc-200 mb-1">
                    High Contrast Mode
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Increase contrast for better visibility. Changes require a
                    page refresh.
                  </p>
                </div>
                <button
                  onClick={() =>
                    setSettings({
                      ...settings,
                      accessibilityHighContrast:
                        !settings.accessibilityHighContrast,
                    })
                  }
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings.accessibilityHighContrast
                      ? "bg-violet-600"
                      : "bg-zinc-700"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.accessibilityHighContrast
                        ? "translate-x-6"
                        : "translate-x-1"
                    }`}
                  />
                </button>
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
