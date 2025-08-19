import { inject } from 'inversify';
import { Logger } from './logger';
import { LIB_TYPES } from '../di/types';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import env from './env';
import { PrismaClient } from '@prisma/client';

export class Database {
  private readonly _client: PrismaClient;

  constructor(@inject(LIB_TYPES.Logger) private readonly _logger: Logger) {
    const adapter = new PrismaMariaDb({
      host: env.database_host,
      port: env.database_port,
      user: env.database_user,
      password: env.database_password,
      database: env.database_name,
      ssl: { rejectUnauthorized: false },
    });
    this._client = new PrismaClient({
      adapter: adapter,
    });

    // this._client.$on('query', (e: any) => this._logger.debug(e.query));
    // this._client.$on('info', (e: any) => this._logger.info(e.message));
    // this._client.$on('warn', (e: any) => this._logger.warn(e.message));
    // this._client.$on('error', (e: any) => this._logger.error(e.message));
  }

  get connection(): PrismaClient {
    return this._client;
  }

  async connect(): Promise<void> {
    await this._client.$connect();
  }

  async isHealthy(): Promise<void> {
    try {
      await this._client.$queryRawUnsafe('SELECT 1');
    } catch (error) {
      this._logger.error('database is not healthy', { error });
    }
  }

  async close(): Promise<void> {
    await this._client.$disconnect();
    this._logger.warn('database connection closed');
  }

  async setup(logger: Logger): Promise<Database> {
    const dbConfig = new Database(logger);
    await dbConfig.connect();
    logger.info('connected to database');
    return dbConfig;
  }
}