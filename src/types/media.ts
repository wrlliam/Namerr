/**
 * Media-related type definitions
 */

export interface MediaInfo {
  title: string;
  year?: string;
  season?: number;
  episode?: number;
  verified?: boolean;
  tmdbId?: number;
}

export interface ParsedMediaInfo extends MediaInfo {
  originalFilename: string;
  extension: string;
}

export interface RenameResult {
  success: boolean;
  oldPath?: string;
  newPath?: string;
  error?: string;
  skipped?: boolean;
}

export interface SubtitleRenameResult {
  renamed: string[];
  errors: Array<{ path: string; error: string }>;
}
