import { NextFunction, Request, Response } from 'express';
import Default from '../app/defaults/default';
import { IAuthRecord, IError, IFileUpload, ILog, IResponse } from '../interfaces/interfaces';
import Status from 'http-status-codes';
import { LogStatus } from '../enums/enum';
import { inject, injectable } from 'inversify';
import { LIB_TYPES } from '../di/types';
import { Logger } from '../config/logger';
import { BaseMiddleware } from 'inversify-express-utils';
import { RedisClient } from '../config/redis';
import Redis from 'ioredis';


declare global {
  namespace Express {
    interface Request {
      user?: IAuthRecord;
      uploadedFile?: IFileUpload;
    }
  }
}


@injectable()
export class AuthMiddleware extends BaseMiddleware {
  private _logger: Logger;
  private _redisClient: Redis;

  constructor(
    @inject(LIB_TYPES.Logger) private logger: Logger,
    @inject(LIB_TYPES.RedisClient) private readonly redis: RedisClient,
  ) {
    super();
    this._logger = logger;
    this._redisClient = redis.client;
  }

  public async handler(req: Request, res: Response, next: NextFunction) {
    const requestId: string = Default.GENERATE_REQUEST_ID();
    const timestamp: string = new Date().toUTCString();
    const ip: string = String(req.headers['x-forwarded-for']) || req.ip as string;
    const userAgent: string = req.get('User-Agent') as string;

    if (!req.user) {
      const payload: ILog = {
        action: 'AUTHORIZATION_USER',
        data: undefined,
        description: 'token is expired or not valid, authorization denied',
        ipAddress: ip,
        userAgent: userAgent,
        timestamp: timestamp,
        requestId: requestId,
        status: LogStatus.FAILED,
        details: {},
      };

      this._logger.error(payload.description, payload);

      const response: IResponse<any, IError> = {
        statusCode: Status.UNAUTHORIZED,
        success: false,
        message: 'token is expired or not valid, authorization denied',
        timestamp: timestamp,
        requestId: requestId,
        error: {
          code: Status.UNAUTHORIZED,
          message: 'token is expired or not valid, authorization denied',
          details: {},
        },
      };

      res.status(response.statusCode).json(response);
      return;
    }

    next();
  }
}
