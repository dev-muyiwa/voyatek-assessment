import { Server, Socket } from 'socket.io';
import { Database } from '../../config/db';
import { Logger } from '../../config/logger';
import jwt from 'jsonwebtoken';
import { RedisClient } from '../../config/redis';
import { PresenceService } from '../users/presence.service';
import { RateLimiterService } from '../users/rate-limiter.service';
import { ValidationService } from '../common/validation.service';
import { MessageReceiptsService } from '../messages/message-receipts.service';
import { UserService } from '../users/user.service';
import { inject, injectable } from 'inversify';
import { LIB_TYPES, SERVICE_TYPES } from '../../di/types';

type InvitePayload = { u: string; r: string; t: number };

export function createInviteToken(secret: string, userId: string, roomId: string): string {
  const token = jwt.sign({ u: userId, r: roomId }, secret, { expiresIn: '3d' });
  return Buffer.from(token).toString('base64');
}

export function verifyInviteToken(secret: string, base64Token: string): InvitePayload | null {
  try {
    const decoded = Buffer.from(base64Token, 'base64').toString('utf8');
    const payload = jwt.verify(decoded, secret) as any;
    return { u: payload.u, r: payload.r, t: Date.now() };
  } catch {
    return null;
  }
}

@injectable()
export class SocketService {
  private io!: Server;
  private client: any;

  constructor(
    @inject(LIB_TYPES.KnexDB) private readonly db: Database,
    @inject(LIB_TYPES.Logger) private readonly logger: Logger,
    @inject(LIB_TYPES.RedisClient) private readonly redisClient: RedisClient,
    @inject(SERVICE_TYPES.PresenceService) private readonly presenceService: PresenceService,
    @inject(SERVICE_TYPES.RateLimiterService) private readonly rateLimiterService: RateLimiterService,
    @inject(SERVICE_TYPES.ValidationService) private readonly validationService: ValidationService,
    @inject(SERVICE_TYPES.MessageReceiptsService) private readonly messageReceiptsService: MessageReceiptsService,
    @inject(SERVICE_TYPES.UserService) private readonly userService: UserService,
  ) {
    this.client = this.db.connection;
  }

  private async getUserPublic(userId: string): Promise<{ id: string; username: string; first_name: string; last_name: string } | null> {
    return await this.userService.findOne(
      { id: userId },
      { id: true, username: true, first_name: true, last_name: true }
    ) as any;
  }

  public init(io: Server, secret: string): void {
    this.io = io;
    this.setupAuthenticationMiddleware(secret);
    this.setupConnectionHandler(secret);
  }

  private async authenticateSocket(socket: Socket, secret: string): Promise<{ id: string; email: string } | null> {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        this.logger.debug('No token provided for socket connection');
        return null;
      }

      const payload = jwt.verify(token, secret, { ignoreExpiration: true }) as any;
      const tokenKey = `users:${payload.sub}:session-${payload.lastLogin}`;
      const ttl = await this.redisClient.client.ttl(tokenKey);
      
      if (ttl < 0) {
        this.logger.debug('Token expired for socket connection', { userId: payload.sub });
        return null;
      }

      // Extend token TTL
      const expiration = payload.rememberMe ? 30 * 24 * 60 * 60 : 5 * 24 * 60 * 60;
      await this.redisClient.client.expire(tokenKey, expiration);

