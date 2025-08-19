import { Request, Response } from 'express';
import { controller, httpPost } from 'inversify-express-utils';
import { inject } from 'inversify';
import { LIB_TYPES, MIDDLEWARE_TYPES, SERVICE_TYPES } from '../../../di/types';
import Default from '../../defaults/default';
import { BaseController } from '../../../internal/base.controller';
import { Logger } from '../../../config/logger';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { AuthService } from '../services/auth.service';
import { LoginDto } from '../dto/login.dto';
import { IAuthRecord } from '../../../interfaces/interfaces';
import { RegisterDto } from '../dto/register.dto';

@controller('/auth')
export class AuthController extends BaseController {
  constructor(
    @inject(SERVICE_TYPES.AuthService)
    private readonly _authService: AuthService,
    @inject(LIB_TYPES.Logger) protected readonly _logger: Logger,
  ) {
    super(_logger);
  }

  @httpPost('/register')
  public async register(req: Request, res: Response) {
    const requestId: string = Default.GENERATE_REQUEST_ID();
    const timestamp: string = new Date().toUTCString();
    const ip: string = req.ip as string;
    const userAgent: string = req.headers['user-agent'] as string;

    try {
      const dto: RegisterDto = plainToInstance(RegisterDto, req.body);
      await validateOrReject(dto);
      const data = await this._authService.register(dto, ip, userAgent, timestamp, requestId);
      this.sendSuccess(
        res,
        data,
        'User created',
        201,
        timestamp,
        requestId,
      );
    } catch (err) {
      this.sendError(res, requestId, err);
    }
  }

  @httpPost('/login')
  public async login(req: Request, res: Response) {
    const requestId: string = Default.GENERATE_REQUEST_ID();
    const timestamp: string = new Date().toUTCString();
    const ip: string = req.ip as string;
    const userAgent: string = req.headers['user-agent'] as string;
    try {
      const dto = plainToInstance(LoginDto, req.body);
      await validateOrReject(dto);
      const loginObject = await this._authService.login(
        dto,
        ip,
        userAgent,
        timestamp,
        requestId,
      );
      this.sendSuccess(
        res,
        loginObject,
        'Login successful',
        200,
        timestamp,
        requestId,
      );
    } catch (err) {
      this.sendError(res, requestId, err);
    }
  }

