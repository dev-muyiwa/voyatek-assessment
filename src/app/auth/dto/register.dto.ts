import { IsEmail, IsString, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class RegisterDto {
  @IsString({ message: 'firstName is required' })
  @Length(2, undefined, { message: 'firstName must be at least 2 characters long' })
  readonly firstName!: string;

  @IsString({ message: 'lastName is required' })
  @Length(2, undefined, { message: 'lastName must be at least 2 characters long' })
  readonly lastName!: string;

  @IsString({ message: 'username is required' })
  @Length(3, undefined, { message: 'username must be at least 3 characters long' })
  readonly username!: string;

  @IsEmail({}, { message: 'email is required' })
  @Transform(({ value }) => value.toLowerCase().trim())
  readonly email!: string;

  @IsString({ message: 'password is required' })
  @Length(6, undefined, { message: 'password must be at least 6 characters long' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{6,}$/, {
    message: 'password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
  })
  readonly password!: string;
}

