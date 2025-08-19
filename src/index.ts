import 'reflect-metadata'
import env from './config/env';
import http from 'http';
import { Logger } from './config/logger';
import { Database } from './config/db';
import { App } from './app/app';
import { RedisClient } from './config/redis';
import { container } from './di/inversify.config';
import { LIB_TYPES } from './di/types';
import { RedisJob } from './enums/enum';
import Handlebars from 'handlebars';

const start = async () => {
  const logger = container.get<Logger>(LIB_TYPES.Logger);

  try {
    const db = container.get<Database>(LIB_TYPES.KnexDB);
    await db.setup(logger);

    const redisClient = container.get<RedisClient>(LIB_TYPES.RedisClient);

    Handlebars.registerHelper('eq', function(a, b) {
      return a === b;
    });

    const app = new App(container, logger, async () => {
      await db.isHealthy();
      await redisClient.isHealthy();
    });
    const appServer = app.server.build();

    const httpServer = http.createServer(appServer);
    httpServer.on('listening', () =>
      logger.info(`HTTP server listening on ${env.port}`),
    );

    httpServer.listen(env.port);

    process.on('SIGTERM', async () => {
      logger.info('exiting application...');
      try {
        await db.close();
        await redisClient.close();
      } catch (err) {
        logger.error('error during shutdown', { error: err });
      } finally {
        httpServer.close(() => {
          logger.info('HTTP server closed');
          process.exit(0);
        });
      }
    });
  } catch (err) {
    logger.error('error starting application', { error: err });
  }
};

start();