import { IsEmail, IsEnum, IsOptional, IsString, ValidateIf } from 'class-validator';
import { ProfileType } from '../../../enums/enum';

export class CreateUserDto {
  @IsEmail({}, { message: 'email is required' })
  readonly email: string;

  @IsString({ message: 'password is required' })
  readonly password: string;

  @IsString({ message: 'callingCode is required' })
  readonly callingCode: number;

  @IsString({ message: 'nationalNumber is required' })
  readonly nationalNumber: string;

  @IsEnum(Object.values(ProfileType), { message: `profileType must be one of the following: ${Object.values(ProfileType).join(', ')}` })
  readonly profileType: ProfileType;

  @ValidateIf((o) => o.profileType === ProfileType.Teacher || o.profileType === ProfileType.Creator)
  @IsString({ message: 'firstName is required' })
  readonly firstName?: string;

  @ValidateIf((o) => o.profileType === ProfileType.Teacher || o.profileType === ProfileType.Creator)
  @IsString({ message: 'lastName is required' })
  readonly lastName?: string;

  @ValidateIf((o) => o.profileType === ProfileType.School)
  @IsString({ message: 'name is required' })
  readonly name?: string;

  @ValidateIf((o) => o.profileType === ProfileType.Teacher)
  @IsOptional()
  @IsString({ message: 'referral is required' })
  readonly referral?: string;
}

export class UpdatePhoneNumberDto implements Readonly<any> {
  @IsString({ message: 'callingCode is required' })
  readonly callingCode: number;

  @IsString({ message: 'nationalNumber is required' })
  readonly nationalNumber: string;
}

export class UpdatePasswordDto implements Readonly<any> {
  @IsString({ message: 'oldPassword is required' })
  readonly oldPassword: string;

  @IsString({ message: 'newPassword is required' })
  readonly newPassword: string;
}