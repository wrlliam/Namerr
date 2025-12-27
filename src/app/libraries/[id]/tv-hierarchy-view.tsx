"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRightIcon,
  ChevronDownIcon,
  VideoIcon,
  CheckCircledIcon,
  Pencil1Icon,
  MixIcon,
  Cross2Icon,
  LinkBreak2Icon,
} from "@radix-ui/react-icons";

function formatFileSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(unitIndex > 0 ? 1 : 0)} ${units[unitIndex]}`;
}

/**
 * Normalize show name for grouping purposes
 * Strips release groups, quality tags, season info, etc.
 * This is critical for grouping shows like "Clarksons Farm S01 AMZN WEBRip DDP5 1 -KOGi"
 * with "Clarksons Farm S02 WEBRip" under the same show.
 */
function normalizeShowName(name: string): string {
  return name
    .replace(/\./g, " ")
    .replace(/\_/g, " ")
    // Remove apostrophes and common punctuation for matching
    // "Clarkson's Farm" and "Clarksons Farm" should match
    .replace(/[''`]/g, "")
    // Remove scene group brackets first [anything]
    .replace(/\[[^\]]*\]/g, "")
    // Remove parentheses content that looks like release info
    .replace(/\([^)]*(?:720p|1080p|WEB|HDTV|BluRay|AMZN|NF)[^)]*\)/gi, "")
    // Remove season/episode patterns (S01, S01E01, S01-S02, etc.)
    .replace(/\b[Ss]\d{1,2}(?:[Ee]\d{1,2})?(?:-[Ss]?\d{1,2})?(?:[Ee]\d{1,2})?\b/g, "")
    // Remove common streaming service tags
    .replace(/\b(AMZN|AMAZON|NF|NETFLIX|HULU|DSNP|DISNEY|ATVP|APPLE|PMTP|PARAMOUNT|HBO|HBOMAX|MAX|PCOK|PEACOCK|STAN|CRAV|CRAVE|ROKU|iT|iTunes)\b/gi, "")
    // Remove format/quality tags
    .replace(/\b(WEBRip|WEB-DL|WEB|HDTV|BluRay|BDRip|BRRip|DVDRip|DVDR|HDRip|PDTV|DSR|SATRip|TVRip)\b/gi, "")
    // Remove resolution tags
    .replace(/\b(720p|1080p|1080i|2160p|4k|UHD|HD|SD)\b/gi, "")
    // Remove codec tags (handle H 264 with space, H.264, H264, x264, etc.)
    .replace(/\b(x264|x265|H\s*\.?\s*264|H\s*\.?\s*265|HEVC|AVC|XVID|DIVX|VP9|AV1)\b/gi, "")
    // Remove audio format tags (DDP, DD, AC3, AAC, etc.) and channel info like "5 1", "7 1"
    .replace(/\b(DDP?5?\.?1?|DD\+?|AC3|AAC|FLAC|DTS|TrueHD|Atmos|LPCM|EAC3|MP3|OGG)\b/gi, "")
    // Remove audio channel patterns like "5 1", "7 1", "2 0" that get left behind
    .replace(/\b[257]\s*[01]\b/g, "")
    // Remove standalone "1" that might be left from audio channels
    .replace(/(?<=\s)1(?=\s|$)/g, "")
    // Remove bit depth and HDR tags
    .replace(/\b(10bit|10-bit|8bit|8-bit|HDR|HDR10|DV|DoVi|Dolby\s*Vision)\b/gi, "")
    // Remove common release tags
    .replace(/\b(COMPLETE|PROPER|REPACK|RERIP|INTERNAL|REAL|READNFO|NFO|SUBBED|DUBBED|MULTI|MULTi|DUAL|iNTERNAL|EXTENDED|UNRATED|DC|REMASTERED)\b/gi, "")
    // Remove release group patterns (commonly at end after hyphen)
    .replace(/-[A-Za-z0-9]+$/g, "")
    // Remove standalone release group names that might appear
    .replace(/\b(FLUX|KONTRAST|KOGi|MIXED|rartv|eztv|TGx|YTS|YIFY|RARBG|PSA|ION10|NTb|SPARKS|FGT|DEMAND|GOSSIP|LOL|DIMENSION|KILLERS|AVS|REWARD|DEFLATE|METCON|BAMBOOZLE|SYNCOPY|ETHEL|TOMMY|MEMENTO|TEPES|CAKES|W4F)\b/gi, "")
    // Remove language tags
    .replace(/\b(ENG|ITA|SPA|GER|FRE|RUS|JPN|KOR|CHI|POR|DUT|POL|HIN|TUR|ARA|HEB|SWE|NOR|DAN|FIN|GRE|CZE|HUN|ROM|BUL|SLO|CRO|SRB|UKR|VIE|THA|IND|MAL|TAM|TEL|KAN|BEN|MAR|GUJ|PAN|ORI|ASM|NEP|SIN|MYA|KHM|LAO|TIB|MON|URD|PER|PAS|KUR|HAU|YOR|IGB|SWA|ZUL|XHO|AFR|AMH|SOM|ORM|TIR|MAL|KAZ|UZB|KYR|TGK|TUK|AZE|GEO|ARM|ALB|MAC|BOS|MNT|SLV|EST|LAT|LIT|BEL|UKR|MOL|RUM)\b/gi, "")
    // Remove ITA-ENG style language pairs
    .replace(/\b[A-Z]{2,3}-[A-Z]{2,3}\b/g, "")
    // Remove V2, V3, etc version tags
    .replace(/\bV\d+\b/gi, "")
    // Remove year patterns at the end (but keep years that are part of show titles)
    .replace(/\s+(19|20)\d{2}\s*$/g, "")
    // Remove "264" standalone (leftover from H 264)
    .replace(/\b264\b/g, "")
    // Remove "265" standalone (leftover from H 265)
    .replace(/\b265\b/g, "")
    // Collapse multiple spaces
    .replace(/\s+/g, " ")
    // Remove leading/trailing spaces and hyphens
    .replace(/^[\s\-]+|[\s\-]+$/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Clean show name for display purposes
 * Similar to normalize but preserves capitalization
 */
function cleanShowNameForDisplay(name: string): string {
  const cleaned = name
    .replace(/\./g, " ")
    .replace(/\_/g, " ")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\([^)]*(?:720p|1080p|WEB|HDTV|BluRay|AMZN|NF)[^)]*\)/gi, "")
    .replace(/\b[Ss]\d{1,2}(?:[Ee]\d{1,2})?(?:-[Ss]?\d{1,2})?(?:[Ee]\d{1,2})?\b/g, "")
    .replace(/\b(AMZN|AMAZON|NF|NETFLIX|HULU|DSNP|DISNEY|ATVP|APPLE|PMTP|PARAMOUNT|HBO|HBOMAX|MAX|PCOK|PEACOCK|STAN|CRAV|CRAVE|ROKU|iT|iTunes)\b/gi, "")
    .replace(/\b(WEBRip|WEB-DL|WEB|HDTV|BluRay|BDRip|BRRip|DVDRip|DVDR|HDRip|PDTV|DSR|SATRip|TVRip)\b/gi, "")
    .replace(/\b(720p|1080p|1080i|2160p|4k|UHD|HD|SD)\b/gi, "")
    .replace(/\b(x264|x265|H\s*\.?\s*264|H\s*\.?\s*265|HEVC|AVC|XVID|DIVX|VP9|AV1)\b/gi, "")
    .replace(/\b(DDP?5?\.?1?|DD\+?|AC3|AAC|FLAC|DTS|TrueHD|Atmos|LPCM|EAC3|MP3|OGG)\b/gi, "")
    .replace(/\b[257]\s*[01]\b/g, "")
    .replace(/(?<=\s)1(?=\s|$)/g, "")
    .replace(/\b(10bit|10-bit|8bit|8-bit|HDR|HDR10|DV|DoVi|Dolby\s*Vision)\b/gi, "")
    .replace(/\b(COMPLETE|PROPER|REPACK|RERIP|INTERNAL|REAL|READNFO|NFO|SUBBED|DUBBED|MULTI|MULTi|DUAL|iNTERNAL|EXTENDED|UNRATED|DC|REMASTERED)\b/gi, "")
    .replace(/-[A-Za-z0-9]+$/g, "")
    .replace(/\b(FLUX|KONTRAST|KOGi|MIXED|rartv|eztv|TGx|YTS|YIFY|RARBG|PSA|ION10|NTb|SPARKS|FGT|DEMAND|GOSSIP|LOL|DIMENSION|KILLERS|AVS|REWARD|DEFLATE|METCON|BAMBOOZLE|SYNCOPY|ETHEL|TOMMY|MEMENTO|TEPES|CAKES|W4F)\b/gi, "")
    .replace(/\b(ENG|ITA|SPA|GER|FRE|RUS|JPN|KOR|CHI|POR|DUT|POL|HIN|TUR|ARA|HEB|SWE|NOR|DAN|FIN|GRE|CZE|HUN|ROM|BUL|SLO|CRO|SRB|UKR|VIE|THA|IND|MAL|TAM|TEL|KAN|BEN|MAR|GUJ|PAN|ORI|ASM|NEP|SIN|MYA|KHM|LAO|TIB|MON|URD|PER|PAS|KUR|HAU|YOR|IGB|SWA|ZUL|XHO|AFR|AMH|SOM|ORM|TIR|MAL|KAZ|UZB|KYR|TGK|TUK|AZE|GEO|ARM|ALB|MAC|BOS|MNT|SLV|EST|LAT|LIT|BEL|UKR|MOL|RUM)\b/gi, "")
    .replace(/\b[A-Z]{2,3}-[A-Z]{2,3}\b/g, "")
    .replace(/\bV\d+\b/gi, "")
    .replace(/\b264\b/g, "")
    .replace(/\b265\b/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-]+|[\s\-]+$/g, "")
    .trim();

  // Capitalize first letter of each word
  return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
}

