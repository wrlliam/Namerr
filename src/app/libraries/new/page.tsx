"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon, VideoIcon, DesktopIcon } from "@radix-ui/react-icons";
import { Input, Label } from "@/src/components/ui/Input";
import { Button } from "@/src/components/ui/Button";

export default function NewLibraryPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [label, setLabel] = useState("");
  const [type, setType] = useState<"movie" | "tv">("movie");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/libraries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, path, label, type }),
      });

      if (response.ok) {
        router.push("/dashboard");
        router.refresh();
      } else {
        const data = await response.json();
        setError(data.error || "Failed to create library");
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black">
      <main className="mx-auto w-full max-w-2xl px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/dashboard"
            className="text-zinc-500 hover:text-zinc-400 transition-colors"
          >
            <ArrowLeftIcon className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-medium text-zinc-300">Add Library</h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Add a new media library to scan and organize
            </p>
          </div>
        </div>

        {/* Form Card */}
        <div className="bg-zinc-900 rounded border border-zinc-800 p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Library Name */}
            <div>
              <Label className="text-xs text-zinc-400">Library Name</Label>
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Main Movies, Kids TV"
                required
                className="mt-1.5 bg-zinc-900 border-zinc-800 text-zinc-300 text-xs"
              />
              <p className="text-[10px] text-zinc-600 mt-1">
                A friendly name to identify this library
              </p>
            </div>

            {/* Path */}
            <div>
              <Label className="text-xs text-zinc-400">Directory Path</Label>
              <Input
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/media/movies or /mnt/media/tv"
                required
                className="mt-1.5 bg-zinc-900 border-zinc-800 text-zinc-300 text-xs font-mono"
              />
              <p className="text-[10px] text-zinc-600 mt-1">
                The absolute path to the media directory (must be mounted in
                Docker)
              </p>
            </div>

            {/* Label */}
            <div>
              <Label className="text-xs text-zinc-400">Display Label</Label>
              <Input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g., Movies, TV Shows, Anime"
                required
                className="mt-1.5 bg-zinc-900 border-zinc-800 text-zinc-300 text-xs"
              />
              <p className="text-[10px] text-zinc-600 mt-1">
                The label shown in the tab navigation
              </p>
            </div>

            {/* Type Selection */}
            <div>
              <Label className="text-xs text-zinc-400 mb-2 block">
                Media Type
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setType("movie")}
                  className={`p-4 rounded border transition-colors ${
                    type === "movie"
                      ? "border-violet-500 bg-violet-900/20"
                      : "border-zinc-800 hover:border-zinc-700"
                  }`}
                >
                  <VideoIcon
                    className={`w-5 h-5 mb-2 ${
                      type === "movie" ? "text-violet-400" : "text-zinc-500"
                    }`}
                  />
                  <div
                    className={`text-sm font-medium ${
                      type === "movie" ? "text-violet-300" : "text-zinc-400"
                    }`}
                  >
                    Movies
                  </div>
                  <p className="text-[10px] text-zinc-600 mt-1">
                    "Title (Year).ext" format
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setType("tv")}
                  className={`p-4 rounded border transition-colors ${
                    type === "tv"
                      ? "border-emerald-500 bg-emerald-900/20"
                      : "border-zinc-800 hover:border-zinc-700"
                  }`}
                >
                  <DesktopIcon
                    className={`w-5 h-5 mb-2 ${
                      type === "tv" ? "text-emerald-400" : "text-zinc-500"
                    }`}
                  />
                  <div
                    className={`text-sm font-medium ${
                      type === "tv" ? "text-emerald-300" : "text-zinc-400"
                    }`}
                  >
                    TV Shows
                  </div>
                  <p className="text-[10px] text-zinc-600 mt-1">
                    "Title S##E##.ext" format
                  </p>
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="text-xs text-red-400 bg-red-900/20 border border-red-900/50 p-3 rounded">
                {error}
              </div>
            )}

            {/* Submit Button */}
            <div className="flex gap-3">
              <Button
                type="submit"
                disabled={isLoading}
                className="flex-1 h-9 bg-zinc-800 text-zinc-200 text-xs hover:bg-zinc-700 disabled:opacity-50"
              >
                {isLoading ? "Creating..." : "Create Library"}
              </Button>
              <Link href="/dashboard">
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 text-xs"
                >
                  Cancel
                </Button>
              </Link>
            </div>
          </form>
        </div>

        {/* Help Text */}
        <div className="mt-6 p-4 bg-zinc-900/50 rounded border border-zinc-800">
          <h3 className="text-xs font-medium text-zinc-400 mb-2">
            Docker Volume Mounts
          </h3>
          <p className="text-[10px] text-zinc-500 mb-2">
            Make sure your media directories are mounted in the Docker
            container. In docker-compose.yml:
          </p>
          <pre className="text-[10px] text-zinc-500 bg-zinc-900 p-2 rounded font-mono overflow-x-auto">
            {`volumes:
  - /path/to/movies:/media/movies:ro
  - /path/to/tv:/media/tv:ro`}
          </pre>
        </div>
      </main>
    </div>
  );
}
