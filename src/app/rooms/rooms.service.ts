import { inject, injectable } from 'inversify';
import { LIB_TYPES, SERVICE_TYPES } from '../../di/types';
import { Database } from '../../config/db';
import { Logger } from '../../config/logger';
import env from '../../config/env';
import { BaseService } from '../../internal/base.service';
import { Exception } from '../../internal/exception';
import { IAuthRecord } from '../../interfaces/interfaces';
import {
  CreateRoomDto,
  GetRoomDto, GetRoomMessageDto,
  GetRoomMessagesDto,
  GetUserRoomsDto,
  InviteUserToRoomDto,
  JoinRoomDto,
} from './dto/room.dto';
import { PrismaClient } from '@prisma/client';
import { UserService } from '../users/user.service';
import { PresenceService } from '../users/presence.service';
import { MessageReceiptsService } from '../messages/message-receipts.service';
import { createInviteToken } from '../realtime/socket';
import { PaginationService } from '../../internal/prisma';

@injectable()
export class RoomsService extends BaseService {
  private readonly _client: PrismaClient;
  private readonly pagination: PaginationService;

  constructor(
    @inject(LIB_TYPES.KnexDB) private readonly _db: Database,
    @inject(LIB_TYPES.Logger) private readonly _logger: Logger,
    @inject(SERVICE_TYPES.UserService) private readonly _userService: UserService,
    @inject(SERVICE_TYPES.PresenceService) private readonly _presenceService: PresenceService,
    @inject(SERVICE_TYPES.MessageReceiptsService) private readonly _messageReceiptsService: MessageReceiptsService,
  ) {
    super(_logger);
    this._client = this._db.connection;
    this.pagination = new PaginationService(this._client);
  }

  private async verifyRoomMembership(userId: string, roomId: string): Promise<void> {
    const membership = await this._client.room_members.findFirst({
      where: {
        room_id: roomId,
        member_id: userId,
        deleted_at: null,
      },
      select: { id: true },
    });

    if (!membership) {
      this.logError('User is not a member of the room', { roomId, userId });
      throw new Exception('You are not a member of this room', Exception.FORBIDDEN);
    }
  }

  public async listUserRooms(
    record: IAuthRecord,
    dto: GetUserRoomsDto,
    ip: string,
    userAgent: string,
    timestamp: string,
    requestId: string,
  ) {
    this.action = 'LIST_USER_ROOMS';
    this.ipAddress = ip;
    this.userAgent = userAgent;
    this.requestId = requestId;
    this.timestamp = timestamp;

    const { data, ...metadata } = await this.pagination.paginate('rooms', {
      page: dto.page,
      pageSize: dto.pageSize,
      where: {
        room_members: {
          some: {
            member_id: record.id,
            deleted_at: null,
          },
        },
        deleted_at: null,
      },
      select: {
        id: true,
        name: true,
        description: true,
        is_private: true,
        created_at: true,
      },
      orderBy: { created_at: 'desc' },
    });

    this.logDebug('Fetched user rooms', { metadata: metadata }, { userId: record.id });

    return {
      ...metadata,
      data: data,
    };
  }

  public async createRoom(
    record: IAuthRecord,
    dto: CreateRoomDto,
    ip: string,
    userAgent: string,
    timestamp: string,
    requestId: string,
  ) {
    this.action = 'CREATE_ROOM';
    this.ipAddress = ip;
    this.userAgent = userAgent;
    this.requestId = requestId;
    this.timestamp = timestamp;

    const user = await this._userService.findOne({ id: record.id });
    if (!user || user.deleted_at) {
      this.logError('User not found', { userId: record.id });
      throw new Exception('User not found', Exception.NOT_FOUND);
    }

    const room = await this._client.$transaction(async (trx: PrismaClient) => {
      const newRoom = await trx.rooms.create({
        data: {
          name: dto.name,
          description: dto.description || null,
          is_private: dto.isPrivate,
        },
        select: { id: true, name: true, description: true, is_private: true },
      });

      await trx.room_members.create({
        data: { room_id: newRoom.id, member_id: user.id, role: 'owner' },
      });

      return newRoom;
    });

    this.logDebug('Room created', room, { ownerId: user.id });
    return room;
  }

