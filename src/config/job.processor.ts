import { Job } from 'bullmq';
import { Logger } from './logger';
import { LogStatus, ProfileType, RedisJob } from '../enums/enum';
import { promisify } from 'util';
import { readFile } from 'node:fs';
import { join } from 'node:path';
import Handlebars from 'handlebars';
import * as process from 'node:process';
import { ILog } from '../interfaces/interfaces';
import { MailClient } from './mail';
import { inject, injectable } from 'inversify';
import { EMITTER, LIB_TYPES } from '../di/types';
import { Database } from './db';
import { EventEmitter } from 'events';

export interface JobData {
  data: any;
  ip: string;
  userAgent: string;
  timestamp: string;
  requestId: string;
}

@injectable()
export class JobProcessor {

  constructor(
    @inject(LIB_TYPES.MailClient) private readonly _mailClient: MailClient,
    @inject(LIB_TYPES.Logger) private readonly _logger: Logger,
    @inject(LIB_TYPES.KnexDB) private readonly _db: Database,
    @inject(EMITTER) private eventEmitter: EventEmitter,
  ) {
  }

  public async processJobs(job: Job<JobData>): Promise<void> {
    try {
      this._logger.debug(`processing job ${job.id} with data`);
      const { ip, requestId, timestamp, userAgent } = job.data;
      const readFileAsync = promisify(readFile);

      switch (job.name as RedisJob) {
        default:
          throw new Error(`unknown job name: ${job.name}`);
      }
    } catch (error) {
      const payload: ILog = {
        action: job.name,
        data: undefined,
        description: `failed to process job ${job.id}`,
        ipAddress: job.data.ip,
        userAgent: job.data.userAgent,
        requestId: job.data.requestId,
        timestamp: job.data.timestamp,
        status: LogStatus.FAILED,
        details: { error: error },
      };
      this._logger.error(`job ${job.id} failed`, payload);
    }
  }
}
