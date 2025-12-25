"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  CheckCircledIcon,
  CrossCircledIcon,
  ReloadIcon,
  ArrowLeftIcon,
} from "@radix-ui/react-icons";
import { Input, Label } from "@/src/components/ui/Input";
import { Button } from "@/src/components/ui/Button";

interface SeerrSettings {
  apiUrl: string | null;
  apiKey: string | null;
  connectionStatus: "connected" | "disconnected" | "error" | null;
  lastTestedAt: string | null;
}

export default function SeerrSettingsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [settings, setSettings] = useState<SeerrSettings>({
    apiUrl: null,
    apiKey: null,
    connectionStatus: null,
    lastTestedAt: null,
  });

  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch("/api/seerr/settings");
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
        setApiUrl(data.apiUrl || "");
        setApiKey(""); // Don't pre-fill API key for security
      }
    } catch {
      setError("Failed to load settings");
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
      // First, save the settings
      const saveResponse = await fetch("/api/seerr/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiUrl, apiKey }),
      });

      if (!saveResponse.ok) {
        const data = await saveResponse.json();
        setError(data.error || "Failed to save settings");
        setIsSaving(false);
        return;
      }

      // Then, automatically test the connection
      const testResponse = await fetch("/api/seerr/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiUrl, apiKey }),
      });

      const testData = await testResponse.json();

      if (testResponse.ok && testData.success) {
        setSuccess(`Settings saved and connection successful! Version: ${testData.version || "unknown"}`);
      } else {
        setError(`Settings saved but connection test failed: ${testData.error || "Unknown error"}`);
      }

      fetchSettings();
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setError("");
    setSuccess("");
    setIsTesting(true);

    try {
      const response = await fetch("/api/seerr/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiUrl, apiKey }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setSuccess(`Connection successful! Version: ${data.version || "unknown"}`);
        fetchSettings();
      } else {
        setError(data.error || "Connection test failed");
      }
    } catch {
      setError("An error occurred during connection test");
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <ReloadIcon className="w-6 h-6 text-zinc-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      <main className="mx-auto w-full max-w-2xl px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <Link
              href="/settings"
              className="text-zinc-500 hover:text-zinc-400 transition-colors"
            >
              <ArrowLeftIcon className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="text-xl font-medium text-zinc-300">Seerr Settings</h1>
              <p className="text-xs text-zinc-500 mt-0.5">
                Configure Seerr/Overseerr API for metadata fetching
              </p>
            </div>
          </div>
        </div>

        {/* Form Card */}
        <div className="bg-zinc-900 rounded border border-zinc-800 p-6">
          <form onSubmit={handleSave} className="space-y-6">
            {/* API URL */}
            <div>
              <Label className="text-xs text-zinc-400">Seerr API URL</Label>
              <Input
                type="url"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="http://192.168.1.100:5055"
                required
                className="mt-1.5 bg-zinc-900 border-zinc-800 text-zinc-300 text-xs font-mono"
              />
              <p className="text-[10px] text-zinc-600 mt-1">
                The URL of your Seerr/Overseerr instance (e.g., http://192.168.1.100:5055)
              </p>
            </div>

            {/* API Key */}
            <div>
              <Label className="text-xs text-zinc-400">API Key</Label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={settings.apiKey ? "Enter new API key to change" : "Enter your API key"}
                required={!settings.apiKey}
                className="mt-1.5 bg-zinc-900 border-zinc-800 text-zinc-300 text-xs font-mono"
              />
              <p className="text-[10px] text-zinc-600 mt-1">
                Found in Seerr under Settings → General → API Key
              </p>
            </div>

            {/* Connection Status */}
            {settings.connectionStatus && (
              <div className="flex items-center gap-2 text-xs">
                {settings.connectionStatus === "connected" ? (
                  <>
                    <CheckCircledIcon className="w-3.5 h-3.5 text-green-400" />
                    <span className="text-green-400">Connected</span>
                  </>
                ) : settings.connectionStatus === "error" ? (
                  <>
                    <CrossCircledIcon className="w-3.5 h-3.5 text-red-400" />
                    <span className="text-red-400">Connection Error</span>
                  </>
                ) : (
                  <>
                    <div className="w-3.5 h-3.5 rounded-full bg-zinc-600" />
                    <span className="text-zinc-500">Not Connected</span>
                  </>
                )}
                {settings.lastTestedAt && (
                  <span className="text-zinc-600">
                    • Last tested {new Date(settings.lastTestedAt).toLocaleString()}
                  </span>
                )}
              </div>
            )}

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

            {/* Buttons */}
            <div className="flex gap-3">
              <Button
                type="submit"
                disabled={isSaving || isTesting}
                className="flex-1 h-9 bg-zinc-800 text-zinc-200 text-xs hover:bg-zinc-700 disabled:opacity-50"
              >
                {isSaving ? "Saving & Testing..." : "Save & Test Connection"}
              </Button>
              <Button
                type="button"
                onClick={handleTestConnection}
                disabled={isSaving || isTesting || !apiUrl || !apiKey}
                variant="outline"
                className="h-9 text-xs"
              >
                {isTesting ? "Testing..." : "Test Only"}
              </Button>
            </div>
          </form>
        </div>

        {/* Help Text */}
        <div className="mt-6 p-4 bg-zinc-900/50 rounded border border-zinc-800">
          <h3 className="text-xs font-medium text-zinc-400 mb-2">
            About Seerr Integration
          </h3>
          <p className="text-[10px] text-zinc-500 mb-2">
            Seerr (Overseerr/Jellyseerr) is a request management and media discovery tool.
            When configured, Namerr will:
          </p>
          <ul className="text-[10px] text-zinc-500 space-y-1 ml-4 list-disc">
            <li>Fetch accurate metadata from TMDB via Seerr</li>
            <li>Match your media files against Seerr requests</li>
            <li>Provide poster images and descriptions</li>
            <li>Verify titles and years for correct renaming</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
