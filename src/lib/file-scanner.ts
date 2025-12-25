import fg from "fast-glob";
import path from "path";
import fs from "fs/promises";

// Video file extensions to scan for
const VIDEO_EXTENSIONS = [
  "mkv",
  "mp4",
  "avi",
  "mov",
  "m4v",
  "wmv",
  "flv",
  "webm",
  "mpg",
  "mpeg",
  "ts",
  "m2ts",
];

// Subtitle file extensions
const SUBTITLE_EXTENSIONS = ["srt", "sub", "ass", "ssa", "vtt", "idx"];

// Patterns to ignore (sample files, extras, etc.)
const IGNORE_PATTERNS = [
  "**/Sample/**",
  "**/sample/**",
  "**/SAMPLE/**",
  "**/Extras/**",
  "**/extras/**",
  "**/Featurettes/**",
  "**/Behind The Scenes/**",
  "**/.DS_Store",
  "**/Thumbs.db",
  "**/@eaDir/**",
  "**/#recycle/**",
];

export interface ScannedFile {
  filePath: string; // Absolute path
  relativePath: string; // Relative to library root
  fileName: string;
  fileSize: number;
  fileExtension: string;
  isSubtitle: boolean;
}

export interface ScanResult {
  videoFiles: ScannedFile[];
  subtitleFiles: ScannedFile[];
  totalSize: number;
  errors: string[];
}

/**
 * Scan a directory for video and subtitle files
 */
export async function scanLibraryPath(libraryPath: string): Promise<ScanResult> {
  const result: ScanResult = {
    videoFiles: [],
    subtitleFiles: [],
    totalSize: 0,
    errors: [],
  };

  try {
    // Verify the path exists and is accessible
    await fs.access(libraryPath, fs.constants.R_OK);

    // Build glob pattern for video files
    const videoPattern = `**/*.{${VIDEO_EXTENSIONS.join(",")}}`;
    const subtitlePattern = `**/*.{${SUBTITLE_EXTENSIONS.join(",")}}`;

    // Scan for video files
    const videoFiles = await fg(videoPattern, {
      cwd: libraryPath,
      absolute: true,
      ignore: IGNORE_PATTERNS,
      onlyFiles: true,
      followSymbolicLinks: false,
      caseSensitiveMatch: false,
    });

    // Scan for subtitle files
    const subtitleFiles = await fg(subtitlePattern, {
      cwd: libraryPath,
      absolute: true,
      ignore: IGNORE_PATTERNS,
      onlyFiles: true,
      followSymbolicLinks: false,
      caseSensitiveMatch: false,
    });

    // Process video files
    for (const filePath of videoFiles) {
      try {
        const stats = await fs.stat(filePath);
        const relativePath = path.relative(libraryPath, filePath);
        const fileName = path.basename(filePath);
        const fileExtension = path.extname(filePath).slice(1).toLowerCase();

        result.videoFiles.push({
          filePath,
          relativePath,
          fileName,
          fileSize: stats.size,
          fileExtension,
          isSubtitle: false,
        });

        result.totalSize += stats.size;
      } catch (error) {
        result.errors.push(`Failed to stat ${filePath}: ${error}`);
      }
    }

    // Process subtitle files
    for (const filePath of subtitleFiles) {
      try {
        const stats = await fs.stat(filePath);
        const relativePath = path.relative(libraryPath, filePath);
        const fileName = path.basename(filePath);
        const fileExtension = path.extname(filePath).slice(1).toLowerCase();

        result.subtitleFiles.push({
          filePath,
          relativePath,
          fileName,
          fileSize: stats.size,
          fileExtension,
          isSubtitle: true,
        });
      } catch (error) {
        result.errors.push(`Failed to stat ${filePath}: ${error}`);
      }
    }

    return result;
  } catch (error) {
    result.errors.push(`Failed to scan ${libraryPath}: ${error}`);
    return result;
  }
}

/**
 * Get file info for a single file
 */
export async function getFileInfo(
  filePath: string,
  libraryPath: string
): Promise<ScannedFile | null> {
  try {
    const stats = await fs.stat(filePath);
    const relativePath = path.relative(libraryPath, filePath);
    const fileName = path.basename(filePath);
    const fileExtension = path.extname(filePath).slice(1).toLowerCase();

    return {
      filePath,
      relativePath,
      fileName,
      fileSize: stats.size,
      fileExtension,
      isSubtitle: SUBTITLE_EXTENSIONS.includes(fileExtension),
    };
  } catch {
    return null;
  }
}

/**
 * Check if a path is a valid media directory
 */
export async function isValidMediaDirectory(
  directoryPath: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    const stats = await fs.stat(directoryPath);

    if (!stats.isDirectory()) {
      return { valid: false, error: "Path is not a directory" };
    }

    // Check read access
    await fs.access(directoryPath, fs.constants.R_OK);

    return { valid: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { valid: false, error: "Directory does not exist" };
    }
    if ((error as NodeJS.ErrnoException).code === "EACCES") {
      return { valid: false, error: "Permission denied" };
    }
    return { valid: false, error: `Unknown error: ${error}` };
  }
}

/**
 * Find subtitle files associated with a video file
 */
export async function findAssociatedSubtitles(
  videoPath: string
): Promise<string[]> {
  const dir = path.dirname(videoPath);
  const baseName = path.basename(videoPath, path.extname(videoPath));

  const subtitles: string[] = [];

  for (const ext of SUBTITLE_EXTENSIONS) {
    // Match exact name (e.g., "Movie.srt")
    const exactPath = path.join(dir, `${baseName}.${ext}`);
    if (await fileExists(exactPath)) {
      subtitles.push(exactPath);
    }

    // Match with language code (e.g., "Movie.en.srt", "Movie.eng.srt")
    const langPattern = path.join(dir, `${baseName}.*.${ext}`);
    const matches = await fg(langPattern, {
      absolute: true,
      onlyFiles: true,
    });
    subtitles.push(...matches.filter((m) => !subtitles.includes(m)));
  }

  return subtitles;
}

/**
 * Check if a file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(unitIndex > 0 ? 1 : 0)} ${units[unitIndex]}`;
}

export { VIDEO_EXTENSIONS, SUBTITLE_EXTENSIONS };
