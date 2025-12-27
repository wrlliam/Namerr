/**
 * Cache Layer
 * Supports Redis and in-memory fallback with TTL
 */

import Redis from "ioredis";

export interface CacheOptions {
  /**
   * Time-to-live in seconds
   */
  ttl?: number;

  /**
   * Cache key prefix
   */
  prefix?: string;

  /**
   * Force use of in-memory cache even if Redis is available
   * Useful for SSH workers to avoid Redis dependency
   */
  forceMemory?: boolean;
}

export interface CacheBackend {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  del(key: string): Promise<void>;
  clear(pattern?: string): Promise<void>;
  has(key: string): Promise<boolean>;
}

/**
 * Redis cache backend
 */
class RedisCache implements CacheBackend {
  private client: Redis;
  private prefix: string;
  private isConnected: boolean = false;

  constructor(redisUrl?: string, prefix: string = "namerr:") {
    this.prefix = prefix;

    if (redisUrl) {
      this.client = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        lazyConnect: true,
        connectTimeout: 5000, // 5 second timeout
      });

      // Handle connection errors gracefully
      this.client.on("error", (err) => {
        console.error("[Redis Cache] Connection error:", err.message);
        this.isConnected = false;
      });

      this.client.on("connect", () => {
        console.log("[Redis Cache] Connected successfully");
        this.isConnected = true;
      });

      this.client.on("ready", () => {
        this.isConnected = true;
      });

      this.client.on("close", () => {
        this.isConnected = false;
      });

