import express, { Application, NextFunction, Request, Response } from 'express';
import { Container } from 'inversify';
import { InversifyExpressServer } from 'inversify-express-utils';
import Status from 'http-status-codes';
import { capitalize } from 'lodash';
import cors from 'cors';
import helmet from 'helmet';
import { Logger } from '../config/logger';
import env from '../config/env';
import { MIDDLEWARE_TYPES } from '../di/types';
import { IError, IResponse } from '../interfaces/interfaces';
import Default from './defaults/default';
import { ExtractTokenMiddleware } from '../middlewares/extract-token';

export class App {
  readonly server: InversifyExpressServer;

  constructor(
    container: Container,
    logger: Logger,
    healthCheck = () => Promise.resolve(),
  ) {
    const opts: any = [null, null, false];
    this.server = new InversifyExpressServer(
      container,
      null,
      {
        rootPath: `/api/${env.api_version}`,
      },
      ...opts,
    );

    this.server.setConfig((app: Application) => {
      app.disable('x-powered-by');

      app.use(express.json());
      app.use(express.urlencoded({ extended: true }));
      app.use(cors());
      app.options('*', cors());
      app.use(helmet());
      app.use(helmet.hidePoweredBy());
      app.use(helmet.noSniff());
      app.use(helmet.xssFilter());
      app.use(helmet.frameguard({ action: 'sameorigin' }));

      const extractTokenMiddleware = container.get<ExtractTokenMiddleware>(MIDDLEWARE_TYPES.ExtractTokenMiddleware);
      app.use(extractTokenMiddleware.handler.bind(extractTokenMiddleware));

      app.get('/', async (_req: Request, res: Response) => {
        try {
          await healthCheck();
          res.status(200).send('Welcome to the API');
        } catch (err: any) {
          res.status(Status.INTERNAL_SERVER_ERROR).send(err.message);
        }
      });

      app.get(env.api_version, async (_req, res) => {
        try {
          await healthCheck();
        } catch (err: any) {
          res.status(Status.INTERNAL_SERVER_ERROR).send(err.message);
        }

        res
          .status(200)
          .send(`${capitalize(env.node_env)} is up and running 👉🏾👈🏾`);
      });
    });

    /**
     * Register handlers after all middlewares and controller routes have been mounted
     */
    this.server.setErrorConfig((app: Application) => {
      app.use((_req: Request, res: Response, _next: NextFunction) => {
        const response: IResponse<any, IError> = {
          statusCode: 404,
          success: false,
          message: 'Whoops! Route does not exist',
          timestamp: new Date().toISOString(),
          requestId: Default.GENERATE_REQUEST_ID(),
          error: {
            code: 404,
            message: 'Whoops! Route does not exist',
          },
        }

        res.status(response.statusCode).json(response);
      });

      // app.use(errors(logger));
    });
  }
}