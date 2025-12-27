"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeftIcon,
  CheckCircledIcon,
  CrossCircledIcon,
  ClockIcon,
  ReloadIcon,
  UpdateIcon,
  StarFilledIcon,
} from "@radix-ui/react-icons";
import { Input, Label } from "@/src/components/ui/Input";
import { Button } from "@/src/components/ui/Button";

interface MediaFile {
  id: string;
  libraryId: string;
  filePath: string;
  fileName: string;
  fileSize: number | null;
  fileExtension: string | null;
  parsedTitle: string | null;
  parsedYear: string | null;
  parsedSeason: number | null;
  parsedEpisode: number | null;
  seerrVerified: boolean | null;
  seerrTitle: string | null;
  seerrYear: string | null;
  seerrTmdbId: number | null;
  seerrOverview: string | null;
  seerrPosterPath: string | null;
  seerrBackdropPath: string | null;
  seerrVoteAverage: string | null;
  seerrCast: Array<{
    name: string;
    character: string;
    profile_path: string | null;
  }> | null;
  seerrMatchScore: string | null;
  manualTitle: string | null;
  manualYear: string | null;
  manualSeason: number | null;
  manualEpisode: number | null;
  renameStatus: string | null;
  lastRenamedAt: Date | null;
  renameError: string | null;
  libraryName: string | null;
  libraryType: string | null;
}

