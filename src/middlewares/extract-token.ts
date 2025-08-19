import { NextFunction, Request, Response } from 'express';
import { LogStatus, ProfileType } from '../enums/enum';
import jwt, { JwtPayload } from 'jsonwebtoken';
import env from '../config/env';
import { inject, injectable } from 'inversify';
import { BaseMiddleware } from 'inversify-express-utils';
import { LIB_TYPES } from '../di/types';
import { Logger } from '../config/logger';
import Redis from 'ioredis';
import { RedisClient } from '../config/redis';
import { ILog } from '../interfaces/interfaces';
import Default from '../app/defaults/default';

@injectable()
export class ExtractTokenMiddleware extends BaseMiddleware {
  private _logger: Logger;
  private _redisClient: Redis;

  constructor(
    @inject(LIB_TYPES.Logger) private readonly logger: Logger,
    @inject(LIB_TYPES.RedisClient) private readonly redis: RedisClient,
  ) {
    super();
    this._logger = logger;
    this._redisClient = redis.client;
  }

  public async handler(req: Request, _res: Response, next: NextFunction) {
    const requestId: string = Default.GENERATE_REQUEST_ID();
    const timestamp: string = new Date().toUTCString();
    const ip: string = String(req.headers['x-forwarded-for']) || req.ip as string;
    const userAgent: string = req.get('User-Agent') as string;

    const token = req.header('Authorization')?.replace('Bearer ', '');
    req.user = undefined;

    if (!token) {
      this._logger.debug('No token provided, proceeding with guest user.');
      return next();
    }

    try {
      const payload = jwt.verify(token, env.jwt_access_secret, { ignoreExpiration: true }) as JwtPayload;
      const tokenKey = `users:${payload.sub}:session-${payload.lastLogin}`;
      const ttl = await this._redisClient.ttl(tokenKey);
      if (ttl < 0) {
        const payload: ILog = {
          action: 'AUTHORIZATION_USER',
          data: undefined,
          description: 'token expired, authorization denied',
          ipAddress: ip,
          userAgent: userAgent,
          timestamp: timestamp,
          requestId: requestId,
          status: LogStatus.FAILED,
          details: {},
        };
        this._logger.error(payload.description, payload);

        return next();
      }

      const expiration = payload.rememberMe ? 30 * 24 * 60 * 60 : 5 * 24 * 60 * 60;
      await this._redisClient.expire(tokenKey, expiration);
      this._logger.debug(`ttl extended for user: ${payload.sub}`, { tokenKey, newTTL: expiration });

      req.user = {
        id: payload.sub as string,
        email: payload.email,
        lastLogin: payload.lastLogin as number,
      };

      next();
    } catch (err: any) {
      const payload: ILog = {
        action: 'AUTHORIZATION_USER',
        data: undefined,
        description: 'invalid token provided, authorization denied',
        ipAddress: ip,
        userAgent: userAgent,
        timestamp: timestamp,
        requestId: requestId,
        status: LogStatus.FAILED,
        details: {},
      };
      this._logger.error(payload.description, payload);

      next();
    }
  }
}
