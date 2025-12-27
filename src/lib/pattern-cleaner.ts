/**
 * PatternCleaner - Clean filenames using regex patterns
 * Ported from Python jellyfin_renamer.py
 */

export class PatternCleaner {
  private readonly qualityPatterns: RegExp[] = [
    /[\._\-](?:1080p|2160p|720p|480p|4K|UHD)/i,
    /[\._\-](?:BluRay|BrRip|WEB-?DL|WEBRip|HDRip|DVDRip|HDTV|REMUX)/i,
    /[\._\-](?:x264|x265|h264|h265|HEVC|AVC)/i,
    /[\._\-](?:AAC|AC3|DTS|TrueHD|FLAC|Atmos)/i,
    /[\._\-](?:DTS-HD)/i,
    /[\._\-](?:MA)(?:[\._\-]|\s|$)/i,
    /[\._\-](?:HD)(?:[\._\-]|\s|$)/i,
    /[\._\-](?:5\.1|7\.1|2\.0|5\s1|7\s1|2\s0)/i,
    /[\._\-](?:NORDiC|NORDIC)/i,
    /[\._\-](?:ENG|ESP|LATINO|MULTi)/i,
    /[\._\-](?:Master|Remastered)/i,
    /[\._\-](?:DDP5\.1|DD\+5\.1)/i,
    /[\._\-](?:DV|HDR|SDR|HDR10|HDR10\+)/i,
    /[\._\-](?:PROPER|REPACK|INTERNAL)/i,
    /-[A-Z0-9]+$/,
  ];

  private readonly bracketPatterns: RegExp[] = [
    /\[.*?\]/,
    /\((?!(?:19|20)\d{2}\)).*?\)/, // Remove parentheses except for years
  ];

  private readonly otherPatterns: RegExp[] = [
    /www\.\S+\s*-\s*/, // Remove "www.site.com - " prefixes
    /\.(?:mkv|mp4|avi|mov|m4v|wmv)$/i,
  ];

  private customPatterns: RegExp[] = [];

  constructor(customPatterns?: string[]) {
    if (customPatterns) {
      for (const pattern of customPatterns) {
        try {
          this.customPatterns.push(new RegExp(pattern, "i"));
        } catch {
          // Skip invalid patterns
        }
      }
    }
  }

  /**
   * Clean filename of common torrent artifacts
   */
  clean(name: string): string {
    let cleaned = name;

    // Apply all pattern categories
    const allPatterns = [
      ...this.qualityPatterns,
      ...this.bracketPatterns,
      ...this.otherPatterns,
      ...this.customPatterns,
    ];

    for (const pattern of allPatterns) {
      cleaned = cleaned.replace(pattern, " ");
    }

    // Remove empty parentheses (multiple passes for nested)
    while (/\(\s*\)/.test(cleaned)) {
      cleaned = cleaned.replace(/\(\s*\)/g, "");
    }

    // Clean up multiple spaces and trim
    cleaned = cleaned.replace(/\s+/g, " ").trim();

    return cleaned;
  }

  /**
   * Clean filename for Seerr API search - also strips year in parentheses
   * since year is extracted and used separately for matching
   */
  cleanForSearch(name: string): string {
    // First apply normal cleaning
    let cleaned = this.clean(name);

    // Also strip years in parentheses (e.g., "(2002)") since Seerr API
    // doesn't accept parentheses in search queries
    cleaned = cleaned.replace(/\s*\((?:19|20)\d{2}\)\s*/g, " ");

    // Clean up multiple spaces and trim
    cleaned = cleaned.replace(/\s+/g, " ").trim();

    return cleaned;
  }
}
