import { inject, injectable } from 'inversify';
import { LIB_TYPES, SERVICE_TYPES } from '../../../di/types';
import { Database } from '../../../config/db';
import { RedisClient } from '../../../config/redis';
import { Logger } from '../../../config/logger';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';
import { UserService } from '../../users/user.service';
import { IAuthRecord, ILog } from '../../../interfaces/interfaces';
import { LogStatus } from '../../../enums/enum';
import { Exception } from '../../../internal/exception';
import bcrypt from 'bcryptjs';
import env from '../../../config/env';
import Default from '../../defaults/default';
import { BaseService } from '../../../internal/base.service';
import { PrismaClient } from '@prisma/client';

@injectable()
export class AuthService extends BaseService {
  private readonly _client: PrismaClient;

  constructor(
    @inject(SERVICE_TYPES.UserService) private readonly _userService: UserService,
    @inject(LIB_TYPES.KnexDB) private readonly _db: Database,
    @inject(LIB_TYPES.RedisClient) private readonly _redis: RedisClient,
    @inject(LIB_TYPES.Logger) private readonly _logger: Logger,
  ) {
    super(_logger);
    this._client = this._db.connection;
  }

  private async comparePassword(
    password: string,
    hash: string,
  ): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  private async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(env.bcrypt_rounds);
    return bcrypt.hash(password, salt);
  }

  public async register(
    dto: RegisterDto,
    ipAddress: string,
    userAgent: string,
    timestamp: string,
    requestId: string,
  ) {
    this.action = 'REGISTER_USER';
    this.ipAddress = ipAddress;
    this.userAgent = userAgent;
    this.timestamp = timestamp;
    this.requestId = requestId;

    const existingUser = await this._userService.findOne({ OR: [{ email: dto.email }, { username: dto.username }] }, { id: true });
    if (existingUser) {
      this.logError('Email or username already exists', dto);
      throw new Exception('Oops! An account with this email/username already exists', Exception.CONFLICT);
    }

    const passwordHash = await this.hashPassword(dto.password);

    const created = await this._client.users.create({
      data: {
        first_name: dto.firstName,
        last_name: dto.lastName,
        username: dto.username,
        email: dto.email.toLowerCase(),
        password_hash: passwordHash,
      },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        email: true,
        username: true,
      },
    });

    this.logDebug('Created user', created);

    return created;
  }

  public async login(
    dto: LoginDto,
    ipAddress: string,
    userAgent: string,
    timestamp: string,
    requestId: string,
  ) {
    this.action = 'LOGIN';
    this.ipAddress = ipAddress;
    this.userAgent = userAgent;
    this.timestamp = timestamp;
    this.requestId = requestId;

    const existingUser = await this._userService.findOne(
      { email: dto.email.toLowerCase().trim() },
      {
        id: true,
        first_name: true,
        last_name: true,
        username: true,
        email: true,
        password_hash: true,
        deleted_at: true,
      });
    if (!existingUser) {
      this.logError('Email does not exist', dto);
      throw new Exception('Invalid login credentials', Exception.UNPROCESSABLE_ENTITY);
    }

    const doPasswordsMatch: boolean = await this.comparePassword(dto.password, existingUser.password_hash);
    if (!doPasswordsMatch) {
      this.logError('Password does not match', dto);
      throw new Exception('Invalid login credentials', Exception.UNPROCESSABLE_ENTITY);
    }

    if (existingUser.deleted_at) {
      this.logError('User account is deleted', existingUser);
      throw new Exception('Account has been de-activated. Contact an administrator', Exception.UNAUTHORIZED);
    }

    const lastLogin = Date.now();
    const accessToken = Default.GENERATE_ACCESS_TOKEN(existingUser.id, existingUser.email, lastLogin, dto.rememberMe);

    await this._redis.client.set(`users:${existingUser.id}:session-${lastLogin}`, accessToken, 'EX', 20 * 60);

    this.logDebug('User logged in successfully', { email: existingUser.email, id: existingUser.id });

    return {
      id: existingUser.id,
      first_name: existingUser.first_name,
      last_name: existingUser.last_name,
      username: existingUser.username,
      email: existingUser.email,
      token: accessToken,
    };
  }

  // public async startEmailVerification(
  //   record: IAuthRecord,
  //   ipAddress: string,
  //   userAgent: string,
  //   timestamp: string,
  //   requestId: string,
  // ): Promise<Record<string, string>> {
  //   const user = await this._userService.findOne({ id: record.id });
  //   if (!user) {
  //     const payload: ILog = {
  //       action: 'START_EMAIL_VERIFICATION',
  //       data: undefined,
  //       status: LogStatus.FAILED,
  //       timestamp: timestamp,
  //       ipAddress: ipAddress,
  //       userAgent: userAgent,
  //       requestId: requestId,
  //       description: 'failed to start email verification - user not found',
  //       details: { userId: record.id },
  //     };
  //     this._logger.error(payload.description, payload);
  //     throw new Exception('User does not exist', Exception.NOT_FOUND);
  //   }
  //
  //   if (profile.verified_at !== null) {
  //     const payload: ILog = {
  //       action: 'START_EMAIL_VERIFICATION',
  //       data: undefined,
  //       status: LogStatus.FAILED,
  //       timestamp: timestamp,
  //       ipAddress: ipAddress,
  //       userAgent: userAgent,
  //       requestId: requestId,
  //       description: 'failed to start email verification - user is already verified',
  //       details: { userId: user.id },
  //     };
  //     this._logger.error(payload.description, payload);
  //     throw new Exception('User is already verified', Exception.UNPROCESSABLE_ENTITY);
  //   }
  //
  //   const [token] = await this._knex<Token>('user_tokens').insert({
  //     user_id: user.id,
  //     type: TokenType.OTP,
  //     token: Default.GENERATE_OTP(),
  //     valid_till: new Date(Date.now() + (60 * 20 * 1000)),
  //   }).returning(['token', 'valid_till']);
  //
  //   await this._redis.addJob(RedisJob.SEND_VERIFICATION_OTP, {
  //     data: {
  //       name: 'first_name' in profile ? profile.first_name : 'name' in profile ? profile.name : '',
  //       email: user.email,
  //       otp: token.token,
  //       expiresIn: new Date(token.valid_till).getMinutes() - new Date().getMinutes(),
  //     },
  //     ip: ipAddress,
  //     userAgent: userAgent,
  //     timestamp: timestamp,
  //     requestId: requestId,
  //   });
  //
  //   return { email: user.email };
  // }
  //
  // public async completeEmailVerification(
  //   record: IAuthRecord,
  //   dto: TokenDto,
  //   ipAddress: string,
  //   userAgent: string,
  //   timestamp: string,
  //   requestId: string,
  // ): Promise<void> {
  //   const user: User | null = await this._userService.findOne({ id: record.id });
  //   if (!user) {
  //     const payload: ILog = {
  //       action: 'COMPLETE_EMAIL_VERIFICATION',
  //       data: undefined,
  //       status: LogStatus.FAILED,
  //       timestamp: timestamp,
  //       ipAddress: ipAddress,
  //       userAgent: userAgent,
  //       requestId: requestId,
  //       description: 'failed to complete email verification - user not found',
  //       details: { userId: record.id },
  //     };
  //     this._logger.error(payload.description, payload);
  //     throw new Exception('User does not exist', Exception.NOT_FOUND);
  //   }
  //
  //   const token: Token | null = await this._knex<Token>('user_tokens').where({
  //     user_id: user.id,
  //     type: TokenType.OTP,
  //     token: dto.otp,
  //   }).first() || null;
  //   if (!token) {
  //     const payload: ILog = {
  //       action: 'COMPLETE_EMAIL_VERIFICATION',
  //       data: undefined,
  //       status: LogStatus.FAILED,
  //       timestamp: timestamp,
  //       ipAddress: ipAddress,
  //       userAgent: userAgent,
  //       requestId: requestId,
  //       description: 'failed to complete email verification - OTP does not exist',
  //       details: { userId: user.id },
  //     };
  //     this._logger.error(payload.description, payload);
  //     throw new Exception('One-Time Passcode does not exist', Exception.NOT_FOUND);
  //   }
  //
  //   if (token.used_at) {
  //     const payload: ILog = {
  //       action: 'COMPLETE_EMAIL_VERIFICATION',
  //       data: undefined,
  //       status: LogStatus.FAILED,
  //       timestamp: timestamp,
  //       ipAddress: ipAddress,
  //       userAgent: userAgent,
  //       requestId: requestId,
  //       description: 'failed to complete email verification - OTP has already been used',
  //       details: { userId: user.id },
  //     };
  //     this._logger.error(payload.description, payload);
  //     throw new Exception('One-Time Passcode has already been used', Exception.UNAUTHORIZED);
  //   }
  //
  //   if (new Date(token.valid_till) < new Date()) {
  //     const payload: ILog = {
  //       action: 'COMPLETE_EMAIL_VERIFICATION',
  //       data: undefined,
  //       status: LogStatus.FAILED,
  //       timestamp: timestamp,
  //       ipAddress: ipAddress,
  //       userAgent: userAgent,
  //       requestId: requestId,
  //       description: 'failed to complete email verification - token has expired',
  //       details: { userId: user.id },
  //     };
  //     this._logger.error(payload.description, payload);
  //
  //     await this._knex<Token>('user_tokens').where({ id: token.id, user_id: token.user_id }).del();
  //
  //     throw new Exception('One-Time Passcode has expired', Exception.UNAUTHORIZED);
  //   }
  //
  //   await this._knex.transaction(async trx => {
  //     switch (record.profileType) {
  //       case ProfileType.Teacher: {
  //         await trx<TeacherProfile>('teacher_profiles').where('user_id', user.id).update({
  //           verified_at: new Date(),
  //         });
  //         break;
  //       }
  //       case ProfileType.School: {
  //         await trx<SchoolProfile>('school_profiles').where('user_id', user.id).update({
  //           verified_at: new Date(),
  //         });
  //         break;
  //       }
  //       case ProfileType.Creator: {
  //         await trx<CreatorProfile>('creator_profiles').where('user_id', user.id).update({
  //           verified_at: new Date(),
  //         });
  //         break;
  //       }
  //       default: {
  //         const payload: ILog = {
  //           action: 'RESET_PASSWORD',
  //           data: undefined,
  //           status: LogStatus.FAILED,
  //           timestamp: timestamp,
  //           ipAddress: ipAddress,
  //           userAgent: userAgent,
  //           requestId: requestId,
  //           description: 'failed to reset password - invalid profile type',
  //           details: { userId: user.id },
  //         };
  //         this._logger.error(payload.description, payload);
  //         throw new Exception('Invalid profile type', Exception.UNAUTHORIZED);
  //       }
  //     }
  //
  //     await trx<Token>('user_tokens').where({ id: token.id, user_id: token.user_id }).del();
  //   });
  //
  //   const payload: ILog = {
  //     action: 'COMPLETE_EMAIL_VERIFICATION',
  //     data: undefined,
  //     status: LogStatus.SUCCESS,
  //     timestamp: timestamp,
  //     ipAddress: ipAddress,
  //     userAgent: userAgent,
  //     requestId: requestId,
  //     description: 'email verification successful',
  //     details: { userId: user.id },
  //   };
  //   this._logger.debug(payload.description, payload);
  //
  //   await this._redis.addJob(RedisJob.SEND_WELCOME_EMAIL, {
  //     data: {
  //       name: 'first_name' in record ? record.first_name : 'name' in record ? record.name : '',
  //       email: user.email,
  //       profileType: record.profileType,
  //     },
  //     ip: ipAddress,
  //     userAgent: userAgent,
  //     timestamp: timestamp,
  //     requestId: requestId,
  //   });
  // }
  //
  // public async forgotPassword(
  //   dto: ForgotPasswordDto,
  //   ipAddress: string,
  //   userAgent: string,
  //   timestamp: string,
  //   requestId: string,
  // ): Promise<void> {
  //   const user: User | null = await this._userService.findOne({ email: dto.email });
  //   if (!user) {
  //     const payload: ILog = {
  //       action: 'FORGOT_PASSWORD',
  //       data: undefined,
  //       status: LogStatus.FAILED,
  //       timestamp: timestamp,
  //       ipAddress: ipAddress,
  //       userAgent: userAgent,
  //       requestId: requestId,
  //       description: 'failed to initiate password reset - user not found',
  //       details: { email: dto.email },
  //     };
  //     this._logger.error(payload.description, payload);
  //     throw new Exception('User does not exist', Exception.NOT_FOUND);
  //   }
  //
  //   const profile: SchoolProfile | TeacherProfile | CreatorProfile | null =
  //     await this._userService.findProfile(user.id, dto.profileType);
  //   if (!profile) {
  //     const payload: ILog = {
  //       action: 'FORGOT_PASSWORD',
  //       data: undefined,
  //       status: LogStatus.FAILED,
  //       timestamp: timestamp,
  //       ipAddress: ipAddress,
  //       userAgent: userAgent,
  //       requestId: requestId,
  //       description: 'failed to initiate password reset - profile not found',
  //       details: { userId: user.id },
  //     };
  //     this._logger.error(payload.description, payload);
  //     throw new Exception('User does not exist', Exception.NOT_FOUND);
  //   }
  //
  //   const expiryInMinutes = 20;
  //   const [token] = await this._knex<Token>('user_tokens').insert({
  //     user_id: user.id,
  //     type: TokenType.RESET,
  //     token: Default.GENERATE_PASSWORD_RESET_TOKEN(user.id, user.email, dto.profileType, expiryInMinutes),
  //     valid_till: new Date(Date.now() + (60 * expiryInMinutes * 1000)),
  //   }).returning(['token', 'valid_till']);
  //
  //   const baseUrl = dto.profileType === ProfileType.Creator ? env.creator_base_url : env.frontend_base_url;
  //   await this._redis.addJob(RedisJob.SEND_PASSWORD_RESET_LINK, {
  //     data: {
  //       name: 'first_name' in profile ? profile.first_name : 'name' in profile ? profile.name : '',
  //       email: user.email,
  //       link: baseUrl + dto.redirectPath + '?token=' + token.token,
  //       expiresIn: new Date(token.valid_till).getMinutes() - new Date().getMinutes(),
  //     },
  //     ip: ipAddress,
  //     userAgent: userAgent,
  //     timestamp: timestamp,
  //     requestId: requestId,
  //   });
  // }
  //
  // public async verifyPasswordResetToken(
  //   token: string,
  //   ipAddress: string,
  //   userAgent: string,
  //   timestamp: string,
  //   requestId: string,
  // ): Promise<void> {
  //   const userToken = await this._knex<Token>('user_tokens').where({ token: token, type: TokenType.RESET }).first();
  //   if (!userToken) {
  //     const payload: ILog = {
  //       action: 'VERIFY_PASSWORD_RESET_TOKEN',
  //       data: undefined,
  //       status: LogStatus.FAILED,
  //       timestamp: timestamp,
  //       ipAddress: ipAddress,
  //       userAgent: userAgent,
  //       requestId: requestId,
  //       description: 'failed to verify password reset token',
  //       details: { token: token },
  //     };
  //     this._logger.error(payload.description, payload);
  //     throw new Exception('Invalid token issuer', Exception.UNAUTHORIZED);
  //   }
  //
  //   if (userToken.used_at) {
  //     const payload: ILog = {
  //       action: 'VERIFY_PASSWORD_RESET_TOKEN',
  //       data: undefined,
  //       status: LogStatus.FAILED,
  //       timestamp: timestamp,
  //       ipAddress: ipAddress,
  //       userAgent: userAgent,
  //       requestId: requestId,
  //       description: 'failed to verify password reset token - token has already been used',
  //       details: { token: token },
  //     };
  //     this._logger.error(payload.description, payload);
  //     throw new Exception('Token has already been used', Exception.UNAUTHORIZED);
  //   }
  //
  //   if (new Date(userToken.valid_till) < new Date()) {
  //     const payload: ILog = {
  //       action: 'VERIFY_PASSWORD_RESET_TOKEN',
  //       data: undefined,
  //       status: LogStatus.FAILED,
  //       timestamp: timestamp,
  //       ipAddress: ipAddress,
  //       userAgent: userAgent,
  //       requestId: requestId,
  //       description: 'failed to verify password reset token - token has expired',
  //       details: { token: token },
  //     };
  //     this._logger.error(payload.description, payload);
  //
  //     await this._knex<Token>('user_tokens').where({ token: userToken.token, user_id: userToken.user_id }).del();
  //
  //     throw new Exception('Token has expired', Exception.UNAUTHORIZED);
  //   }
  //
  //   await this._knex<Token>('user_tokens').where({ token: userToken.token, user_id: userToken.user_id })
  //     .update({
  //       used_at: this._knex.fn.now(),
  //     });
  // }
  //
  // public async resetPassword(
  //   dto: ResetPasswordDto,
  //   ipAddress: string,
  //   userAgent: string,
  //   timestamp: string,
  //   requestId: string,
  // ): Promise<void> {
  //   const decodedToken = jwt.verify(dto.token, env.jwt_password_reset_secret, {
  //     ignoreExpiration: true,
  //   }) as jwt.JwtPayload;
  //   if (!decodedToken || decodedToken.type !== 'password-reset') {
  //     const payload: ILog = {
  //       action: 'RESET_PASSWORD',
  //       data: undefined,
  //       status: LogStatus.FAILED,
  //       timestamp: timestamp,
  //       ipAddress: ipAddress,
  //       userAgent: userAgent,
  //       requestId: requestId,
  //       description: 'failed to reset password - invalid token',
  //       details: { token: dto.token },
  //     };
  //     this._logger.error(payload.description, payload);
  //     throw new Exception('Invalid token', Exception.UNAUTHORIZED);
  //   }
  //
  //   const userToken = await this._knex<Token>('user_tokens').where({
  //     user_id: decodedToken.sub,
  //     token: dto.token,
  //     type: TokenType.RESET,
  //   }).first();
  //   if (!userToken) {
  //     const payload: ILog = {
  //       action: 'RESET_PASSWORD',
  //       data: undefined,
  //       status: LogStatus.FAILED,
  //       timestamp: timestamp,
  //       ipAddress: ipAddress,
  //       userAgent: userAgent,
  //       requestId: requestId,
  //       description: 'failed to reset password - token does not exist',
  //       details: { token: dto.token },
  //     };
  //     this._logger.error(payload.description, payload);
  //     throw new Exception('Invalid token', Exception.UNAUTHORIZED);
  //   }
  //
  //   if (!userToken.used_at) {
  //     const payload: ILog = {
  //       action: 'RESET_PASSWORD',
  //       data: undefined,
  //       status: LogStatus.FAILED,
  //       timestamp: timestamp,
  //       ipAddress: ipAddress,
  //       userAgent: userAgent,
  //       requestId: requestId,
  //       description: 'failed to reset password - token has not been verified',
  //       details: { token: dto.token },
  //     };
  //     this._logger.error(payload.description, payload);
  //     throw new Exception('Token has not been verified', Exception.UNAUTHORIZED);
  //   }
  //
  //   const user: User | null = await this._userService.findOne({ id: userToken.user_id });
  //   if (!user) {
  //     const payload: ILog = {
  //       action: 'RESET_PASSWORD',
  //       data: undefined,
  //       status: LogStatus.FAILED,
  //       timestamp: timestamp,
  //       ipAddress: ipAddress,
  //       userAgent: userAgent,
  //       requestId: requestId,
  //       description: 'failed to reset password - user not found',
  //       details: { userId: userToken.user_id },
  //     };
  //     this._logger.error(payload.description, payload);
  //     throw new Exception('User does not exist', Exception.NOT_FOUND);
  //   }
  //
  //   const profile: SchoolProfile | TeacherProfile | CreatorProfile | null =
  //     await this._userService.findProfile(user.id, decodedToken.profileType);
  //   if (!profile) {
  //     const payload: ILog = {
  //       action: 'RESET_PASSWORD',
  //       data: undefined,
  //       status: LogStatus.FAILED,
  //       timestamp: timestamp,
  //       ipAddress: ipAddress,
  //       userAgent: userAgent,
  //       requestId: requestId,
  //       description: 'failed to reset password - profile not found',
  //       details: { userId: user.id },
  //     };
  //     this._logger.error(payload.description, payload);
  //     throw new Exception('User does not exist', Exception.NOT_FOUND);
  //   }
  //
  //   // const salt = await bcrypt.genSalt(Number(env.bcrypt_rounds));
  //   const password = await bcrypt.hash(dto.password, Number(env.bcrypt_rounds));
  //   await this._knex.transaction(async trx => {
  //     switch (decodedToken.profileType) {
  //       case ProfileType.Teacher: {
  //         await trx<TeacherProfile>('teacher_profiles').where('user_id', user.id).update({
  //           password: password,
  //         });
  //         break;
  //       }
  //       case ProfileType.School: {
  //         await trx<SchoolProfile>('school_profiles').where('user_id', user.id).update({
  //           password: password,
  //         });
  //         break;
  //       }
  //       case ProfileType.Creator: {
  //         await trx<CreatorProfile>('creator_profiles').where('user_id', user.id).update({
  //           password: password,
  //         });
  //         break;
  //       }
  //       default: {
  //         const payload: ILog = {
  //           action: 'RESET_PASSWORD',
  //           data: undefined,
  //           status: LogStatus.FAILED,
  //           timestamp: timestamp,
  //           ipAddress: ipAddress,
  //           userAgent: userAgent,
  //           requestId: requestId,
  //           description: 'failed to reset password - invalid profile type',
  //           details: { userId: user.id },
  //         };
  //         this._logger.error(payload.description, payload);
  //         throw new Exception('Invalid profile type', Exception.UNAUTHORIZED);
  //       }
  //     }
  //
  //     await trx<Token>('user_tokens').where({ user_id: user.id, token: userToken.token }).del();
  //   });
  //
  //   await this._redis.addJob(RedisJob.SEND_PASSWORD_RESET_SUCCESS_EMAIL, {
  //     data: {
  //       name: 'first_name' in profile ? profile.first_name : 'name' in profile ? profile.name : '',
  //       email: user.email,
  //       profileType: decodedToken.profileType,
  //     },
  //     ip: ipAddress,
  //     userAgent: userAgent,
  //     timestamp: timestamp,
  //     requestId: requestId,
  //   });
  //
  //   const keys = await this._redis.client.keys(`${decodedToken.profileType}:${user.id}*`);
  //   for (const key of keys) {
  //     await this._redis.client.del(key);
  //   }
  // }

  public async logout(
    record: IAuthRecord,
    ipAddress: string,
    userAgent: string,
    timestamp: string,
    requestId: string,
  ): Promise<void> {
    await this._redis.client.del(`users:${record.id}:session-${record.lastLogin}`);

    const payload: ILog = {
      action: 'LOGOUT',
      data: undefined,
      status: LogStatus.SUCCESS,
      timestamp: timestamp,
      ipAddress: ipAddress,
      userAgent: userAgent,
      requestId: requestId,
      description: 'user logged out successfully',
      details: { userId: record.id },
    };
    this._logger.debug(payload.description, payload);
  }

  public async logoutFromAllDevices(
    record: IAuthRecord,
    ipAddress: string,
    userAgent: string,
    timestamp: string,
    requestId: string,
  ): Promise<void> {
    const keys = await this._redis.client.keys(`users:${record.id}*`);
    for (const key of keys) {
      await this._redis.client.del(key);
    }

    const payload: ILog = {
      action: 'LOGOUT_FROM_ALL_DEVICES',
      data: undefined,
      status: LogStatus.SUCCESS,
      timestamp: timestamp,
      ipAddress: ipAddress,
      userAgent: userAgent,
      requestId: requestId,
      description: 'user logged out from all devices successfully',
      details: { userId: record.id },
    };
    this._logger.debug(payload.description, payload);
  }
}