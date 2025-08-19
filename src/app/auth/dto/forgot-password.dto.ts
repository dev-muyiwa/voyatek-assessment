import { IsEmail, IsEnum, IsString, IsUrl, Matches } from 'class-validator';
import { ProfileType } from '../../../enums/enum';

export class ForgotPasswordDto implements Readonly<any> {
  @IsEmail({}, { message: 'email is required and must be valid' })
  email: string;

  @IsEnum(Object.values(ProfileType), { message: `profileType must be one of the following: ${Object.values(ProfileType).join(', ')}` })
  profileType: ProfileType;

  
    @Matches(/^\/[a-zA-Z0-9-_\/]*$/, {
      message: 'redirectPath must be a valid path starting with /',
    })
  redirectPath: string;
}