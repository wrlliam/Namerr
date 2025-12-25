/**
 * Seerr Settings Component
 * Extracted from page.tsx to be used in tabbed settings
 */

"use client";

import { useState, useEffect } from "react";
import {
  CheckCircledIcon,
  CrossCircledIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";
import { Input, Label, Button, Card, Badge, Spinner } from "@/src/components/ui";

interface SeerrSettings {
  apiUrl: string | null;
  apiKey: string | null;
  connectionStatus: "connected" | "disconnected" | "error" | null;
  lastTestedAt: string | null;
}

export default function SeerrSettings() {
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
      const response = await fetch("/api/seerr/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiUrl, apiKey }),
      });

      if (response.ok) {
        setSuccess("Settings saved successfully. Please test connection to enable metadata fetching.");
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
        {/* API URL */}
        <div>
          <Label htmlFor="seerr-url">Seerr API URL</Label>
          <Input
            id="seerr-url"
            type="url"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder="http://192.168.1.100:5055"
            required
            className="mt-1.5 bg-zinc-900 border-zinc-800 text-zinc-300 text-xs font-mono"
          />
          <p className="text-[10px] text-zinc-600 mt-1">
            The URL of your Seerr/Overseerr instance
          </p>
        </div>

        {/* API Key */}
        <div>
          <Label htmlFor="seerr-key">API Key</Label>
          <Input
            id="seerr-key"
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
                <Badge variant="success">Connected</Badge>
              </>
            ) : settings.connectionStatus === "error" ? (
              <>
                <CrossCircledIcon className="w-3.5 h-3.5 text-red-400" />
                <Badge variant="error">Connection Error</Badge>
              </>
            ) : (
              <>
                <div className="w-3.5 h-3.5 rounded-full bg-zinc-600" />
                <Badge variant="default">Not Connected</Badge>
              </>
            )}
            {settings.lastTestedAt && (
              <span className="text-zinc-600 ml-2">
                Last tested {new Date(settings.lastTestedAt).toLocaleString()}
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
            size="sm"
          >
            {isSaving ? "Saving..." : "Save Settings"}
          </Button>
          <Button
            type="button"
            onClick={handleTestConnection}
            disabled={isSaving || isTesting || !apiUrl || !apiKey}
            variant="outline"
            size="sm"
          >
            {isTesting ? "Testing..." : "Test Connection"}
          </Button>
        </div>
      </form>

      {/* Help Text */}
      <div className="mt-6 pt-6 border-t border-zinc-800">
        <h3 className="text-xs font-medium text-zinc-400 mb-2">
          About Seerr Integration
        </h3>
        <p className="text-[10px] text-zinc-500 mb-2">
          Seerr (Overseerr/Jellyseerr) integration enables:
        </p>
        <ul className="text-[10px] text-zinc-500 space-y-1 ml-4 list-disc">
          <li>Accurate metadata from TMDB via Seerr</li>
          <li>Poster images and descriptions</li>
          <li>Title and year verification for renaming</li>
        </ul>
      </div>
    </Card>
  );
}
