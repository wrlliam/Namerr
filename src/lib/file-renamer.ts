/**
 * FileRenamer - Rename media files with conflict resolution
 * Ported from Python jellyfin_renamer.py
 */

import * as fs from "fs/promises";
import * as path from "path";
import type { MediaInfo, RenameResult, SubtitleRenameResult } from "@/src/types/media";

export type ConflictResolution = "skip" | "increment" | "overwrite";

const SUBTITLE_EXTENSIONS = [".srt", ".sub", ".idx", ".ssa", ".ass", ".vtt"];

export class FileRenamer {
  private conflictResolution: ConflictResolution;
  private handleSubtitles: boolean;

  constructor(options?: {
    conflictResolution?: ConflictResolution;
    handleSubtitles?: boolean;
  }) {
    this.conflictResolution = options?.conflictResolution || "skip";
    this.handleSubtitles = options?.handleSubtitles !== false;
  }

  /**
   * Resolve filename conflict based on strategy
   */
  private async resolveConflict(
    targetPath: string
  ): Promise<string | null> {
    try {
      await fs.access(targetPath);
      // File exists
    } catch {
      // File doesn't exist, no conflict
      return targetPath;
    }

    if (this.conflictResolution === "skip") {
      return null;
    } else if (this.conflictResolution === "overwrite") {
      return targetPath;
    } else if (this.conflictResolution === "increment") {
      const dir = path.dirname(targetPath);
      const ext = path.extname(targetPath);
      const base = path.basename(targetPath, ext);
      let counter = 1;

      while (true) {
        const newPath = path.join(dir, `${base} (${counter})${ext}`);
        try {
          await fs.access(newPath);
          counter++;
        } catch {
          return newPath;
        }
      }
    }

    return null;
  }

  /**
   * Find subtitle files for a video file
   */
  private async findSubtitles(videoPath: string): Promise<string[]> {
    if (!this.handleSubtitles) {
      return [];
    }

    const subtitles: string[] = [];
    const dir = path.dirname(videoPath);
    const baseName = path.basename(videoPath, path.extname(videoPath));

    for (const subExt of SUBTITLE_EXTENSIONS) {
      // Exact match
      const exactMatch = path.join(dir, `${baseName}${subExt}`);
      try {
        await fs.access(exactMatch);
        subtitles.push(exactMatch);
      } catch {
        // File doesn't exist
      }

      // Language variants (e.g., movie.en.srt)
      try {
        const files = await fs.readdir(dir);
        for (const file of files) {
          if (
            file.startsWith(baseName) &&
            file.endsWith(subExt) &&
            !subtitles.includes(path.join(dir, file))
          ) {
            subtitles.push(path.join(dir, file));
          }
        }
      } catch {
        // Ignore directory read errors
      }
    }

    return subtitles;
  }

  /**
   * Rename subtitle files to match new video name
   */
  private async renameSubtitles(
    oldVideoPath: string,
    newVideoPath: string,
    subtitles: string[]
  ): Promise<SubtitleRenameResult> {
    const renamed: string[] = [];
    const errors: Array<{ path: string; error: string }> = [];
    const oldBase = path.basename(oldVideoPath, path.extname(oldVideoPath));
    const newBase = path.basename(newVideoPath, path.extname(newVideoPath));

    for (const subPath of subtitles) {
      try {
        const subName = path.basename(subPath);
        const newSubName = subName.replace(oldBase, newBase);
        const newSubPath = path.join(path.dirname(subPath), newSubName);

        await fs.rename(subPath, newSubPath);
        renamed.push(newSubPath);
      } catch (error) {
        errors.push({
          path: subPath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { renamed, errors };
  }

  /**
   * Rename movie file to Jellyfin format: "Title (Year).ext"
   */
  async renameMovie(
    filePath: string,
    mediaInfo: MediaInfo,
    options?: { dryRun?: boolean }
  ): Promise<RenameResult> {
    const dryRun = options?.dryRun || false;

    try {
      const extension = path.extname(filePath);
      const directory = path.dirname(filePath);

      // Generate new filename
      const newName = mediaInfo.year
        ? `${mediaInfo.title} (${mediaInfo.year})${extension}`
        : `${mediaInfo.title}${extension}`;

      const newPath = path.join(directory, newName);

      // Check if already correctly named
      if (filePath === newPath) {
        return {
          success: true,
          oldPath: filePath,
          newPath,
          skipped: true,
        };
      }

      // Resolve conflicts
      const resolvedPath = await this.resolveConflict(newPath);
      if (resolvedPath === null) {
        return {
          success: false,
          oldPath: filePath,
          error: "Filename conflict - file exists",
          skipped: true,
        };
      }

      // Find subtitles
      const subtitles = await this.findSubtitles(filePath);

      if (dryRun) {
        return {
          success: true,
          oldPath: filePath,
          newPath: resolvedPath,
        };
      }

      // Rename video file
      await fs.rename(filePath, resolvedPath);

      // Rename subtitles
      if (subtitles.length > 0) {
        await this.renameSubtitles(filePath, resolvedPath, subtitles);
      }

      return {
        success: true,
        oldPath: filePath,
        newPath: resolvedPath,
      };
    } catch (error) {
      return {
        success: false,
        oldPath: filePath,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Rename TV show file to Jellyfin format: "Title S##E##.ext"
   */
  async renameTV(
    filePath: string,
    mediaInfo: MediaInfo,
    options?: { dryRun?: boolean }
  ): Promise<RenameResult> {
    const dryRun = options?.dryRun || false;

    try {
      if (!mediaInfo.season || !mediaInfo.episode) {
        return {
          success: false,
          oldPath: filePath,
          error: "Could not parse TV show season/episode info",
        };
      }

      const extension = path.extname(filePath);
      const directory = path.dirname(filePath);

      // Generate new filename
      const season = String(mediaInfo.season).padStart(2, "0");
      const episode = String(mediaInfo.episode).padStart(2, "0");
      const newName = `${mediaInfo.title} S${season}E${episode}${extension}`;
      const newPath = path.join(directory, newName);

      // Check if already correctly named
      if (filePath === newPath) {
        return {
          success: true,
          oldPath: filePath,
          newPath,
          skipped: true,
        };
      }

      // Resolve conflicts
      const resolvedPath = await this.resolveConflict(newPath);
      if (resolvedPath === null) {
        return {
          success: false,
          oldPath: filePath,
          error: "Filename conflict - file exists",
          skipped: true,
        };
      }

      // Find subtitles
      const subtitles = await this.findSubtitles(filePath);

      if (dryRun) {
        return {
          success: true,
          oldPath: filePath,
          newPath: resolvedPath,
        };
      }

      // Rename video file
      await fs.rename(filePath, resolvedPath);

      // Rename subtitles
      if (subtitles.length > 0) {
        await this.renameSubtitles(filePath, resolvedPath, subtitles);
      }

      return {
        success: true,
        oldPath: filePath,
        newPath: resolvedPath,
      };
    } catch (error) {
      return {
        success: false,
        oldPath: filePath,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
