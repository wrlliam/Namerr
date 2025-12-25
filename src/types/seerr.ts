/**
 * Seerr API type definitions
 */

export interface SeerrSettings {
  id: number;
  apiUrl: string | null;
  apiKey: string | null;
  connectionStatus: "connected" | "disconnected" | "error" | null;
  lastTestedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SeerrMediaResult {
  id: number;
  mediaType: "movie" | "tv";
  title?: string; // For movies
  name?: string; // For TV shows
  releaseDate?: string;
  firstAirDate?: string;
  overview?: string;
  voteAverage?: number;
  posterPath?: string; // Seerr converts to camelCase
  poster_path?: string; // TMDB snake_case (fallback)
  backdropPath?: string;
  backdrop_path?: string;
}

export interface SeerrSearchResponse {
  page: number;
  totalPages: number;
  totalResults: number;
  results: SeerrMediaResult[];
}

export interface SeerrRequest {
  id: number;
  status: number; // 1 = Pending, 2 = Approved, 3 = Available
  type: "movie" | "tv";
  media: {
    tmdbId: number;
    title?: string;
    name?: string;
    releaseDate?: string;
    firstAirDate?: string;
    overview?: string;
    voteAverage?: number;
    posterPath?: string; // Seerr converts to camelCase
    poster_path?: string; // TMDB snake_case (fallback)
  };
  createdAt: string;
}

export interface SeerrRequestsResponse {
  pageInfo: {
    pages: number;
    pageSize: number;
    results: number;
    page: number;
  };
  results: SeerrRequest[];
}

export interface SeerrMovieData {
  title: string;
  release_date: string;
  overview: string;
  id: number;
  vote_average?: number;
  poster_path?: string | null;
  backdrop_path?: string | null;
  source: "seerr_request" | "seerr_search";
  request_status?: number;
  match_score: number;
}

export interface SeerrTVData {
  name: string;
  first_air_date: string;
  overview: string;
  id: number;
  vote_average?: number;
  poster_path?: string | null;
  backdrop_path?: string | null;
  source: "seerr_request" | "seerr_search";
  request_status?: number;
  match_score: number;
}

export interface SeerrVerifyResult<T = SeerrMovieData | SeerrTVData> {
  verified: boolean;
  data?: T;
}

export interface SeerrStats {
  total: number;
  pending: number;
  approved: number;
  available: number;
  movies: number;
  tv: number;
}

export interface SeerrTestConnectionResult {
  success: boolean;
  error?: string;
  version?: string;
}
