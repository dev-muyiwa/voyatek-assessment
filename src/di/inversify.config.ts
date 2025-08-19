import { Container } from 'inversify';
import { Logger } from '../config/logger';
import { Database } from '../config/db';
import { RedisClient } from '../config/redis';
import { EMITTER, LIB_TYPES, MIDDLEWARE_TYPES, SERVICE_TYPES } from './types';
import { BaseMiddleware } from 'inversify-express-utils';
import { AuthMiddleware } from '../middlewares/auth';
import { AuthController } from '../app/auth/controllers/auth.controller';
import { MailClient } from '../config/mail';
import { UserService } from '../app/users/user.service';
import { AuthService } from '../app/auth/services/auth.service';
import { ExtractTokenMiddleware } from '../middlewares/extract-token';
import { JobProcessor } from '../config/job.processor';
import { EventEmitter } from 'events';

const container = new Container();


container.bind<EventEmitter>(EMITTER).toConstantValue(new EventEmitter());
container.bind<Logger>(LIB_TYPES.Logger).to(Logger).inSingletonScope();
container.bind<Database>(LIB_TYPES.KnexDB).to(Database).inSingletonScope();
container.bind<MailClient>(LIB_TYPES.MailClient).to(MailClient).inSingletonScope();
container.bind<JobProcessor>(LIB_TYPES.JobProcessor).to(JobProcessor).inSingletonScope();
container.bind<RedisClient>(LIB_TYPES.RedisClient).to(RedisClient).inSingletonScope();

container.bind<BaseMiddleware>(MIDDLEWARE_TYPES.ExtractTokenMiddleware).to(ExtractTokenMiddleware);
container.bind<BaseMiddleware>(MIDDLEWARE_TYPES.AuthMiddleware).to(AuthMiddleware);

container.bind<AuthController>(AuthController).toSelf();

container.bind<AuthService>(SERVICE_TYPES.AuthService).to(AuthService);
container.bind<UserService>(SERVICE_TYPES.UserService).to(UserService);

export { container };
