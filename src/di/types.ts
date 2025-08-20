export const LIB_TYPES = {
  Logger: Symbol.for('Logger'),
  KnexDB: Symbol.for('KnexDB'),
  RedisClient: Symbol.for('RedisClient'),
  JobProcessor: Symbol.for('JobProcessor'),
  MailClient: Symbol.for('MailClient'),
  StorageProvider: Symbol.for('StorageProvider'),
};

export const EMITTER = Symbol.for('EventEmitter');


export const MIDDLEWARE_TYPES = {
  ExtractTokenMiddleware: Symbol.for('ExtractTokenMiddleware'),
  AuthMiddleware: Symbol.for('AuthMiddleware'),
  HeadersMiddleware: Symbol.for('HeadersMiddleware'),
  RateLimitMiddleware: Symbol.for('RateLimitMiddleware'),
};

export const SERVICE_TYPES = {
  AuthService: Symbol.for('AuthService'),
  CommonSService: Symbol.for('CommonService'),
  UserService: Symbol.for('UserService'),
  RoomsService: Symbol.for('RoomsService'),
  PresenceService: Symbol.for('PresenceService'),
  RateLimiterService: Symbol.for('RateLimiterService'),
  ValidationService: Symbol.for('ValidationService'),
  MessageReceiptsService: Symbol.for('MessageReceiptsService'),
  SocketService: Symbol.for('SocketService'),
};
