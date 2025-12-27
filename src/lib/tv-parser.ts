/**
 * TV Show File Parser
 * Extracts show name, season, and episode from file paths and names
 */

import path from "path";

export interface TVParseResult {
  showName: string | null;
  season: number | null;
  episode: number | null;
}

/**
 * Parse TV show information from file path
 * Supports structures like:
 * - Show Name/Season 01/Episode.mkv
 * - Show Name/Show.S01E01.mkv
 * - Show.Name.S01E01.720p.mkv
 */
export function parseTVShowPath(
  filePath: string,
  libraryPath: string
): TVParseResult {
  const result: TVParseResult = {
    showName: null,
    season: null,
    episode: null,
  };

  // Get relative path from library root
  const relativePath = path.relative(libraryPath, filePath);
  const pathParts = relativePath.split(path.sep);
  const fileName = path.basename(filePath, path.extname(filePath));

  // For TV shows, typical structure is: ShowName/Season/Episode.mkv (3 levels)
  // Or: ShowName/Episode.mkv (2 levels)

  // Extract show name from directory structure
  if (pathParts.length >= 2) {
    // First directory is usually the show name
    result.showName = cleanShowName(pathParts[0]);
  }

  // Parse season and episode from filename
  const seasonEpisodeMatch = fileName.match(/S(\d{1,2})E(\d{1,2})/i);
  if (seasonEpisodeMatch) {
    result.season = parseInt(seasonEpisodeMatch[1], 10);
    result.episode = parseInt(seasonEpisodeMatch[2], 10);
  } else {
    // Try alternative patterns
    // Pattern: 1x01, 01x01
    const altMatch = fileName.match(/(\d{1,2})x(\d{1,2})/i);
    if (altMatch) {
      result.season = parseInt(altMatch[1], 10);
      result.episode = parseInt(altMatch[2], 10);
    } else {
      // Try season from directory name
      if (pathParts.length >= 2) {
        const seasonMatch = pathParts[pathParts.length - 2].match(
          /season\s*(\d{1,2})/i
        );
        if (seasonMatch) {
          result.season = parseInt(seasonMatch[1], 10);
        }
      }

      // Try episode from filename (e.g., "Episode 01" or just "01")
      const epMatch = fileName.match(/(?:episode|ep|e)?\s*(\d{1,2})/i);
      if (epMatch) {
        result.episode = parseInt(epMatch[1], 10);
      }
    }
  }

  return result;
}

/**
 * Clean show name by removing common artifacts
 * Handles folder names like:
 * - "Clarksons Farm S01 AMZN WEBRip DDP5 1 -KOGi[eztv re]"
 * - "Show Name S02 WEBRip [eztv re]"
 * - "Show.Name.S03.COMPLETE.AMZN.DDP5.1.H.264-FLUX[TGx]"
 */
function cleanShowName(rawName: string): string {
  return rawName
    // Replace dots and underscores with spaces
    .replace(/\./g, " ")
    .replace(/\_/g, " ")
    // Remove scene group brackets first [anything]
    .replace(/\[[^\]]*\]/g, "")
    // Remove season/episode patterns (S01, S01E01, S01-S02, etc.)
    .replace(/\b[Ss]\d{1,2}(?:[Ee]\d{1,2})?(?:-[Ss]?\d{1,2})?(?:[Ee]\d{1,2})?\b/g, "")
    // Remove common streaming service tags
    .replace(/\b(AMZN|AMAZON|NF|NETFLIX|HULU|DSNP|DISNEY|ATVP|APPLE|PMTP|PARAMOUNT|HBO|HBOMAX|MAX|PCOK|PEACOCK|STAN|CRAV|CRAVE|ROKU|iT|iTunes)\b/gi, "")
    // Remove format/quality tags
    .replace(/\b(WEBRip|WEB-DL|WEB|HDTV|BluRay|BDRip|BRRip|DVDRip|DVDR|HDRip|PDTV|DSR|SATRip|TVRip)\b/gi, "")
    // Remove resolution tags
    .replace(/\b(720p|1080p|1080i|2160p|4k|UHD|HD|SD)\b/gi, "")
    // Remove codec tags
    .replace(/\b(x264|x265|H\.?264|H\.?265|HEVC|AVC|XVID|DIVX|VP9|AV1)\b/gi, "")
    // Remove audio tags
    .replace(/\b(DDP?5?\.?1?|DD\+?|AC3|AAC|FLAC|DTS|TrueHD|Atmos|LPCM|EAC3|MP3|OGG)(\s*\d+\.\d+)?\b/gi, "")
    // Remove bit depth
    .replace(/\b(10bit|10-bit|8bit|8-bit|HDR|HDR10|DV|DoVi|Dolby\s*Vision)\b/gi, "")
    // Remove "COMPLETE", "PROPER", "REPACK", "INTERNAL" tags
    .replace(/\b(COMPLETE|PROPER|REPACK|RERIP|INTERNAL|REAL|READNFO|NFO)\b/gi, "")
    // Remove trailing release group after hyphen (e.g., "-KONTRAST", "-FLUX", "-KOGi")
    .replace(/-[A-Za-z0-9]+$/g, "")
    // Remove standalone numbers that might be audio channels (5 1, 7 1, etc.)
    .replace(/\b\d\s+1\b/g, "")
    // Collapse multiple spaces
    .replace(/\s+/g, " ")
    // Remove leading/trailing spaces and hyphens
    .replace(/^[\s\-]+|[\s\-]+$/g, "")
    .trim();
}