      return {
        id: payload.sub as string,
        email: payload.email,
      };
    } catch (err: any) {
      this.logger.debug('Invalid token for socket connection', { error: err.message });
      return null;
    }
  }

  private async verifyRoomMembership(userId: string, roomId: string): Promise<boolean> {
    const membership = await this.client.room_members.findFirst({
            where: {
        room_id: roomId,
              member_id: userId,
        deleted_at: null,
      },
      select: { id: true },
    });
    return !!membership;
  }

  private setupAuthenticationMiddleware(secret: string): void {
    this.io.use(async (socket, next) => {
      const user = await this.authenticateSocket(socket, secret);
      if (!user) {
        this.logger.debug('Socket connection rejected: unauthenticated', { socketId: socket.id });
        return next(new Error('Unauthorized'));
      }
      
      socket.data.user = user;
      this.logger.debug('Socket authenticated', { userId: user.id, socketId: socket.id });
      next();
    });
  }

  private setupConnectionHandler(secret: string): void {
    this.io.on('connection', async (socket: Socket) => {
      const user = socket.data.user;
      this.logger.info(`authenticated socket connected: ${socket.id}`, { userId: user.id });

      // Set user as online
      await this.presenceService.setUserOnline(user.id, socket.id);
      
      // Start heartbeat for presence
      socket.data.heartbeat = this.presenceService.startHeartbeat(user.id);

      this.setupJoinRoomHandler(socket, user);
      this.setupSendMessageHandler(socket, user);
      this.setupTypingHandler(socket, user);
      this.setupMessageReceiptHandlers(socket, user);
      this.setupLeaveRoomHandler(socket, user);
      this.setupDisconnectHandler(socket, user);
    });
  }

  private setupJoinRoomHandler(socket: Socket, user: { id: string; email: string }): void {
    socket.on('join_room', async (data: { roomId: string }) => {
      try {
        const rateLimitResult = await this.rateLimiterService.checkRateLimit(
          user.id,
          RateLimiterService.CONFIGS.JOIN_ROOM_RATE_LIMIT
        );

        if (!rateLimitResult.allowed) {
          socket.emit('join_room_error', { 
            message: 'Too many join attempts. Please try again later.',
            retryAfter: rateLimitResult.retryAfter
          });
          return;
        }

        const validationResult = this.validationService.validateJoinRoomData(data);
        if (!validationResult.isValid) {
          socket.emit('join_room_error', { 
            message: 'Invalid request data',
            errors: validationResult.errors
          });
          return;
        }

        const { roomId } = data;

        const room = await this.client.rooms.findFirst({
          where: { id: roomId, deleted_at: null },
          select: { id: true, is_private: true, name: true }
        });

        if (!room) {
          socket.emit('join_room_error', { message: 'Room not found' });
          return;
        }

        const isMember = await this.verifyRoomMembership(user.id, roomId);
        if (!isMember) {
          this.logger.debug('User attempted to join room without membership', { 
            userId: user.id, 
            roomId,
            roomName: room.name,
            isPrivate: room.is_private
          });
          
          const errorMessage = room.is_private 
            ? 'This is a private room. You need an invitation to join.'
            : 'You are not a member of this room';
            
          socket.emit('join_room_error', { message: errorMessage });
          return;
        }

        // Join the room
        socket.join(roomId);
        socket.data.currentRoomId = roomId;

        await this.presenceService.addUserToRoom(roomId, user.id);

        const userPresence = await this.presenceService.getUserPresence(user.id);
        const userPublic = await this.getUserPublic(user.id);

        socket.to(roomId).emit('user_joined', { 
          user_id: user.id,
          username: userPublic?.username,
          first_name: userPublic?.first_name,
          last_name: userPublic?.last_name,
          status: userPresence?.status || 'online',
          timestamp: new Date().toISOString()
        });

        socket.to(roomId).emit('user_status', {
          user_id: user.id,
          username: userPublic?.username,
          first_name: userPublic?.first_name,
          last_name: userPublic?.last_name,
          status: 'online',
          last_seen: userPresence?.lastSeen || new Date().toISOString(),
          timestamp: new Date().toISOString()
        });

        const roomPresence = await this.presenceService.getRoomPresence(roomId);

        const unreadMessages = await this.messageReceiptsService.getUnreadMessages(user.id, roomId);
        if (unreadMessages.length > 0) {
          const readCount = await this.messageReceiptsService.markMultipleAsRead(unreadMessages, user.id);
          if (readCount > 0) {
            this.io.to(roomId).emit('messages_read', {
              recipientId: user.id,
              messageCount: readCount,
              timestamp: new Date().toISOString()
            });
          }
        }

        socket.emit('joined_room', { 
          room_id: roomId,
          timestamp: new Date().toISOString(),
          presence: roomPresence.map(p => ({
            user_id: p.userId,
            status: p.status,
            last_seen: p.lastSeen,
          })),
          unread_count: unreadMessages.length
        });

        this.logger.debug('User joined room', { userId: user.id, roomId });
      } catch (e: any) {
        this.logger.error('join_room error', { error: e.message, userId: user.id });
        socket.emit('join_room_error', { message: 'Failed to join room' });
      }
    });
  }

  private setupSendMessageHandler(socket: Socket, user: { id: string; email: string }): void {
    socket.on('send_message', async (data: { roomId: string; content: string }) => {
      try {
        const rateLimitResult = await this.rateLimiterService.checkRateLimit(
          user.id,
          RateLimiterService.CONFIGS.MESSAGE_RATE_LIMIT
        );

        if (!rateLimitResult.allowed) {
          socket.emit('message_error', { 
            message: `Rate limit exceeded. You can send ${RateLimiterService.CONFIGS.MESSAGE_RATE_LIMIT.maxRequests} messages per ${RateLimiterService.CONFIGS.MESSAGE_RATE_LIMIT.windowSeconds} seconds.`,
            retryAfter: rateLimitResult.retryAfter,
            remaining: rateLimitResult.remaining
          });
          return;
        }

        const { roomId, content } = data || {};

        // Validate room ID
        if (!roomId) {
          socket.emit('message_error', { message: 'Room ID is required' });
          return;
        }

        const roomValidation = this.validationService.validateRoomId(roomId);
        if (!roomValidation.isValid) {
          socket.emit('message_error', { 
            message: 'Invalid room ID format',
            errors: roomValidation.errors
          });
          return;
        }

        // Validate message content
        const messageValidation = this.validationService.validateMessage(content);
        if (!messageValidation.isValid) {
          socket.emit('message_error', { 
            message: 'Invalid message content',
            errors: messageValidation.errors
          });
          return;
        }

        // Sanitize the message content
        const sanitizedContent = this.validationService.sanitizeMessage(content);
        if (!sanitizedContent) {
          socket.emit('message_error', { message: 'Message content cannot be empty after sanitization' });
          return;
        }

        // Check if user is currently in the room (socket level)
        if (socket.data.currentRoomId !== roomId) {
          socket.emit('message_error', { message: 'You must join the room before sending messages' });
          return;
        }

        // Verify user is a member of the room (database level)
        const isMember = await this.verifyRoomMembership(user.id, roomId);
        if (!isMember) {
          this.logger.debug('User attempted to send message to room without membership', { 
            userId: user.id, 
            roomId 
          });
          socket.emit('message_error', { message: 'You are not a member of this room' });
          return;
        }

        const message = await this.client.messages.create({
          data: { 
            room_id: roomId, 
            sender_id: user.id, 
            content: sanitizedContent 
          },
            select: {
              id: true,
              room_id: true,
              content: true,
              created_at: true,
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

        // Create delivery receipts for all room members (except sender)
        await this.messageReceiptsService.createDeliveryReceipts(message.id, roomId, user.id);

        this.io.to(roomId).emit('receive_message', {
          id: message.id,
          room_id: message.room_id,
          content: message.content,
          timestamp: message.created_at.toISOString(),
          sender: {
            id: message.sender.id,
            username: message.sender.username,
            first_name: message.sender.first_name,
            last_name: message.sender.last_name,
          }
        });

        this.logger.debug('Message sent with receipts', { 
          messageId: message.id, 
          userId: user.id, 
          roomId,
          contentLength: sanitizedContent.length
        });
      } catch (e: any) {
        this.logger.error('send_message error', { error: e.message, userId: user.id });
        socket.emit('message_error', { message: 'Failed to send message' });
      }
    });
  }

  private setupTypingHandler(socket: Socket, user: { id: string; email: string }): void {
    socket.on('typing', async (data: { roomId: string; isTyping: boolean }) => {
      try {
        const rateLimitResult = await this.rateLimiterService.checkRateLimit(
          user.id,
          RateLimiterService.CONFIGS.TYPING_RATE_LIMIT
        );

        if (!rateLimitResult.allowed) {
          return;
        }

        const validationResult = this.validationService.validateTypingData(data);
        if (!validationResult.isValid) {
          this.logger.debug('Invalid typing data', { 
            userId: user.id, 
            data, 
            errors: validationResult.errors 
          });
          return;
        }

        const { roomId, isTyping } = data;

        if (socket.data.currentRoomId !== roomId) {
          return;
        }

        const userPublic = await this.getUserPublic(user.id);
        socket.to(roomId).emit('typing', { 
          user_id: user.id,
          username: userPublic?.username,
          first_name: userPublic?.first_name,
          last_name: userPublic?.last_name,
          is_typing: isTyping,
          timestamp: new Date().toISOString()
        });
      } catch (e: any) {
        this.logger.error('typing error', { error: e.message, userId: user.id });
      }
    });
  }

  private setupMessageReceiptHandlers(socket: Socket, user: { id: string; email: string }): void {

    socket.on('message_read', async (data: { messageId: string; roomId: string }) => {
      try {
        const { messageId, roomId } = data || {};

        if (!messageId || !roomId) {
          return;
        }

        if (socket.data.currentRoomId !== roomId) {
          return;
        }

        // Mark as read
        const updated = await this.messageReceiptsService.markAsRead(messageId, user.id);
        
        if (updated) {
          // Notify the sender that the message was read
          const userPublic = await this.getUserPublic(user.id);
          this.io.to(roomId).emit('message_receipt', {
            message_id: messageId,
            recipient_id: user.id,
            username: userPublic?.username,
            first_name: userPublic?.first_name,
            last_name: userPublic?.last_name,
            status: 'read',
            timestamp: new Date().toISOString()
          });
        }
      } catch (e: any) {
        this.logger.error('message_read error', { error: e.message, userId: user.id });
      }
    });

    socket.on('mark_messages_read', async (data: { messageIds: string[]; roomId: string }) => {
      try {
        const { messageIds, roomId } = data || {};

        if (!messageIds || !Array.isArray(messageIds) || !roomId) {
          return;
        }

        // Verify user is in the room
        if (socket.data.currentRoomId !== roomId) {
          return;
        }

        const updatedCount = await this.messageReceiptsService.markMultipleAsRead(messageIds, user.id);
        
        if (updatedCount > 0) {
          // Notify about bulk read
          const userPublic = await this.getUserPublic(user.id);
          this.io.to(roomId).emit('messages_read', {
            recipient_id: user.id,
            username: userPublic?.username,
            first_name: userPublic?.first_name,
            last_name: userPublic?.last_name,
            message_count: updatedCount,
            timestamp: new Date().toISOString()
          });
        }
      } catch (e: any) {
        this.logger.error('mark_messages_read error', { error: e.message, userId: user.id });
      }
    });
  }

  private setupLeaveRoomHandler(socket: Socket, user: { id: string; email: string }): void {
    socket.on('leave_room', async (data: { roomId: string }) => {
      try {
        const { roomId } = data || {};
        
        if (!roomId) {
          return;
        }

        socket.leave(roomId);
        if (socket.data.currentRoomId === roomId) {
          socket.data.currentRoomId = null;
        }

        await this.presenceService.removeUserFromRoom(roomId, user.id);

        const userPublic = await this.getUserPublic(user.id);
        socket.to(roomId).emit('user_left', { 
          user_id: user.id,
          username: userPublic?.username,
          first_name: userPublic?.first_name,
          last_name: userPublic?.last_name,
          timestamp: new Date().toISOString()
        });

        socket.to(roomId).emit('user_status', {
          userId: user.id,
          status: 'offline',
          lastSeen: new Date().toISOString(),
          timestamp: new Date().toISOString()
        });

        socket.emit('left_room', { 
          roomId,
          timestamp: new Date().toISOString()
        });

        this.logger.debug('User left room', { userId: user.id, roomId });
      } catch (e: any) {
        this.logger.error('leave_room error', { error: e.message, userId: user.id });
      }
    });
  }

  private setupDisconnectHandler(socket: Socket, user: { id: string; email: string }): void {
    socket.on('disconnect', async () => {
      const currentRoomId = socket.data.currentRoomId;

      if (socket.data.heartbeat) {
        clearInterval(socket.data.heartbeat);
      }

      await this.presenceService.handleUserDisconnect(user.id, currentRoomId);
      
      if (currentRoomId) {
        const userPublic = await this.getUserPublic(user.id);
        socket.to(currentRoomId).emit('user_left', { 
          user_id: user.id,
          username: userPublic?.username,
          first_name: userPublic?.first_name,
          last_name: userPublic?.last_name,
          timestamp: new Date().toISOString()
        });

        socket.to(currentRoomId).emit('user_status', {
          user_id: user.id,
          status: 'offline',
          last_seen: new Date().toISOString(),
          timestamp: new Date().toISOString()
        });
      }
      
      this.logger.info(`authenticated socket disconnected: ${socket.id}`, { userId: user.id });
    });
  }
}

