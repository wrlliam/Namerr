"use client";

import { useState } from "react";
import { FileTextIcon } from "@radix-ui/react-icons";

export function ParseTVButton({ libraryId }: { libraryId: string }) {
  const [loading, setLoading] = useState(false);

  const handleParse = async () => {
    if (loading) return;

    const confirmed = confirm(
      "This will parse show names from file paths for all files in this library. Continue?"
    );
    if (!confirmed) return;

    setLoading(true);

    try {
      const res = await fetch(`/api/libraries/${libraryId}/parse-tv`, {
        method: "POST",
      });

      if (res.ok) {
        const data = await res.json();
        alert(
          `Successfully parsed ${data.updatedFiles} of ${data.totalFiles} files. Refresh the page to see changes.`
        );
        window.location.reload();
      } else {
        const error = await res.json();
        alert(`Failed to parse: ${error.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Parse error:", error);
      alert("An error occurred while parsing files");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleParse}
      disabled={loading}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      title="Parse show names from file paths"
    >
      <FileTextIcon className="w-3 h-3" />
      {loading ? "Parsing..." : "Parse TV"}
    </button>
  );
}
