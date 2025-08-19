import { inject, injectable } from 'inversify';
import { LIB_TYPES } from '../../di/types';
import { Logger } from '../../config/logger';
import { RedisClient } from '../../config/redis';
import { Database } from '../../config/db';
import { Prisma, PrismaClient } from '@prisma/client';

@injectable()
export class UserService {
  private readonly _client: PrismaClient;

  constructor(
    @inject(LIB_TYPES.KnexDB) private readonly _db: Database,
    @inject(LIB_TYPES.RedisClient) private readonly _redis: RedisClient,
    @inject(LIB_TYPES.Logger) private readonly _logger: Logger,
  ) {
    this._client = this._db.connection;
  }

  public async findOne(filters: Prisma.usersWhereInput, select?: Prisma.usersSelect) {
    return this._client.users.findFirst({ where: filters, select });
  }
}
