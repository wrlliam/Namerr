/**
 * SeerrClient - Seerr (Overseerr/Jellyseerr) API integration
 * Ported from Python jellyfin_renamer.py
 */

import type {
  SeerrMediaResult,
  SeerrSearchResponse,
  SeerrRequest,
  SeerrRequestsResponse,
  SeerrMovieData,
  SeerrTVData,
  SeerrVerifyResult,
  SeerrStats,
  SeerrTestConnectionResult,
} from "@/src/types/seerr";
import { retryFetch, retry } from "./retry";
import { seerrCache } from "./cache";

export class SeerrClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, ""); // Remove trailing slash
  }

  /**
   * Make API request with caching and retry logic
   */
  private async makeRequest<T>(
    endpoint: string,
    params?: Record<string, string | number>,
    cacheTTL?: number,
    forceRefresh = false
  ): Promise<T | null> {
    const cacheKey = `${endpoint}:${JSON.stringify(params || {})}`;

    if (forceRefresh) {
      try {
        await seerrCache.del(cacheKey);
      } catch {
        // Ignore cache clear failures
      }
    }

    // Try to get from cache unless forceRefresh
    if (!forceRefresh) {
      const cached = await seerrCache.get<T>(cacheKey);
      if (cached !== null) {
        return cached;
      }
    }

    try {
      const url = new URL(`/api/v1/${endpoint}`, this.baseUrl);
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          // Use encodeURIComponent for proper %20 encoding (Seerr doesn't accept + for spaces)
          url.searchParams.append(key, String(value));
        });
      }
      // Replace + with %20 since Seerr requires %20 encoding for spaces
      const urlString = url.toString().replace(/\+/g, "%20");

      const response = await retryFetch(
        urlString,
        {
          headers: {
            "X-Api-Key": this.apiKey,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(10000), // 10 second timeout
        },
        {
          maxAttempts: 3,
          initialDelay: 1000,
          maxDelay: 10000,
          onRetry: (error, attempt, delay) => {
            console.log(
              `[Seerr ${endpoint}] Retry ${attempt} after error: ${error.message}`
            );
          },
        }
      );

      const data = await response.json();

      // Store in cache with TTL
      // Search results: 1 hour, metadata: 24 hours
      const ttl = cacheTTL ?? (endpoint.includes("search") ? 3600 : 86400);
      await seerrCache.set(cacheKey, data, ttl);

      return data as T;
    } catch (error) {
      console.error(`[Seerr ${endpoint}] Request failed after retries:`, error);
      return null;
    }
  }

  /**
   * Test connection to Seerr API
   */
  async testConnection(): Promise<SeerrTestConnectionResult> {
    try {
      const url = new URL("/api/v1/status", this.baseUrl);
      const response = await retryFetch(
        url.toString(),
        {
          headers: {
            "X-Api-Key": this.apiKey,
          },
          signal: AbortSignal.timeout(5000),
        },
        {
          maxAttempts: 2, // Only retry once for connection test
          initialDelay: 500,
        }
      );

      const data = (await response.json()) as { version?: string };
      return {
        success: true,
        version: data.version || "unknown",
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get all user requests from Seerr
   */
  async getUserRequests(forceRefresh = false): Promise<SeerrRequest[]> {
    const cacheKey = "user_requests:all";

    // If force refresh, delete existing cached list
    if (forceRefresh) {
      try {
        await seerrCache.del(cacheKey);
      } catch {
        // Ignore cache clear failures
      }
    }

    // Check cache unless force refresh
    if (!forceRefresh) {
      const cached = await seerrCache.get<SeerrRequest[]>(cacheKey);
      if (cached) {
        return cached;
      }
    }
    const allRequests: SeerrRequest[] = [];

    try {
      // Get first page
      const firstPage = await this.makeRequest<SeerrRequestsResponse>(
        "request",
        {
          filter: "all",
          sort: "added",
        },
        600, // 10 minutes TTL for requests list
        forceRefresh
      );

      if (firstPage?.results) {
        allRequests.push(...firstPage.results);
      }

      // Fetch additional pages if needed
      const totalPages = firstPage?.pageInfo?.pages || 1;
      if (totalPages > 1) {
        for (let page = 2; page <= totalPages; page++) {
          const pageData = await this.makeRequest<SeerrRequestsResponse>(
            "request",
            {
              filter: "all",
              sort: "added",
              skip: (page - 1) * 20,
            },
            600,
            forceRefresh
          );

          if (pageData?.results) {
            allRequests.push(...pageData.results);
          }
        }
      }

      // Cache the complete list
      await seerrCache.set(cacheKey, allRequests, 600);
      return allRequests;
    } catch {
      return [];
    }
  }

  /**
   * Search for media in Seerr
   */
  async searchMedia(
    query: string,
    mediaType: "movie" | "tv" = "movie",
    forceRefresh = false
  ): Promise<SeerrMediaResult[]> {
    const data = await this.makeRequest<SeerrSearchResponse>(
      "search",
      {
        query,
        page: 1,
      },
      3600,
      forceRefresh
    );

    if (data?.results) {
      return data.results.filter((r) => r.mediaType === mediaType);
    }

    return [];
  }

  /**
   * Calculate fuzzy match score between two titles
   */
  fuzzyMatchTitle(
    searchTitle: string,
    candidateTitle: string,
    threshold = 0.8
  ): number {
    // Normalize string: lowercase, remove punctuation, collapse spaces
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    const s = normalize(searchTitle);
    const c = normalize(candidateTitle);

    if (!s || !c) return 0.0;

    // Exact match
    if (s === c) return 1.0;

    // Sequel/series indicators that should NOT be ignored
    const sequelIndicators = new Set([
      "2", "3", "4", "5", "6", "7", "8", "9", "10",
      "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x",
      "part", "chapter", "volume", "vol",
    ]);

    // Token-based Dice coefficient (better for titles)
    const stopwords = new Set([
      "the",
      "a",
      "an",
      "and",
      "of",
      "in",
      "to",
      "for",
    ]);

    const sTokens = s.split(" ").filter((t) => !stopwords.has(t));
    const cTokens = c.split(" ").filter((t) => !stopwords.has(t));

    // Check for sequel mismatch - if one has a number/sequel indicator and the other doesn't
    const sSequelTokens = sTokens.filter((t) => sequelIndicators.has(t) || /^\d+$/.test(t));
    const cSequelTokens = cTokens.filter((t) => sequelIndicators.has(t) || /^\d+$/.test(t));

    // If candidate has sequel indicators that search doesn't have (or vice versa), penalize heavily
    const sHasSequel = sSequelTokens.length > 0;
    const cHasSequel = cSequelTokens.length > 0;

    // If they both have sequel indicators, they must match
    if (sHasSequel && cHasSequel) {
      const sSequelSet = new Set(sSequelTokens);
      const cSequelSet = new Set(cSequelTokens);
      const sequelMatch = [...sSequelSet].some((t) => cSequelSet.has(t));
      if (!sequelMatch) {
        // Different sequel numbers (e.g., "2" vs "3") - very low score
        return 0.3;
      }
    } else if (sHasSequel !== cHasSequel) {
      // One has a sequel indicator and the other doesn't
      // e.g., "Now You See Me" vs "Now You See Me 2"
      // This is likely NOT the same movie, penalize heavily
      return 0.4;
    }

    const sSet = new Set(sTokens);
    const cSet = new Set(cTokens);

    const intersection = [...sSet].filter((t) => cSet.has(t)).length;
    const dice = (2 * intersection) / (sSet.size + cSet.size);

    // If both strings are effectively single-token (short titles), fallback to a length ratio
    if (sSet.size <= 1 && cSet.size <= 1) {
      const shorter = Math.min(s.length, c.length);
      const longer = Math.max(s.length, c.length);
      const ratio = shorter / longer;

      // Slightly prefer containment if one contains the other
      if (s.includes(c) || c.includes(s)) {
        return Math.max(ratio, 0.6);
      }

      return ratio;
    }

    // Check if one title contains the other (after normalization)
    // But only boost if they have the same sequel status
    if ((s.includes(c) || c.includes(s)) && sHasSequel === cHasSequel) {
      const longer = Math.max(s.length, c.length);
      const shorter = Math.min(s.length, c.length);
      const containmentScore = (shorter / longer) * 1.1;
      // Return the max of dice coefficient and containment score
      return Math.max(dice, containmentScore);
    }

    return Number.isFinite(dice) ? dice : 0.0;
  }

  /**
   * Find a matching request in the user's Seerr requests
   */
  async findMatchingRequest(
    title: string,
    year?: string,
    mediaType: "movie" | "tv" = "movie",
    threshold = 0.8,
    forceRefresh = false
  ): Promise<SeerrRequest | null> {
    const requests = await this.getUserRequests(forceRefresh);

    let bestMatch: SeerrRequest | null = null;
    let bestScore = 0.0;

    for (const request of requests) {
      // Check media type
      if (request.type !== mediaType) {
        continue;
      }

      // Get title from request
      const requestTitle =
        mediaType === "movie"
          ? request.media.title || ""
          : request.media.name || "";
      const requestYear =
        mediaType === "movie"
          ? request.media.releaseDate?.substring(0, 4)
          : request.media.firstAirDate?.substring(0, 4);

      // Skip requests without a title
      if (!requestTitle.trim()) {
        continue;
      }

      // Calculate match score
      let titleScore = this.fuzzyMatchTitle(title, requestTitle, threshold);

      // Boost score if years match, with ±1 year tolerance
      if (year && requestYear) {
        const yearInt = parseInt(year);
        const requestYearInt = parseInt(requestYear);
        if (year === requestYear || Math.abs(yearInt - requestYearInt) <= 1) {
          titleScore = Math.min(1.0, titleScore * 1.2);
        } else {
          titleScore *= 0.7; // Penalize year mismatch
        }
      }

      if (titleScore > bestScore && titleScore >= threshold) {
        bestScore = titleScore;
        bestMatch = request;
      }
    }

    if (bestMatch) {
      console.log(
        `[Seerr] Request match: "${title}" -> "${bestMatch.media.title || bestMatch.media.name}" (${(bestScore * 100).toFixed(0)}%)`
      );
    }

    return bestMatch;
  }

  /**
   * Verify a movie against Seerr requests and media database
   */
  async verifyMovie(
    title: string,
    year?: string,
    threshold = 0.8,
    forceRefresh = false,
    fileName?: string
  ): Promise<SeerrVerifyResult<SeerrMovieData>> {
    let searchResults = await this.searchMedia(title, "movie", forceRefresh);

    // If no results, try fallback queries using filename (if provided)
    if ((!searchResults || searchResults.length === 0) && fileName) {
      const { PatternCleaner } = await import("./pattern-cleaner");
      const cleaner = new PatternCleaner();
      const cleaned = cleaner.cleanForSearch(fileName);

      searchResults = await this.searchMedia(cleaned, "movie", forceRefresh);

      // Try cleaned + year if still nothing
      if ((!searchResults || searchResults.length === 0) && year) {
        const q = `${cleaned} ${year}`;
        searchResults = await this.searchMedia(q, "movie", forceRefresh);
      }
    }

    if (searchResults && searchResults.length > 0) {
      // Score ALL results (not just first 5)
      const scoredResults = searchResults.map((result) => {
        const resultTitle = result.title || "";
        const resultYear = result.releaseDate?.substring(0, 4);
        let score = this.fuzzyMatchTitle(title, resultTitle, threshold);

        // Apply year matching with ±1 year tolerance
        if (year && resultYear) {
          const yearInt = parseInt(year);
          const resultYearInt = parseInt(resultYear);
          if (year === resultYear || Math.abs(yearInt - resultYearInt) <= 1) {
            score = Math.min(1.0, score * 1.2);
          } else {
            score *= 0.7; // Penalize year mismatch
          }
        }

        return { result, score, resultTitle, resultYear };
      });

      // Sort by score DESCENDING
      scoredResults.sort((a, b) => b.score - a.score);

      // Log condensed top 3 candidates
      const top3 = scoredResults.slice(0, 3).map(
        (item) => `"${item.resultTitle}" (${item.resultYear || "?"}) ${(item.score * 100).toFixed(0)}%`
      );
      console.log(`[Seerr] Movie "${title}" -> candidates: ${top3.join(" | ")}`);

      // Select best match above threshold
      const bestScoredResult = scoredResults[0];
      if (bestScoredResult && bestScoredResult.score >= threshold) {
        const bestMatch = bestScoredResult.result;
        const bestScore = bestScoredResult.score;

        console.log(
          `[Seerr] Movie matched: "${title}" -> "${bestMatch.title}" (${(bestScore * 100).toFixed(0)}%)`
        );

        return {
          verified: true,
          data: {
            title: bestMatch.title || title,
            release_date: bestMatch.releaseDate || "",
            overview: bestMatch.overview || "",
            id: bestMatch.id,
            vote_average: bestMatch.voteAverage,
            poster_path: bestMatch.posterPath || bestMatch.poster_path || null,
            backdrop_path:
              (bestMatch as any).backdropPath ||
              (bestMatch as any).backdrop_path ||
              null,
            source: "seerr_search",
            match_score: bestScore,
          },
        };
      } else {
        console.log(
          `[Seerr] Movie no match: "${title}" (best: ${(bestScoredResult?.score * 100 || 0).toFixed(0)}% < ${(threshold * 100).toFixed(0)}%)`
        );
      }
    }

    // Fallback: check user requests
    const requestMatch = await this.findMatchingRequest(
      title,
      year,
      "movie",
      threshold,
      forceRefresh
    );

    if (requestMatch) {
      const media = requestMatch.media;
      const requestTitle = media.title || "";
      const computedScore = this.fuzzyMatchTitle(
        title,
        requestTitle,
        threshold
      );
      console.log(
        `[Seerr] Movie matched (request): "${title}" -> "${requestTitle}" (${(computedScore * 100).toFixed(0)}%)`
      );

      return {
        verified: true,
        data: {
          title: media.title || title,
          release_date: media.releaseDate || "",
          overview: media.overview || "",
          id: media.tmdbId,
          vote_average: media.voteAverage,
          poster_path: media.posterPath || media.poster_path || null,
          backdrop_path:
            (media as any).backdropPath || (media as any).backdrop_path || null,
          source: "seerr_request",
          request_status: requestMatch.status,
          match_score: computedScore,
        },
      };
    }

    return { verified: false };
  }

  /**
   * Verify a TV show against Seerr requests and media database
   */
  async verifyTV(
    title: string,
    threshold = 0.8,
    forceRefresh = false,
    fileName?: string
  ): Promise<SeerrVerifyResult<SeerrTVData>> {
    let searchResults = await this.searchMedia(title, "tv", forceRefresh);

    // If nothing found, try filename-based fallback if available
    if ((!searchResults || searchResults.length === 0) && fileName) {
      const { PatternCleaner } = await import("./pattern-cleaner");
      const cleaner = new PatternCleaner();
      const cleaned = cleaner.cleanForSearch(fileName);
      searchResults = await this.searchMedia(cleaned, "tv", forceRefresh);
    }

    if (searchResults && searchResults.length > 0) {
      // Score ALL results (not just first 5)
      const scoredResults = searchResults.map((result) => {
        const resultTitle = result.name || "";
        const resultYear = result.firstAirDate?.substring(0, 4);
        const score = this.fuzzyMatchTitle(title, resultTitle, threshold);

        return { result, score, resultTitle, resultYear };
      });

      // Sort by score DESCENDING
      scoredResults.sort((a, b) => b.score - a.score);

      // Log condensed top 3 candidates
      const top3 = scoredResults.slice(0, 3).map(
        (item) => `"${item.resultTitle}" (${item.resultYear || "?"}) ${(item.score * 100).toFixed(0)}%`
      );
      console.log(`[Seerr] TV "${title}" -> candidates: ${top3.join(" | ")}`);

      // Select best match above threshold
      const bestScoredResult = scoredResults[0];
      if (bestScoredResult && bestScoredResult.score >= threshold) {
        const bestMatch = bestScoredResult.result;
        const bestScore = bestScoredResult.score;

        console.log(
          `[Seerr] TV matched: "${title}" -> "${bestMatch.name}" (${(bestScore * 100).toFixed(0)}%)`
        );

        return {
          verified: true,
          data: {
            name: bestMatch.name || title,
            first_air_date: bestMatch.firstAirDate || "",
            overview: bestMatch.overview || "",
            id: bestMatch.id,
            vote_average: bestMatch.voteAverage,
            poster_path: bestMatch.posterPath || bestMatch.poster_path || null,
            backdrop_path:
              (bestMatch as any).backdropPath ||
              (bestMatch as any).backdrop_path ||
              null,
            source: "seerr_search",
            match_score: bestScore,
          },
        };
      } else {
        console.log(
          `[Seerr] TV no match: "${title}" (best: ${(bestScoredResult?.score * 100 || 0).toFixed(0)}% < ${(threshold * 100).toFixed(0)}%)`
        );
      }
    }

    // Fallback: check user requests
    const requestMatch = await this.findMatchingRequest(
      title,
      undefined,
      "tv",
      threshold,
      forceRefresh
    );

    if (requestMatch) {
      const media = requestMatch.media;
      const requestTitle = media.name || "";
      const computedScore = this.fuzzyMatchTitle(
        title,
        requestTitle,
        threshold
      );
      console.log(
        `[Seerr] TV matched (request): "${title}" -> "${requestTitle}" (${(computedScore * 100).toFixed(0)}%)`
      );

      return {
        verified: true,
        data: {
          name: media.name || title,
          first_air_date: media.firstAirDate || "",
          overview: media.overview || "",
          id: media.tmdbId,
          vote_average: media.voteAverage,
          poster_path: media.posterPath || media.poster_path || null,
          backdrop_path:
            (media as any).backdropPath || (media as any).backdrop_path || null,
          source: "seerr_request",
          request_status: requestMatch.status,
          match_score: computedScore,
        },
      };
    }

    return { verified: false };
  }

  /**
   * Get statistics about user requests
   */
  async getRequestStats(): Promise<SeerrStats> {
    const requests = await this.getUserRequests();

    const stats: SeerrStats = {
      total: requests.length,
      pending: 0,
      approved: 0,
      available: 0,
      movies: 0,
      tv: 0,
    };

    for (const request of requests) {
      const status = request.status || 0;
      const type = request.type;

      if (status === 1) {
        stats.pending++;
      } else if (status === 2) {
        stats.approved++;
      } else if (status === 3) {
        stats.available++;
      }

      if (type === "movie") {
        stats.movies++;
      } else if (type === "tv") {
        stats.tv++;
      }
    }

    return stats;
  }

  /**
   * Get movie credits (cast) from TMDB via Seerr
   */
  async getMovieCredits(tmdbId: number): Promise<any[]> {
    const data = await this.makeRequest<any>(`movie/${tmdbId}/credits`);
    if (data?.cast) {
      // Return top 10 cast members
      return data.cast.slice(0, 10).map((person: any) => ({
        name: person.name,
        character: person.character,
        profile_path: person.profile_path,
      }));
    }
    return [];
  }

  /**
   * Get TV show credits (cast) from TMDB via Seerr
   */
  async getTVCredits(tmdbId: number): Promise<any[]> {
    const data = await this.makeRequest<any>(`tv/${tmdbId}/credits`);
    if (data?.cast) {
      // Return top 10 cast members
      return data.cast.slice(0, 10).map((person: any) => ({
        name: person.name,
        character: person.character,
        profile_path: person.profile_path,
      }));
    }
    return [];
  }

  /**
   * Get full movie details from TMDB via Seerr
   * Returns complete metadata including credits, genres, runtime, etc.
   */
  async getMovieDetails(
    tmdbId: number,
    forceRefresh = false
  ): Promise<any | null> {
    return await this.makeRequest<any>(
      `movie/${tmdbId}`,
      undefined,
      undefined,
      forceRefresh
    );
  }

  /**
   * Get full TV show details from TMDB via Seerr
   * Returns complete metadata including credits, genres, runtime, etc.
   */
  async getTVDetails(
    tmdbId: number,
    forceRefresh = false
  ): Promise<any | null> {
    return await this.makeRequest<any>(
      `tv/${tmdbId}`,
      undefined,
      undefined,
      forceRefresh
    );
  }

  /**
   * Get TV season details from TMDB via Seerr
   * Returns season name and episode information
   */
  async getTVSeasonDetails(
    tmdbId: number,
    seasonNumber: number,
    forceRefresh = false
  ): Promise<{
    name: string;
    seasonNumber: number;
    overview: string;
    posterPath: string | null;
    episodes: Array<{
      episodeNumber: number;
      name: string;
      overview: string;
      airDate: string | null;
      stillPath: string | null;
    }>;
  } | null> {
    const data = await this.makeRequest<any>(
      `tv/${tmdbId}/season/${seasonNumber}`,
      undefined,
      86400, // Cache for 24 hours
      forceRefresh
    );

    if (!data) {
      return null;
    }

    return {
      name: data.name || `Season ${seasonNumber}`,
      seasonNumber: data.season_number ?? seasonNumber,
      overview: data.overview || "",
      posterPath: data.poster_path || null,
      episodes: (data.episodes || []).map((ep: any) => ({
        episodeNumber: ep.episode_number,
        name: ep.name || `Episode ${ep.episode_number}`,
        overview: ep.overview || "",
        airDate: ep.air_date || null,
        stillPath: ep.still_path || null,
      })),
    };
  }

  /**
   * Get episode name from TMDB via Seerr
   * Convenience method that fetches season details and returns just the episode name
   */
  async getEpisodeName(
    tmdbId: number,
    seasonNumber: number,
    episodeNumber: number,
    forceRefresh = false
  ): Promise<string | null> {
    const seasonDetails = await this.getTVSeasonDetails(
      tmdbId,
      seasonNumber,
      forceRefresh
    );

    if (!seasonDetails) {
      return null;
    }

    const episode = seasonDetails.episodes.find(
      (ep) => ep.episodeNumber === episodeNumber
    );

    return episode?.name || null;
  }
}
