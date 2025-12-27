/**
 * FileOrganizer - Utility for organizing rogue video files into folders
 * Handles moving files, subtitles, and metadata files into properly structured directories
 */

import * as fs from "fs/promises";
import * as path from "path";
import { findAssociatedSubtitles } from "./file-scanner";
import {
  getMetadataFilePath,
  getPosterPath,
  getBackdropPath,
} from "./metadata-file";

export interface OrganizeResult {
  success: boolean;
  oldPath: string;
  newPath?: string;
  folderCreated?: string;
  error?: string;
  filesMoved?: number;
}

export class FileOrganizer {
  /**
   * Sanitize a filename to be used as a folder name
   * Removes invalid filesystem characters and limits length
   */
  sanitizeFolderName(filename: string): string {
    return (
      filename
        .replace(/\.[^.]+$/, "") // Remove extension
        .replace(/[:\*\?"<>\|\/\\]/g, "") // Remove invalid chars
        .replace(/\s+/g, " ") // Collapse multiple spaces
        .trim()
        .substring(0, 200) // Limit length to 200 chars
    );
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
   * Move a single file with error handling
   */
  private async moveFile(
    oldPath: string,
    newPath: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await fs.rename(oldPath, newPath);
      console.log(`[FileOrganizer] Moved ${path.basename(oldPath)} to ${newPath}`);
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(
        `[FileOrganizer] Failed to move ${path.basename(oldPath)}: ${errorMsg}`
      );
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Organize a rogue video file into its own folder
   * Creates a folder with the sanitized filename and moves the video file,
   * associated subtitles, and metadata files into it
   */
  async organizeRogueFile(
    videoPath: string,
    libraryPath: string
  ): Promise<OrganizeResult> {
    const fileName = path.basename(videoPath);
    const currentDir = path.dirname(videoPath);

    // Check if file is actually in library root
    const relativePath = path.relative(libraryPath, videoPath);
    const relativeDir = path.dirname(relativePath);
    if (relativeDir !== "." && relativeDir !== "") {
      return {
        success: false,
        oldPath: videoPath,
        error: "File is not in library root directory",
      };
    }

    // Generate sanitized folder name
    const folderName = this.sanitizeFolderName(fileName);
    if (!folderName) {
      return {
        success: false,
        oldPath: videoPath,
        error: "Could not generate valid folder name",
      };
    }

    const folderPath = path.join(currentDir, folderName);

    // Check if folder already exists
    if (await this.fileExists(folderPath)) {
      console.log(
        `[FileOrganizer] Folder already exists for ${fileName}, skipping organization`
      );
      return {
        success: false,
        oldPath: videoPath,
        error: `Folder ${folderName} already exists`,
      };
    }

    try {
      // Create the folder
      await fs.mkdir(folderPath, { recursive: true });
      console.log(`[FileOrganizer] Created folder: ${folderPath}`);

      let filesMoved = 0;

      // Move the video file
      const newVideoPath = path.join(folderPath, fileName);
      const moveResult = await this.moveFile(videoPath, newVideoPath);
      if (!moveResult.success) {
        // Cleanup: remove empty folder
        try {
          await fs.rmdir(folderPath);
        } catch {}
        return {
          success: false,
          oldPath: videoPath,
          error: `Failed to move video file: ${moveResult.error}`,
        };
      }
      filesMoved++;

      // Find and move associated subtitle files
      try {
        const subtitles = await findAssociatedSubtitles(videoPath);
        for (const subPath of subtitles) {
          const subFileName = path.basename(subPath);
          const newSubPath = path.join(folderPath, subFileName);
          const subMoveResult = await this.moveFile(subPath, newSubPath);
          if (subMoveResult.success) {
            filesMoved++;
          }
        }
      } catch (error) {
        console.warn(
          `[FileOrganizer] Error finding/moving subtitles: ${error}`
        );
      }

      // Move metadata files if they exist
      const metadataFiles = [
        getMetadataFilePath(videoPath),
        getPosterPath(videoPath),
        getBackdropPath(videoPath),
      ];

      for (const metadataPath of metadataFiles) {
        if (await this.fileExists(metadataPath)) {
          const metadataFileName = path.basename(metadataPath);
          const newMetadataPath = path.join(folderPath, metadataFileName);
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
        oldPath: videoPath,
        newPath: newVideoPath,
        folderCreated: folderPath,
        filesMoved,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[FileOrganizer] Error organizing ${fileName}: ${errorMsg}`);

      // Attempt to cleanup: remove folder if it's empty
      try {
        await fs.rmdir(folderPath);
      } catch {}

      return {
        success: false,
        oldPath: videoPath,
        error: errorMsg,
      };
    }
  }

  /**
   * Organize multiple rogue files
   * Returns an array of results for each file
   */
  async organizeMultipleFiles(
    videoPaths: string[],
    libraryPath: string
  ): Promise<OrganizeResult[]> {
    const results: OrganizeResult[] = [];

    for (const videoPath of videoPaths) {
      const result = await this.organizeRogueFile(videoPath, libraryPath);
      results.push(result);
    }

    return results;
  }
}
