import { inject, injectable } from 'inversify';
import { LIB_TYPES } from '../../di/types';
import { Logger } from '../../config/logger';
import { RedisClient } from '../../config/redis';
import Redis from 'ioredis';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

export interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
  keyPrefix: string;
}

@injectable()
export class RateLimiterService {
  private _redisClient: Redis;

  constructor(
    @inject(LIB_TYPES.Logger) private readonly _logger: Logger,
    @inject(LIB_TYPES.RedisClient) private readonly _redis: RedisClient,
  ) {
    this._redisClient = this._redis.client;
  }

  /**
   * Check if a request is within rate limits using sliding window
   */
  async checkRateLimit(
    identifier: string,
    config: RateLimitConfig
  ): Promise<RateLimitResult> {
    const key = `${config.keyPrefix}:${identifier}`;
    const now = Date.now();
    const windowStart = now - (config.windowSeconds * 1000);

    try {
      // Use Redis pipeline for atomic operations
      const pipeline = this._redisClient.pipeline();
      
      // Remove old entries outside the window
      pipeline.zremrangebyscore(key, 0, windowStart);
      
      // Count current requests in window
      pipeline.zcard(key);
      
      // Add current request
      pipeline.zadd(key, now, `${now}-${Math.random()}`);
      
      // Set expiration
      pipeline.expire(key, config.windowSeconds);
      
      const results = await pipeline.exec();
      
      if (!results) {
        throw new Error('Pipeline execution failed');
      }

      // Get count after removing old entries but before adding new one
      const currentCount = (results[1][1] as number) || 0;
      
      const allowed = currentCount < config.maxRequests;
      const remaining = Math.max(0, config.maxRequests - currentCount - (allowed ? 1 : 0));
      const resetTime = now + (config.windowSeconds * 1000);

      if (!allowed) {
        // Remove the request we just added since it's not allowed
        await this._redisClient.zrem(key, `${now}-${Math.random()}`);
        
        // Calculate retry after time
        const oldestInWindow = await this._redisClient.zrange(key, 0, 0, 'WITHSCORES');
        const retryAfter = oldestInWindow.length > 0 
          ? Math.ceil((parseInt(oldestInWindow[1]) + (config.windowSeconds * 1000) - now) / 1000)
          : config.windowSeconds;

        this._logger.debug('Rate limit exceeded', {
          identifier,
          currentCount,
          maxRequests: config.maxRequests,
          retryAfter
        });

        return {
          allowed: false,
          remaining: 0,
          resetTime,
          retryAfter
        };
      }

      this._logger.debug('Rate limit check passed', {
        identifier,
        currentCount: currentCount + 1,
        remaining,
        maxRequests: config.maxRequests
      });

      return {
        allowed: true,
        remaining,
        resetTime
      };

    } catch (error: any) {
      this._logger.error('Rate limit check failed', {
        error: error.message,
        identifier,
        config
      });
      
      // In case of error, allow the request but log the issue
      return {
        allowed: true,
        remaining: config.maxRequests - 1,
        resetTime: now + (config.windowSeconds * 1000)
      };
    }
  }

  /**
   * Get current rate limit status without incrementing
   */
  async getRateLimitStatus(
    identifier: string,
    config: RateLimitConfig
  ): Promise<RateLimitResult> {
    const key = `${config.keyPrefix}:${identifier}`;
    const now = Date.now();
    const windowStart = now - (config.windowSeconds * 1000);

    try {
      // Remove old entries and count current ones
      await this._redisClient.zremrangebyscore(key, 0, windowStart);
      const currentCount = await this._redisClient.zcard(key);
      
      const remaining = Math.max(0, config.maxRequests - currentCount);
      const resetTime = now + (config.windowSeconds * 1000);

      return {
        allowed: currentCount < config.maxRequests,
        remaining,
        resetTime
      };

    } catch (error: any) {
      this._logger.error('Rate limit status check failed', {
        error: error.message,
        identifier,
        config
      });
      
      return {
        allowed: true,
        remaining: config.maxRequests,
        resetTime: now + (config.windowSeconds * 1000)
      };
    }
  }

  /**
   * Reset rate limit for a specific identifier
   */
  async resetRateLimit(identifier: string, keyPrefix: string): Promise<void> {
    try {
      const key = `${keyPrefix}:${identifier}`;
      await this._redisClient.del(key);
      
      this._logger.debug('Rate limit reset', { identifier, keyPrefix });
    } catch (error: any) {
      this._logger.error('Rate limit reset failed', {
        error: error.message,
        identifier,
        keyPrefix
      });
    }
  }

  /**
   * Predefined rate limit configurations
   */
  static readonly CONFIGS = {
    MESSAGE_RATE_LIMIT: {
      maxRequests: 5,
      windowSeconds: 10,
      keyPrefix: 'rate_limit:messages'
    } as RateLimitConfig,
    
    JOIN_ROOM_RATE_LIMIT: {
      maxRequests: 10,
      windowSeconds: 60,
      keyPrefix: 'rate_limit:join_room'
    } as RateLimitConfig,
    
    TYPING_RATE_LIMIT: {
      maxRequests: 20,
      windowSeconds: 10,
      keyPrefix: 'rate_limit:typing'
    } as RateLimitConfig
  };
}