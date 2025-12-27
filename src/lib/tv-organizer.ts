/**
 * TVOrganizer - Utility for organizing TV episodes into hierarchical folders
 * Target structure: Show Name/Season ## - Season Name/Show Name S##E##.ext
 */

import * as fs from "fs/promises";
import * as path from "path";
import { findAssociatedSubtitles } from "./file-scanner";
import {
  getMetadataFilePath,
  getPosterPath,
  getBackdropPath,
} from "./metadata-file";

export interface TVOrganizeResult {
  success: boolean;
  oldPath: string;
  newPath?: string;
  showFolder?: string;
  seasonFolder?: string;
  error?: string;
  filesMoved?: number;
}

export interface SeasonInfo {
  seasonNumber: number;
  seasonName?: string;
}

export class TVOrganizer {
  /**
   * Sanitize a string to be used as a folder name
   * Removes invalid filesystem characters and limits length
   */
  sanitizeFolderName(name: string): string {
    return (
      name
        .replace(/[:\*\?"<>\|\/\\]/g, "") // Remove invalid chars
        .replace(/\s+/g, " ") // Collapse multiple spaces
        .trim()
        .substring(0, 200) // Limit length to 200 chars
    );
  }

  /**
   * Format season folder name
   * @param seasonNumber - Season number (1, 2, 3, etc.)
   * @param seasonName - Optional season name from TMDB
   * @returns Formatted folder name like "Season 01" or "Season 01 - Season Name"
   */
  formatSeasonFolder(seasonNumber: number, seasonName?: string): string {
    const paddedNumber = String(seasonNumber).padStart(2, "0");

    if (seasonName && seasonName.toLowerCase() !== `season ${seasonNumber}`) {
      // Only include season name if it's not just "Season X"
      const sanitizedName = this.sanitizeFolderName(seasonName);
      return `Season ${paddedNumber} - ${sanitizedName}`;
    }

    return `Season ${paddedNumber}`;
  }

  /**
   * Get the target path for an episode
   * @returns Full path where the episode should be moved
   */
  getTargetPath(
    libraryPath: string,
    showName: string,
    seasonNumber: number,
    seasonName: string | undefined,
    fileName: string
  ): string {
    const sanitizedShowName = this.sanitizeFolderName(showName);
    const seasonFolderName = this.formatSeasonFolder(seasonNumber, seasonName);

    return path.join(libraryPath, sanitizedShowName, seasonFolderName, fileName);
  }

  /**
   * Check if a file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ensure the show/season folder structure exists
   * @returns Object with showFolder and seasonFolder paths
   */
  async ensureFolderStructure(
    libraryPath: string,
    showName: string,
    seasonNumber: number,
    seasonName?: string
  ): Promise<{ showFolder: string; seasonFolder: string }> {
    const sanitizedShowName = this.sanitizeFolderName(showName);
    const seasonFolderName = this.formatSeasonFolder(seasonNumber, seasonName);

    const showFolder = path.join(libraryPath, sanitizedShowName);
    const seasonFolder = path.join(showFolder, seasonFolderName);

    // Create folders if they don't exist
    await fs.mkdir(seasonFolder, { recursive: true });

    console.log(`[TVOrganizer] Ensured folder structure: ${seasonFolder}`);

    return { showFolder, seasonFolder };
  }

  /**
   * Move a single file with error handling
   */
  private async moveFile(
    oldPath: string,
    newPath: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Ensure target directory exists
      const targetDir = path.dirname(newPath);
      await fs.mkdir(targetDir, { recursive: true });

      await fs.rename(oldPath, newPath);
      console.log(`[TVOrganizer] Moved ${path.basename(oldPath)} to ${newPath}`);
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(
        `[TVOrganizer] Failed to move ${path.basename(oldPath)}: ${errorMsg}`
      );
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Organize an episode into the correct show/season folder structure
   * Moves the episode file along with associated subtitles and metadata
   */
  async organizeEpisode(
    currentPath: string,
    libraryPath: string,
    showName: string,
    seasonNumber: number,
    seasonName?: string
  ): Promise<TVOrganizeResult> {
    const fileName = path.basename(currentPath);
    const targetPath = this.getTargetPath(
      libraryPath,
      showName,
      seasonNumber,
      seasonName,
      fileName
    );

    // If already in the correct location, skip
    if (currentPath === targetPath) {
      return {
        success: true,
        oldPath: currentPath,
        newPath: targetPath,
        filesMoved: 0,
      };
    }

    // Check if target already exists
    if (await this.fileExists(targetPath)) {
      return {
        success: false,
        oldPath: currentPath,
        error: `Target file already exists: ${targetPath}`,
      };
    }

    try {
      // Ensure folder structure exists
      const { showFolder, seasonFolder } = await this.ensureFolderStructure(
        libraryPath,
        showName,
        seasonNumber,
        seasonName
      );

      let filesMoved = 0;

      // Move the video file
      const moveResult = await this.moveFile(currentPath, targetPath);
      if (!moveResult.success) {
        return {
          success: false,
          oldPath: currentPath,
          error: `Failed to move video file: ${moveResult.error}`,
        };
      }
      filesMoved++;

      // Find and move associated subtitle files
      try {
        const subtitles = await findAssociatedSubtitles(currentPath);
        for (const subPath of subtitles) {
          const subFileName = path.basename(subPath);
          const newSubPath = path.join(seasonFolder, subFileName);
          const subMoveResult = await this.moveFile(subPath, newSubPath);
          if (subMoveResult.success) {
            filesMoved++;
          }
        }
      } catch (error) {
        console.warn(
          `[TVOrganizer] Error finding/moving subtitles: ${error}`
        );
      }

      // Move metadata files if they exist
      const metadataFiles = [
        getMetadataFilePath(currentPath),
        getPosterPath(currentPath),
        getBackdropPath(currentPath),
      ];

      for (const metadataPath of metadataFiles) {
        if (await this.fileExists(metadataPath)) {
          const metadataFileName = path.basename(metadataPath);
          const newMetadataPath = path.join(seasonFolder, metadataFileName);
          const metaMoveResult = await this.moveFile(
            metadataPath,
            newMetadataPath
          );
          if (metaMoveResult.success) {
            filesMoved++;
          }
        }
      }

      return {
        success: true,
        oldPath: currentPath,
        newPath: targetPath,
        showFolder,
        seasonFolder,
        filesMoved,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[TVOrganizer] Error organizing ${fileName}: ${errorMsg}`);

      return {
        success: false,
        oldPath: currentPath,
        error: errorMsg,
      };
    }
  }

  /**
   * Check if an episode needs to be organized (not in correct folder structure)
   */
  isInCorrectLocation(
    currentPath: string,
    libraryPath: string,
    showName: string,
    seasonNumber: number,
    seasonName?: string
  ): boolean {
    const fileName = path.basename(currentPath);
    const expectedPath = this.getTargetPath(
      libraryPath,
      showName,
      seasonNumber,
      seasonName,
      fileName
    );

    return currentPath === expectedPath;
  }

  /**
   * Get info about where an episode would be moved to
   */
  getOrganizationPreview(
    currentPath: string,
    libraryPath: string,
    showName: string,
    seasonNumber: number,
    seasonName?: string
  ): {
    currentPath: string;
    targetPath: string;
    showFolder: string;
    seasonFolder: string;
    needsMove: boolean;
  } {
    const fileName = path.basename(currentPath);
    const sanitizedShowName = this.sanitizeFolderName(showName);
    const seasonFolderName = this.formatSeasonFolder(seasonNumber, seasonName);

    const showFolder = path.join(libraryPath, sanitizedShowName);
    const seasonFolder = path.join(showFolder, seasonFolderName);
    const targetPath = path.join(seasonFolder, fileName);

    return {
      currentPath,
      targetPath,
      showFolder,
      seasonFolder,
      needsMove: currentPath !== targetPath,
    };
  }

  /**
   * Clean up empty folders after organizing
   * Removes empty show/season folders
   */
  async cleanupEmptyFolders(folderPath: string, libraryPath: string): Promise<void> {
    try {
      // Don't remove library root
      if (folderPath === libraryPath) {
        return;
      }

      const entries = await fs.readdir(folderPath);

      // If folder is empty, remove it
      if (entries.length === 0) {
        await fs.rmdir(folderPath);
        console.log(`[TVOrganizer] Removed empty folder: ${folderPath}`);

        // Recursively check parent
        const parentDir = path.dirname(folderPath);
        if (parentDir !== libraryPath) {
          await this.cleanupEmptyFolders(parentDir, libraryPath);
        }
      }
    } catch (error) {
      // Ignore errors during cleanup
      console.warn(`[TVOrganizer] Could not clean up folder ${folderPath}: ${error}`);
    }
  }
}
