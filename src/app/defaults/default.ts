import jwt from 'jsonwebtoken';
import { ProfileType } from '../../enums/enum';
import env from '../../config/env';

export default class Default {
  public static GENERATE_ACCESS_TOKEN = (userId: string, email: string, sessionId: number, rememberMe: boolean = false) => {
    return jwt.sign({
      email: email,
      type: 'access',
      lastLogin: sessionId,
      rememberMe: rememberMe,
    }, env.jwt_access_secret, { expiresIn: rememberMe ? '30d' : '20m', subject: userId });
  };

  public static GENERATE_REFRESH_TOKEN = (userId: string, email: string, profileType: ProfileType, rememberMe: boolean = false) => {
    return jwt.sign({
      email: email,
      profileType: profileType,
      type: 'refresh',
    }, env.jwt_refresh_secret, { expiresIn: rememberMe ? '30d' : '5d', subject: userId });
  };

  public static GENERATE_PASSWORD_RESET_TOKEN = (userId: string, email: string, profileType: ProfileType | 'admin', expiresIn: number) => {
    return jwt.sign({
      email: email,
      profileType: profileType,
      type: 'password-reset',
    }, env.jwt_password_reset_secret, { expiresIn: `${expiresIn}m`, subject: userId });
  };

  public static GENERATE_REQUEST_ID(): string {
    const prefix: string = 'REQ_';
    const length: number = 18;
    const randomNumber: number = Math.floor(Math.random() * Math.pow(10, length - prefix.length));
    return prefix + randomNumber.toString().padStart(length - prefix.length, '0');
  };

  public static GENERATE_RANDOM_ID(prefix: string = 'REX_', length: number = 18): string {
    const randomNumber: number = Math.floor(Math.random() * Math.pow(10, length - prefix.length));
    return prefix + randomNumber.toString().padStart(length - prefix.length, '0');
  };

  public static GENERATE_OTP(length: number = 6): string {
    let OTP = '';
    for (let i = 0; i < length; i++) {
      OTP += Math.floor(Math.random() * 10).toString();
    }
    return OTP;
  };
}
