import { IsString, Matches } from 'class-validator';

export class TokenDto implements Readonly<any> {
  @Matches(/^\d{6}$/, { message: 'one-time passcode must be exactly 6 digits' })
  otp: string;
}

export class VerifyPasswordResetTokenDto implements Readonly<any> {
  @IsString({ message: 'token is required' })
  token: string;
}

export class ResetPasswordDto implements Readonly<any> {
  @IsString({ message: 'password is required' })
  password: string;

  @IsString({ message: 'token is required' })
  token: string;
}