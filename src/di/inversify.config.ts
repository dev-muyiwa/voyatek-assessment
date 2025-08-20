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
import { PresenceService } from '../app/users/presence.service';
import { RateLimiterService } from '../app/users/rate-limiter.service';
import { ValidationService } from '../app/realtime/services/validation.service';
import { MessageReceiptsService } from '../app/messages/message-receipts.service';
import { SocketService } from '../app/realtime/socket';
import { AuthService } from '../app/auth/services/auth.service';
import { ExtractTokenMiddleware } from '../middlewares/extract-token';
import { JobProcessor } from '../config/job.processor';
import { EventEmitter } from 'events';
import { RoomsService } from '../app/rooms/rooms.service';
import { RoomsController } from '../app/rooms/rooms.controller';
import { RateLimitMiddleware } from '../middlewares/rate-limit';

const container = new Container();


container.bind<EventEmitter>(EMITTER).toConstantValue(new EventEmitter());
container.bind<Logger>(LIB_TYPES.Logger).to(Logger).inSingletonScope();
container.bind<Database>(LIB_TYPES.KnexDB).to(Database).inSingletonScope();
container.bind<MailClient>(LIB_TYPES.MailClient).to(MailClient).inSingletonScope();
container.bind<JobProcessor>(LIB_TYPES.JobProcessor).to(JobProcessor).inSingletonScope();
container.bind<RedisClient>(LIB_TYPES.RedisClient).to(RedisClient).inSingletonScope();

container.bind<BaseMiddleware>(MIDDLEWARE_TYPES.ExtractTokenMiddleware).to(ExtractTokenMiddleware);
container.bind<BaseMiddleware>(MIDDLEWARE_TYPES.AuthMiddleware).to(AuthMiddleware);
container.bind<BaseMiddleware>(MIDDLEWARE_TYPES.RateLimitMiddleware).to(RateLimitMiddleware);

container.bind<AuthController>(AuthController).toSelf();
container.bind<RoomsController>(RoomsController).toSelf();

container.bind<AuthService>(SERVICE_TYPES.AuthService).to(AuthService);
container.bind<UserService>(SERVICE_TYPES.UserService).to(UserService);
container.bind<PresenceService>(SERVICE_TYPES.PresenceService).to(PresenceService);
container.bind<RateLimiterService>(SERVICE_TYPES.RateLimiterService).to(RateLimiterService);
container.bind<ValidationService>(SERVICE_TYPES.ValidationService).to(ValidationService);
container.bind<MessageReceiptsService>(SERVICE_TYPES.MessageReceiptsService).to(MessageReceiptsService);
container.bind<SocketService>(SERVICE_TYPES.SocketService).to(SocketService);
container.bind<RoomsService>(SERVICE_TYPES.RoomsService).to(RoomsService);

export { container };