  public async inviteUserToRoom(
    record: IAuthRecord,
    dto: InviteUserToRoomDto,
    ip: string,
    userAgent: string,
    timestamp: string,
    requestId: string,
  ) {
    this.action = ' INVITE_USER_TO_ROOM';
    this.ipAddress = ip;
    this.userAgent = userAgent;
    this.requestId = requestId;
    this.timestamp = timestamp;

    const room = await this._client.rooms.findUnique({
      where: { id: dto.roomId, deleted_at: null },
      select: { id: true, is_private: true },
    });
    if (!room) {
      this.logError('Room not found', { roomId: dto.roomId });
      throw new Exception('Room not found', Exception.NOT_FOUND);
    }

    await this.verifyRoomMembership(record.id, dto.roomId);

    const newInvitee = await this._client.users.findUnique({
      where: { id: dto.inviteeId, deleted_at: null },
      select: { id: true },
    });
    if (!newInvitee) {
      this.logError('Invitee user not found', { inviteeId: dto.inviteeId });
      throw new Exception('Invitee not found', Exception.NOT_FOUND);
    }

    const existingMembership = await this._client.room_members.findFirst({
      where: {
        room_id: room.id,
        member_id: newInvitee.id,
      },
      select: { id: true },
    });
    if (existingMembership) {
      this.logError('Invitee is already a member of the room', { roomId: room.id, inviteeId: newInvitee.id });
      throw new Exception('Invitee is already a member of the room', Exception.CONFLICT);
    }

    const token = createInviteToken(env.jwt_access_secret, newInvitee.id, room.id);
    return { invite: token };
  }

  private async joinPublicRoom(
    record: IAuthRecord,
    roomId: string,
    ip: string,
    userAgent: string,
    timestamp: string,
    requestId: string,
  ) {
    this.action = 'JOIN_PUBLIC_ROOM';
    this.ipAddress = ip;
    this.userAgent = userAgent;
    this.requestId = requestId;
    this.timestamp = timestamp;

    const room = await this._client.rooms.findFirst({
      where: { id: roomId, deleted_at: null, is_private: false },
      select: { id: true },
    });
    if (!room) {
      this.logError('Room not found or is private', { roomId });
      throw new Exception('Room not found', Exception.NOT_FOUND);
    }

    const existing = await this._client.room_members.findFirst({
      where: { room_id: roomId, member_id: record.id, deleted_at: null },
      select: { id: true },
    });
    if (!existing) {
      await this._client.room_members.create({ data: { room_id: roomId, member_id: record.id, role: 'member' } });
    }

    this.logDebug('Joined public room', { roomId }, { userId: record.id });
    return { roomId };
  }

  private async joinPrivateRoom(
    record: IAuthRecord,
    invite: string,
    ip: string,
    userAgent: string,
    timestamp: string,
    requestId: string,
  ) {
    this.action = 'JOIN_PRIVATE_ROOM';
    this.ipAddress = ip;
    this.userAgent = userAgent;
    this.requestId = requestId;
    this.timestamp = timestamp;

    const payload = (() => {
      try {
        return Buffer.from(invite, 'base64').toString('utf8');
      } catch {
        return null;
      }
    })();
    if (!payload) {
      this.logError('Invalid invite token (base64)', { invite });
      throw new Exception('Invalid invite', Exception.UNAUTHORIZED);
    }

    let decoded: any;
    try {
      const jwt = require('jsonwebtoken');
      decoded = jwt.verify(payload, env.jwt_access_secret);
    } catch {
      this.logError('Invalid invite token (jwt)', {});
      throw new Exception('Invalid invite', Exception.UNAUTHORIZED);
    }

    if (!decoded?.u || !decoded?.r || decoded.u !== record.id) {
      this.logError('Invite does not match user', decoded || {});
      throw new Exception('Invalid invite', Exception.UNAUTHORIZED);
    }

    const room = await this._client.rooms.findFirst({
      where: { id: decoded.r, is_private: true, deleted_at: null },
      select: { id: true },
    });
    if (!room) {
      this.logError('Private room not found', { roomId: decoded.r });
      throw new Exception('Room not found', Exception.NOT_FOUND);
    }

    const existing = await this._client.room_members.findFirst({
      where: { room_id: decoded.r, member_id: record.id, deleted_at: null },
      select: { id: true },
    });
    if (!existing) {
      await this._client.room_members.create({ data: { room_id: decoded.r, member_id: record.id, role: 'member' } });
    }

    this.logDebug('Joined private room', { roomId: decoded.r }, { userId: record.id });
    return { roomId: decoded.r };
  }

