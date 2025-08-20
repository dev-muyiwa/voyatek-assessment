import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRoomDto {
  @IsString({ message: 'name is required' })
  @IsNotEmpty({ message: 'name is required' })
  readonly name!: string;

  @IsOptional()
  @IsString({ message: 'description must be a string' })
  readonly description?: string | null;

  @IsBoolean({ message: 'isPrivate must be a boolean' })
  @Type(() => Boolean)
  readonly isPrivate!: boolean;
}

export class GetUserRoomsDto {
  @IsInt({ message: 'page must be a number' })
  @Type(() => Number)
  @Min(1, { message: 'page must be at least 1' })
  @IsOptional()
  readonly page: number = 1;

  @IsInt({ message: 'pageSize must be a number' })
  @Type(() => Number)
  @Min(5, { message: 'pageSize must be at least 1' })
  @Max(50, { message: 'pageSize must not exceed 50' })
  @IsOptional()
  readonly pageSize: number = 20;
}

export class InviteUserToRoomDto {
  @IsUUID(undefined, { message: 'Invalid room ID format' })
  roomId!: string;

  @IsUUID(undefined, { message: 'Invalid invitee ID format' })
  inviteeId!: string;
}

export class JoinRoomDto {
  @IsUUID(undefined, { message: 'Invalid room ID format' })
  roomId!: string;

  @IsOptional()
  @IsString()
  invite?: string;
}

export class GetRoomMessagesDto {
  @IsUUID(undefined, { message: 'Invalid room ID format' })
  roomId!: string;

  @IsInt({ message: 'page must be a number' })
  @Type(() => Number)
  @Min(1, { message: 'page must be at least 1' })
  @IsOptional()
  readonly page: number = 1;

  @IsInt({ message: 'pageSize must be a number' })
  @Type(() => Number)
  @Min(5, { message: 'pageSize must be at least 5' })
  @Max(100, { message: 'pageSize must not exceed 100' })
  @IsOptional()
  readonly pageSize: number = 20;
}

export class GetRoomDto {
  @IsUUID(undefined, { message: 'Invalid room ID format' })
  roomId!: string;
}

export class GetRoomMessageDto {
  @IsUUID(undefined, { message: 'Invalid room ID format' })
  roomId!: string;

  @IsUUID(undefined, { message: 'Invalid message ID format' })
  messageId!: string;
}