interface MediaFile {
  id: string;
  fileName: string;
  fileSize: number | null;
  parsedTitle: string | null;
  parsedSeason: number | null;
  parsedEpisode: number | null;
  seerrTitle: string | null;
  seerrTmdbId: number | null;
  seerrPosterPath: string | null;
  seerrSeasonName: string | null;
  seerrEpisodeName: string | null;
  seerrYear: string | null;
  manualTitle: string | null;
  manualShowGroup: string | null;
  renameStatus: string | null;
}

interface ShowGroup {
  groupKey: string;
  showName: string;
  tmdbId: number | null;
  posterPath: string | null;
  metadataCount: number;
  totalCount: number;
  isManuallyGrouped: boolean;
  fileIds: string[];
  seasons: Map<
    number,
    {
      seasonName: string;
      episodes: MediaFile[];
    }
  >;
}

function groupByShow(files: MediaFile[]): ShowGroup[] {
  const showMap = new Map<string, ShowGroup>();

  for (const file of files) {
    // Use manualShowGroup if set (user override), otherwise normalize automatically
    let groupKey: string;
    if (file.manualShowGroup) {
      // Manual override - use exact value for grouping
      groupKey = `manual-${file.manualShowGroup.toLowerCase()}`;
    } else {
      // ALWAYS group by normalized name - this ensures files with and without
      // TMDB metadata are grouped together under the same show
      // Use seerrTitle if available (it's the canonical TMDB name), otherwise parsedTitle
      const titleToNormalize = file.seerrTitle || file.parsedTitle || "unknown";
      const normalizedName = normalizeShowName(titleToNormalize);
      groupKey = `show-${normalizedName}`;
    }

    // For display, prefer manualShowGroup, seerr title, then clean the parsed title
    const showName = file.manualShowGroup || file.manualTitle || file.seerrTitle ||
      (file.parsedTitle ? cleanShowNameForDisplay(file.parsedTitle) : "Unknown Show");
    const seasonNum = file.parsedSeason || 1;
    const seasonName =
      file.seerrSeasonName || `Season ${String(seasonNum).padStart(2, "0")}`;

    if (!showMap.has(groupKey)) {
      showMap.set(groupKey, {
        groupKey,
        showName,
        tmdbId: file.seerrTmdbId,
        posterPath: file.seerrPosterPath,
        metadataCount: 0,
        totalCount: 0,
        isManuallyGrouped: !!file.manualShowGroup,
        fileIds: [],
        seasons: new Map(),
      });
    }

    const show = showMap.get(groupKey)!;
    show.totalCount++;
    show.fileIds.push(file.id);
    if (file.seerrTmdbId) {
      show.metadataCount++;
    }
    // Track if any file in the group has manual grouping
    if (file.manualShowGroup) {
      show.isManuallyGrouped = true;
    }

    // Update show info to prefer seerrTitle and poster if we have metadata
    // This ensures the best available info is used for the group
    if (file.seerrTitle && file.seerrTmdbId) {
      show.showName = file.seerrTitle;
      show.tmdbId = file.seerrTmdbId;
    }
    if (file.seerrPosterPath && !show.posterPath) {
      show.posterPath = file.seerrPosterPath;
    }

    if (!show.seasons.has(seasonNum)) {
      show.seasons.set(seasonNum, {
        seasonName,
        episodes: [],
      });
    }

    show.seasons.get(seasonNum)!.episodes.push(file);
  }

  // Sort episodes within each season
  for (const show of showMap.values()) {
    for (const season of show.seasons.values()) {
      season.episodes.sort(
        (a, b) => (a.parsedEpisode || 0) - (b.parsedEpisode || 0)
      );
    }
  }

  return Array.from(showMap.values()).sort((a, b) =>
    a.showName.localeCompare(b.showName)
  );
}

