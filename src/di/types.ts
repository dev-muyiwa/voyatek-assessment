export const LIB_TYPES = {
  Logger: Symbol.for('Logger'),
  KnexDB: Symbol.for('KnexDB'),
  RedisClient: Symbol.for('RedisClient'),
  JobProcessor: Symbol.for('JobProcessor'),
  MailClient: Symbol.for('MailClient'),
  StorageProvider: Symbol.for('StorageProvider'),
};

export const EMITTER = Symbol.for('EventEmitter');

export const APP_EVENTS = {
  SubscriptionPaymentSuccess: Symbol.for('SubscriptionPaymentSuccess'),
  SubscriptionPaymentFailed: Symbol.for('SubscriptionPaymentFailed'),
};

export const MIDDLEWARE_TYPES = {
  ExtractTokenMiddleware: Symbol.for('ExtractTokenMiddleware'),
  AuthMiddleware: Symbol.for('AuthMiddleware'),
  HeadersMiddleware: Symbol.for('HeadersMiddleware'),
  FileUploadMiddleware: Symbol.for('FileUploadMiddleware'),
  FileUploadMiddlewareForVideos: Symbol.for('FileUploadMiddlewareForVideos'),
  FileUploadMiddlewareForDocuments: Symbol.for('FileUploadMiddlewareForDocuments'),
  FileUploadMiddlewareForCoursePublicFiles: Symbol.for('FileUploadMiddlewareForCoursePublicFiles'),
  FileUploadMiddlewareForLessonFiles: Symbol.for('FileUploadMiddlewareForLessonFiles'),
};

export const SERVICE_TYPES = {
  AuthService: Symbol.for('AuthService'),
  CommonSService: Symbol.for('CommonService'),
  UserService: Symbol.for('UserService'),
  TeacherService: Symbol.for('TeacherService'),
  CreatorService: Symbol.for('CreatorService'),
  CourseService: Symbol.for('CourseService'),
  ReviewService: Symbol.for('ReviewService'),
  ModuleService: Symbol.for('ModuleService'),
  LessonService: Symbol.for('LessonService'),
  AssessmentService: Symbol.for('AssessmentService'),
  AnnouncementService: Symbol.for('AnnouncementService'),
  ReflectionService: Symbol.for('ReflectionService'),
  SubscriptionService: Symbol.for('SubscriptionService'),
  FlutterwaveService: Symbol.for('FlutterwaveService'),
  AdminAuthService: Symbol.for('AdminAuthService'),
  ReferralService: Symbol.for('ReferralService'),
  ProgrammeService: Symbol.for('ProgrammeService'),
  DefaultService: Symbol.for('DefaultService'),
};
