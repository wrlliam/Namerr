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
      });

      // Handle connection errors gracefully
      this.client.on("error", (err) => {
        console.error("[Redis Cache] Connection error:", err.message);
      });

      this.client.on("connect", () => {
        console.log("[Redis Cache] Connected successfully");
      });

      // Connect asynchronously
      this.client.connect().catch((err) => {
        console.error("[Redis Cache] Failed to connect:", err.message);
      });
    } else {
      // No Redis URL provided, create a disconnected client
      this.client = new Redis({ lazyConnect: true });
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

  constructor(options: CacheOptions = {}) {
    this.defaultTTL = options.ttl || 3600; // Default 1 hour

    // Try to use Redis if REDIS_URL is set
    const redisUrl = process.env.REDIS_URL;

    if (redisUrl) {
      console.log("[Cache] Using Redis backend");
      this.backend = new RedisCache(redisUrl, options.prefix);
    } else {
      console.log("[Cache] Using in-memory backend (Redis not configured)");
      this.backend = new MemoryCache(options.prefix);
    }
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    return this.backend.get<T>(key);
  }

  /**
   * Set value in cache with optional TTL
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    await this.backend.set(key, value, ttl ?? this.defaultTTL);
  }

  /**
   * Delete value from cache
   */
  async del(key: string): Promise<void> {
    await this.backend.del(key);
  }

  /**
   * Clear cache (all keys or by pattern)
   */
  async clear(pattern?: string): Promise<void> {
    await this.backend.clear(pattern);
  }

  /**
   * Check if key exists in cache
   */
  async has(key: string): Promise<boolean> {
    return this.backend.has(key);
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
    if (this.backend instanceof RedisCache) {
      return this.backend.getStats();
    } else if (this.backend instanceof MemoryCache) {
      return this.backend.getStats();
    }
    return { connected: false, totalKeys: 0 };
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