export default function MediaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [paramId, setParamId] = React.useState<string>("");

  React.useEffect(() => {
    params.then((p) => setParamId(p.id));
  }, [params]);
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isFetchingMetadata, setIsFetchingMetadata] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [mediaFile, setMediaFile] = useState<MediaFile | null>(null);
  const [manualTitle, setManualTitle] = useState("");
  const [manualYear, setManualYear] = useState("");
  const [manualSeason, setManualSeason] = useState("");
  const [manualEpisode, setManualEpisode] = useState("");

  useEffect(() => {
    if (paramId) {
      fetchMediaFile();
    }
  }, [paramId]);

  const fetchMediaFile = async () => {
    if (!paramId) return;
    try {
      const response = await fetch(`/api/media/${paramId}`);
      if (response.ok) {
        const data = await response.json();
        setMediaFile(data.mediaFile);
        setManualTitle(data.mediaFile.manualTitle || "");
        setManualYear(data.mediaFile.manualYear || "");
        setManualSeason(data.mediaFile.manualSeason?.toString() || "");
        setManualEpisode(data.mediaFile.manualEpisode?.toString() || "");
      } else {
        setError("Failed to load media file");
      }
    } catch {
      setError("Failed to load media file");
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
      const response = await fetch(`/api/media/${paramId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manualTitle: manualTitle || null,
          manualYear: manualYear || null,
          manualSeason: manualSeason || null,
          manualEpisode: manualEpisode || null,
        }),
      });

      if (response.ok) {
        setSuccess(
          "Metadata saved successfully. File marked as ready for renaming."
        );
        fetchMediaFile();
      } else {
        const data = await response.json();
        setError(data.error || "Failed to save metadata");
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleFetchMetadata = async () => {
    setError("");
    setSuccess("");
    setIsFetchingMetadata(true);

    try {
      const response = await fetch(`/api/media/${paramId}/metadata`, {
        method: "POST",
      });

      const data = await response.json();

      if (response.ok && data.verified) {
        setSuccess(
          `Metadata fetched from Seerr! Match score: ${
            data.metadata.matchScore?.toFixed(2) || "N/A"
          }`
        );
        fetchMediaFile();
      } else {
        setError(data.error || "Failed to fetch metadata from Seerr");
      }
    } catch {
      setError("An error occurred while fetching metadata");
    } finally {
      setIsFetchingMetadata(false);
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "Unknown";
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "renamed":
        return (
          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-green-900/20 text-green-400 border border-green-900/50">
            <CheckCircledIcon className="w-3 h-3" />
            Renamed
          </span>
        );
      case "ready":
        return (
          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-900/20 text-blue-400 border border-blue-900/50">
            <ClockIcon className="w-3 h-3" />
            Ready
          </span>
        );
      case "error":
        return (
          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-red-900/20 text-red-400 border border-red-900/50">
            <CrossCircledIcon className="w-3 h-3" />
            Error
          </span>
        );
      default:
        return (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">
            Pending
          </span>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <ReloadIcon className="w-6 h-6 text-zinc-500 animate-spin" />
      </div>
    );
  }

  if (!mediaFile) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="text-center">
          <h1 className="text-xl text-zinc-300 mb-2">Media file not found</h1>
          <Link
            href="/dashboard"
            className="text-xs text-blue-400 hover:underline"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const isTV = mediaFile.libraryType === "tv";
  const finalTitle =
    mediaFile.manualTitle ||
    mediaFile.seerrTitle ||
    mediaFile.parsedTitle ||
    "Unknown";
  const finalYear =
    mediaFile.manualYear || mediaFile.seerrYear || mediaFile.parsedYear;

  return (
    <div className="min-h-screen bg-black">
      {/* Backdrop */}
      {mediaFile.seerrBackdropPath && (
        <div className="relative h-64 w-full overflow-hidden">
          <div className="absolute inset-0 bg-linear-to-b from-transparent via-black/50 to-black z-10" />
          <img
            src={`https://image.tmdb.org/t/p/original${mediaFile.seerrBackdropPath}`}
            alt=""
            className="w-full h-full object-cover opacity-40"
            onError={(e) => {
              console.error(
                "Failed to load backdrop:",
                mediaFile.seerrBackdropPath
              );
              e.currentTarget.parentElement?.remove();
            }}
          />
        </div>
      )}

      <main className="mx-auto w-full max-w-4xl px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link
            href={`/libraries/${mediaFile.libraryId}`}
            className="text-zinc-500 hover:text-zinc-400 transition-colors"
          >
            <ArrowLeftIcon className="w-4 h-4" />
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-medium text-zinc-300">
                {finalTitle}
              </h1>
              {finalYear && (
                <span className="text-sm text-zinc-500">({finalYear})</span>
              )}
              {getStatusBadge(mediaFile.renameStatus)}
            </div>
            <p className="text-xs text-zinc-500">
              {mediaFile.libraryName} • {mediaFile.fileName}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Poster & Seerr Metadata */}
          <div className="space-y-6">
            {/* Poster */}
            {mediaFile.seerrPosterPath ? (
              <div className="aspect-2/3 bg-zinc-900 rounded border border-zinc-800 overflow-hidden">
                <img
                  src={`https://image.tmdb.org/t/p/w500${mediaFile.seerrPosterPath}`}
                  alt={finalTitle}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    console.error("Failed to load poster:", {
                      posterPath: mediaFile.seerrPosterPath,
                      fullUrl: `https://image.tmdb.org/t/p/w500${mediaFile.seerrPosterPath}`,
                    });
                    e.currentTarget.style.display = "none";
                    const parent = e.currentTarget.parentElement;
                    if (parent) {
                      parent.innerHTML =
                        '<div class="flex items-center justify-center h-full"><span class="text-xs text-red-400">Failed to load poster</span></div>';
                    }
                  }}
                  onLoad={() => {
                    console.log(
                      "Poster loaded successfully:",
                      mediaFile.seerrPosterPath
                    );
                  }}
                />
              </div>
            ) : (
              <div className="aspect-2/3 bg-zinc-900 rounded border border-zinc-800 flex items-center justify-center">
                <span className="text-xs text-zinc-600">
                  No poster available
                  {mediaFile.seerrVerified && (
                    <span className="block text-[10px] mt-1">
                      (Seerr verified but no poster)
                    </span>
                  )}
                </span>
              </div>
            )}

            {/* Seerr Metadata */}
            {mediaFile.seerrVerified && (
              <div className="bg-zinc-900 rounded border border-zinc-800 p-4">
                <h3 className="text-sm font-medium text-zinc-300 mb-3">
                  Seerr Metadata
                </h3>
                <div className="space-y-3 text-xs">
                  <div>
                    <span className="text-zinc-500">Title:</span>
                    <span className="text-zinc-300 ml-2">
                      {mediaFile.seerrTitle}
                    </span>
                  </div>
                  {mediaFile.seerrYear && (
                    <div>
                      <span className="text-zinc-500">Year:</span>
                      <span className="text-zinc-300 ml-2">
                        {mediaFile.seerrYear}
                      </span>
                    </div>
                  )}
                  {mediaFile.seerrVoteAverage && (
                    <div>
                      <span className="text-zinc-500">Rating:</span>
                      <span className="text-zinc-300 ml-2 inline-flex items-center gap-1">
                        <StarFilledIcon className="w-3 h-3 text-yellow-500" />
                        {parseFloat(mediaFile.seerrVoteAverage).toFixed(1)}/10
                      </span>
                    </div>
                  )}
                  {mediaFile.seerrTmdbId && (
                    <div>
                      <span className="text-zinc-500">TMDB ID:</span>
                      <span className="text-zinc-300 ml-2">
                        {mediaFile.seerrTmdbId}
                      </span>
                    </div>
                  )}
                  {mediaFile.seerrMatchScore && (
                    <div>
                      <span className="text-zinc-500">Match Score:</span>
                      <span className="text-zinc-300 ml-2">
                        {(parseFloat(mediaFile.seerrMatchScore) * 100).toFixed(
                          0
                        )}
                        %
                      </span>
                    </div>
                  )}
                  {mediaFile.seerrOverview && (
                    <div>
                      <span className="text-zinc-500 block mb-1">
                        Overview:
                      </span>
                      <p className="text-zinc-400 text-[10px] leading-relaxed">
                        {mediaFile.seerrOverview}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Cast */}
            {mediaFile.seerrCast && mediaFile.seerrCast.length > 0 && (
              <div className="bg-zinc-900 rounded border border-zinc-800 p-4">
                <h3 className="text-sm font-medium text-zinc-300 mb-3">Cast</h3>
                <div className="grid grid-cols-2 gap-3">
                  {mediaFile.seerrCast.map((person, index) => (
                    <div key={index} className="flex gap-2">
                      {person.profile_path ? (
                        <img
                          src={`https://image.tmdb.org/t/p/w185${person.profile_path}`}
                          alt={person.name}
                          className="w-12 h-12 rounded object-cover bg-zinc-800"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="w-12 h-12 rounded bg-zinc-800 flex items-center justify-center">
                          <span className="text-[10px] text-zinc-600">
                            No photo
                          </span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-zinc-300 font-medium truncate">
                          {person.name}
                        </p>
                        <p className="text-[10px] text-zinc-500 truncate">
                          {person.character}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Fetch Metadata Button */}
            <div className="flex flex-col gap-2">
              {!mediaFile.seerrVerified && (
                <Button
                  onClick={handleFetchMetadata}
                  disabled={isFetchingMetadata}
                  variant="outline"
                  className="w-full h-9 text-xs"
                >
                  {isFetchingMetadata ? (
                    <>
                      <UpdateIcon className="w-3 h-3 mr-2 animate-spin" />
                      Fetching...
                    </>
                  ) : (
                    "Fetch Metadata from Seerr"
                  )}
                </Button>
              )}

              {/* Hard refresh always available */}
              <Button
                onClick={async () => {
                  setError("");
                  setSuccess("");
                  setIsFetchingMetadata(true);
                  try {
                    const response = await fetch(
                      `/api/media/${paramId}/metadata`,
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ hard: true }),
                      }
                    );

                    const data = await response.json();

                    if (response.ok && data.verified) {
                      setSuccess(
                        `Hard metadata refresh complete. Match score: ${
                          data.metadata.matchScore?.toFixed(2) || "N/A"
                        }`
                      );
                      fetchMediaFile();
                    } else {
                      setError(
                        data.error || "Failed to fetch metadata from Seerr"
                      );
                    }
                  } catch (e) {
                    setError("An error occurred while fetching metadata");
                  } finally {
                    setIsFetchingMetadata(false);
                  }
                }}
                disabled={isFetchingMetadata}
                variant="outline"
                className="w-full h-9 text-xs"
              >
                {isFetchingMetadata ? (
                  <>
                    <UpdateIcon className="w-3 h-3 mr-2 animate-spin" />
                    Fetching...
                  </>
                ) : (
                  "Hard Refresh Metadata (overwrite)"
                )}
              </Button>
            </div>
          </div>

          {/* Right Column: File Info & Manual Editor */}
          <div className="lg:col-span-2 space-y-6">
            {/* File Information */}
            <div className="bg-zinc-900 rounded border border-zinc-800 p-4">
              <h3 className="text-sm font-medium text-zinc-300 mb-3">
                File Information
              </h3>
              <div className="space-y-2 text-xs">
                <div className="grid grid-cols-2">
                  <span className="text-zinc-500">File Name:</span>
                  <span className="text-zinc-300 font-mono">
                    {mediaFile.fileName}
                  </span>
                </div>
                <div className="grid grid-cols-2">
                  <span className="text-zinc-500">Size:</span>
                  <span className="text-zinc-300">
                    {formatFileSize(mediaFile.fileSize)}
                  </span>
                </div>
                <div className="grid grid-cols-2">
                  <span className="text-zinc-500">Extension:</span>
                  <span className="text-zinc-300">
                    {mediaFile.fileExtension}
                  </span>
                </div>
                <div className="grid grid-cols-2">
                  <span className="text-zinc-500">Path:</span>
                  <span className="text-zinc-400 font-mono text-[10px] break-all">
                    {mediaFile.filePath}
                  </span>
                </div>
              </div>
            </div>

            {/* Parsed Metadata */}
            <div className="bg-zinc-900 rounded border border-zinc-800 p-4">
              <h3 className="text-sm font-medium text-zinc-300 mb-3">
                Parsed Metadata
              </h3>
              <div className="space-y-2 text-xs">
                <div className="grid grid-cols-2">
                  <span className="text-zinc-500">Title:</span>
                  <span className="text-zinc-300">
                    {mediaFile.parsedTitle || "-"}
                  </span>
                </div>
                <div className="grid grid-cols-2">
                  <span className="text-zinc-500">Year:</span>
                  <span className="text-zinc-300">
                    {mediaFile.parsedYear || "-"}
                  </span>
                </div>
                {isTV && (
                  <>
                    <div className="grid grid-cols-2">
                      <span className="text-zinc-500">Season:</span>
                      <span className="text-zinc-300">
                        {mediaFile.parsedSeason || "-"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2">
                      <span className="text-zinc-500">Episode:</span>
                      <span className="text-zinc-300">
                        {mediaFile.parsedEpisode || "-"}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Manual Metadata Editor */}
            <div className="bg-zinc-900 rounded border border-zinc-800 p-4">
              <h3 className="text-sm font-medium text-zinc-300 mb-3">
                Manual Metadata Override
              </h3>
              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <Label className="text-xs text-zinc-400">Title</Label>
                  <Input
                    type="text"
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                    placeholder={
                      mediaFile.seerrTitle ||
                      mediaFile.parsedTitle ||
                      "Enter title"
                    }
                    className="mt-1.5 bg-zinc-900 border-zinc-800 text-zinc-300 text-xs"
                  />
                </div>

                <div>
                  <Label className="text-xs text-zinc-400">Year</Label>
                  <Input
                    type="text"
                    value={manualYear}
                    onChange={(e) => setManualYear(e.target.value)}
                    placeholder={
                      mediaFile.seerrYear || mediaFile.parsedYear || "YYYY"
                    }
                    className="mt-1.5 bg-zinc-900 border-zinc-800 text-zinc-300 text-xs"
                  />
                </div>

                {isTV && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-zinc-400">Season</Label>
                      <Input
                        type="number"
                        value={manualSeason}
                        onChange={(e) => setManualSeason(e.target.value)}
                        placeholder={mediaFile.parsedSeason?.toString() || "1"}
                        className="mt-1.5 bg-zinc-900 border-zinc-800 text-zinc-300 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-zinc-400">Episode</Label>
                      <Input
                        type="number"
                        value={manualEpisode}
                        onChange={(e) => setManualEpisode(e.target.value)}
                        placeholder={mediaFile.parsedEpisode?.toString() || "1"}
                        className="mt-1.5 bg-zinc-900 border-zinc-800 text-zinc-300 text-xs"
                      />
                    </div>
                  </div>
                )}

                <p className="text-[10px] text-zinc-600">
                  Manual metadata takes priority over Seerr and parsed data.
                  Leave fields empty to use automatic values.
                </p>

                {/* Error Message */}
                {error && (
                  <div className="text-xs text-red-400 bg-red-900/20 border border-red-900/50 p-3 rounded">
                    {error}
                  </div>
                )}

                {/* Success Message */}
                {success && (
                  <div className="text-xs text-green-400 bg-green-900/20 border border-green-900/50 p-3 rounded flex items-center gap-2">
                    <CheckCircledIcon className="w-3.5 h-3.5" />
                    {success}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isSaving}
                  className="w-full h-9 bg-zinc-800 text-zinc-200 text-xs hover:bg-zinc-700 disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : "Save Metadata"}
                </Button>
              </form>
            </div>

            {/* Rename Error */}
            {mediaFile.renameError && (
              <div className="bg-red-900/20 border border-red-900/50 rounded p-4">
                <h3 className="text-sm font-medium text-red-400 mb-2">
                  Rename Error
                </h3>
                <p className="text-xs text-red-300">{mediaFile.renameError}</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
