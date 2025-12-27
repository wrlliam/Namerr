"use client";

import { useState, useEffect } from "react";
import { EyeOpenIcon, EyeClosedIcon } from "@radix-ui/react-icons";

interface WatchToggleProps {
  libraryId: string;
}

export function WatchToggle({ libraryId }: WatchToggleProps) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/libraries/${libraryId}/watch`);
        if (res.ok) {
          const data = await res.json();
          setEnabled(data.enabled);
        }
      } catch (error) {
        console.error("Failed to fetch watch status:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, [libraryId]);

  const handleToggle = async () => {
    setUpdating(true);
    try {
      const res = await fetch(`/api/libraries/${libraryId}/watch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });

      if (res.ok) {
        const data = await res.json();
        setEnabled(data.enabled);
      }
    } catch (error) {
      console.error("Failed to toggle watch:", error);
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <button
        disabled
        className="flex items-center gap-1.5 h-8 rounded border border-zinc-800 bg-zinc-900 text-xs text-zinc-500 px-3"
      >
        <EyeClosedIcon className="w-3 h-3" />
        Watch
      </button>
    );
  }

  return (
    <button
      onClick={handleToggle}
      disabled={updating}
      className={`flex items-center gap-1.5 h-8 rounded border text-xs px-3 transition-colors ${
        enabled
          ? "border-emerald-900/50 bg-emerald-900/20 text-emerald-400 hover:bg-emerald-900/30"
          : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700"
      } disabled:opacity-50`}
      title={enabled ? "Auto-watch enabled" : "Auto-watch disabled"}
    >
      {enabled ? (
        <EyeOpenIcon className="w-3 h-3" />
      ) : (
        <EyeClosedIcon className="w-3 h-3" />
      )}
      {updating ? "..." : enabled ? "Watching" : "Watch"}
    </button>
  );
}
