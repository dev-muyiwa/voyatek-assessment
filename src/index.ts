import 'reflect-metadata'
import env from './config/env';
import http from 'http';
import { Server as IOServer } from 'socket.io';
import { SocketService } from './app/realtime/socket';
import { Logger } from './config/logger';
import { Database } from './config/db';
import { App } from './app/app';
import { RedisClient } from './config/redis';
import { LIB_TYPES, SERVICE_TYPES } from './di/types';
import Handlebars from 'handlebars';
import { container } from './di/inversify.config';

let loggerRef: Logger | null = null;
let dbRef: Database | null = null;
let redisRef: RedisClient | null = null;
let httpServerRef: http.Server | null = null;

async function shutdown(exitCode: number = 1, reason?: unknown): Promise<never> {
  const log = loggerRef ? loggerRef : console;
  if (reason) {
    log.error('initiating graceful shutdown', { reason });
  } else {
    log.info('initiating graceful shutdown');
  }

  try {
    if (dbRef) {
      await dbRef.close();
    }
  } catch (e) {
    log.error('error closing database', { error: e });
  }

  try {
    if (redisRef) {
      await redisRef.close();
    }
  } catch (e) {
    log.error('error closing redis', { error: e });
  }

  try {
    if (httpServerRef) {
      await new Promise<void>((resolve) => httpServerRef!.close(() => resolve()));
      log.info('HTTP server closed');
    }
  } catch (e) {
    log.error('error closing HTTP server', { error: e });
  }

  process.exit(exitCode);
}

process.on('SIGTERM', () => shutdown(0, 'SIGTERM'));
process.on('SIGINT', () => shutdown(0, 'SIGINT'));
process.on('uncaughtException', (err) => shutdown(1, err));
process.on('unhandledRejection', (reason) => shutdown(1, reason));

const start = async () => {
  const logger = container.get<Logger>(LIB_TYPES.Logger);
  loggerRef = logger;

  try {
    const dbService = container.get<Database>(LIB_TYPES.KnexDB);
    dbRef = await dbService.setup(logger);

    const redisClient = container.get<RedisClient>(LIB_TYPES.RedisClient);
    redisRef = redisClient;
    const socketService = container.get<SocketService>(SERVICE_TYPES.SocketService);

    Handlebars.registerHelper('eq', function(a, b) {
      return a === b;
    });

    const app = new App(container, logger, async () => {
      await dbRef!.isHealthy();
      await redisClient.isHealthy();
    });
    const appServer = app.server.build();

    const httpServer = http.createServer(appServer);
    httpServerRef = httpServer;
    const io = new IOServer(httpServer, { cors: { origin: '*'} });
    socketService.init(io, env.jwt_access_secret);
    httpServer.on('listening', () =>
      logger.info(`HTTP server listening on ${env.port}`),
    );

    httpServer.listen(env.port);
  } catch (err) {
    logger.error('error starting application', { error: err });
    await shutdown(1, err);
  }
};

start();