  // @httpPatch('/start-email-verification', MIDDLEWARE_TYPES.AuthMiddleware)
  // public async startEmailVerification(req: Request, res: Response) {
  //   const requestId: string = Default.GENERATE_REQUEST_ID();
  //   const timestamp: string = new Date().toUTCString();
  //   const ip: string = req.ip as string;
  //   const userAgent: string = req.headers['user-agent'] as string;
  //   const record = req.user as IAuthRecord;
  //   try {
  //     const email = await this._authService.startEmailVerification(
  //       record,
  //       ip,
  //       userAgent,
  //       timestamp,
  //       requestId,
  //     );
  //     this.sendSuccess(
  //       res,
  //       email,
  //       'Email verification started',
  //       200,
  //       timestamp,
  //       requestId,
  //     );
  //   } catch (err) {
  //     this.sendError(res, requestId, err);
  //   }
  // }
  //
  // @httpPatch('/verify-email', MIDDLEWARE_TYPES.AuthMiddleware)
  // public async verifyEmail(req: Request, res: Response) {
  //   const requestId: string = Default.GENERATE_REQUEST_ID();
  //   const timestamp: string = new Date().toUTCString();
  //   const ip: string = req.ip as string;
  //   const userAgent: string = req.headers['user-agent'] as string;
  //   const record = req.user as IAuthRecord;
  //   try {
  //     const dto = plainToInstance(TokenDto, req.body);
  //     await validateOrReject(dto);
  //     await this._authService.completeEmailVerification(
  //       record,
  //       dto,
  //       ip,
  //       userAgent,
  //       timestamp,
  //       requestId,
  //     );
  //     this.sendSuccess(res, null, 'Email verified', 200, timestamp, requestId);
  //   } catch (err) {
  //     this.sendError(res, requestId, err);
  //   }
  // }
  //
  // @httpPost('/forgot-password')
  // public async forgotPassword(req: Request, res: Response) {
  //   const requestId: string = Default.GENERATE_REQUEST_ID();
  //   const timestamp: string = new Date().toUTCString();
  //   const ip: string = req.ip as string;
  //   const userAgent: string = req.headers['user-agent'] as string;
  //   try {
  //     const dto = plainToInstance(ForgotPasswordDto, req.body);
  //     await validateOrReject(dto);
  //     await this._authService.forgotPassword(
  //       dto,
  //       ip,
  //       userAgent,
  //       timestamp,
  //       requestId,
  //     );
  //     this.sendSuccess(
  //       res,
  //       null,
  //       'Password reset link sent',
  //       200,
  //       timestamp,
  //       requestId,
  //     );
  //   } catch (err) {
  //     this.sendError(res, requestId, err);
  //   }
  // }
  //
  // @httpPatch('/verify-reset-token')
  // public async verifyResetToken(req: Request, res: Response) {
  //   const requestId: string = Default.GENERATE_REQUEST_ID();
  //   const timestamp: string = new Date().toUTCString();
  //   const ip: string = req.ip as string;
  //   const userAgent: string = req.headers['user-agent'] as string;
  //   try {
  //     const dto = plainToInstance(VerifyPasswordResetTokenDto, req.body);
  //     await validateOrReject(dto);
  //     await this._authService.verifyPasswordResetToken(
  //       dto.token,
  //       ip,
  //       userAgent,
  //       timestamp,
  //       requestId,
  //     );
  //     this.sendSuccess(res, null, 'Token verified', 200, timestamp, requestId);
  //   } catch (err) {
  //     this.sendError(res, requestId, err);
  //   }
  // }
  //
  // @httpPatch('/reset-password')
  // public async resetPassword(req: Request, res: Response) {
  //   const requestId: string = Default.GENERATE_REQUEST_ID();
  //   const timestamp: string = new Date().toUTCString();
  //   const ip: string = req.ip as string;
  //   const userAgent: string = req.headers['user-agent'] as string;
  //   try {
  //     const dto = plainToInstance(ResetPasswordDto, req.body);
  //     await validateOrReject(dto);
  //     await this._authService.resetPassword(
  //       dto,
  //       ip,
  //       userAgent,
  //       timestamp,
  //       requestId,
  //     );
  //     this.sendSuccess(
  //       res,
  //       null,
  //       'Password reset successful',
  //       200,
  //       timestamp,
  //       requestId,
  //     );
  //   } catch (err) {
  //     this.sendError(res, requestId, err);
  //   }
  // }

  @httpPost('/logout', MIDDLEWARE_TYPES.AuthMiddleware)
  public async logout(req: Request, res: Response) {
    const requestId: string = Default.GENERATE_REQUEST_ID();
    const timestamp: string = new Date().toUTCString();
    const ip: string = req.ip as string;
    const userAgent: string = req.headers['user-agent'] as string;
    try {
      await this._authService.logout(
        req.user as IAuthRecord,
        ip,
        userAgent,
        timestamp,
        requestId,
      );
      this.sendSuccess(
        res,
        null,
        'Logout successful',
        200,
        timestamp,
        requestId,
      );
    } catch (err) {
      this.sendError(res, requestId, err);
    }
  }

  @httpPost('/logout-all', MIDDLEWARE_TYPES.AuthMiddleware)
  public async logoutAll(req: Request, res: Response) {
    const requestId: string = Default.GENERATE_REQUEST_ID();
    const timestamp: string = new Date().toUTCString();
    const ip: string = req.ip as string;
    const userAgent: string = req.headers['user-agent'] as string;
    try {
      await this._authService.logoutFromAllDevices(
        req.user as IAuthRecord,
        ip,
        userAgent,
        timestamp,
        requestId,
      );
      this.sendSuccess(
        res,
        null,
        'Logged out from all devices',
        200,
        timestamp,
        requestId,
      );
    } catch (err) {
      this.sendError(res, requestId, err);
    }
  }
}
