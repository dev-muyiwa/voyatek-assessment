import { IsBoolean, IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class LoginDto {
  @IsEmail({}, { message: 'email is required and must be valid' })
  email: string;

  @IsString({ message: 'password is required' })
  @IsNotEmpty({ message: 'password is required' })
  password: string;

  @IsBoolean({ message: 'rememberMe must be a boolean' })
  @Type(() => Boolean)
  rememberMe: boolean = false;
}