      // Connect asynchronously
      this.client.connect().catch((err) => {
        console.error("[Redis Cache] Failed to connect:", err.message);
        this.isConnected = false;
      });
    } else {
      // No Redis URL provided, create a disconnected client
      this.client = new Redis({ lazyConnect: true });
      this.isConnected = false;
    }
  }

  /**
   * Check if Redis is connected
   */
  async checkConnection(): Promise<boolean> {
    try {
      if (this.client.status === "ready") {
        await this.client.ping();
        this.isConnected = true;
        return true;
      }
      this.isConnected = false;
      return false;
    } catch (error) {
      this.isConnected = false;
      return false;
    }
  }

  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(this.getKey(key));
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`[Redis Cache] Get error for key ${key}:`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      const redisKey = this.getKey(key);

      if (ttl) {
        await this.client.setex(redisKey, ttl, serialized);
      } else {
        await this.client.set(redisKey, serialized);
      }
    } catch (error) {
      console.error(`[Redis Cache] Set error for key ${key}:`, error);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(this.getKey(key));
    } catch (error) {
      console.error(`[Redis Cache] Delete error for key ${key}:`, error);
    }
  }

  async clear(pattern?: string): Promise<void> {
    try {
      const searchPattern = pattern
        ? `${this.prefix}${pattern}`
        : `${this.prefix}*`;

      const keys = await this.client.keys(searchPattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch (error) {
      console.error("[Redis Cache] Clear error:", error);
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      const exists = await this.client.exists(this.getKey(key));
      return exists === 1;
    } catch (error) {
      console.error(`[Redis Cache] Has error for key ${key}:`, error);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
  }

  async getStats() {
    try {
      const info = await this.client.info("stats");
      const keys = await this.client.dbsize();
      return {
        connected: this.client.status === "ready",
        totalKeys: keys,
        info,
      };
    } catch (error) {
      return {
        connected: false,
        totalKeys: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * In-memory cache backend with TTL support
 */
class MemoryCache implements CacheBackend {
  private cache: Map<string, { value: unknown; expires?: number }> = new Map();
  private prefix: string;

  constructor(prefix: string = "namerr:") {
    this.prefix = prefix;

    // Clean up expired entries every minute
    setInterval(() => {
      this.cleanupExpired();
    }, 60000);
  }

  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  private cleanupExpired() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expires && entry.expires < now) {
        this.cache.delete(key);
      }
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(this.getKey(key));

    if (!entry) return null;

    // Check if expired
    if (entry.expires && entry.expires < Date.now()) {
      this.cache.delete(this.getKey(key));
      return null;
    }

    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const expires = ttl ? Date.now() + ttl * 1000 : undefined;
    this.cache.set(this.getKey(key), { value, expires });
  }

  async del(key: string): Promise<void> {
    this.cache.delete(this.getKey(key));
  }

  async clear(pattern?: string): Promise<void> {
    if (!pattern) {
      this.cache.clear();
      return;
    }

    const regex = new RegExp(
      pattern.replace(/\*/g, ".*").replace(/\?/g, ".")
    );

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  async has(key: string): Promise<boolean> {
    return this.cache.has(this.getKey(key));
  }

  getStats() {
    return {
      connected: true,
      totalKeys: this.cache.size,
      type: "memory",
    };
  }
}

/**
 * Cache manager with automatic fallback
 */
export class Cache {
  private backend: CacheBackend;
  private defaultTTL: number;
  private fallbackBackend?: CacheBackend;
  private usingFallback: boolean = false;

  constructor(options: CacheOptions = {}) {
    this.defaultTTL = options.ttl || 3600; // Default 1 hour

    // Force memory cache if requested (for SSH workers)
    // Can be set via options.forceMemory or FORCE_MEMORY_CACHE=true environment variable
    if (options.forceMemory || process.env.FORCE_MEMORY_CACHE === "true") {
      console.log("[Cache] Using in-memory backend (forced via config or environment)");
      this.backend = new MemoryCache(options.prefix);
      return;
    }

    // Try to use Redis if REDIS_URL is set
    const redisUrl = process.env.REDIS_URL;

    if (redisUrl) {
      console.log("[Cache] Attempting to connect to Redis...");
      const redisBackend = new RedisCache(redisUrl, options.prefix);
      this.backend = redisBackend;

      // Create in-memory fallback
      this.fallbackBackend = new MemoryCache(options.prefix);

      // Test Redis connection asynchronously
      this.testRedisConnection(redisBackend, options.prefix);
    } else {
      console.log("[Cache] Using in-memory backend (Redis not configured)");
      this.backend = new MemoryCache(options.prefix);
    }
  }

  /**
   * Test Redis connection and fall back to memory if it fails
   */
  private async testRedisConnection(redisBackend: RedisCache, prefix?: string) {
    try {
      // Give Redis 3 seconds to connect
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const isConnected = await redisBackend.checkConnection();

      if (!isConnected) {
        console.warn("[Cache] Redis connection failed, falling back to in-memory cache");
        this.backend = this.fallbackBackend!;
        this.usingFallback = true;
      } else {
        console.log("[Cache] Redis connection verified");
      }
    } catch (error) {
      console.error("[Cache] Error testing Redis connection:", error);
      console.warn("[Cache] Falling back to in-memory cache");
      this.backend = this.fallbackBackend!;
      this.usingFallback = true;
    }
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      return await this.backend.get<T>(key);
    } catch (error) {
      if (this.fallbackBackend && !this.usingFallback) {
        console.warn("[Cache] Redis get failed, using fallback");
        return await this.fallbackBackend.get<T>(key);
      }
      console.error("[Cache] Get failed:", error);
      return null;
    }
  }

  /**
   * Set value in cache with optional TTL
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      await this.backend.set(key, value, ttl ?? this.defaultTTL);
      // Also set in fallback if we have one
      if (this.fallbackBackend && !this.usingFallback) {
        await this.fallbackBackend.set(key, value, ttl ?? this.defaultTTL);
      }
    } catch (error) {
      if (this.fallbackBackend && !this.usingFallback) {
        console.warn("[Cache] Redis set failed, using fallback");
        await this.fallbackBackend.set(key, value, ttl ?? this.defaultTTL);
      } else {
        console.error("[Cache] Set failed:", error);
      }
    }
  }

  /**
   * Delete value from cache
   */
  async del(key: string): Promise<void> {
    try {
      await this.backend.del(key);
      if (this.fallbackBackend && !this.usingFallback) {
        await this.fallbackBackend.del(key);
      }
    } catch (error) {
      if (this.fallbackBackend && !this.usingFallback) {
        console.warn("[Cache] Redis del failed, using fallback");
        await this.fallbackBackend.del(key);
      } else {
        console.error("[Cache] Del failed:", error);
      }
    }
  }

  /**
   * Clear cache (all keys or by pattern)
   */
  async clear(pattern?: string): Promise<void> {
    try {
      await this.backend.clear(pattern);
      if (this.fallbackBackend && !this.usingFallback) {
        await this.fallbackBackend.clear(pattern);
      }
    } catch (error) {
      if (this.fallbackBackend && !this.usingFallback) {
        console.warn("[Cache] Redis clear failed, using fallback");
        await this.fallbackBackend.clear(pattern);
      } else {
        console.error("[Cache] Clear failed:", error);
      }
    }
  }

  /**
   * Check if key exists in cache
   */
  async has(key: string): Promise<boolean> {
    try {
      return await this.backend.has(key);
    } catch (error) {
      if (this.fallbackBackend && !this.usingFallback) {
        console.warn("[Cache] Redis has failed, using fallback");
        return await this.fallbackBackend.has(key);
      }
      console.error("[Cache] Has failed:", error);
      return false;
    }
  }

  /**
   * Get or set pattern: fetch from cache or compute and store
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Compute value
    const value = await factory();

    // Store in cache
    await this.set(key, value, ttl);

    return value;
  }

  /**
   * Wrap a function with caching
   */
  wrap<T>(
    keyFactory: (...args: any[]) => string,
    fn: (...args: any[]) => Promise<T>,
    ttl?: number
  ) {
    return async (...args: any[]): Promise<T> => {
      const key = keyFactory(...args);
      return this.getOrSet(key, () => fn(...args), ttl);
    };
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    const stats: any = { usingFallback: this.usingFallback };

    if (this.backend instanceof RedisCache) {
      stats.backend = "redis";
      stats.redis = await this.backend.getStats();
    } else if (this.backend instanceof MemoryCache) {
      stats.backend = "memory";
      stats.memory = this.backend.getStats();
    }

    if (this.fallbackBackend instanceof MemoryCache) {
      stats.fallback = this.fallbackBackend.getStats();
    }

    return stats;
  }

  /**
   * Get current backend type
   */
  getBackendType(): string {
    if (this.usingFallback) {
      return "memory (fallback)";
    }
    if (this.backend instanceof RedisCache) {
      return "redis";
    }
    if (this.backend instanceof MemoryCache) {
      return "memory";
    }
    return "unknown";
  }
}

/**
 * Default cache instances for different use cases
 */

// Seerr API cache (1 hour TTL for searches, 24 hours for metadata)
export const seerrCache = new Cache({
  prefix: "seerr:",
  ttl: 3600, // 1 hour default
});

// General application cache (5 minutes TTL)
export const appCache = new Cache({
  prefix: "app:",
  ttl: 300,
});

// Worker cache (30 seconds TTL for frequently changing data)
export const workerCache = new Cache({
  prefix: "worker:",
  ttl: 30,
});
