import { NextFunction, Request, Response } from 'express';
import { inject, injectable } from 'inversify';
import { BaseMiddleware } from 'inversify-express-utils';
import { LIB_TYPES, SERVICE_TYPES } from '../di/types';
import { Logger } from '../config/logger';
import { RateLimiterService, RateLimitConfig } from '../app/users/rate-limiter.service';
import Status from 'http-status-codes';
import { IAuthRecord, IError, IResponse } from '../interfaces/interfaces';
import Default from '../app/defaults/default';

@injectable()
export class RateLimitMiddleware extends BaseMiddleware {
  private _logger: Logger;
  private _rateLimiterService: RateLimiterService;

  constructor(
    @inject(LIB_TYPES.Logger) private readonly logger: Logger,
    @inject(SERVICE_TYPES.RateLimiterService) private readonly rateLimiterService: RateLimiterService,
  ) {
    super();
    this._logger = logger;
    this._rateLimiterService = rateLimiterService;
  }

  public async handler(req: Request, res: Response, next: NextFunction) {
    const requestId: string = Default.GENERATE_REQUEST_ID();
    const timestamp: string = new Date().toUTCString();
    const ip: string = String(req.headers['x-forwarded-for']) || req.ip as string;

    try {
      // Get user ID for authenticated requests, fall back to IP
      const user = req.user as IAuthRecord;
      const identifier = user?.id || ip;
      
      // Determine rate limit config based on endpoint
      const config = this.getRateLimitConfig(req.path, req.method);
      
      if (!config) {
        // No rate limiting for this endpoint
        return next();
      }

      // Check rate limit
      const rateLimitResult = await this._rateLimiterService.checkRateLimit(identifier, config);

      // Set rate limit headers
      res.set({
        'X-RateLimit-Limit': config.maxRequests.toString(),
        'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
        'X-RateLimit-Reset': new Date(rateLimitResult.resetTime).toISOString(),
      });

      if (!rateLimitResult.allowed) {
        this._logger.warn('Rate limit exceeded', {
          identifier,
          endpoint: `${req.method} ${req.path}`,
          ip,
          userAgent: req.get('User-Agent'),
          config,
          requestId
        });

        if (rateLimitResult.retryAfter) {
          res.set('Retry-After', rateLimitResult.retryAfter.toString());
        }

        const response: IResponse<any, IError> = {
          statusCode: Status.TOO_MANY_REQUESTS,
          success: false,
          message: 'Rate limit exceeded. Too many requests.',
          timestamp: timestamp,
          requestId: requestId,
          error: {
            code: Status.TOO_MANY_REQUESTS,
            message: 'Rate limit exceeded. Too many requests.',
            details: {
              limit: config.maxRequests,
              windowSeconds: config.windowSeconds,
              retryAfter: rateLimitResult.retryAfter,
            },
          },
        };

        return res.status(Status.TOO_MANY_REQUESTS).json(response);
      }

      next();
    } catch (error: any) {
      this._logger.error('Rate limit middleware error', {
        error: error.message,
        requestId,
        path: req.path,
        method: req.method
      });
      
      // On error, allow the request through but log the issue
      next();
    }
  }

  /**
   * Get rate limit configuration for specific endpoints
   */
  private getRateLimitConfig(path: string, method: string): RateLimitConfig | null {
    // Message sending endpoints
    if (path.includes('/rooms/') && path.includes('/messages') && method === 'GET') {
      return {
        maxRequests: 30,
        windowSeconds: 60,
        keyPrefix: 'rate_limit:get_messages'
      };
    }

    // Room creation
    if (path === '/rooms' && method === 'POST') {
      return {
        maxRequests: 5,
        windowSeconds: 300, // 5 minutes
        keyPrefix: 'rate_limit:create_room'
      };
    }

    // Room joining
    if (path.includes('/rooms/') && path.includes('/join') && method === 'POST') {
      return {
        maxRequests: 10,
        windowSeconds: 60,
        keyPrefix: 'rate_limit:join_room'
      };
    }

    // Invitation creation
    if (path.includes('/rooms/') && path.includes('/invite') && method === 'POST') {
      return {
        maxRequests: 20,
        windowSeconds: 300, // 5 minutes
        keyPrefix: 'rate_limit:create_invite'
      };
    }

    // General API rate limit
    if (method !== 'GET') {
      return {
        maxRequests: 100,
        windowSeconds: 60,
        keyPrefix: 'rate_limit:api_general'
      };
    }

    // No rate limiting for other endpoints
    return null;
  }
}