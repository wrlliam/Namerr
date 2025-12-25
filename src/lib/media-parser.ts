/**
 * MediaParser - Parse media information from filenames
 * Ported from Python jellyfin_renamer.py
 */

import { PatternCleaner } from "./pattern-cleaner";
import type { MediaInfo } from "@/src/types/media";

export class MediaParser {
  private cleaner: PatternCleaner;
  private yearRange: { min: number; max: number };

  // TV show patterns
  private readonly tvPatterns: RegExp[] = [
    /[Ss](\d{1,2})[Ee](\d{1,2})(?:-?[Ee](\d{1,2}))?/, // S01E01 or S01E01-E02
    /(\d{1,2})x(\d{1,2})/, // 1x01
    /[Ss]eason[\._\s]*(\d{1,2})[\._\s]*[Ee]pisode[\._\s]*(\d{1,2})/i,
  ];

  // Year pattern
  private readonly yearPattern = /\b(19\d{2}|20\d{2})\b/;

  // Movie format pattern
  private readonly movieFormat = /^(.+?)\s*\((\d{4})\)$/;

  // TV format pattern
  private readonly tvFormat = /^(.+?)\s+S(\d{2})E(\d{2})$/i;

  constructor(
    cleaner?: PatternCleaner,
    yearRange: { min: number; max: number } = { min: 1900, max: 2030 }
  ) {
    this.cleaner = cleaner || new PatternCleaner();
    this.yearRange = yearRange;
  }

  /**
   * Check if year is within valid range
   */
  isValidYear(year: string): boolean {
    try {
      const yearInt = parseInt(year, 10);
      return yearInt >= this.yearRange.min && yearInt <= this.yearRange.max;
    } catch {
      return false;
    }
  }

  /**
   * Extract movie title and year from filename
   */
  extractMovieInfo(filename: string): MediaInfo {
    // Check if already in correct format
    const correctFormat = filename.match(this.movieFormat);
    if (correctFormat) {
      const title = correctFormat[1].trim();
      const year = correctFormat[2];
      if (this.isValidYear(year)) {
        return { title, year };
      }
    }

    // Check for malformed formats
    const malformedWithYear = filename.match(/^(.+?)\s*\(\s*\(\s*(\d{4})\)$/);
    if (malformedWithYear) {
      const title = malformedWithYear[1].trim();
      const year = malformedWithYear[2];
      if (this.isValidYear(year)) {
        return { title, year };
      }
    }

    const malformedEmpty = filename.match(/^(.+?)\s*\(\s*\($/);
    if (malformedEmpty) {
      let title = malformedEmpty[1].trim();
      const yearMatch = title.match(this.yearPattern);
      if (yearMatch && this.isValidYear(yearMatch[1])) {
        const year = yearMatch[1];
        title = title.substring(0, yearMatch.index).trim();
        return { title, year };
      }
      return { title };
    }

    // Extract year from anywhere in filename
    const years = filename.match(new RegExp(this.yearPattern, "g"));
    const validYears = years
      ? years.filter((y) => this.isValidYear(y))
      : [];

    if (validYears.length > 0) {
      // Use the first valid year
      const year = validYears[0];
      const yearMatch = filename.match(this.yearPattern);
      let title = filename.substring(0, yearMatch!.index);
      title = this.cleaner.clean(title);
      title = title.replace(/[\._]+/g, " ").trim();

      if (!title) {
        title = this.cleaner.clean(filename);
        title = title.replace(/[\._]+/g, " ").trim();
        title = title.replace(new RegExp(`\\b${year}\\b`), "").trim();
      }

      return { title, year };
    } else {
      let title = this.cleaner.clean(filename);
      title = title.replace(/[\._]+/g, " ").trim();
      return { title };
    }
  }

  /**
   * Extract TV show info: title, season, episode
   */
  extractTVInfo(filename: string): MediaInfo {
    // Check if already in correct format
    const correctFormat = filename.match(this.tvFormat);
    if (correctFormat) {
      return {
        title: correctFormat[1].trim(),
        season: parseInt(correctFormat[2], 10),
        episode: parseInt(correctFormat[3], 10),
      };
    }

    // Try various patterns
    for (const pattern of this.tvPatterns) {
      const match = filename.match(pattern);
      if (match) {
        const season = parseInt(match[1], 10);
        const episode = parseInt(match[2], 10);

        // Check for multi-episode
        // (we'll just use the first episode for now)

        let title = filename.substring(0, match.index);
        title = this.cleaner.clean(title);
        title = title.replace(/[\._]+/g, " ").trim();

        return {
          title,
          season,
          episode,
        };
      }
    }

    return { title: "" };
  }
}
