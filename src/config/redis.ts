import { Job, JobsOptions, JobType, Queue, Worker } from 'bullmq';
import { inject, injectable } from 'inversify';
import Redis from 'ioredis';
import { LIB_TYPES } from '../di/types';
import env from './env';
import { Logger } from './logger';
import { JobData, JobProcessor } from './job.processor';
import { RedisJob } from '../enums/enum';

@injectable()
export class RedisClient {
  private readonly _client: Redis;

  private _queue: Queue<JobData> | undefined;
  private _workers: Worker<JobData>[] = [];

  private readonly DEFAULT_EMAIL_QUEUE = 'emailQueue';

  constructor(
    @inject(LIB_TYPES.Logger) private readonly _logger: Logger,
    @inject(LIB_TYPES.JobProcessor) private readonly _jobProcessor: JobProcessor,
  ) {
    this._client = new Redis({
      host: env.redis_host,
      port: env.redis_port,
      username: env.redis_username,
      password: env.redis_password,
      maxRetriesPerRequest: null,
    });

    this._client.on('error', (err) => {
      this._logger.error('redis error', { error: err });
    });

    this._client.on('connect', () => {
      this._logger.info('connected to redis');
    });

    this._client.on('ready', () => {
      this._logger.info('redis is ready');
    });

    this.initializeDefaultWorkers();
  }

  get client(): Redis {
    return this._client;
  }

  private initializeDefaultWorkers(): void {
    const emailJobProcessor = (job: Job) => this._jobProcessor.processJobs(job);

    this._queue = this.createQueue(this.DEFAULT_EMAIL_QUEUE);

    const numberOfWorkers = 5;
    for (let i = 0; i < numberOfWorkers; i++) {
      const worker = this.createWorker(this.DEFAULT_EMAIL_QUEUE, emailJobProcessor);
      this._workers.push(worker);
    }
  }

  createQueue(queueName: string = this.DEFAULT_EMAIL_QUEUE): Queue {
    const queue = new Queue<JobData>(queueName, {
      connection: this._client,
      defaultJobOptions: { removeOnComplete: true },
    });

    this._logger.info(`queue "${queueName}" created`);

    return queue;
  }

  createWorker(queueName: string, processor: (job: Job) => Promise<void>): Worker {
    const worker = new Worker(queueName, processor, {
      connection: this._client,
      concurrency: 10,
    });

    this._logger.info(`worker for queue "${queueName}" created`);

    worker.on('completed', (job) => {
      this._logger.debug(`job ${job.id} on queue "${queueName}" completed`);
    });

    worker.on('failed', (job, err) => {
      this._logger.error(`job ${job?.id} on queue "${queueName}" failed`, { error: err });
    });

    return worker;
  }

  async addJob(jobName: RedisJob, jobData: JobData, options: JobsOptions = {}): Promise<void> {
    if (!this._queue) {
      throw new Error(`queue "${this.DEFAULT_EMAIL_QUEUE}" is not initialized`);
    }

    await this._queue.add(jobName, jobData, options);
    this._logger.debug(`job "${jobName}" added to queue "${this.DEFAULT_EMAIL_QUEUE}"`);
  }

  async getJobs(type?: JobType): Promise<Job<JobData>[]> {
    if (!this._queue) {
      throw new Error(`queue "${this.DEFAULT_EMAIL_QUEUE}" is not initialized`);
    }

    return this._queue.getJobs(type);
  }

  async isHealthy(): Promise<void> {
    try {
      await this._client.ping();
    } catch (error) {
      this._logger.error('redis is not healthy', { error });
    }
  }

  async close(): Promise<void> {
    for (const worker of this._workers) {
      await worker.close();
      this._logger.info('worker closed');
    }

    if (this._queue) {
      await this._queue.close();
      this._logger.info('queue closed');
    }

    await this._client.quit();
    this._logger.info('redis connection closed');
  }
}