function getStatusColor(status: string | null): string {
  switch (status) {
    case "renamed":
      return "text-green-400";
    case "ready":
      return "text-blue-400";
    case "error":
      return "text-red-400";
    default:
      return "text-zinc-500";
  }
}

interface RenameDialogState {
  isOpen: boolean;
  show: ShowGroup | null;
  newName: string;
}

interface MergeDialogState {
  isOpen: boolean;
  sourceShow: ShowGroup | null;
  targetShowKey: string;
}

export function TVHierarchyView({ files, libraryId }: { files: MediaFile[]; libraryId: string }) {
  const router = useRouter();
  const [expandedShows, setExpandedShows] = useState<Set<string>>(new Set());
  const [expandedSeasons, setExpandedSeasons] = useState<Set<string>>(
    new Set()
  );
  const [renameDialog, setRenameDialog] = useState<RenameDialogState>({
    isOpen: false,
    show: null,
    newName: "",
  });
  const [mergeDialog, setMergeDialog] = useState<MergeDialogState>({
    isOpen: false,
    sourceShow: null,
    targetShowKey: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const shows = groupByShow(files);

  const handleRename = useCallback(async () => {
    if (!renameDialog.show || !renameDialog.newName.trim()) return;
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/libraries/${libraryId}/shows/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileIds: renameDialog.show.fileIds,
          newShowName: renameDialog.newName.trim(),
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to rename show");
      }
      setRenameDialog({ isOpen: false, show: null, newName: "" });
      router.refresh();
    } catch (error) {
      console.error("Failed to rename show:", error);
      alert(error instanceof Error ? error.message : "Failed to rename show");
    } finally {
      setIsSubmitting(false);
    }
  }, [renameDialog, libraryId, router]);

  const handleMerge = useCallback(async () => {
    if (!mergeDialog.sourceShow || !mergeDialog.targetShowKey) return;
    const targetShow = shows.find((s) => s.groupKey === mergeDialog.targetShowKey);
    if (!targetShow) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/libraries/${libraryId}/shows/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceFileIds: mergeDialog.sourceShow.fileIds,
          targetShowName: targetShow.showName,
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to merge shows");
      }
      setMergeDialog({ isOpen: false, sourceShow: null, targetShowKey: "" });
      router.refresh();
    } catch (error) {
      console.error("Failed to merge shows:", error);
      alert(error instanceof Error ? error.message : "Failed to merge shows");
    } finally {
      setIsSubmitting(false);
    }
  }, [mergeDialog, shows, libraryId, router]);

  const handleUngroup = useCallback(async (show: ShowGroup) => {
    if (!confirm(`Remove manual grouping for "${show.showName}"? Files will be re-grouped automatically.`)) return;
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/libraries/${libraryId}/shows/ungroup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds: show.fileIds }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to ungroup show");
      }
      router.refresh();
    } catch (error) {
      console.error("Failed to ungroup show:", error);
      alert(error instanceof Error ? error.message : "Failed to ungroup show");
    } finally {
      setIsSubmitting(false);
    }
  }, [libraryId, router]);

  const toggleShow = (groupKey: string) => {
    const newExpanded = new Set(expandedShows);
    if (newExpanded.has(groupKey)) {
      newExpanded.delete(groupKey);
    } else {
      newExpanded.add(groupKey);
    }
    setExpandedShows(newExpanded);
  };

  const toggleSeason = (groupKey: string, seasonNum: number) => {
    const key = `${groupKey}-${seasonNum}`;
    const newExpanded = new Set(expandedSeasons);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedSeasons(newExpanded);
  };

  if (shows.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-zinc-500 text-sm">No TV shows found</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {shows.map((show) => {
        const isShowExpanded = expandedShows.has(show.groupKey);
        const totalEpisodes = Array.from(show.seasons.values()).reduce(
          (sum, season) => sum + season.episodes.length,
          0
        );
        const hasAllMetadata = show.metadataCount === show.totalCount;
        const metadataPercent = show.totalCount > 0
          ? Math.round((show.metadataCount / show.totalCount) * 100)
          : 0;

        return (
          <div key={show.groupKey} className="bg-zinc-900 rounded border border-zinc-800">
            {/* Show Header */}
            <div className="flex items-center gap-3 p-3 hover:bg-zinc-800/50 transition-colors">
              <button
                onClick={() => toggleShow(show.groupKey)}
                className="flex items-center gap-3 flex-1 min-w-0 text-left"
              >
                {isShowExpanded ? (
                  <ChevronDownIcon className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                ) : (
                  <ChevronRightIcon className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                )}

                {/* Poster Thumbnail */}
                <div className="w-10 h-14 rounded overflow-hidden flex-shrink-0 bg-zinc-800">
                  {show.posterPath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`https://image.tmdb.org/t/p/w92${show.posterPath}`}
                      alt={show.showName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <VideoIcon className="w-4 h-4 text-zinc-600" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-zinc-300 truncate">
                      {show.showName}
                    </h3>
                    {hasAllMetadata && (
                      <CheckCircledIcon className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                    )}
                    {show.isManuallyGrouped && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded">
                        Manual
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500">
                    {show.seasons.size} season{show.seasons.size !== 1 ? "s" : ""} •{" "}
                    {totalEpisodes} episode{totalEpisodes !== 1 ? "s" : ""}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    {/* Metadata Progress */}
                    <div className="flex items-center gap-1.5">
                      <div className="w-16 h-1 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            hasAllMetadata ? 'bg-green-500' : 'bg-violet-500'
                          }`}
                          style={{ width: `${metadataPercent}%` }}
                        />
                      </div>
                      <span className={`text-[10px] ${hasAllMetadata ? 'text-green-500' : 'text-zinc-500'}`}>
                        {show.metadataCount}/{show.totalCount}
                      </span>
                    </div>
                    {show.tmdbId && (
                      <span className="text-[10px] text-violet-400">
                        TMDB: {show.tmdbId}
                      </span>
                    )}
                  </div>
                </div>
              </button>

              {/* Show Action Buttons */}
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setRenameDialog({
                      isOpen: true,
                      show,
                      newName: show.showName,
                    });
                  }}
                  className="p-1.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
                  title="Rename show"
                >
                  <Pencil1Icon className="w-3.5 h-3.5" />
                </button>
                {shows.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMergeDialog({
                        isOpen: true,
                        sourceShow: show,
                        targetShowKey: "",
                      });
                    }}
                    className="p-1.5 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
                    title="Merge into another show"
                  >
                    <MixIcon className="w-3.5 h-3.5" />
                  </button>
                )}
                {show.isManuallyGrouped && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUngroup(show);
                    }}
                    disabled={isSubmitting}
                    className="p-1.5 rounded hover:bg-zinc-700 text-amber-500 hover:text-amber-400 transition-colors disabled:opacity-50"
                    title="Remove manual grouping"
                  >
                    <LinkBreak2Icon className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Seasons */}
            {isShowExpanded && (
              <div className="border-t border-zinc-800">
                {Array.from(show.seasons.entries())
                  .sort(([a], [b]) => a - b)
                  .map(([seasonNum, season]) => {
                    const seasonKey = `${show.groupKey}-${seasonNum}`;
                    const isSeasonExpanded = expandedSeasons.has(seasonKey);

                    return (
                      <div key={seasonKey} className="border-b border-zinc-800 last:border-b-0">
                        {/* Season Header */}
                        <button
                          onClick={() => toggleSeason(show.groupKey, seasonNum)}
                          className="w-full flex items-center gap-2 p-3 pl-12 hover:bg-zinc-800/30 transition-colors text-left"
                        >
                          {isSeasonExpanded ? (
                            <ChevronDownIcon className="w-3 h-3 text-zinc-500 flex-shrink-0" />
                          ) : (
                            <ChevronRightIcon className="w-3 h-3 text-zinc-500 flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-zinc-400">
                              {season.seasonName}
                            </p>
                            <p className="text-[10px] text-zinc-600">
                              {season.episodes.length} episode{season.episodes.length !== 1 ? "s" : ""}
                            </p>
                          </div>
                        </button>

                        {/* Episodes */}
                        {isSeasonExpanded && (
                          <div className="bg-zinc-800/20">
                            {season.episodes.map((episode) => {
                              const episodeName =
                                episode.seerrEpisodeName ||
                                `Episode ${String(episode.parsedEpisode || 1).padStart(2, "0")}`;

                              return (
                                <Link
                                  key={episode.id}
                                  href={`/media/${episode.id}`}
                                  className="flex items-center gap-3 p-2 pl-20 hover:bg-zinc-800/50 transition-colors border-t border-zinc-800 first:border-t-0"
                                >
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs text-zinc-300 truncate">
                                      S{String(episode.parsedSeason || 1).padStart(2, "0")}E
                                      {String(episode.parsedEpisode || 1).padStart(2, "0")} -{" "}
                                      {episodeName}
                                    </p>
                                    <p className="text-[10px] text-zinc-600 truncate">
                                      {episode.fileName}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`text-[10px] ${getStatusColor(episode.renameStatus)}`}
                                    >
                                      ●
                                    </span>
                                    <span className="text-[10px] text-zinc-600">
                                      {formatFileSize(episode.fileSize || 0)}
                                    </span>
                                  </div>
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        );
      })}

      {/* Rename Dialog */}
      {renameDialog.isOpen && renameDialog.show && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setRenameDialog({ isOpen: false, show: null, newName: "" })}
          />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-zinc-900 rounded border border-zinc-800 shadow-xl z-50">
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-zinc-200">Rename Show</h2>
                <button
                  onClick={() => setRenameDialog({ isOpen: false, show: null, newName: "" })}
                  className="p-1 hover:bg-zinc-800 rounded transition-colors"
                >
                  <Cross2Icon className="w-4 h-4 text-zinc-500" />
                </button>
              </div>

              <p className="text-xs text-zinc-500">
                This will set the canonical name for all {renameDialog.show.totalCount} episodes in this show.
                Files will be grouped under this name.
              </p>

              <div>
                <label className="text-sm text-zinc-400 block mb-2">Show Name</label>
                <input
                  type="text"
                  value={renameDialog.newName}
                  onChange={(e) => setRenameDialog({ ...renameDialog, newName: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-violet-600"
                  placeholder="Enter show name"
                  autoFocus
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleRename}
                  disabled={isSubmitting || !renameDialog.newName.trim()}
                  className="flex-1 px-4 py-2 text-sm rounded bg-violet-600 text-white hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? "Saving..." : "Rename Show"}
                </button>
                <button
                  onClick={() => setRenameDialog({ isOpen: false, show: null, newName: "" })}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm rounded border border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Merge Dialog */}
      {mergeDialog.isOpen && mergeDialog.sourceShow && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setMergeDialog({ isOpen: false, sourceShow: null, targetShowKey: "" })}
          />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-zinc-900 rounded border border-zinc-800 shadow-xl z-50">
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-zinc-200">Merge Shows</h2>
                <button
                  onClick={() => setMergeDialog({ isOpen: false, sourceShow: null, targetShowKey: "" })}
                  className="p-1 hover:bg-zinc-800 rounded transition-colors"
                >
                  <Cross2Icon className="w-4 h-4 text-zinc-500" />
                </button>
              </div>

              <p className="text-xs text-zinc-500">
                Move all {mergeDialog.sourceShow.totalCount} episodes from &quot;{mergeDialog.sourceShow.showName}&quot; into another show.
              </p>

              <div>
                <label className="text-sm text-zinc-400 block mb-2">Merge Into</label>
                <select
                  value={mergeDialog.targetShowKey}
                  onChange={(e) => setMergeDialog({ ...mergeDialog, targetShowKey: e.target.value })}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-violet-600"
                >
                  <option value="">Select a show...</option>
                  {shows
                    .filter((s) => s.groupKey !== mergeDialog.sourceShow?.groupKey)
                    .map((s) => (
                      <option key={s.groupKey} value={s.groupKey}>
                        {s.showName} ({s.totalCount} episodes)
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleMerge}
                  disabled={isSubmitting || !mergeDialog.targetShowKey}
                  className="flex-1 px-4 py-2 text-sm rounded bg-violet-600 text-white hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? "Merging..." : "Merge Shows"}
                </button>
                <button
                  onClick={() => setMergeDialog({ isOpen: false, sourceShow: null, targetShowKey: "" })}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm rounded border border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
