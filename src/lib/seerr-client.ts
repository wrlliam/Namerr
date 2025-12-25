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
    cacheTTL?: number
  ): Promise<T | null> {
    const cacheKey = `${endpoint}:${JSON.stringify(params || {})}`;

    // Try to get from cache
    const cached = await seerrCache.get<T>(cacheKey);
    if (cached !== null) {
      console.log(`[Seerr ${endpoint}] Cache hit`);
      return cached;
    }

    console.log(`[Seerr ${endpoint}] Cache miss, fetching from API`);

    try {
      const url = new URL(`/api/v1/${endpoint}`, this.baseUrl);
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          url.searchParams.append(key, String(value));
        });
      }

      const response = await retryFetch(
        url.toString(),
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
      console.log(`Seerr API response for ${endpoint}:`, JSON.stringify(data, null, 2));

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

    // Check cache unless force refresh
    if (!forceRefresh) {
      const cached = await seerrCache.get<SeerrRequest[]>(cacheKey);
      if (cached) {
        console.log("[Seerr] User requests cache hit");
        return cached;
      }
    }

    console.log("[Seerr] Fetching user requests from API");
    const allRequests: SeerrRequest[] = [];

    try {
      // Get first page
      const firstPage = await this.makeRequest<SeerrRequestsResponse>(
        "request",
        {
          filter: "all",
          sort: "added",
        },
        600 // 10 minutes TTL for requests list
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
            600
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
    mediaType: "movie" | "tv" = "movie"
  ): Promise<SeerrMediaResult[]> {
    const data = await this.makeRequest<SeerrSearchResponse>("search", {
      query,
      page: 1,
    });

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
    const searchLower = searchTitle.toLowerCase().trim();
    const candidateLower = candidateTitle.toLowerCase().trim();

    // Exact match
    if (searchLower === candidateLower) {
      return 1.0;
    }

    // Contains match
    if (
      searchLower.includes(candidateLower) ||
      candidateLower.includes(searchLower)
    ) {
      const shorter = Math.min(searchLower.length, candidateLower.length);
      const longer = Math.max(searchLower.length, candidateLower.length);
      return shorter / longer;
    }

    // Character overlap
    const searchChars = new Set(searchLower.replace(/\s/g, ""));
    const candidateChars = new Set(candidateLower.replace(/\s/g, ""));

    if (searchChars.size === 0 || candidateChars.size === 0) {
      return 0.0;
    }

    const overlap = [...searchChars].filter((char) =>
      candidateChars.has(char)
    ).length;
    const union = new Set([...searchChars, ...candidateChars]).size;

    return union > 0 ? overlap / union : 0.0;
  }

  /**
   * Find a matching request in the user's Seerr requests
   */
  async findMatchingRequest(
    title: string,
    year?: string,
    mediaType: "movie" | "tv" = "movie",
    threshold = 0.8
  ): Promise<SeerrRequest | null> {
    const requests = await this.getUserRequests();

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

      // Calculate match score
      let titleScore = this.fuzzyMatchTitle(title, requestTitle, threshold);

      // Boost score if years match
      if (year && requestYear) {
        if (year === requestYear) {
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

    return bestMatch;
  }

  /**
   * Verify a movie against Seerr requests and media database
   */
  async verifyMovie(
    title: string,
    year?: string,
    threshold = 0.8
  ): Promise<SeerrVerifyResult<SeerrMovieData>> {
    // First, check user requests
    const requestMatch = await this.findMatchingRequest(
      title,
      year,
      "movie",
      threshold
    );

    if (requestMatch) {
      const media = requestMatch.media;
      console.log("Seerr request match media:", JSON.stringify(media, null, 2));
      return {
        verified: true,
        data: {
          title: media.title || title,
          release_date: media.releaseDate || "",
          overview: media.overview || "",
          id: media.tmdbId,
          vote_average: media.voteAverage,
          poster_path: media.posterPath || media.poster_path || null,
          backdrop_path: (media as any).backdropPath || (media as any).backdrop_path || null,
          source: "seerr_request",
          request_status: requestMatch.status,
          match_score: 1.0,
        },
      };
    }

    // If not in requests, search Seerr's media database
    const searchResults = await this.searchMedia(title, "movie");

    if (searchResults.length > 0) {
      let bestMatch: SeerrMediaResult | null = null;
      let bestScore = 0.0;

      for (const result of searchResults.slice(0, 5)) {
        // Check top 5
        const resultTitle = result.title || "";
        const resultYear = result.releaseDate?.substring(0, 4);

        let score = this.fuzzyMatchTitle(title, resultTitle, threshold);

        // Boost for year match
        if (year && resultYear) {
          if (year === resultYear) {
            score = Math.min(1.0, score * 1.2);
          } else {
            score *= 0.7;
          }
        }

        if (score > bestScore && score >= threshold) {
          bestScore = score;
          bestMatch = result;
        }
      }

      if (bestMatch) {
        return {
          verified: true,
          data: {
            title: bestMatch.title || title,
            release_date: bestMatch.releaseDate || "",
            overview: bestMatch.overview || "",
            id: bestMatch.id,
            vote_average: bestMatch.voteAverage,
            poster_path: bestMatch.posterPath || bestMatch.poster_path || null,
            backdrop_path: (bestMatch as any).backdropPath || (bestMatch as any).backdrop_path || null,
            source: "seerr_search",
            match_score: bestScore,
          },
        };
      }
    }

    return { verified: false };
  }

  /**
   * Verify a TV show against Seerr requests and media database
   */
  async verifyTV(
    title: string,
    threshold = 0.8
  ): Promise<SeerrVerifyResult<SeerrTVData>> {
    // First, check user requests
    const requestMatch = await this.findMatchingRequest(
      title,
      undefined,
      "tv",
      threshold
    );

    if (requestMatch) {
      const media = requestMatch.media;
      return {
        verified: true,
        data: {
          name: media.name || title,
          first_air_date: media.firstAirDate || "",
          overview: media.overview || "",
          id: media.tmdbId,
          vote_average: media.voteAverage,
          poster_path: media.posterPath || media.poster_path || null,
          backdrop_path: (media as any).backdropPath || (media as any).backdrop_path || null,
          source: "seerr_request",
          request_status: requestMatch.status,
          match_score: 1.0,
        },
      };
    }

    // If not in requests, search Seerr's media database
    const searchResults = await this.searchMedia(title, "tv");

    if (searchResults.length > 0) {
      let bestMatch: SeerrMediaResult | null = null;
      let bestScore = 0.0;

      for (const result of searchResults.slice(0, 5)) {
        const resultTitle = result.name || "";
        const score = this.fuzzyMatchTitle(title, resultTitle, threshold);

        if (score > bestScore && score >= threshold) {
          bestScore = score;
          bestMatch = result;
        }
      }

      if (bestMatch) {
        return {
          verified: true,
          data: {
            name: bestMatch.name || title,
            first_air_date: bestMatch.firstAirDate || "",
            overview: bestMatch.overview || "",
            id: bestMatch.id,
            vote_average: bestMatch.voteAverage,
            poster_path: bestMatch.posterPath || bestMatch.poster_path || null,
            backdrop_path: (bestMatch as any).backdropPath || (bestMatch as any).backdrop_path || null,
            source: "seerr_search",
            match_score: bestScore,
          },
        };
      }
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
}