  public async joinRoom(
    record: IAuthRecord,
    dto: JoinRoomDto,
    ip: string,
    userAgent: string,
    timestamp: string,
    requestId: string,
  ) {
    this.action = 'JOIN_ROOM';
    this.ipAddress = ip;
    this.userAgent = userAgent;
    this.requestId = requestId;
    this.timestamp = timestamp;

    const room = await this._client.rooms.findFirst({
      where: { id: dto.roomId, deleted_at: null },
      select: { id: true, is_private: true },
    });
    if (!room) {
      this.logError('Room not found', dto);
      throw new Exception('Room not found', Exception.NOT_FOUND);
    }

    if (room.is_private) {
      if (!dto.invite) {
        this.logError('Invite token required for private room', dto);
        throw new Exception('Invite required', Exception.UNAUTHORIZED);
      }
      // Reuse the existing joinPrivateRoom logic
      return this.joinPrivateRoom(record, dto.invite, ip, userAgent, timestamp, requestId);
    }

    // Public room
    return this.joinPublicRoom(record, dto.roomId, ip, userAgent, timestamp, requestId);
  }

  public async getRoomMessages(
    record: IAuthRecord,
    dto: GetRoomMessagesDto,
    ip: string,
    userAgent: string,
    timestamp: string,
    requestId: string,
  ) {
    this.action = 'GET_ROOM_MESSAGES';
    this.ipAddress = ip;
    this.userAgent = userAgent;
    this.requestId = requestId;
    this.timestamp = timestamp;

    // Verify user is a member of the room
    await this.verifyRoomMembership(record.id, dto.roomId);

    // Fetch messages with pagination
    const { data, ...metadata } = await this.pagination.paginate('messages', {
      page: dto.page,
      pageSize: dto.pageSize,
      where: {
        room_id: dto.roomId,
        deleted_at: null,
      },
      select: {
        id: true,
        content: true,
        created_at: true,
        sender: {
          select: {
            username: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    // Get receipt information for all messages
    const messageIds = data.map((message: any) => message.id);
    const receiptsMap = await this._messageReceiptsService.getMessagesWithReceipts(messageIds);

    // Auto-mark fetched messages as read for the requesting user
    const readCount = await this._messageReceiptsService.markMultipleAsRead(messageIds, record.id);

    this.logDebug('Fetched room messages with receipts and marked as read', { 
      metadata, 
      roomId: dto.roomId,
      messageCount: data.length,
      markedAsReadCount: readCount
    }, { userId: record.id });

    return {
      ...metadata,
      data: data.map((message: any) => {
        const receipts = receiptsMap.get(message.id) || {
          totalRecipients: 0,
          readCount: 0,
          readStatus: 'no_recipients'
        };

        return {
          ...message,
          timestamp: message.created_at.toISOString(),
          receipts: {
            totalRecipients: receipts.totalRecipients,
            readCount: receipts.readCount,
            readStatus: receipts.readStatus,
          }
        };
      }),
    };
  }

  public async getRoomMembers(
    record: IAuthRecord,
    dto: GetRoomDto,
    ip: string,
    userAgent: string,
    timestamp: string,
    requestId: string,
  ) {
    this.action = 'GET_ROOM_MEMBERS';
    this.ipAddress = ip;
    this.userAgent = userAgent;
    this.requestId = requestId;
    this.timestamp = timestamp;

    // Verify user is a member of the room
    await this.verifyRoomMembership(record.id, dto.roomId);

    // Fetch room members
    const members = await this._client.room_members.findMany({
      where: {
        room_id: dto.roomId,
        deleted_at: null,
      },
      select: {
        id: true,
        role: true,
        created_at: true,
        member: {
          select: {
            id: true,
            username: true,
            first_name: true,
            last_name: true,
          },
        },
      },
      orderBy: { created_at: 'asc' },
    });

    // Get presence information for all members
    const memberIds = members.map((member: any) => member.member.id);
    const presenceData = await this._presenceService.getMultipleUserPresence(memberIds);
    
    // Create a map for quick lookup
    const presenceMap = new Map(presenceData.map(p => [p.userId, p]));

    this.logDebug('Fetched room members with presence', { 
      roomId: dto.roomId, 
      memberCount: members.length 
    }, { userId: record.id });

    return {
      data: members.map((member: any) => {
        const presence = presenceMap.get(member.member.id);
        return {
          id: member.id,
          role: member.role,
          joinedAt: member.created_at.toISOString(),
          user: {
            ...member.member,
            presence: {
              status: presence?.status || 'offline',
              lastSeen: presence?.lastSeen || new Date().toISOString(),
            }
          },
        };
      }),
    };
  }

  public async getRoomPresence(
    record: IAuthRecord,
    dto: GetRoomDto,
    ip: string,
    userAgent: string,
    timestamp: string,
    requestId: string,
  ) {
    this.action = 'GET_ROOM_PRESENCE';
    this.ipAddress = ip;
    this.userAgent = userAgent;
    this.requestId = requestId;
    this.timestamp = timestamp;

    // Verify user is a member of the room
    await this.verifyRoomMembership(record.id, dto.roomId);

    // Get room presence from presence service
    const presence = await this._presenceService.getRoomPresence(dto.roomId);

    this.logDebug('Fetched room presence', { 
      roomId: dto.roomId, 
      onlineCount: presence.filter(p => p.status === 'online').length,
      totalCount: presence.length
    }, { userId: record.id });

    return {
      data: presence,
      summary: {
        totalUsers: presence.length,
        onlineUsers: presence.filter(p => p.status === 'online').length,
        offlineUsers: presence.filter(p => p.status === 'offline').length,
      }
    };
  }

  public async getMessageReceipts(
    record: IAuthRecord,
    dto: GetRoomMessageDto,
    ip: string,
    userAgent: string,
    timestamp: string,
    requestId: string,
  ) {
    this.action = 'GET_MESSAGE_RECEIPTS';
    this.ipAddress = ip;
    this.userAgent = userAgent;
    this.requestId = requestId;
    this.timestamp = timestamp;

    // Verify user is a member of the room
    await this.verifyRoomMembership(record.id, dto.roomId);

    // Verify the message exists in the specified room
    const message = await this._client.messages.findFirst({
      where: {
        id: dto.messageId,
        room_id: dto.roomId,
        deleted_at: null,
      },
      select: {
        id: true,
        content: true,
        created_at: true,
        sender_id: true,
        sender: {
          select: {
            id: true,
            username: true,
            first_name: true,
            last_name: true,
          },
        },
      },
    });

    if (!message) {
      this.logError('Message not found in room', { messageId: dto.messageId, roomId: dto.roomId });
      throw new Exception('Message not found', Exception.NOT_FOUND);
    }

    // Get detailed receipt information
    const receipts = await this._messageReceiptsService.getMessageReceipts(dto.messageId);

    this.logDebug('Fetched message receipts', { 
      messageId: dto.messageId, 
      roomId: dto.roomId,
      receiptCount: receipts.length
    }, { userId: record.id });

    return {
      message: {
        id: message.id,
        content: message.content,
        createdAt: message.created_at.toISOString(),
        sender: message.sender,
      },
      receipts: receipts,
      summary: {
        totalRecipients: receipts.length,
        readCount: receipts.filter(r => r.read).length,
      },
    };
  }
}

